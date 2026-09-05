#!/usr/bin/env python3
"""Owner-only Google Sheets bridge for PROJECT SIXTH prediction publication.

GitHub Actions never receives Google credentials and never becomes a collaborator
of the Gemini Spark spreadsheet.  It talks only to an owner-executed Apps Script
web app using HMAC-signed HTTPS requests.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Protocol, Sequence


SPREADSHEET_ID = "1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y"
SPREADSHEET_URL = (
    "https://docs.google.com/spreadsheets/d/"
    f"{SPREADSHEET_ID}/edit"
)
CONTRACT_ID = "PROJECT_SIXTH_PREDICTION_OPS"
SCHEMA_VERSION = "2.0.0"
TIMEZONE_NAME = "Asia/Tokyo"
JST = timezone(timedelta(hours=9))

PUBLIC_URL = "https://yu-zora.com/project_sixth/#prediction"
ARTICLE_SLUG = "/project_sixth/#prediction"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MIN_XLSX_BYTES = 128
MAX_XLSX_BYTES = 50 * 1024 * 1024
MAX_UNCOMPRESSED_XLSX_BYTES = 200 * 1024 * 1024
MAX_EXPORT_CHUNKS = 900

REQUIRED_TABS = (
    "00_DASHBOARD",
    "01_SPARK_SPEC",
    "02_SKILLS",
    "03_TASKS",
    "04_SCHEDULES",
    "05_CONFIG",
    "06_PREDICTIONS",
    "07_SOURCE_MASTER",
    "08_SOURCE_CANDIDATES",
    "09_RESULTS",
    "10_EVENT_WATCH",
    "11_AUDIT_LOG",
    "12_RUN_LOG",
    "13_ERROR_POLICY",
    "14_GITHUB_IO",
)

PREDICTION_HEADERS = (
    "prediction_id",
    "version",
    "status",
    "category",
    "horizon",
    "priority",
    "question_text",
    "choice_a",
    "choice_b",
    "choice_c",
    "choice_d",
    "resolution_rule",
    "primary_source_id",
    "secondary_source_id",
    "publish_at_jst",
    "close_at_jst",
    "event_at",
    "result_due_at_jst",
    "source_timezone",
    "created_by_run",
    "created_at",
    "t2_run_id",
    "t3_status",
    "t3_notes",
    "t3_run_id",
    "t4_decision",
    "t4_notes",
    "t4_run_id",
    "published_at",
    "git_publish_key",
    "article_slug",
    "result_status",
    "final_result",
    "result_source_url",
    "settled_at",
    "settlement_key",
    "reward_policy_id",
    "reward_units",
    "needs_human_review",
    "last_error_code",
    "last_error_at",
    "updated_at",
    "publish_gate",
    "final_gate",
)

AUDIT_HEADERS = (
    "audit_id",
    "timestamp_jst",
    "actor",
    "action",
    "entity_type",
    "idempotency_key",
    "entity_id",
    "version",
    "before_status",
    "after_status",
    "decision",
    "reason",
    "evidence_url_1",
    "evidence_url_2",
    "run_id",
    "immutable",
)

SOURCE_HEADERS = (
    "source_id",
    "source_name",
    "url",
    "category",
    "role",
    "trust_tier",
    "status",
    "discovery_ok",
    "result_ok",
    "login_required",
    "paywall",
    "stability",
    "update_frequency",
    "quality_score",
    "notes",
    "last_verified",
)

KNOWN_STATUSES = frozenset(
    {
        "DISCOVERED",
        "DRAFTED",
        "CHECK_PASSED",
        "CHECK_FAILED",
        "APPROVED_FOR_PUBLISH",
        "PUBLISHED",
        "RESULT_APPROVED",
        "SETTLED",
        "HOLD",
        "REJECTED",
        "ERROR",
        "CORRECTION",
        "TEMPLATE",
    }
)
PERSISTED_STATUSES = frozenset({"PUBLISHED", "RESULT_APPROVED", "SETTLED"})
ID_RE = re.compile(r"^PRED-\d{8}-\d{3}$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
TOKEN_RE = re.compile(r"^[0-9a-f]{64}$")

CONFIG_RANGE = "'05_CONFIG'!A:C"
PREDICTIONS_RANGE = "'06_PREDICTIONS'!A:AR"
SOURCE_RANGE = "'07_SOURCE_MASTER'!A:P"
AUDIT_RANGE = "'11_AUDIT_LOG'!A:P"
MAX_PUBLICATIONS_PER_RUN = 6
MAX_GET_ATTEMPTS = 3
MAX_RETRY_DELAY_SECONDS = 5.0
BRIDGE_PROTOCOL_VERSION = 1
BRIDGE_URL_RE = re.compile(
    r"^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$"
)


class BridgeError(RuntimeError):
    """A fail-closed bridge validation or transport error."""


@dataclass(frozen=True)
class BinaryResponse:
    data: bytes
    content_type: str


class ApiClient(Protocol):
    def export_xlsx(self, spreadsheet_id: str) -> BinaryResponse: ...

    def get_spreadsheet_metadata(self, spreadsheet_id: str) -> dict[str, Any]: ...

    def batch_get_values(
        self, spreadsheet_id: str, ranges: Sequence[str]
    ) -> list[list[list[Any]]]: ...

    def batch_update(
        self, spreadsheet_id: str, requests: Sequence[dict[str, Any]]
    ) -> dict[str, Any]: ...


class AppsScriptBridgeApi:
    """HMAC-authenticated client for the owner-executed Apps Script proxy."""

    def __init__(
        self,
        endpoint_url: str,
        shared_secret: str,
        timeout: int = 30,
        *,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.time,
        nonce_factory: Callable[[], str] | None = None,
    ):
        endpoint_url = endpoint_url.strip()
        if not BRIDGE_URL_RE.fullmatch(endpoint_url):
            raise BridgeError(
                "Apps Script bridge URL must be a production "
                "https://script.google.com/macros/s/.../exec URL"
            )
        if not TOKEN_RE.fullmatch(shared_secret):
            raise BridgeError("Apps Script bridge secret is missing or malformed")
        self._endpoint_url = endpoint_url
        self._shared_secret = shared_secret
        self._timeout = timeout
        self._sleep = sleep
        self._clock = clock
        self._nonce_factory = nonce_factory or (lambda: secrets.token_hex(16))

    @staticmethod
    def _payload_json(payload: dict[str, Any]) -> str:
        return json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )

    def _signed_body(self, operation: str, payload: dict[str, Any]) -> bytes:
        timestamp = int(self._clock())
        nonce = self._nonce_factory()
        if not re.fullmatch(r"[0-9a-f]{32}", nonce):
            raise BridgeError("Apps Script bridge nonce generator returned invalid data")
        payload_json = self._payload_json(payload)
        message = (
            f"{BRIDGE_PROTOCOL_VERSION}\n{timestamp}\n{nonce}\n"
            f"{operation}\n{payload_json}"
        )
        signature = hmac.new(
            self._shared_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        envelope = {
            "version": BRIDGE_PROTOCOL_VERSION,
            "timestamp": timestamp,
            "nonce": nonce,
            "operation": operation,
            "payload": payload_json,
            "signature": signature,
        }
        return json.dumps(
            envelope,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")

    @staticmethod
    def _retry_delay(attempt: int) -> float:
        return min(0.25 * (2 ** (attempt - 1)), MAX_RETRY_DELAY_SECONDS)

    def _request(
        self,
        operation: str,
        payload: dict[str, Any],
        *,
        retry_safe: bool,
    ) -> dict[str, Any]:
        attempts = MAX_GET_ATTEMPTS if retry_safe else 1
        for attempt in range(1, attempts + 1):
            request = urllib.request.Request(
                self._endpoint_url,
                data=self._signed_body(operation, payload),
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json; charset=utf-8",
                    "User-Agent": "PROJECT-SIXTH-GitHub-Action/2",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=self._timeout) as response:
                    content_type = response.headers.get("Content-Type", "")
                    data = response.read(25 * 1024 * 1024 + 1)
            except urllib.error.HTTPError as error:
                status_code = error.code
                error.close()
                if retry_safe and attempt < attempts and (
                    status_code == 429 or 500 <= status_code <= 599
                ):
                    self._sleep(self._retry_delay(attempt))
                    continue
                raise BridgeError(
                    f"Apps Script bridge transport failed with HTTP {status_code}"
                ) from None
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                if retry_safe and attempt < attempts:
                    self._sleep(self._retry_delay(attempt))
                    continue
                raise BridgeError(
                    "Apps Script bridge transport failed: "
                    f"{type(error).__name__}"
                ) from None

            if len(data) > 25 * 1024 * 1024:
                raise BridgeError("Apps Script bridge response exceeded size limit")
            if content_type.split(";", 1)[0].strip().lower() != "application/json":
                preview = data[:1024].decode("utf-8", errors="replace")
                title_match = re.search(
                    r"<title[^>]*>(.*?)</title>", preview, flags=re.IGNORECASE | re.DOTALL
                )
                title = ""
                if title_match:
                    title = re.sub(r"\s+", " ", title_match.group(1)).strip()[:160]
                detail = f"content-type={content_type or 'missing'}"
                if title:
                    detail += f", title={title!r}"
                raise BridgeError(
                    "Apps Script bridge returned a non-JSON response (" + detail + ")"
                )
            try:
                envelope = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                raise BridgeError("Apps Script bridge returned malformed JSON") from None
            if not isinstance(envelope, dict):
                raise BridgeError("Apps Script bridge returned an invalid JSON object")
            if envelope.get("ok") is not True:
                message = envelope.get("message")
                if not isinstance(message, str) or not message:
                    message = "Apps Script bridge rejected the request"
                if retry_safe and envelope.get("retryable") is True and attempt < attempts:
                    self._sleep(self._retry_delay(attempt))
                    continue
                raise BridgeError(message)
            result = envelope.get("result")
            if not isinstance(result, dict):
                raise BridgeError("Apps Script bridge response has no result object")
            return result
        raise BridgeError("Apps Script bridge retry budget was exhausted")

    def export_xlsx(self, spreadsheet_id: str) -> BinaryResponse:
        last_error: BridgeError | None = None
        for session_attempt in range(2):
            export_id = None
            chunk_count = 0
            try:
                begin = self._request(
                    "export_xlsx_begin",
                    {"spreadsheet_id": spreadsheet_id},
                    retry_safe=True,
                )
                export_id = begin.get("export_id")
                content_type = begin.get("content_type")
                expected_sha256 = begin.get("sha256")
                byte_length = begin.get("byte_length")
                chunk_count = begin.get("chunk_count")
                if (
                    not isinstance(export_id, str)
                    or not re.fullmatch(r"[0-9a-f]{32}", export_id)
                    or not isinstance(content_type, str)
                    or not isinstance(expected_sha256, str)
                    or not TOKEN_RE.fullmatch(expected_sha256)
                    or not isinstance(byte_length, int)
                    or isinstance(byte_length, bool)
                    or byte_length < MIN_XLSX_BYTES
                    or byte_length > MAX_XLSX_BYTES
                    or not isinstance(chunk_count, int)
                    or isinstance(chunk_count, bool)
                    or chunk_count < 1
                    or chunk_count > MAX_EXPORT_CHUNKS
                ):
                    raise BridgeError("Apps Script bridge returned an invalid XLSX export manifest")

                encoded_parts: list[str] = []
                for chunk_index in range(chunk_count):
                    chunk = self._request(
                        "export_xlsx_chunk",
                        {
                            "spreadsheet_id": spreadsheet_id,
                            "export_id": export_id,
                            "chunk_index": chunk_index,
                        },
                        retry_safe=True,
                    )
                    if chunk.get("export_id") != export_id or chunk.get("chunk_index") != chunk_index:
                        raise BridgeError("Apps Script bridge returned the wrong XLSX chunk")
                    encoded = chunk.get("data_base64")
                    if not isinstance(encoded, str) or not encoded:
                        raise BridgeError("Apps Script bridge returned an invalid XLSX chunk")
                    encoded_parts.append(encoded)

                try:
                    data = base64.b64decode("".join(encoded_parts), validate=True)
                except (ValueError, binascii.Error):
                    raise BridgeError("Apps Script bridge returned invalid base64 XLSX data") from None
                if len(data) != byte_length:
                    raise BridgeError("Apps Script bridge XLSX byte length did not match")
                if not hmac.compare_digest(
                    hashlib.sha256(data).hexdigest(), expected_sha256
                ):
                    raise BridgeError("Apps Script bridge XLSX checksum did not match")
                return BinaryResponse(data=data, content_type=content_type)
            except BridgeError as error:
                last_error = error
                if session_attempt == 0 and "export cache" in str(error).lower():
                    continue
                raise
            finally:
                if export_id is not None:
                    try:
                        self._request(
                            "export_xlsx_finish",
                            {
                                "spreadsheet_id": spreadsheet_id,
                                "export_id": export_id,
                                "chunk_count": chunk_count,
                            },
                            retry_safe=False,
                        )
                    except BridgeError:
                        pass
        raise last_error or BridgeError("Apps Script bridge XLSX export failed")

    def get_spreadsheet_metadata(self, spreadsheet_id: str) -> dict[str, Any]:
        return self._request(
            "get_spreadsheet_metadata",
            {"spreadsheet_id": spreadsheet_id},
            retry_safe=True,
        )

    def batch_get_values(
        self, spreadsheet_id: str, ranges: Sequence[str]
    ) -> list[list[list[Any]]]:
        result = self._request(
            "batch_get_values",
            {"spreadsheet_id": spreadsheet_id, "ranges": list(ranges)},
            retry_safe=True,
        )
        values = result.get("ranges")
        if not isinstance(values, list) or len(values) != len(ranges):
            raise BridgeError("Apps Script bridge returned an incomplete range set")
        if any(
            not isinstance(value_range, list)
            or any(not isinstance(row, list) for row in value_range)
            for value_range in values
        ):
            raise BridgeError("Apps Script bridge returned malformed rows")
        return values

    def batch_update(
        self, spreadsheet_id: str, requests: Sequence[dict[str, Any]]
    ) -> dict[str, Any]:
        return self._request(
            "batch_update",
            {"spreadsheet_id": spreadsheet_id, "requests": list(requests)},
            retry_safe=False,
        )


@dataclass(frozen=True)
class Snapshot:
    config: dict[str, str]
    sheet_ids: dict[str, int]
    prediction_rows: tuple[dict[str, Any], ...]
    source_rows: tuple[dict[str, Any], ...]
    audit_rows: tuple[dict[str, Any], ...]


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _padded(row: Sequence[Any], length: int) -> list[Any]:
    return list(row[:length]) + [""] * max(0, length - len(row))


def _validate_header(
    rows: Sequence[Sequence[Any]], expected: Sequence[str], sheet_name: str
) -> None:
    if len(rows) < 3:
        raise BridgeError(f"{sheet_name} is missing header row 3")
    actual = tuple(_text(value) for value in _padded(rows[2], len(expected)))
    if actual != tuple(expected):
        raise BridgeError(f"{sheet_name} header does not match schema {SCHEMA_VERSION}")


def _records(
    rows: Sequence[Sequence[Any]], headers: Sequence[str]
) -> tuple[dict[str, Any], ...]:
    result: list[dict[str, Any]] = []
    for row_number, row in enumerate(rows[3:], start=4):
        values = _padded(row, len(headers))
        if not any(_text(value) for value in values):
            continue
        result.append(
            {
                "_row_number": row_number,
                **{header: values[index] for index, header in enumerate(headers)},
            }
        )
    return tuple(result)


def _parse_config(rows: Sequence[Sequence[Any]]) -> dict[str, str]:
    if len(rows) < 3:
        raise BridgeError("05_CONFIG is missing header row 3")
    header = tuple(_text(value) for value in _padded(rows[2], 3))
    if header != ("key", "value", "meaning"):
        raise BridgeError("05_CONFIG header does not match schema 2.0.0")
    result: dict[str, str] = {}
    for row_number, row in enumerate(rows[3:], start=4):
        values = _padded(row, 2)
        key = _text(values[0])
        if not key:
            continue
        if key in result:
            raise BridgeError(f"05_CONFIG contains duplicate key at row {row_number}")
        result[key] = _text(values[1])
    expected = {
        "contract_id": CONTRACT_ID,
        "schema_version": SCHEMA_VERSION,
        "timezone": TIMEZONE_NAME,
        "spark_sheet_id": SPREADSHEET_ID,
        "spark_sheet_url": SPREADSHEET_URL,
        "gid_dependency": "NONE",
    }
    for key, value in expected.items():
        if result.get(key) != value:
            raise BridgeError(f"05_CONFIG {key} does not match the fixed contract")
    if not SEMVER_RE.fullmatch(result.get("release_version", "")):
        raise BridgeError("05_CONFIG release_version is not semantic versioning")
    configured_tabs = tuple(
        item.strip()
        for item in result.get("required_tabs_csv", "").split(",")
        if item.strip()
    )
    if configured_tabs != REQUIRED_TABS:
        raise BridgeError("05_CONFIG required_tabs_csv does not match the fixed contract")
    return result


def _parse_version(value: Any, row_number: int) -> int:
    text = _text(value)
    try:
        numeric = float(text)
    except ValueError:
        raise BridgeError(f"06_PREDICTIONS row {row_number} has invalid version") from None
    if not numeric.is_integer() or numeric < 1 or numeric > 2_147_483_647:
        raise BridgeError(f"06_PREDICTIONS row {row_number} has invalid version")
    return int(numeric)


def _parse_jst(value: Any, description: str) -> datetime:
    text = _text(value)
    if not text:
        raise BridgeError(f"{description} is missing")
    normalized = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        raise BridgeError(f"{description} is not an ISO date-time") from None
    if parsed.microsecond:
        raise BridgeError(f"{description} must use whole seconds")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=JST)
    return parsed.astimezone(JST)


def _parse_aware_jst(value: Any, description: str) -> datetime:
    text = _text(value)
    if not text:
        raise BridgeError(f"{description} is missing")
    normalized = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        raise BridgeError(f"{description} is not an ISO date-time") from None
    if parsed.tzinfo is None:
        raise BridgeError(f"{description} must include a timezone")
    if parsed.microsecond:
        raise BridgeError(f"{description} must use whole seconds")
    return parsed.astimezone(JST)


def _format_jst(value: datetime) -> str:
    return value.astimezone(JST).replace(microsecond=0).strftime("%Y-%m-%d %H:%M:%S")


def _validate_https_url(value: str, description: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(value)
        port = parsed.port
    except ValueError:
        raise BridgeError(f"{description} is not a valid HTTPS URL") from None
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or any(character.isspace() or ord(character) < 32 for character in value)
        or (port is not None and not 1 <= port <= 65535)
    ):
        raise BridgeError(f"{description} is not a valid HTTPS URL")
    return value


def _canonical_cell(value: Any) -> str | int | float | bool:
    """Return a stable JSON value without exposing it in the plan."""
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _full_row(record: dict[str, Any], headers: Sequence[str]) -> dict[str, Any]:
    return {header: _canonical_cell(record.get(header, "")) for header in headers}


def _hash_json(value: Any) -> str:
    encoded = json.dumps(
        value, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _referenced_sources(
    record: dict[str, Any], source_by_id: dict[str, dict[str, Any]]
) -> tuple[dict[str, Any], ...]:
    source_ids = {
        source_id
        for source_id in (
            _text(record["primary_source_id"]),
            _text(record["secondary_source_id"]),
        )
        if source_id
    }
    missing = sorted(source_ids.difference(source_by_id))
    if missing:
        raise BridgeError(
            "06_PREDICTIONS references an unknown source: " + ", ".join(missing)
        )
    return tuple(source_by_id[source_id] for source_id in sorted(source_ids))


def _state_token(
    record: dict[str, Any], referenced_sources: Sequence[dict[str, Any]]
) -> str:
    return _hash_json(
        {
            "prediction": _full_row(record, PREDICTION_HEADERS),
            "sources": [
                _full_row(source, SOURCE_HEADERS) for source in referenced_sources
            ],
        }
    )


def _audit_health(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Return non-blocking integrity diagnostics for the shared Spark audit log.

    GitHub Action 1 must not become unavailable because an unrelated Spark stage
    duplicated an audit row. Publication idempotency is enforced separately on
    successful PREDICTION_PUBLISHED rows, which remain fail-closed below.
    """
    by_id: dict[str, list[int]] = {}
    for record in rows:
        audit_id = _text(record["audit_id"])
        if not audit_id:
            continue
        by_id.setdefault(audit_id, []).append(int(record["_row_number"]))
    duplicates = {
        audit_id: row_numbers
        for audit_id, row_numbers in by_id.items()
        if len(row_numbers) > 1
    }
    duplicate_ids = sorted(duplicates)
    return {
        "duplicate_audit_id_count": len(duplicate_ids),
        "duplicate_audit_ids": duplicate_ids[:20],
        "duplicate_audit_rows": {
            audit_id: duplicates[audit_id] for audit_id in duplicate_ids[:20]
        },
        "truncated": len(duplicate_ids) > 20,
    }


