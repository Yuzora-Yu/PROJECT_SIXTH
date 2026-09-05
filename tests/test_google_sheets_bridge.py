from __future__ import annotations

import copy
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import urllib.error
import zipfile
from email.message import Message
from datetime import datetime
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
BRIDGE_PATH = ROOT / "scripts" / "google-sheets-bridge.py"
SPEC = importlib.util.spec_from_file_location("google_sheets_bridge", BRIDGE_PATH)
assert SPEC is not None and SPEC.loader is not None
BRIDGE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = BRIDGE
SPEC.loader.exec_module(BRIDGE)

FIXED_NOW = datetime.fromisoformat("2026-09-05T15:00:00+09:00")
COMMIT_TIME = datetime.fromisoformat("2026-09-05T15:05:00+09:00")
COMMIT_URL = "https://github.com/Yuzora-Yu/PROJECT_SIXTH/commit/abcdef123456"


def config_rows():
    values = {
        "contract_id": BRIDGE.CONTRACT_ID,
        "schema_version": BRIDGE.SCHEMA_VERSION,
        "release_version": "2.2.0",
        "timezone": BRIDGE.TIMEZONE_NAME,
        "spark_sheet_id": BRIDGE.SPREADSHEET_ID,
        "spark_sheet_url": BRIDGE.SPREADSHEET_URL,
        "gid_dependency": "NONE",
        "required_tabs_csv": ",".join(BRIDGE.REQUIRED_TABS),
    }
    return [
        ["運用設定"],
        ["固定契約"],
        ["key", "value", "meaning"],
        *[[key, value, "test"] for key, value in values.items()],
    ]


def prediction_record(
    number: int = 1,
    *,
    status: str = "APPROVED_FOR_PUBLISH",
    gate: str = "READY",
    publish_at: str = "2026-09-05 12:00:00",
):
    prediction_id = f"PRED-20260905-{number:03d}"
    record = {header: "" for header in BRIDGE.PREDICTION_HEADERS}
    record.update(
        {
            "prediction_id": prediction_id,
            "version": 1,
            "status": status,
            "category": "SPORTS",
            "horizon": "SHORT",
            "priority": "NORMAL",
            "question_text": f"SECRET QUESTION {number}",
            "choice_a": "A",
            "choice_b": "B",
            "resolution_rule": "公式結果で判定する。",
            "primary_source_id": "SRC001",
            "publish_at_jst": publish_at,
            "close_at_jst": "2026-09-06 12:00:00",
            "result_due_at_jst": "2026-09-06 13:00:00",
            "source_timezone": "Asia/Tokyo",
            "t3_status": "PASS",
            "t4_decision": "APPROVE",
            "git_publish_key": f"{prediction_id}|1",
            "publish_gate": gate,
            "final_gate": "HOLD",
        }
    )
    return record


def published_record(number: int = 1, timestamp: str = "2026-09-05 14:24:00"):
    record = prediction_record(number, status="PUBLISHED", gate="HOLD")
    record.update(
        {
            "published_at": timestamp,
            "article_slug": BRIDGE.ARTICLE_SLUG,
            "updated_at": timestamp,
        }
    )
    return record


def publication_audit(
    number: int = 1,
    *,
    audit_id: str | None = None,
    timestamp: str = "2026-09-05 14:24:00",
    run_id: str = "RUN-ACTION1-existing-1",
):
    prediction_id = f"PRED-20260905-{number:03d}"
    return {
        "audit_id": audit_id or f"AUD-ACTION1-existing-{number:03d}",
        "timestamp_jst": timestamp,
        "actor": "CODEX_ACTION1",
        "action": "PREDICTION_PUBLISHED",
        "entity_type": "PREDICTION",
        "idempotency_key": f"{prediction_id}|1",
        "entity_id": prediction_id,
        "version": 1,
        "before_status": "APPROVED_FOR_PUBLISH",
        "after_status": "PUBLISHED",
        "decision": "SUCCESS",
        "reason": "公開済み",
        "evidence_url_1": BRIDGE.PUBLIC_URL,
        "evidence_url_2": COMMIT_URL,
        "run_id": run_id,
        "immutable": True,
    }


def other_stage_audit(number: int = 1):
    prediction_id = f"PRED-20260905-{number:03d}"
    record = publication_audit(number)
    record.update(
        {
            "audit_id": f"AUD-T04-{number:03d}",
            "actor": "SPARK_T04",
            "action": "PUBLICATION_APPROVED",
            "before_status": "CHECK_PASSED",
            "after_status": "APPROVED_FOR_PUBLISH",
            "decision": "APPROVE",
            "run_id": "RUN-T04-test",
        }
    )
    return record


