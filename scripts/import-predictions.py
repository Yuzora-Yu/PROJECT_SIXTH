#!/usr/bin/env python3
"""Build the public prediction catalog from a PROJECT_SIXTH Ops workbook."""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


CONTRACT_ID = "PROJECT_SIXTH_PREDICTION_OPS"
SCHEMA_VERSION = "2.0.0"
TIMEZONE_NAME = "Asia/Tokyo"
JST = timezone(timedelta(hours=9))
SPREADSHEET_ID = "1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y"
MAX_APPROVED_KEYS = 6

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL_NS = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "ops" / "PROJECT_SIXTH_GeminiSpark_Prediction_Ops.xlsx"
OUTPUT_PATH = ROOT / "worker" / "prediction-catalog.generated.js"

PUBLISHABLE_STATUS = "APPROVED_FOR_PUBLISH"
PERSISTED_STATUSES = frozenset({"PUBLISHED", "RESULT_APPROVED", "SETTLED"})
KNOWN_STATUSES = frozenset(
    {
        "DISCOVERED",
        "DRAFTED",
        "CHECK_PASSED",
        "CHECK_FAILED",
        PUBLISHABLE_STATUS,
        *PERSISTED_STATUSES,
        "HOLD",
        "REJECTED",
        "ERROR",
        "CORRECTION",
        "TEMPLATE",
    }
)
VALID_CATEGORIES = frozenset(
    {
        "SPORTS",
        "ENTERTAINMENT",
        "ACADEMIA",
        "SCIENCE",
        "ARTS",
        "POLITICS",
        "ECONOMY",
        "TECH",
        "OTHER",
    }
)
VALID_HORIZONS = frozenset({"SHORT", "MEDIUM", "MONTHLY", "LONG"})
CHOICE_FIELDS = ("choice_a", "choice_b", "choice_c", "choice_d")
CHOICE_IDS = ("A", "B", "C", "D")

CONFIG_HEADERS = frozenset({"key", "value"})
SOURCE_HEADERS = frozenset(
    {"source_id", "source_name", "url", "status", "trust_tier", "result_ok"}
)
PREDICTION_HEADERS = frozenset(
    {
        "prediction_id",
        "version",
        "status",
        "category",
        "horizon",
        "question_text",
        *CHOICE_FIELDS,
        "resolution_rule",
        "primary_source_id",
        "publish_at_jst",
        "close_at_jst",
        "result_due_at_jst",
        "published_at",
        "git_publish_key",
        "article_slug",
        "result_status",
        "final_result",
        "result_source_url",
        "settled_at",
        "settlement_key",
        "needs_human_review",
        "publish_gate",
        "final_gate",
    }
)

ID_RE = re.compile(r"^PRED-\d{8}-\d{3}$")
TOKEN_RE = re.compile(r"^[0-9a-f]{64}$")
RELEASE_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
NUMERIC_RE = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$")
URL_BODY = r"[A-Za-z0-9._~:/?#\[\]@!$&*+,;=%\-]+"
URL_RE = re.compile(rf"https?://{URL_BODY}", re.IGNORECASE)
URL_PREFIX_RE = re.compile(r"https?://", re.IGNORECASE)
WRAPPED_URL_RE = re.compile(
    rf"(?:（\s*https?://{URL_BODY}\s*）|\(\s*https?://{URL_BODY}\s*\))",
    re.IGNORECASE,
)
TIMEZONE_SENTENCE_RE = re.compile(
    r"(?:^|(?<=[。！？!?\n]))[ \t\u3000]*"
    r"タイムゾーン\s*(?:は|[:：])?\s*"
    r"[A-Za-z][A-Za-z0-9_+\-]*(?:/[A-Za-z0-9_+\-]+)+\s*[。.]?",
    re.MULTILINE,
)
HOLD_RE = re.compile(r"(?<![A-Za-z0-9_])HOLD(?![A-Za-z0-9_])")

IMMUTABLE_FIELDS = (
    "id",
    "version",
    "category",
    "horizon",
    "question",
    "choices",
    "resolutionRule",
    "publishAt",
    "closeAt",
    "resultDueAt",
    "source",
)


class ImportFailure(Exception):
    """A workbook or generated-catalog contract violation."""


def fail(message: str) -> None:
    raise ImportFailure(message)