def _publication_audits(
    rows: Sequence[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    publication_audit_ids: set[str] = set()
    for record in rows:
        if not (
            _text(record["action"]) == "PREDICTION_PUBLISHED"
            and _text(record["decision"]) == "SUCCESS"
        ):
            continue
        audit_id = _text(record["audit_id"])
        if not audit_id:
            raise BridgeError("11_AUDIT_LOG publication audit is missing audit_id")
        if audit_id in publication_audit_ids:
            raise BridgeError(
                "11_AUDIT_LOG contains a duplicate successful publication audit_id"
            )
        publication_audit_ids.add(audit_id)
        key = _text(record["idempotency_key"])
        if not key:
            raise BridgeError("11_AUDIT_LOG publication audit is missing its key")
        if key in result:
            raise BridgeError(
                "11_AUDIT_LOG contains duplicate successful publication audits"
            )
        if _text(record["entity_type"]) != "PREDICTION":
            raise BridgeError("11_AUDIT_LOG publication audit has invalid entity type")
        if _text(record["immutable"]).upper() not in {"TRUE", "1"}:
            raise BridgeError("11_AUDIT_LOG publication audit is not immutable")
        entity_id = _text(record["entity_id"])
        version = _parse_version(record["version"], int(record["_row_number"]))
        if key != f"{entity_id}|{version}":
            raise BridgeError("11_AUDIT_LOG publication audit key is inconsistent")
        result[key] = record
    return result


class SheetsBridge:
    def __init__(
        self,
        api: ApiClient,
        spreadsheet_id: str = SPREADSHEET_ID,
        *,
        clock: Callable[[], datetime] | None = None,
    ):
        if spreadsheet_id != SPREADSHEET_ID:
            raise BridgeError("Spreadsheet ID does not match the fixed contract")
        self.api = api
        self.spreadsheet_id = spreadsheet_id
        self.clock = clock or (lambda: datetime.now(JST))

    def export(self, output_path: Path) -> dict[str, Any]:
        if output_path.suffix.lower() != ".xlsx":
            raise BridgeError("export output must have an .xlsx extension")
        response = self.api.export_xlsx(self.spreadsheet_id)
        content_type = response.content_type.split(";", 1)[0].strip().lower()
        if content_type != XLSX_MIME:
            raise BridgeError("Drive export returned an unexpected Content-Type")
        data = response.data
        if not MIN_XLSX_BYTES <= len(data) <= MAX_XLSX_BYTES:
            raise BridgeError("Drive export XLSX size is outside the allowed range")
        stream = io.BytesIO(data)
        if not zipfile.is_zipfile(stream):
            raise BridgeError("Drive export is not an XLSX ZIP package")
        stream.seek(0)
        try:
            with zipfile.ZipFile(stream, "r") as archive:
                names = archive.namelist()
                if len(names) != len(set(names)):
                    raise BridgeError("Drive export XLSX contains duplicate members")
                required = {"[Content_Types].xml", "xl/workbook.xml"}
                if not required.issubset(names) or not any(
                    name.startswith("xl/worksheets/") for name in names
                ):
                    raise BridgeError("Drive export XLSX is missing required members")
                if sum(item.file_size for item in archive.infolist()) > MAX_UNCOMPRESSED_XLSX_BYTES:
                    raise BridgeError("Drive export XLSX expands beyond the size limit")
                if archive.testzip() is not None:
                    raise BridgeError("Drive export XLSX failed its ZIP integrity check")
        except zipfile.BadZipFile:
            raise BridgeError("Drive export XLSX is corrupt") from None

        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_name: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                "wb",
                dir=output_path.parent,
                prefix=f".{output_path.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary:
                temporary_name = temporary.name
                temporary.write(data)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, output_path)
        except OSError as error:
            raise BridgeError(f"cannot save exported XLSX: {type(error).__name__}") from None
        finally:
            if temporary_name:
                try:
                    Path(temporary_name).unlink(missing_ok=True)
                except OSError:
                    pass
        return {
            "command": "export",
            "status": "SUCCESS",
            "output": str(output_path),
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }

    def _read_snapshot(self) -> Snapshot:
        metadata = self.api.get_spreadsheet_metadata(self.spreadsheet_id)
        if metadata.get("spreadsheetId") != self.spreadsheet_id:
            raise BridgeError("Sheets metadata returned the wrong spreadsheet")
        properties = metadata.get("properties")
        if not isinstance(properties, dict) or properties.get("timeZone") != TIMEZONE_NAME:
            raise BridgeError("Spreadsheet timezone does not match Asia/Tokyo")
        sheets = metadata.get("sheets")
        if not isinstance(sheets, list):
            raise BridgeError("Sheets metadata does not contain worksheet metadata")
        sheet_ids: dict[str, int] = {}
        for sheet in sheets:
            if not isinstance(sheet, dict) or not isinstance(sheet.get("properties"), dict):
                raise BridgeError("Sheets metadata contains an invalid worksheet")
            sheet_properties = sheet["properties"]
            title = sheet_properties.get("title")
            sheet_id = sheet_properties.get("sheetId")
            if not isinstance(title, str) or not isinstance(sheet_id, int):
                raise BridgeError("Sheets metadata contains invalid worksheet properties")
            if title in sheet_ids:
                raise BridgeError("Sheets metadata contains duplicate worksheet titles")
            sheet_ids[title] = sheet_id
        if tuple(sheet_ids) != REQUIRED_TABS:
            raise BridgeError("Spreadsheet tabs or tab order do not match the fixed contract")

        config_rows, prediction_rows, source_rows, audit_rows = (
            self.api.batch_get_values(
            self.spreadsheet_id,
                (CONFIG_RANGE, PREDICTIONS_RANGE, SOURCE_RANGE, AUDIT_RANGE),
            )
        )
        config = _parse_config(config_rows)
        _validate_header(prediction_rows, PREDICTION_HEADERS, "06_PREDICTIONS")
        _validate_header(source_rows, SOURCE_HEADERS, "07_SOURCE_MASTER")
        _validate_header(audit_rows, AUDIT_HEADERS, "11_AUDIT_LOG")
        return Snapshot(
            config=config,
            sheet_ids=sheet_ids,
            prediction_rows=_records(prediction_rows, PREDICTION_HEADERS),
            source_rows=_records(source_rows, SOURCE_HEADERS),
            audit_rows=_records(audit_rows, AUDIT_HEADERS),
        )

    def _plan_from_snapshot(
        self, snapshot: Snapshot, as_of_jst: datetime
    ) -> dict[str, Any]:
        if as_of_jst.tzinfo is None:
            raise BridgeError("plan as-of time must include a timezone")
        as_of_jst = as_of_jst.astimezone(JST).replace(microsecond=0)
        published_audits = _publication_audits(snapshot.audit_rows)

        source_by_id: dict[str, dict[str, Any]] = {}
        for source in snapshot.source_rows:
            row_number = int(source["_row_number"])
            source_id = _text(source["source_id"])
            if not source_id:
                raise BridgeError(
                    f"07_SOURCE_MASTER row {row_number} is missing source_id"
                )
            if source_id in source_by_id:
                first_row = int(source_by_id[source_id]["_row_number"])
                raise BridgeError(
                    f"07_SOURCE_MASTER source_id {source_id!r} is duplicated "
                    f"at rows {first_row} and {row_number}"
                )
            source_by_id[source_id] = source

        keys_seen: dict[str, int] = {}
        candidates: list[tuple[datetime, str, int, dict[str, Any]]] = []
        catalog_state_tokens: list[dict[str, str]] = []
        counts = {
            "prediction_rows": 0,
            "ready_due": 0,
            "ready_future": 0,
            "already_published": 0,
            "publication_audits": len(published_audits),
            "selected": 0,
            "deferred": 0,
        }

        for record in snapshot.prediction_rows:
            row_number = int(record["_row_number"])
            prediction_id = _text(record["prediction_id"])
            if not prediction_id:
                continue
            if prediction_id == "PRED-TEMPLATE":
                continue
            counts["prediction_rows"] += 1
            if not ID_RE.fullmatch(prediction_id):
                raise BridgeError(f"06_PREDICTIONS row {row_number} has invalid ID")
            version = _parse_version(record["version"], row_number)
            key = f"{prediction_id}|{version}"
            if key in keys_seen:
                raise BridgeError("06_PREDICTIONS contains a duplicate prediction key")
            keys_seen[key] = row_number
            status = _text(record["status"])
            gate = _text(record["publish_gate"])
            if status not in KNOWN_STATUSES:
                raise BridgeError(f"06_PREDICTIONS row {row_number} has invalid status")
            if gate not in {"READY", "HOLD"}:
                raise BridgeError(f"06_PREDICTIONS row {row_number} has invalid publish_gate")
            if gate == "READY" and status != "APPROVED_FOR_PUBLISH":
                raise BridgeError(
                    f"06_PREDICTIONS row {row_number} has a stale publish_gate"
                )
            if status in PERSISTED_STATUSES or status == "APPROVED_FOR_PUBLISH":
                if _text(record["git_publish_key"]) != key:
                    raise BridgeError(
                        f"06_PREDICTIONS row {row_number} has an invalid publish key"
                    )

            has_publication_audit = key in published_audits
            if status in PERSISTED_STATUSES:
                if not _text(record["published_at"]) or not _text(record["article_slug"]):
                    raise BridgeError(
                        f"06_PREDICTIONS row {row_number} is missing publication evidence"
                    )
                if not has_publication_audit:
                    raise BridgeError(
                        f"06_PREDICTIONS row {row_number} is missing its publication audit"
                    )
                if gate != "HOLD":
                    raise BridgeError(
                        f"06_PREDICTIONS row {row_number} has a stale publish_gate"
                    )
                sources = _referenced_sources(record, source_by_id)
                catalog_state_tokens.append(
                    {"key": key, "state_token": _state_token(record, sources)}
                )
                counts["already_published"] += 1
                continue
            if has_publication_audit:
                raise BridgeError(
                    f"06_PREDICTIONS row {row_number} conflicts with a publication audit"
                )
            if status != "APPROVED_FOR_PUBLISH" or gate != "READY":
                continue
            if _text(record["t3_status"]) != "PASS" or _text(
                record["t4_decision"]
            ) != "APPROVE":
                raise BridgeError(
                    f"06_PREDICTIONS row {row_number} lacks T3/T4 approval"
                )
            if _text(record["published_at"]) or _text(record["article_slug"]):
                raise BridgeError(
                    f"06_PREDICTIONS row {row_number} has premature publication evidence"
                )
            publish_at = _parse_jst(
                record["publish_at_jst"],
                f"06_PREDICTIONS row {row_number} publish_at_jst",
            )
            if publish_at > as_of_jst:
                counts["ready_future"] += 1
                continue
            counts["ready_due"] += 1
            sources = _referenced_sources(record, source_by_id)
            token = _state_token(record, sources)
            catalog_state_tokens.append({"key": key, "state_token": token})
            candidates.append(
                (
                    publish_at,
                    prediction_id,
                    version,
                    {
                        "row_number": row_number,
                        "prediction_id": prediction_id,
                        "version": version,
                        "key": key,
                        "expected_status": "APPROVED_FOR_PUBLISH",
                        "expected_publish_gate": "READY",
                        "publish_at_jst": publish_at.isoformat(timespec="seconds"),
                        "state_token": token,
                    },
                )
            )

        candidates.sort(key=lambda candidate: candidate[:3])
        items = [candidate[3] for candidate in candidates[:MAX_PUBLICATIONS_PER_RUN]]
        deferred_count = max(0, len(candidates) - len(items))
        counts["selected"] = len(items)
        counts["deferred"] = deferred_count
        fingerprint_input = {
            "spreadsheet_id": self.spreadsheet_id,
            "as_of_jst": as_of_jst.isoformat(timespec="seconds"),
            "contract_config": dict(sorted(snapshot.config.items())),
            "catalog_rows": sorted(
                catalog_state_tokens, key=lambda state: state["key"]
            ),
            "successful_publication_audit_keys": sorted(published_audits),
        }
        fingerprint = _hash_json(fingerprint_input)
        return {
            "plan_version": 1,
            "audit_health": _audit_health(snapshot.audit_rows),
            "spreadsheet_id": self.spreadsheet_id,
            "contract_id": snapshot.config["contract_id"],
            "schema_version": snapshot.config["schema_version"],
            "release_version": snapshot.config["release_version"],
            "as_of_jst": as_of_jst.isoformat(timespec="seconds"),
            "snapshot_fingerprint": fingerprint,
            "noop": not items,
            "deferred_count": deferred_count,
            "counts": counts,
            "items": items,
        }

    def plan(self, as_of_jst: datetime | None = None) -> dict[str, Any]:
        as_of = as_of_jst or self.clock()
        return self._plan_from_snapshot(self._read_snapshot(), as_of)

    @staticmethod
    def _cell_data(value: str | int | bool) -> dict[str, Any]:
        if isinstance(value, bool):
            entered = {"boolValue": value}
        elif isinstance(value, int):
            entered = {"numberValue": value}
        else:
            entered = {"stringValue": value}
        return {"userEnteredValue": entered}

    @classmethod
    def _update_cell_request(
        cls, sheet_id: int, row_number: int, column_index: int, value: str
    ) -> dict[str, Any]:
        return {
            "updateCells": {
                "start": {
                    "sheetId": sheet_id,
                    "rowIndex": row_number - 1,
                    "columnIndex": column_index,
                },
                "rows": [{"values": [cls._cell_data(value)]}],
                "fields": "userEnteredValue",
            }
        }

    @staticmethod
    def _validate_plan(plan: dict[str, Any], spreadsheet_id: str) -> None:
        if (
            not isinstance(plan.get("plan_version"), int)
            or isinstance(plan.get("plan_version"), bool)
            or plan["plan_version"] != 1
        ):
            raise BridgeError("publication plan version is unsupported")
        if plan.get("spreadsheet_id") != spreadsheet_id:
            raise BridgeError("publication plan targets a different spreadsheet")
        if plan.get("contract_id") != CONTRACT_ID or plan.get(
            "schema_version"
        ) != SCHEMA_VERSION:
            raise BridgeError("publication plan contract does not match")
        if not SEMVER_RE.fullmatch(str(plan.get("release_version", ""))):
            raise BridgeError("publication plan release version is invalid")
        plan_as_of = _parse_aware_jst(
            plan.get("as_of_jst"), "publication plan as_of_jst"
        )
        snapshot_fingerprint = plan.get("snapshot_fingerprint")
        if not isinstance(snapshot_fingerprint, str) or not TOKEN_RE.fullmatch(
            snapshot_fingerprint
        ):
            raise BridgeError("publication plan snapshot fingerprint is invalid")
        deferred_count = plan.get("deferred_count")
        if (
            not isinstance(deferred_count, int)
            or isinstance(deferred_count, bool)
            or deferred_count < 0
        ):
            raise BridgeError("publication plan deferred count is invalid")
        items = plan.get("items")
        if not isinstance(items, list) or plan.get("noop") is not (not items):
            raise BridgeError("publication plan item state is invalid")
        if len(items) > MAX_PUBLICATIONS_PER_RUN:
            raise BridgeError("publication plan exceeds the per-run publication limit")
        if deferred_count and len(items) != MAX_PUBLICATIONS_PER_RUN:
            raise BridgeError("publication plan deferred count is inconsistent")
        keys: set[str] = set()
        item_order: list[tuple[datetime, str, int]] = []
        for item in items:
            if not isinstance(item, dict):
                raise BridgeError("publication plan contains an invalid item")
            prediction_id = item.get("prediction_id")
            version = item.get("version")
            key = item.get("key")
            if (
                not isinstance(prediction_id, str)
                or not ID_RE.fullmatch(prediction_id)
                or not isinstance(version, int)
                or isinstance(version, bool)
                or version < 1
                or key != f"{prediction_id}|{version}"
                or key in keys
            ):
                raise BridgeError("publication plan contains an invalid key")
            keys.add(key)
            if item.get("expected_status") != "APPROVED_FOR_PUBLISH" or item.get(
                "expected_publish_gate"
            ) != "READY":
                raise BridgeError("publication plan contains an invalid expected state")
            if (
                not isinstance(item.get("row_number"), int)
                or isinstance(item.get("row_number"), bool)
                or item["row_number"] < 4
            ):
                raise BridgeError("publication plan contains an invalid row number")
            state_token = item.get("state_token")
            if not isinstance(state_token, str) or not TOKEN_RE.fullmatch(
                state_token
            ):
                raise BridgeError("publication plan contains an invalid state token")
            publish_at = _parse_aware_jst(
                item.get("publish_at_jst"), "publication plan publish_at_jst"
            )
            if publish_at > plan_as_of:
                raise BridgeError("publication plan contains a future item")
            item_order.append((publish_at, prediction_id, version))
        if item_order != sorted(item_order):
            raise BridgeError("publication plan items are not in stable order")
        counts = plan.get("counts")
        count_names = ("ready_due", "selected", "deferred")
        if (
            not isinstance(counts, dict)
            or any(
                not isinstance(counts.get(name), int)
                or isinstance(counts.get(name), bool)
                or counts[name] < 0
                for name in count_names
            )
            or counts.get("selected") != len(items)
            or counts.get("deferred") != deferred_count
            or counts.get("ready_due") != len(items) + deferred_count
        ):
            raise BridgeError("publication plan counts are inconsistent")

    def commit_publication(
        self,
        plan: dict[str, Any],
        verified_public_keys: set[str],
        *,
        commit_url: str | None,
        public_url: str = PUBLIC_URL,
        published_at: datetime | None = None,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        self._validate_plan(plan, self.spreadsheet_id)
        planned_items = plan["items"]
        planned_keys = {item["key"] for item in planned_items}
        if not planned_keys.issubset(verified_public_keys):
            raise BridgeError("public API verification is missing planned prediction keys")

        snapshot = self._read_snapshot()
        plan_as_of = _parse_aware_jst(
            plan["as_of_jst"], "publication plan as_of_jst"
        )
        current_plan = self._plan_from_snapshot(snapshot, plan_as_of)
        if current_plan["snapshot_fingerprint"] != plan["snapshot_fingerprint"]:
            raise BridgeError(
                "publication snapshot changed after the plan was created"
            )
        current_items = {item["key"]: item for item in current_plan["items"]}
        if set(current_items) != planned_keys:
            raise BridgeError("publication state changed after the plan was created")
        for item in planned_items:
            current = current_items[item["key"]]
            if current["state_token"] != item["state_token"]:
                raise BridgeError("publication row changed after the plan was created")

        if not planned_items:
            return {
                "command": "commit-publication",
                "status": "NOOP",
                "committed_count": 0,
                "keys": [],
            }

        if not commit_url:
            raise BridgeError("commit URL is required for a publication commit")
        commit_url = _validate_https_url(commit_url, "commit URL")
        public_url = _validate_https_url(public_url, "public URL")
        timestamp = published_at or self.clock()
        if timestamp.tzinfo is None:
            raise BridgeError("published-at must include a timezone")
        timestamp = timestamp.astimezone(JST).replace(microsecond=0)
        timestamp_text = _format_jst(timestamp)
        compact_time = timestamp.strftime("%Y%m%d-%H%M%S")
        if run_id is None:
            github_run = os.environ.get("GITHUB_RUN_ID")
            github_attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1")
            run_id = (
                f"RUN-ACTION1-{github_run}-{github_attempt}"
                if github_run
                else f"RUN-ACTION1-{compact_time}-{uuid.uuid4().hex[:8]}"
            )
        if not re.fullmatch(r"[A-Za-z0-9._-]{8,120}", run_id):
            raise BridgeError("run ID is malformed")

        prediction_sheet_id = snapshot.sheet_ids["06_PREDICTIONS"]
        audit_sheet_id = snapshot.sheet_ids["11_AUDIT_LOG"]
        requests: list[dict[str, Any]] = []
        audit_rows: list[list[str | int | bool]] = []
        audit_ids: list[str] = []
        for sequence, item in enumerate(planned_items, start=1):
            row_number = current_items[item["key"]]["row_number"]
            # C, AC, AE, AP only. AD and AQ/AR are intentionally untouched.
            for column_index, value in (
                (2, "PUBLISHED"),
                (28, timestamp_text),
                (30, ARTICLE_SLUG),
                (41, timestamp_text),
            ):
                requests.append(
                    self._update_cell_request(
                        prediction_sheet_id, row_number, column_index, value
                    )
                )
            digest = hashlib.sha256(
                f"{run_id}|{item['key']}|{sequence}".encode("utf-8")
            ).hexdigest()[:8]
            audit_id = f"AUD-ACTION1-{compact_time}-{digest}"
            audit_ids.append(audit_id)
            audit_rows.append(
                [
                    audit_id,
                    timestamp_text,
                    "GITHUB_ACTION1",
                    "PREDICTION_PUBLISHED",
                    "PREDICTION",
                    item["key"],
                    item["prediction_id"],
                    item["version"],
                    "APPROVED_FOR_PUBLISH",
                    "PUBLISHED",
                    "SUCCESS",
                    "GitHub Action 1で公開カタログを検証し、本番公開を確認した。",
                    public_url,
                    commit_url,
                    run_id,
                    True,
                ]
            )
        requests.append(
            {
                "appendCells": {
                    "sheetId": audit_sheet_id,
                    "rows": [
                        {
                            "values": [
                                self._cell_data(value) for value in audit_row
                            ]
                        }
                        for audit_row in audit_rows
                    ],
                    "fields": "userEnteredValue",
                }
            }
        )
        self.api.batch_update(self.spreadsheet_id, requests)

        verified_snapshot = self._read_snapshot()
        by_key: dict[str, dict[str, Any]] = {}
        for record in verified_snapshot.prediction_rows:
            prediction_id = _text(record["prediction_id"])
            if not prediction_id or prediction_id == "PRED-TEMPLATE":
                continue
            row_number = int(record["_row_number"])
            version = _parse_version(record["version"], row_number)
            key = f"{prediction_id}|{version}"
            if key in by_key:
                raise BridgeError("publication read-back contains a duplicate key")
            by_key[key] = record
        audit_by_id: dict[str, list[dict[str, Any]]] = {}
        for record in verified_snapshot.audit_rows:
            audit_by_id.setdefault(_text(record["audit_id"]), []).append(record)
        verified_publication_audits = _publication_audits(
            verified_snapshot.audit_rows
        )

        for item, audit_id, expected_audit in zip(
            planned_items, audit_ids, audit_rows, strict=True
        ):
            record = by_key.get(item["key"])
            if record is None:
                raise BridgeError("publication read-back lost a prediction row")
            expected_cells = {
                "status": "PUBLISHED",
                "published_at": timestamp_text,
                "article_slug": ARTICLE_SLUG,
                "updated_at": timestamp_text,
                "publish_gate": "HOLD",
            }
            if any(_text(record[field]) != value for field, value in expected_cells.items()):
                raise BridgeError("publication cell read-back did not match")
            matches = audit_by_id.get(audit_id, [])
            if len(matches) != 1:
                raise BridgeError("publication audit read-back was missing or duplicated")
            actual_audit = matches[0]
            if verified_publication_audits.get(item["key"]) is not actual_audit:
                raise BridgeError("publication audit idempotency read-back did not match")
            for header, expected in zip(AUDIT_HEADERS, expected_audit, strict=True):
                if _text(actual_audit[header]) != _text(expected):
                    raise BridgeError("publication audit read-back did not match")

        return {
            "command": "commit-publication",
            "status": "SUCCESS",
            "committed_count": len(planned_items),
            "keys": sorted(planned_keys),
            "run_id": run_id,
            "audit_ids": audit_ids,
        }


def _load_json_object(path: Path, description: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        raise BridgeError(f"cannot read {description} JSON") from None
    if not isinstance(value, dict):
        raise BridgeError(f"{description} must be a JSON object")
    return value


def _load_verified_keys(path: Path | None) -> set[str]:
    if path is None:
        return set()
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        raise BridgeError("cannot read verified public keys JSON") from None
    candidates: Any = value
    if isinstance(value, dict):
        if isinstance(value.get("keys"), list):
            candidates = value["keys"]
        elif isinstance(value.get("items"), list):
            candidates = value["items"]
        elif isinstance(value.get("predictions"), dict) and isinstance(
            value["predictions"].get("items"), list
        ):
            candidates = value["predictions"]["items"]
    if not isinstance(candidates, list):
        raise BridgeError("verified public keys JSON has no supported key list")
    keys: set[str] = set()
    for candidate in candidates:
        if isinstance(candidate, str):
            key = candidate
        elif isinstance(candidate, dict):
            prediction_id = candidate.get("id")
            version = candidate.get("version")
            if not isinstance(prediction_id, str) or not isinstance(version, int):
                raise BridgeError("verified public keys JSON contains an invalid item")
            key = f"{prediction_id}|{version}"
        else:
            raise BridgeError("verified public keys JSON contains an invalid item")
        prediction_id, separator, raw_version = key.partition("|")
        if (
            not separator
            or not ID_RE.fullmatch(prediction_id)
            or not raw_version.isdigit()
            or int(raw_version) < 1
        ):
            raise BridgeError("verified public keys JSON contains an invalid key")
        keys.add(f"{prediction_id}|{int(raw_version)}")
    return keys


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="\n",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_name = temporary.name
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, path)
    except OSError:
        raise BridgeError("cannot save JSON output") from None
    finally:
        if temporary_name:
            try:
                Path(temporary_name).unlink(missing_ok=True)
            except OSError:
                pass


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Bridge PROJECT SIXTH publication data with Google Sheets"
    )
    parser.add_argument("--spreadsheet-id", default=SPREADSHEET_ID)
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("--output", type=Path, required=True)

    plan_parser = subparsers.add_parser("plan")
    plan_parser.add_argument("--output", type=Path)
    plan_parser.add_argument("--as-of")

    commit_parser = subparsers.add_parser("commit-publication")
    commit_parser.add_argument("--plan", type=Path, required=True)
    commit_parser.add_argument("--verified-keys-file", type=Path)
    commit_parser.add_argument("--commit-url")
    commit_parser.add_argument("--public-url", default=PUBLIC_URL)
    commit_parser.add_argument("--published-at")
    commit_parser.add_argument("--run-id")
    return parser


def run(argv: Sequence[str]) -> int:
    arguments = _parser().parse_args(argv)
    endpoint_url = os.environ.get("GEMINI_SPARK_BRIDGE_URL", "")
    shared_secret = os.environ.get("GEMINI_SPARK_BRIDGE_SECRET", "")
    api = AppsScriptBridgeApi(endpoint_url, shared_secret)
    bridge = SheetsBridge(api, arguments.spreadsheet_id)

    if arguments.command == "export":
        result = bridge.export(arguments.output.expanduser().resolve())
    elif arguments.command == "plan":
        as_of = (
            _parse_aware_jst(arguments.as_of, "--as-of")
            if arguments.as_of
            else None
        )
        result = bridge.plan(as_of)
        if arguments.output:
            _write_json(arguments.output.expanduser().resolve(), result)
    else:
        plan = _load_json_object(arguments.plan.expanduser().resolve(), "plan")
        verified_keys = _load_verified_keys(
            arguments.verified_keys_file.expanduser().resolve()
            if arguments.verified_keys_file
            else None
        )
        published_at = (
            _parse_jst(arguments.published_at, "--published-at")
            if arguments.published_at
            else None
        )
        result = bridge.commit_publication(
            plan,
            verified_keys,
            commit_url=arguments.commit_url,
            public_url=arguments.public_url,
            published_at=published_at,
            run_id=arguments.run_id,
        )
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


def main() -> int:
    try:
        return run(sys.argv[1:])
    except BridgeError as error:
        print(
            json.dumps(
                {"status": "ERROR", "error": str(error)},
                ensure_ascii=False,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