def source_record(source_id: str = "SRC001", *, notes: str = "source notes"):
    record = {header: "" for header in BRIDGE.SOURCE_HEADERS}
    record.update(
        {
            "source_id": source_id,
            "source_name": "公式情報源",
            "url": "https://example.com/source",
            "category": "SPORTS",
            "role": "PRIMARY",
            "trust_tier": "A",
            "status": "ACTIVE",
            "discovery_ok": "TRUE",
            "result_ok": "TRUE",
            "login_required": "FALSE",
            "paywall": "FALSE",
            "stability": "HIGH",
            "update_frequency": "DAILY",
            "quality_score": "95",
            "notes": notes,
            "last_verified": "2026-09-05 10:00:00",
        }
    )
    return record


def table_rows(headers, records, title):
    return [
        [title],
        ["test fixture"],
        list(headers),
        *[[record.get(header, "") for header in headers] for record in records],
    ]


def metadata():
    return {
        "spreadsheetId": BRIDGE.SPREADSHEET_ID,
        "properties": {"timeZone": BRIDGE.TIMEZONE_NAME},
        "sheets": [
            {"properties": {"title": title, "sheetId": 100 + index}}
            for index, title in enumerate(BRIDGE.REQUIRED_TABS)
        ],
    }


def snapshot(
    predictions,
    audits=(),
    *,
    prediction_headers=None,
    sources=None,
    source_headers=None,
):
    headers = prediction_headers or BRIDGE.PREDICTION_HEADERS
    source_table_headers = source_headers or BRIDGE.SOURCE_HEADERS
    source_records = [source_record()] if sources is None else sources
    return {
        "metadata": metadata(),
        "ranges": [
            config_rows(),
            table_rows(headers, predictions, "予測"),
            table_rows(source_table_headers, source_records, "情報源"),
            table_rows(BRIDGE.AUDIT_HEADERS, audits, "監査"),
        ],
    }


def xlsx_bytes():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            "<Types>" + "x" * 200 + "</Types>",
        )
        archive.writestr("xl/workbook.xml", "<workbook/>")
        archive.writestr("xl/worksheets/sheet1.xml", "<worksheet/>")
    return stream.getvalue()


class FakeApi:
    def __init__(self, snapshots=(), binary_response=None):
        self.snapshots = list(snapshots)
        self.snapshot_index = 0
        self.binary_response = binary_response
        self.batch_requests = []
        self.requested_ranges = []

    def export_xlsx(self, spreadsheet_id):
        self.export_spreadsheet_id = spreadsheet_id
        assert self.binary_response is not None
        return self.binary_response

    def get_spreadsheet_metadata(self, spreadsheet_id):
        self.metadata_spreadsheet_id = spreadsheet_id
        if self.snapshot_index >= len(self.snapshots):
            raise AssertionError("unexpected metadata read")
        return copy.deepcopy(self.snapshots[self.snapshot_index]["metadata"])

    def batch_get_values(self, spreadsheet_id, ranges):
        self.requested_ranges.append(tuple(ranges))
        if self.snapshot_index >= len(self.snapshots):
            raise AssertionError("unexpected values read")
        value = copy.deepcopy(self.snapshots[self.snapshot_index]["ranges"])
        self.snapshot_index += 1
        return value

    def batch_update(self, spreadsheet_id, requests):
        self.batch_requests.append(
            {"spreadsheet_id": spreadsheet_id, "requests": copy.deepcopy(requests)}
        )
        return {"spreadsheetId": spreadsheet_id, "replies": []}