def timezone_iso_datetime(value: str, description: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        fail(f"{description} must be an ISO date-time with a timezone")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        fail(f"{description} must be an ISO date-time with a timezone")
    if parsed.tzinfo is None:
        fail(f"{description} must include a timezone")
    return parsed.astimezone(JST)


def cli_as_of(value: str) -> datetime:
    try:
        return timezone_iso_datetime(value, "--as-of")
    except ImportFailure as error:
        raise argparse.ArgumentTypeError(str(error)) from None


def cell_text(value: str | None) -> str:
    return "" if value is None else value.strip()


def column_index(reference: str) -> int:
    match = re.match(r"^[A-Z]+", reference)
    if not match:
        fail(f"invalid XLSX cell reference: {reference!r}")
    value = 0
    for character in match.group(0):
        value = value * 26 + ord(character) - ord("A") + 1
    return value - 1


def package_path(base: str, target: str) -> str:
    if target.startswith("/"):
        candidate = posixpath.normpath(target.lstrip("/"))
    else:
        candidate = posixpath.normpath(posixpath.join(base, target))
    if candidate == ".." or candidate.startswith("../"):
        fail(f"XLSX relationship escapes the package: {target!r}")
    return candidate


class Workbook:
    def __init__(self, path: Path):
        self.path = path
        try:
            self.archive = zipfile.ZipFile(path, "r")
        except (OSError, zipfile.BadZipFile) as error:
            fail(f"cannot open XLSX {path}: {error}")

        names = self.archive.namelist()
        if len(names) != len(set(names)):
            self.archive.close()
            fail("XLSX contains duplicate package members")

        try:
            self.shared_strings = self._read_shared_strings()
            self.sheets, self.date_1904 = self._read_workbook()
        except (KeyError, ET.ParseError, ValueError, InvalidOperation) as error:
            self.archive.close()
            fail(f"invalid XLSX package: {error}")

    def close(self) -> None:
        self.archive.close()

    def __enter__(self) -> "Workbook":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _xml(self, name: str) -> ET.Element:
        return ET.fromstring(self.archive.read(name))

    def _read_shared_strings(self) -> list[str]:
        if "xl/sharedStrings.xml" not in self.archive.namelist():
            return []
        root = self._xml("xl/sharedStrings.xml")
        return [
            "".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t"))
            for item in root.findall(f"{{{MAIN_NS}}}si")
        ]

    def _read_workbook(self) -> tuple[dict[str, str], bool]:
        root = self._xml("xl/workbook.xml")
        relationships = self._xml("xl/_rels/workbook.xml.rels")
        targets: dict[str, str] = {}
        for relationship in relationships.findall(
            f"{{{PACKAGE_REL_NS}}}Relationship"
        ):
            relationship_id = relationship.attrib.get("Id", "")
            if relationship.attrib.get("TargetMode") == "External":
                continue
            target = relationship.attrib.get("Target")
            if relationship_id and target:
                targets[relationship_id] = package_path("xl", target)

        sheets: dict[str, str] = {}
        for sheet in root.findall(f".//{{{MAIN_NS}}}sheet"):
            name = sheet.attrib.get("name", "")
            relationship_id = sheet.attrib.get(f"{{{OFFICE_REL_NS}}}id", "")
            if not name or relationship_id not in targets:
                fail("workbook contains a sheet without a valid internal relationship")
            if name in sheets:
                fail(f"workbook contains duplicate sheet name: {name}")
            sheets[name] = targets[relationship_id]

        properties = root.find(f"{{{MAIN_NS}}}workbookPr")
        date_1904 = (
            properties is not None
            and properties.attrib.get("date1904", "0").lower() in {"1", "true"}
        )
        return sheets, date_1904

    def _value(self, cell: ET.Element) -> str | None:
        cell_type = cell.attrib.get("t")
        value_node = cell.find(f"{{{MAIN_NS}}}v")
        raw_value = None if value_node is None else value_node.text

        if cell_type == "inlineStr":
            inline = cell.find(f"{{{MAIN_NS}}}is")
            if inline is None:
                return ""
            return "".join(
                node.text or "" for node in inline.iter(f"{{{MAIN_NS}}}t")
            )
        if cell_type == "s":
            if raw_value is None:
                return ""
            try:
                index = int(raw_value)
                return self.shared_strings[index]
            except (ValueError, IndexError):
                fail(f"invalid shared-string index: {raw_value!r}")
        if cell_type == "b":
            return "TRUE" if raw_value == "1" else "FALSE"
        if cell_type == "e":
            return f"#ERROR:{raw_value or 'UNKNOWN'}"
        return raw_value

    def rows(self, sheet_name: str) -> list[tuple[int, dict[int, str]]]:
        if sheet_name not in self.sheets:
            fail(f"required worksheet is missing: {sheet_name}")
        try:
            root = self._xml(self.sheets[sheet_name])
        except (KeyError, ET.ParseError) as error:
            fail(f"cannot read worksheet {sheet_name}: {error}")

        rows: list[tuple[int, dict[int, str]]] = []
        for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
            try:
                row_number = int(row.attrib["r"])
            except (KeyError, ValueError):
                fail(f"worksheet {sheet_name} contains a row without a valid number")
            values: dict[int, str] = {}
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                reference = cell.attrib.get("r", "")
                index = column_index(reference)
                if index in values:
                    fail(f"worksheet {sheet_name} row {row_number} repeats a cell")
                value = self._value(cell)
                if value is not None:
                    values[index] = value
            rows.append((row_number, values))
        return rows


def find_headers(
    sheet_name: str,
    rows: list[tuple[int, dict[int, str]]],
    required: frozenset[str],
) -> tuple[int, dict[str, int]]:
    matches: list[tuple[int, dict[str, int]]] = []
    for row_number, row in rows:
        cells: list[tuple[str, int]] = []
        for index, raw_value in row.items():
            value = cell_text(raw_value)
            if not value:
                continue
            cells.append((value, index))
        values = {value for value, _ in cells}
        if required.issubset(values):
            headers: dict[str, int] = {}
            for value, index in cells:
                if value in headers:
                    fail(
                        f"worksheet {sheet_name} row {row_number} repeats "
                        f"header {value!r}"
                    )
                headers[value] = index
            matches.append((row_number, headers))
    if not matches:
        fail(
            f"worksheet {sheet_name} has no header row containing: "
            + ", ".join(sorted(required))
        )
    if len(matches) > 1:
        fail(f"worksheet {sheet_name} has ambiguous header rows")
    return matches[0]


def record_from_row(row: dict[int, str], headers: dict[str, int]) -> dict[str, str]:
    return {
        header: cell_text(row.get(index)) for header, index in headers.items()
    }


def read_config(workbook: Workbook) -> dict[str, str]:
    rows = workbook.rows("05_CONFIG")
    header_row, headers = find_headers("05_CONFIG", rows, CONFIG_HEADERS)
    config: dict[str, str] = {}
    for row_number, row in rows:
        if row_number <= header_row:
            continue
        record = record_from_row(row, headers)
        key = record["key"]
        if not key:
            continue
        if key in config:
            fail(f"05_CONFIG row {row_number} repeats key {key!r}")
        config[key] = record["value"]

    expected = {
        "contract_id": CONTRACT_ID,
        "schema_version": SCHEMA_VERSION,
        "timezone": TIMEZONE_NAME,
    }
    for key, expected_value in expected.items():
        actual = config.get(key)
        if actual != expected_value:
            fail(
                f"05_CONFIG {key} must be {expected_value!r}; found {actual!r}"
            )
    release = config.get("release_version", "")
    if not RELEASE_RE.fullmatch(release):
        fail(f"05_CONFIG release_version is invalid: {release!r}")
    return config


def read_sources(workbook: Workbook) -> dict[str, dict[str, str]]:
    rows = workbook.rows("07_SOURCE_MASTER")
    header_row, headers = find_headers("07_SOURCE_MASTER", rows, SOURCE_HEADERS)
    sources: dict[str, dict[str, str]] = {}
    for row_number, row in rows:
        if row_number <= header_row:
            continue
        record = record_from_row(row, headers)
        source_id = record["source_id"]
        if not source_id:
            continue
        if source_id in sources:
            fail(f"07_SOURCE_MASTER row {row_number} repeats source_id {source_id!r}")
        record["_row"] = str(row_number)
        sources[source_id] = record
    return sources


def parse_version(raw_value: str, row_number: int) -> int:
    try:
        value = Decimal(raw_value)
    except InvalidOperation:
        fail(f"06_PREDICTIONS row {row_number} has invalid version {raw_value!r}")
    if not value.is_finite() or value != value.to_integral_value() or value < 1:
        fail(f"06_PREDICTIONS row {row_number} has invalid version {raw_value!r}")
    version = int(value)
    if version > 2_147_483_647:
        fail(f"06_PREDICTIONS row {row_number} version is too large")
    return version


def parse_jst_datetime(
    raw_value: str, field_name: str, row_number: int, date_1904: bool
) -> tuple[datetime, str]:
    if not raw_value:
        fail(f"06_PREDICTIONS row {row_number} is missing {field_name}")

    if NUMERIC_RE.fullmatch(raw_value):
        try:
            serial = Decimal(raw_value)
        except InvalidOperation:
            fail(
                f"06_PREDICTIONS row {row_number} has invalid {field_name}: "
                f"{raw_value!r}"
            )
        if not serial.is_finite():
            fail(
                f"06_PREDICTIONS row {row_number} has invalid {field_name}: "
                f"{raw_value!r}"
            )
        epoch = datetime(1904, 1, 1) if date_1904 else datetime(1899, 12, 30)
        seconds = int(
            (serial * Decimal(86_400)).to_integral_value(rounding=ROUND_HALF_UP)
        )
        try:
            value = (epoch + timedelta(seconds=seconds)).replace(tzinfo=JST)
        except OverflowError:
            fail(
                f"06_PREDICTIONS row {row_number} has out-of-range {field_name}"
            )
    else:
        normalized = raw_value.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            value = datetime.fromisoformat(normalized)
        except ValueError:
            fail(
                f"06_PREDICTIONS row {row_number} has invalid {field_name}: "
                f"{raw_value!r}"
            )
        if value.microsecond:
            fail(
                f"06_PREDICTIONS row {row_number} {field_name} must use whole seconds"
            )
        value = value.replace(tzinfo=JST) if value.tzinfo is None else value.astimezone(JST)

    return value, value.isoformat(timespec="seconds")


def validate_https_url(raw_value: str, description: str) -> str:
    value = raw_value.strip()
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        fail(f"{description} is not a valid HTTPS URL")
    if (
        any(character.isspace() for character in value)
        or any(ord(character) < 32 for character in value)
        or parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port is not None and not (1 <= port <= 65535)
    ):
        fail(f"{description} is not a valid HTTPS URL")
    return value


def clean_resolution_rule(raw_value: str, row_number: int) -> str:
    if not raw_value:
        fail(f"06_PREDICTIONS row {row_number} is missing resolution_rule")
    value = raw_value.replace("\r\n", "\n").replace("\r", "\n").strip()
    value = WRAPPED_URL_RE.sub("", value)

    def remove_url(match: re.Match[str]) -> str:
        matched = match.group(0)
        trailing = ""
        while matched and matched[-1] in "。、，,；;：:！？!?":
            trailing = matched[-1] + trailing
            matched = matched[:-1]
        return trailing

    value = URL_RE.sub(remove_url, value)
    value = TIMEZONE_SENTENCE_RE.sub("", value)
    value = HOLD_RE.sub("判定保留", value)
    value = re.sub(r"（[ \t\u3000]*）|\([ \t\u3000]*\)", "", value)
    value = re.sub(r"[ \t\u3000]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value).strip()
    if not value:
        fail(f"06_PREDICTIONS row {row_number} has an empty public resolution rule")
    if URL_PREFIX_RE.search(value):
        fail(f"06_PREDICTIONS row {row_number} resolution_rule still contains a URL")
    if TIMEZONE_SENTENCE_RE.search(value):
        fail(
            f"06_PREDICTIONS row {row_number} resolution_rule still contains "
            "a timezone-only sentence"
        )
    return value


def required_text(record: dict[str, str], field_name: str, row_number: int) -> str:
    value = record.get(field_name, "").strip()
    if not value:
        fail(f"06_PREDICTIONS row {row_number} is missing {field_name}")
    return value


def boolean_is_false(raw_value: str) -> bool:
    return raw_value.strip().upper() in {"FALSE", "0"}


def public_prediction(
    record: dict[str, str],
    row_number: int,
    version: int,
    sources: dict[str, dict[str, str]],
    date_1904: bool,
) -> dict[str, Any]:
    prediction_id = record["prediction_id"]
    status = record["status"]
    key = f"{prediction_id}|{version}"
    if record["git_publish_key"] != key:
        fail(
            f"06_PREDICTIONS row {row_number} git_publish_key must be {key!r}"
        )

    category = required_text(record, "category", row_number)
    if category not in VALID_CATEGORIES:
        fail(f"06_PREDICTIONS row {row_number} has unsupported category {category!r}")
    horizon = required_text(record, "horizon", row_number)
    if horizon not in VALID_HORIZONS:
        fail(f"06_PREDICTIONS row {row_number} has unsupported horizon {horizon!r}")

    question = required_text(record, "question_text", row_number)
    if len(question) > 240:
        fail(f"06_PREDICTIONS row {row_number} question_text exceeds 240 characters")

    choice_slots = [record[field].strip() for field in CHOICE_FIELDS]
    choices = [choice for choice in choice_slots if choice]
    if not 2 <= len(choices) <= 4:
        fail(f"06_PREDICTIONS row {row_number} must have 2 to 4 choices")
    if len(choices) != len(set(choices)):
        fail(f"06_PREDICTIONS row {row_number} repeats a choice")
    first_blank = next(
        (index for index, choice in enumerate(choice_slots) if not choice),
        len(choice_slots),
    )
    if any(choice_slots[first_blank + 1 :]):
        fail(
            f"06_PREDICTIONS row {row_number} has a choice after a blank choice slot"
        )

    resolution_rule = clean_resolution_rule(record["resolution_rule"], row_number)
    publish_value, publish_at = parse_jst_datetime(
        record["publish_at_jst"], "publish_at_jst", row_number, date_1904
    )
    close_value, close_at = parse_jst_datetime(
        record["close_at_jst"], "close_at_jst", row_number, date_1904
    )
    result_due_value, result_due_at = parse_jst_datetime(
        record["result_due_at_jst"], "result_due_at_jst", row_number, date_1904
    )
    if not publish_value < close_value < result_due_value:
        fail(
            f"06_PREDICTIONS row {row_number} must satisfy "
            "publish_at_jst < close_at_jst < result_due_at_jst"
        )

    source_id = required_text(record, "primary_source_id", row_number)
    source = sources.get(source_id)
    if source is None:
        fail(
            f"06_PREDICTIONS row {row_number} references missing source {source_id!r}"
        )
    source_row = source["_row"]
    if source["status"] != "ACTIVE":
        fail(
            f"07_SOURCE_MASTER row {source_row} source {source_id!r} is not ACTIVE"
        )
    if source["trust_tier"] != "A":
        fail(
            f"07_SOURCE_MASTER row {source_row} source {source_id!r} "
            "does not have trust_tier=A"
        )
    if source["result_ok"].upper() not in {"TRUE", "1"}:
        fail(
            f"07_SOURCE_MASTER row {source_row} source {source_id!r} "
            "does not have result_ok=TRUE"
        )
    source_name = source["source_name"].strip()
    if not source_name:
        fail(f"07_SOURCE_MASTER row {source_row} source {source_id!r} has no name")
    source_url = validate_https_url(
        source["url"], f"07_SOURCE_MASTER row {source_row} source {source_id!r} URL"
    )

    item: dict[str, Any] = {
        "id": prediction_id,
        "version": version,
        "category": category,
        "horizon": horizon,
        "question": question,
        "choices": choices,
        "resolutionRule": resolution_rule,
        "publishAt": publish_at,
        "closeAt": close_at,
        "resultDueAt": result_due_at,
        "source": {"name": source_name, "url": source_url},
    }

    final_result = record["final_result"].upper()
    has_verified_result = status in {"RESULT_APPROVED", "SETTLED"}
    if has_verified_result:
        if status == "RESULT_APPROVED" and record["final_gate"] != "READY":
            fail(
                f"06_PREDICTIONS row {row_number} RESULT_APPROVED requires "
                "final_gate=READY"
            )
        if record["result_status"] != "FINAL":
            fail(
                f"06_PREDICTIONS row {row_number} {status} requires result_status=FINAL"
            )
        valid_result_ids = CHOICE_IDS[: len(choices)]
        if final_result not in valid_result_ids:
            fail(
                f"06_PREDICTIONS row {row_number} has invalid final_result "
                f"{final_result!r}"
            )
        validate_https_url(
            required_text(record, "result_source_url", row_number),
            f"06_PREDICTIONS row {row_number} result_source_url",
        )
        expected_settlement_key = f"{key}|{final_result}"
        if record["settlement_key"] != expected_settlement_key:
            fail(
                f"06_PREDICTIONS row {row_number} settlement_key must be "
                f"{expected_settlement_key!r}"
            )
        if not boolean_is_false(record["needs_human_review"]):
            fail(
                f"06_PREDICTIONS row {row_number} verified result requires "
                "needs_human_review=FALSE"
            )
        if status == "SETTLED":
            item["finalResult"] = final_result
    elif final_result or record["result_status"] == "FINAL" or record["final_gate"] == "READY":
        fail(
            f"06_PREDICTIONS row {row_number} exposes an unverified final result"
        )

    if status in PERSISTED_STATUSES:
        required_text(record, "article_slug", row_number)
        parse_jst_datetime(
            required_text(record, "published_at", row_number),
            "published_at",
            row_number,
            date_1904,
        )
    if status == "SETTLED":
        settled_value, _ = parse_jst_datetime(
            required_text(record, "settled_at", row_number),
            "settled_at",
            row_number,
            date_1904,
        )
        if settled_value < result_due_value:
            fail(
                f"06_PREDICTIONS row {row_number} settled_at must not precede "
                "result_due_at_jst"
            )
    return item


def approved_prediction_is_due(publish_at: datetime, as_of_jst: datetime) -> bool:
    """Return true at and after the approved row's publication instant."""
    if publish_at.tzinfo is None or as_of_jst.tzinfo is None:
        fail("prediction publication times must include a timezone")
    return publish_at.astimezone(JST) <= as_of_jst.astimezone(JST)


def read_predictions(
    workbook: Workbook,
    sources: dict[str, dict[str, str]],
    as_of_jst: datetime,
    approved_keys: set[str] | None = None,
) -> tuple[list[dict[str, Any]], set[str]]:
    rows = workbook.rows("06_PREDICTIONS")
    header_row, headers = find_headers(
        "06_PREDICTIONS", rows, PREDICTION_HEADERS
    )
    selected: list[dict[str, Any]] = []
    keys: dict[str, int] = {}
    matched_approved_keys: set[str] = set()
    unpublished_withdrawals: set[str] = set()

    for row_number, row in rows:
        if row_number <= header_row:
            continue
        record = record_from_row(row, headers)
        prediction_id = record["prediction_id"]
        if not prediction_id:
            continue
        if prediction_id == "PRED-TEMPLATE":
            continue
        if not ID_RE.fullmatch(prediction_id):
            fail(
                f"06_PREDICTIONS row {row_number} has invalid prediction_id "
                f"{prediction_id!r}"
            )
        version = parse_version(record["version"], row_number)
        key = f"{prediction_id}|{version}"
        if key in keys:
            fail(
                f"06_PREDICTIONS rows {keys[key]} and {row_number} duplicate {key!r}"
            )
        keys[key] = row_number

        status = record["status"]
        if status not in KNOWN_STATUSES:
            fail(f"06_PREDICTIONS row {row_number} has invalid status {status!r}")
        publish_gate = record["publish_gate"]
        if publish_gate not in {"READY", "HOLD"}:
            fail(
                f"06_PREDICTIONS row {row_number} has invalid publish_gate "
                f"{publish_gate!r}"
            )
        expected_publish_gate = (
            "READY"
            if status == PUBLISHABLE_STATUS
            and all(
                record[field]
                for field in (
                    "question_text",
                    "choice_a",
                    "resolution_rule",
                    "primary_source_id",
                    "publish_at_jst",
                    "close_at_jst",
                    "result_due_at_jst",
                    "git_publish_key",
                )
            )
            else "HOLD"
        )
        if publish_gate != expected_publish_gate:
            fail(
                f"06_PREDICTIONS row {row_number} has stale publish_gate "
                f"{publish_gate!r}; expected {expected_publish_gate!r}"
            )

        final_gate = record["final_gate"]
        if final_gate not in {"READY", "HOLD"}:
            fail(
                f"06_PREDICTIONS row {row_number} has invalid final_gate "
                f"{final_gate!r}"
            )
        expected_final_gate = (
            "READY"
            if status == "RESULT_APPROVED"
            and record["final_result"]
            and record["settlement_key"]
            and record["needs_human_review"].upper() != "TRUE"
            else "HOLD"
        )
        if final_gate != expected_final_gate:
            fail(
                f"06_PREDICTIONS row {row_number} has stale final_gate "
                f"{final_gate!r}; expected {expected_final_gate!r}"
            )

        item: dict[str, Any] | None = None
        include = status in PERSISTED_STATUSES
        if status == PUBLISHABLE_STATUS and publish_gate == "READY":
            # Validate approved rows before applying the clock gate so a malformed
            # future row fails CI before it can become public.
            item = public_prediction(
                record, row_number, version, sources, workbook.date_1904
            )
            is_due = approved_prediction_is_due(
                datetime.fromisoformat(item["publishAt"]), as_of_jst
            )
            include = is_due and (
                approved_keys is None or key in approved_keys
            )
            if include and approved_keys is not None:
                matched_approved_keys.add(key)
        if include:
            if item is None:
                item = public_prediction(
                    record, row_number, version, sources, workbook.date_1904
                )
            selected.append(item)
        elif not any(
            record[field]
            for field in (
                "published_at",
                "article_slug",
                "final_result",
                "result_source_url",
                "settled_at",
                "settlement_key",
            )
        ):
            # A staged item may be withdrawn before Action 1 publishes it. Sheet
            # publication/result evidence makes an apparent regression non-removable.
            unpublished_withdrawals.add(key)

    if approved_keys is not None:
        unmatched = sorted(approved_keys.difference(matched_approved_keys))
        if unmatched:
            fail(
                "approved publication plan key does not match a due "
                f"APPROVED_FOR_PUBLISH row: {unmatched[0]}"
            )
    selected.sort(key=lambda item: (item["id"], item["version"]))
    return selected, unpublished_withdrawals


def extract_json_assignment(text: str, name: str) -> Any:
    marker = f"export const {name} = Object.freeze("
    if text.count(marker) != 1:
        fail(f"existing generated catalog has invalid {name} declaration")
    start = text.index(marker) + len(marker)
    try:
        value, end = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError as error:
        fail(f"existing generated catalog has invalid {name} JSON: {error}")
    if not re.match(r"\s*\);", text[end:]):
        fail(f"existing generated catalog has invalid {name} terminator")
    return value


def catalog_key(item: Any, context: str) -> str:
    if not isinstance(item, dict):
        fail(f"{context} contains a non-object catalog item")
    prediction_id = item.get("id")
    version = item.get("version")
    if not isinstance(prediction_id, str) or not ID_RE.fullmatch(prediction_id):
        fail(f"{context} contains an invalid prediction id")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        fail(f"{context} contains an invalid prediction version")
    return f"{prediction_id}|{version}"


def version_tuple(value: str, context: str) -> tuple[int, int, int]:
    match = RELEASE_RE.fullmatch(value)
    if not match:
        fail(f"{context} has invalid releaseVersion {value!r}")
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def protect_existing_history(
    output_path: Path,
    metadata: dict[str, str],
    catalog: list[dict[str, Any]],
    unpublished_withdrawals: set[str],
) -> None:
    if not output_path.exists():
        return
    try:
        existing_text = output_path.read_text(encoding="utf-8")
    except OSError as error:
        fail(f"cannot read existing generated catalog: {error}")

    existing_metadata = extract_json_assignment(
        existing_text, "predictionCatalogRelease"
    )
    existing_catalog = extract_json_assignment(existing_text, "rawPredictionCatalog")
    if not isinstance(existing_metadata, dict) or not isinstance(existing_catalog, list):
        fail("existing generated catalog has invalid top-level data")
    if existing_metadata.get("contractId") != CONTRACT_ID:
        fail("existing generated catalog has a different contractId")
    if existing_metadata.get("schemaVersion") != SCHEMA_VERSION:
        fail("existing generated catalog has a different schemaVersion")
    previous_release = existing_metadata.get("releaseVersion")
    if not isinstance(previous_release, str):
        fail("existing generated catalog has no releaseVersion")
    if version_tuple(metadata["releaseVersion"], "workbook") < version_tuple(
        previous_release, "existing generated catalog"
    ):
        fail(
            "workbook releaseVersion is older than the existing generated catalog "
            f"({metadata['releaseVersion']} < {previous_release})"
        )

    old_by_key: dict[str, dict[str, Any]] = {}
    for item in existing_catalog:
        key = catalog_key(item, "existing generated catalog")
        if key in old_by_key:
            fail(f"existing generated catalog duplicates {key!r}")
        old_by_key[key] = item
    new_by_key = {catalog_key(item, "new catalog"): item for item in catalog}

    missing = sorted(
        (set(old_by_key) - set(new_by_key)) - unpublished_withdrawals
    )
    if missing:
        fail(
            "workbook would remove existing prediction history: " + ", ".join(missing)
        )
    for key, old_item in old_by_key.items():
        if key not in new_by_key:
            continue
        new_item = new_by_key[key]
        changed = [
            field
            for field in IMMUTABLE_FIELDS
            if old_item.get(field) != new_item.get(field)
        ]
        if changed:
            fail(
                f"prediction {key} changes immutable public fields without a "
                f"version bump: {', '.join(changed)}"
            )
        if "finalResult" in old_item and old_item["finalResult"] != new_item.get(
            "finalResult"
        ):
            fail(f"prediction {key} changes or removes its verified finalResult")


def render_catalog(
    metadata: dict[str, str], catalog: list[dict[str, Any]]
) -> str:
    metadata_json = json.dumps(metadata, ensure_ascii=False, indent=2)
    catalog_json = json.dumps(catalog, ensure_ascii=False, indent=2)
    return (
        "// Generated by scripts/import-predictions.py. Do not edit.\n\n"
        f"export const predictionCatalogRelease = Object.freeze({metadata_json});\n\n"
        f"export const rawPredictionCatalog = Object.freeze({catalog_json});\n"
    )


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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
    except OSError as error:
        fail(f"cannot write generated catalog: {error}")
    finally:
        if temporary_name:
            try:
                Path(temporary_name).unlink(missing_ok=True)
            except OSError:
                pass


def load_approved_plan(path: Path) -> tuple[set[str], datetime]:
    try:
        plan = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        fail("cannot read approved publication plan JSON")
    if not isinstance(plan, dict):
        fail("approved publication plan must be a JSON object")
    if (
        not isinstance(plan.get("plan_version"), int)
        or isinstance(plan.get("plan_version"), bool)
        or plan["plan_version"] != 1
    ):
        fail("approved publication plan version is unsupported")
    if plan.get("spreadsheet_id") != SPREADSHEET_ID:
        fail("approved publication plan targets a different spreadsheet")
    if (
        plan.get("contract_id") != CONTRACT_ID
        or plan.get("schema_version") != SCHEMA_VERSION
    ):
        fail("approved publication plan contract does not match")
    if not isinstance(plan.get("release_version"), str) or not RELEASE_RE.fullmatch(
        plan["release_version"]
    ):
        fail("approved publication plan release version is invalid")
    snapshot_fingerprint = plan.get("snapshot_fingerprint")
    if not isinstance(snapshot_fingerprint, str) or not TOKEN_RE.fullmatch(
        snapshot_fingerprint
    ):
        fail("approved publication plan fingerprint is invalid")
    as_of_jst = timezone_iso_datetime(
        plan.get("as_of_jst"), "approved publication plan as_of_jst"
    )
    items = plan.get("items")
    if not isinstance(items, list) or len(items) > MAX_APPROVED_KEYS:
        fail("approved publication plan items are invalid")
    if not isinstance(plan.get("noop"), bool) or plan["noop"] != (not items):
        fail("approved publication plan no-op state is invalid")
    deferred_count = plan.get("deferred_count")
    if (
        not isinstance(deferred_count, int)
        or isinstance(deferred_count, bool)
        or deferred_count < 0
    ):
        fail("approved publication plan deferred count is invalid")
    if deferred_count and len(items) != MAX_APPROVED_KEYS:
        fail("approved publication plan deferred count is inconsistent")
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
        fail("approved publication plan counts are inconsistent")

    expected_fields = {
        "row_number",
        "prediction_id",
        "version",
        "key",
        "expected_status",
        "expected_publish_gate",
        "publish_at_jst",
        "state_token",
    }
    approved_keys: set[str] = set()
    order: list[tuple[datetime, str, int]] = []
    for item in items:
        if not isinstance(item, dict) or set(item) != expected_fields:
            fail("approved publication plan contains an invalid item")
        prediction_id = item["prediction_id"]
        version = item["version"]
        key = item["key"]
        if (
            not isinstance(prediction_id, str)
            or not ID_RE.fullmatch(prediction_id)
            or not isinstance(version, int)
            or isinstance(version, bool)
            or version < 1
            or key != f"{prediction_id}|{version}"
            or key in approved_keys
        ):
            fail("approved publication plan contains an invalid key")
        if (
            item["expected_status"] != PUBLISHABLE_STATUS
            or item["expected_publish_gate"] != "READY"
            or not isinstance(item["row_number"], int)
            or isinstance(item["row_number"], bool)
            or item["row_number"] < 4
            or not isinstance(item["state_token"], str)
            or not TOKEN_RE.fullmatch(item["state_token"])
        ):
            fail("approved publication plan contains an invalid expected state")
        publish_at = timezone_iso_datetime(
            item["publish_at_jst"], "approved publication plan publish_at_jst"
        )
        if publish_at > as_of_jst:
            fail("approved publication plan contains a future item")
        approved_keys.add(key)
        order.append((publish_at, prediction_id, version))
    if order != sorted(order):
        fail("approved publication plan items are not in stable order")
    return approved_keys, as_of_jst


def build(
    workbook_path: Path,
    as_of_jst: datetime | None = None,
    approved_keys: set[str] | None = None,
) -> tuple[dict[str, str], list[dict[str, Any]], set[str]]:
    if as_of_jst is None:
        as_of_jst = datetime.now(JST)
    elif as_of_jst.tzinfo is None:
        fail("injected catalog time must include a timezone")
    else:
        as_of_jst = as_of_jst.astimezone(JST)
    with Workbook(workbook_path) as workbook:
        config = read_config(workbook)
        sources = read_sources(workbook)
        catalog, unpublished_withdrawals = read_predictions(
            workbook, sources, as_of_jst, approved_keys
        )
    metadata = {
        "contractId": CONTRACT_ID,
        "schemaVersion": SCHEMA_VERSION,
        "releaseVersion": config["release_version"],
    }
    return metadata, catalog, unpublished_withdrawals


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import PROJECT_SIXTH Prediction Ops XLSX into worker data."
    )
    parser.add_argument(
        "workbook",
        nargs="?",
        type=Path,
        default=DEFAULT_WORKBOOK,
        help=f"input XLSX (default: {DEFAULT_WORKBOOK})",
    )
    parser.add_argument(
        "--as-of",
        type=cli_as_of,
        help="catalog cutoff as an ISO date-time with an explicit timezone",
    )
    parser.add_argument(
        "--approved-keys-file",
        type=Path,
        help="publication plan JSON whose selected APPROVED rows may be exported",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the generated catalog is absent or differs",
    )
    return parser.parse_args(argv)


def run(argv: list[str]) -> int:
    arguments = parse_args(argv)
    workbook_path = arguments.workbook.expanduser().resolve()
    approved_keys: set[str] | None = None
    plan_as_of: datetime | None = None
    if arguments.approved_keys_file is not None:
        approved_keys, plan_as_of = load_approved_plan(
            arguments.approved_keys_file.expanduser().resolve()
        )
    as_of_jst = arguments.as_of or plan_as_of
    if (
        arguments.as_of is not None
        and plan_as_of is not None
        and arguments.as_of.astimezone(timezone.utc)
        != plan_as_of.astimezone(timezone.utc)
    ):
        fail("--as-of does not match approved publication plan as_of_jst")
    metadata, catalog, unpublished_withdrawals = build(
        workbook_path, as_of_jst, approved_keys
    )
    protect_existing_history(
        OUTPUT_PATH, metadata, catalog, unpublished_withdrawals
    )
    expected = render_catalog(metadata, catalog)

    current: str | None = None
    if OUTPUT_PATH.exists():
        try:
            current = OUTPUT_PATH.read_text(encoding="utf-8")
        except OSError as error:
            fail(f"cannot read generated catalog: {error}")

    description = (
        f"{len(catalog)} predictions, release {metadata['releaseVersion']}"
    )
    if arguments.check:
        if current != expected:
            fail(f"generated catalog is out of date ({description})")
        print(f"prediction catalog is up to date ({description})")
        return 0
    if current == expected:
        print(f"prediction catalog unchanged ({description})")
        return 0
    write_atomic(OUTPUT_PATH, expected)
    print(f"wrote {OUTPUT_PATH} ({description})")
    return 0


def main() -> int:
    try:
        return run(sys.argv[1:])
    except ImportFailure as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