class PlanTests(unittest.TestCase):
    def test_plan_cli_as_of_requires_explicit_timezone(self):
        with mock.patch.dict(
            BRIDGE.os.environ, {"GHA_GOOGLE_ACCESS_TOKEN": "access-token"}
        ):
            with self.assertRaisesRegex(BRIDGE.BridgeError, "timezone"):
                BRIDGE.run(["plan", "--as-of", "2026-09-05T15:00:00"])

    def test_happy_path_plan_contains_only_operational_metadata(self):
        api = FakeApi([snapshot([prediction_record()], [other_stage_audit()])])
        plan = BRIDGE.SheetsBridge(api, clock=lambda: FIXED_NOW).plan()

        self.assertFalse(plan["noop"])
        self.assertEqual(plan["counts"]["ready_due"], 1)
        self.assertEqual(
            plan["items"][0]["key"], "PRED-20260905-001|1"
        )
        rendered = json.dumps(plan, ensure_ascii=False)
        self.assertNotIn("SECRET QUESTION", rendered)
        self.assertNotIn("question_text", rendered)
        self.assertEqual(
            api.requested_ranges[0],
            (
                BRIDGE.CONFIG_RANGE,
                BRIDGE.PREDICTIONS_RANGE,
                BRIDGE.SOURCE_RANGE,
                BRIDGE.AUDIT_RANGE,
            ),
        )

    def test_live_like_six_published_rows_are_noop(self):
        predictions = [published_record(number) for number in (1, 4, 5, 7, 8, 11)]
        audits = [publication_audit(number) for number in (1, 4, 5, 7, 8, 11)]
        plan = BRIDGE.SheetsBridge(
            FakeApi([snapshot(predictions, audits)]), clock=lambda: FIXED_NOW
        ).plan()

        self.assertTrue(plan["noop"])
        self.assertEqual(plan["items"], [])
        self.assertEqual(plan["counts"]["already_published"], 6)
        self.assertEqual(plan["counts"]["publication_audits"], 6)

    def test_future_ready_row_is_not_due(self):
        plan = BRIDGE.SheetsBridge(
            FakeApi(
                [
                    snapshot(
                        [
                            prediction_record(
                                publish_at="2026-09-05 15:00:01"
                            )
                        ]
                    )
                ]
            ),
            clock=lambda: FIXED_NOW,
        ).plan()
        self.assertTrue(plan["noop"])
        self.assertEqual(plan["counts"]["ready_future"], 1)

    def test_prediction_header_mismatch_fails_closed(self):
        headers = list(BRIDGE.PREDICTION_HEADERS)
        headers[2] = "state"
        bridge = BRIDGE.SheetsBridge(
            FakeApi([snapshot([prediction_record()], prediction_headers=headers)]),
            clock=lambda: FIXED_NOW,
        )
        with self.assertRaisesRegex(BRIDGE.BridgeError, "header"):
            bridge.plan()

    def test_source_header_mismatch_fails_closed(self):
        headers = list(BRIDGE.SOURCE_HEADERS)
        headers[-1] = "verified_at"
        bridge = BRIDGE.SheetsBridge(
            FakeApi(
                [
                    snapshot(
                        [prediction_record()],
                        source_headers=headers,
                    )
                ]
            ),
            clock=lambda: FIXED_NOW,
        )
        with self.assertRaisesRegex(BRIDGE.BridgeError, "07_SOURCE_MASTER header"):
            bridge.plan()

    def test_more_than_six_due_rows_are_stably_sliced_and_deferred(self):
        records = [prediction_record(number) for number in range(7, 0, -1)]
        plan = BRIDGE.SheetsBridge(
            FakeApi([snapshot(records)]), clock=lambda: FIXED_NOW
        ).plan()

        self.assertEqual(
            [item["prediction_id"] for item in plan["items"]],
            [f"PRED-20260905-{number:03d}" for number in range(1, 7)],
        )
        self.assertEqual(plan["counts"]["ready_due"], 7)
        self.assertEqual(plan["counts"]["selected"], 6)
        self.assertEqual(plan["deferred_count"], 1)
        self.assertEqual(plan["counts"]["deferred"], 1)

    def test_state_token_covers_all_prediction_and_source_content(self):
        first = BRIDGE.SheetsBridge(
            FakeApi([snapshot([prediction_record()])]), clock=lambda: FIXED_NOW
        ).plan()
        changed_prediction = prediction_record()
        changed_prediction["question_text"] = "CHANGED SECRET QUESTION"
        second = BRIDGE.SheetsBridge(
            FakeApi([snapshot([changed_prediction])]), clock=lambda: FIXED_NOW
        ).plan()
        third = BRIDGE.SheetsBridge(
            FakeApi(
                [
                    snapshot(
                        [prediction_record()],
                        sources=[source_record(notes="changed source notes")],
                    )
                ]
            ),
            clock=lambda: FIXED_NOW,
        ).plan()

        self.assertNotEqual(
            first["items"][0]["state_token"],
            second["items"][0]["state_token"],
        )
        self.assertNotEqual(
            first["items"][0]["state_token"],
            third["items"][0]["state_token"],
        )

    def test_plan_hashes_must_be_json_strings(self):
        original = BRIDGE.SheetsBridge(
            FakeApi([snapshot([prediction_record()])]), clock=lambda: FIXED_NOW
        ).plan()
        cases = (
            ("fingerprint", lambda plan: plan.__setitem__(
                "snapshot_fingerprint", int("1" * 64)
            )),
            ("state token", lambda plan: plan["items"][0].__setitem__(
                "state_token", int("1" * 64)
            )),
        )
        for message, mutate in cases:
            with self.subTest(message=message):
                plan = copy.deepcopy(original)
                mutate(plan)
                with self.assertRaisesRegex(BRIDGE.BridgeError, message):
                    BRIDGE.SheetsBridge._validate_plan(
                        plan, BRIDGE.SPREADSHEET_ID
                    )

    def test_only_successful_publication_audit_marks_a_key_published(self):
        eligible = BRIDGE.SheetsBridge(
            FakeApi([snapshot([prediction_record()], [other_stage_audit()])]),
            clock=lambda: FIXED_NOW,
        ).plan()
        self.assertEqual(len(eligible["items"]), 1)

        conflicting = BRIDGE.SheetsBridge(
            FakeApi([snapshot([prediction_record()], [publication_audit()])]),
            clock=lambda: FIXED_NOW,
        )
        with self.assertRaisesRegex(BRIDGE.BridgeError, "conflicts"):
            conflicting.plan()


class CommitTests(unittest.TestCase):
    def _plan_and_api(self, after_snapshot):
        before = snapshot([prediction_record()], [other_stage_audit()])
        api = FakeApi([before, before, after_snapshot])
        bridge = BRIDGE.SheetsBridge(api, clock=lambda: COMMIT_TIME)
        plan = bridge.plan(FIXED_NOW)
        return bridge, api, plan

    @staticmethod
    def _expected_audit_id(run_id="RUN-ACTION1-test-1"):
        digest = hashlib.sha256(
            f"{run_id}|PRED-20260905-001|1|1".encode("utf-8")
        ).hexdigest()[:8]
        return f"AUD-ACTION1-20260905-150500-{digest}"

    def _successful_after_snapshot(self, run_id="RUN-ACTION1-test-1"):
        audit_id = self._expected_audit_id(run_id)
        audit = publication_audit(
            audit_id=audit_id,
            timestamp="2026-09-05 15:05:00",
            run_id=run_id,
        )
        audit.update(
            {
                "actor": "GITHUB_ACTION1",
                "reason": "GitHub Action 1で公開カタログを検証し、本番公開を確認した。",
            }
        )
        return snapshot(
            [published_record(timestamp="2026-09-05 15:05:00")],
            [other_stage_audit(), audit],
        )

    def test_commit_uses_one_atomic_batch_and_only_four_prediction_cells(self):
        run_id = "RUN-ACTION1-test-1"
        bridge, api, plan = self._plan_and_api(
            self._successful_after_snapshot(run_id)
        )
        result = bridge.commit_publication(
            plan,
            {"PRED-20260905-001|1"},
            commit_url=COMMIT_URL,
            published_at=COMMIT_TIME,
            run_id=run_id,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(result["committed_count"], 1)
        self.assertEqual(len(api.batch_requests), 1)
        requests = api.batch_requests[0]["requests"]
        self.assertEqual(len(requests), 5)
        updates = [request["updateCells"] for request in requests[:-1]]
        self.assertEqual(
            {update["start"]["columnIndex"] for update in updates},
            {2, 28, 30, 41},
        )
        self.assertTrue(
            all(update["fields"] == "userEnteredValue" for update in updates)
        )
        self.assertEqual(
            {update["start"]["rowIndex"] for update in updates}, {3}
        )
        append = requests[-1]["appendCells"]
        self.assertEqual(append["sheetId"], 111)
        self.assertEqual(len(append["rows"]), 1)
        self.assertEqual(len(append["rows"][0]["values"]), 16)
        self.assertEqual(append["fields"], "userEnteredValue")

    def test_commit_fails_before_write_when_row_state_changed(self):
        initial = snapshot([prediction_record()], [other_stage_audit()])
        changed = snapshot(
            [prediction_record(status="HOLD", gate="HOLD")],
            [other_stage_audit()],
        )
        api = FakeApi([initial, changed])
        bridge = BRIDGE.SheetsBridge(api, clock=lambda: COMMIT_TIME)
        plan = bridge.plan(FIXED_NOW)

        with self.assertRaisesRegex(BRIDGE.BridgeError, "snapshot changed"):
            bridge.commit_publication(
                plan,
                {"PRED-20260905-001|1"},
                commit_url=COMMIT_URL,
                published_at=COMMIT_TIME,
                run_id="RUN-ACTION1-test-1",
            )
        self.assertEqual(api.batch_requests, [])

    def test_commit_detects_source_change_before_atomic_write(self):
        initial = snapshot([prediction_record()], [other_stage_audit()])
        changed = snapshot(
            [prediction_record()],
            [other_stage_audit()],
            sources=[source_record(notes="updated after plan")],
        )
        api = FakeApi([initial, changed])
        bridge = BRIDGE.SheetsBridge(api, clock=lambda: COMMIT_TIME)
        plan = bridge.plan(FIXED_NOW)

        with self.assertRaisesRegex(BRIDGE.BridgeError, "snapshot changed"):
            bridge.commit_publication(
                plan,
                {"PRED-20260905-001|1"},
                commit_url=COMMIT_URL,
                published_at=COMMIT_TIME,
                run_id="RUN-ACTION1-test-1",
            )
        self.assertEqual(api.batch_requests, [])

    def test_commit_detects_change_to_persisted_catalog_row(self):
        initial_published = published_record(2)
        initial = snapshot(
            [prediction_record(), initial_published],
            [other_stage_audit(), publication_audit(2)],
        )
        changed_published = published_record(2)
        changed_published["question_text"] = "changed published question"
        changed = snapshot(
            [prediction_record(), changed_published],
            [other_stage_audit(), publication_audit(2)],
        )
        api = FakeApi([initial, changed])
        bridge = BRIDGE.SheetsBridge(api, clock=lambda: COMMIT_TIME)
        plan = bridge.plan(FIXED_NOW)

        with self.assertRaisesRegex(BRIDGE.BridgeError, "snapshot changed"):
            bridge.commit_publication(
                plan,
                {"PRED-20260905-001|1"},
                commit_url=COMMIT_URL,
                published_at=COMMIT_TIME,
                run_id="RUN-ACTION1-test-1",
            )
        self.assertEqual(api.batch_requests, [])

    def test_commit_detects_change_to_a_deferred_due_row(self):
        initial_records = [prediction_record(number) for number in range(1, 8)]
        changed_records = copy.deepcopy(initial_records)
        changed_records[-1]["question_text"] = "changed deferred question"
        api = FakeApi(
            [snapshot(initial_records), snapshot(changed_records)]
        )
        bridge = BRIDGE.SheetsBridge(api, clock=lambda: COMMIT_TIME)
        plan = bridge.plan(FIXED_NOW)

        with self.assertRaisesRegex(BRIDGE.BridgeError, "snapshot changed"):
            bridge.commit_publication(
                plan,
                {item["key"] for item in plan["items"]},
                commit_url=COMMIT_URL,
                published_at=COMMIT_TIME,
                run_id="RUN-ACTION1-test-1",
            )
        self.assertEqual(api.batch_requests, [])

    def test_commit_requires_public_api_key_verification(self):
        before = snapshot([prediction_record()], [other_stage_audit()])
        api = FakeApi([before])
        bridge = BRIDGE.SheetsBridge(api, clock=lambda: COMMIT_TIME)
        plan = bridge.plan(FIXED_NOW)
        with self.assertRaisesRegex(BRIDGE.BridgeError, "public API verification"):
            bridge.commit_publication(
                plan,
                set(),
                commit_url=COMMIT_URL,
                published_at=COMMIT_TIME,
                run_id="RUN-ACTION1-test-1",
            )
        self.assertEqual(api.batch_requests, [])

    def test_readback_mismatch_is_reported_after_atomic_write(self):
        run_id = "RUN-ACTION1-test-1"
        bad_after = snapshot(
            [published_record(timestamp="2026-09-05 15:05:00")],
            [other_stage_audit()],
        )
        bridge, api, plan = self._plan_and_api(bad_after)
        with self.assertRaisesRegex(BRIDGE.BridgeError, "audit read-back"):
            bridge.commit_publication(
                plan,
                {"PRED-20260905-001|1"},
                commit_url=COMMIT_URL,
                published_at=COMMIT_TIME,
                run_id=run_id,
            )
        self.assertEqual(len(api.batch_requests), 1)

    def test_noop_commit_rereads_and_does_not_write(self):
        existing = snapshot([published_record()], [publication_audit()])
        api = FakeApi([existing, existing])
        bridge = BRIDGE.SheetsBridge(api, clock=lambda: COMMIT_TIME)
        plan = bridge.plan(FIXED_NOW)
        result = bridge.commit_publication(
            plan, set(), commit_url=None, published_at=COMMIT_TIME
        )
        self.assertEqual(result["status"], "NOOP")
        self.assertEqual(api.batch_requests, [])
        self.assertEqual(api.snapshot_index, 2)


class ExportTests(unittest.TestCase):
    def test_export_checks_and_saves_valid_xlsx(self):
        data = xlsx_bytes()
        api = FakeApi(binary_response=BRIDGE.BinaryResponse(data, BRIDGE.XLSX_MIME))
        bridge = BRIDGE.SheetsBridge(api)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "ops.xlsx"
            result = bridge.export(path)
            self.assertEqual(path.read_bytes(), data)
            self.assertEqual(result["bytes"], len(data))
            self.assertEqual(result["sha256"], hashlib.sha256(data).hexdigest())

    def test_export_rejects_wrong_content_type_and_non_zip(self):
        cases = (
            BRIDGE.BinaryResponse(xlsx_bytes(), "text/html"),
            BRIDGE.BinaryResponse(b"x" * 300, BRIDGE.XLSX_MIME),
        )
        for response in cases:
            with self.subTest(content_type=response.content_type):
                bridge = BRIDGE.SheetsBridge(FakeApi(binary_response=response))
                with tempfile.TemporaryDirectory() as temporary:
                    path = Path(temporary) / "ops.xlsx"
                    with self.assertRaises(BRIDGE.BridgeError):
                        bridge.export(path)
                    self.assertFalse(path.exists())


class GoogleRestApiRetryTests(unittest.TestCase):
    class Response:
        def __init__(self, data: bytes, content_type: str):
            self.data = data
            self.headers = {"Content-Type": content_type}

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def read(self, amount: int) -> bytes:
            return self.data[:amount]

    @staticmethod
    def http_error(code: int, retry_after: str | None = None):
        headers = Message()
        if retry_after is not None:
            headers["Retry-After"] = retry_after
        return urllib.error.HTTPError(
            "https://example.invalid", code, "temporary", headers, None
        )

    def test_drive_export_get_retries_429_and_caps_retry_after(self):
        delays = []
        response = self.Response(b"xlsx", BRIDGE.XLSX_MIME)
        with mock.patch.object(
            BRIDGE.urllib.request,
            "urlopen",
            side_effect=[self.http_error(429, "99"), response],
        ) as urlopen:
            result = BRIDGE.GoogleRestApi(
                "access-token", sleep=delays.append
            ).export_xlsx(BRIDGE.SPREADSHEET_ID)

        self.assertEqual(result.data, b"xlsx")
        self.assertEqual(delays, [BRIDGE.MAX_RETRY_DELAY_SECONDS])
        self.assertEqual(urlopen.call_count, 2)

    def test_sheets_read_get_retries_5xx_with_short_backoff(self):
        delays = []
        payload = json.dumps(
            {
                "spreadsheetId": BRIDGE.SPREADSHEET_ID,
                "properties": {"timeZone": BRIDGE.TIMEZONE_NAME},
                "sheets": [],
            }
        ).encode("utf-8")
        response = self.Response(payload, "application/json")
        with mock.patch.object(
            BRIDGE.urllib.request,
            "urlopen",
            side_effect=[self.http_error(503), response],
        ) as urlopen:
            result = BRIDGE.GoogleRestApi(
                "access-token", sleep=delays.append
            ).get_spreadsheet_metadata(BRIDGE.SPREADSHEET_ID)

        self.assertEqual(result["spreadsheetId"], BRIDGE.SPREADSHEET_ID)
        self.assertEqual(delays, [0.25])
        self.assertEqual(urlopen.call_count, 2)

    def test_atomic_post_is_never_retried_after_unknown_http_failure(self):
        delays = []
        with mock.patch.object(
            BRIDGE.urllib.request,
            "urlopen",
            side_effect=self.http_error(503, "1"),
        ) as urlopen:
            with self.assertRaisesRegex(BRIDGE.BridgeError, "HTTP 503"):
                BRIDGE.GoogleRestApi(
                    "access-token", sleep=delays.append
                ).batch_update(BRIDGE.SPREADSHEET_ID, [])

        self.assertEqual(delays, [])
        self.assertEqual(urlopen.call_count, 1)


if __name__ == "__main__":
    unittest.main()
