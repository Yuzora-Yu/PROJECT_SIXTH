from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from datetime import datetime
from pathlib import Path
from unittest import mock
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
IMPORTER_PATH = ROOT / "scripts" / "import-predictions.py"

SPEC = importlib.util.spec_from_file_location("prediction_importer", IMPORTER_PATH)
assert SPEC is not None and SPEC.loader is not None
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


def column_name(index: int) -> str:
    result = ""
    value = index + 1
    while value:
        value, remainder = divmod(value - 1, 26)
        result = chr(ord("A") + remainder) + result
    return result


def worksheet_xml(rows: list[list[str]]) -> str:
    rendered_rows = []
    for row_number, values in enumerate(rows, start=1):
        cells = []
        for column, value in enumerate(values):
            if value == "":
                continue
            reference = f"{column_name(column)}{row_number}"
            cells.append(
                f'<c r="{reference}" t="inlineStr"><is><t>'
                f"{escape(value)}"
                "</t></is></c>"
            )
        rendered_rows.append(
            f'<row r="{row_number}">' + "".join(cells) + "</row>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<worksheet xmlns="{IMPORTER.MAIN_NS}"><sheetData>'
        + "".join(rendered_rows)
        + "</sheetData></worksheet>"
    )


def prediction_record(
    prediction_id: str,
    status: str,
    *,
    publish_gate: str,
    final_gate: str,
    final_result: str = "",
    settled_at: str = "2026-09-05T14:30:00+09:00",
) -> dict[str, str]:
    key = f"{prediction_id}|1"
    persisted = status in IMPORTER.PERSISTED_STATUSES
    verified = status in {"RESULT_APPROVED", "SETTLED"}
    return {
        "prediction_id": prediction_id,
        "version": "1",
        "status": status,
        "category": "SPORTS",
        "horizon": "SHORT",
        "question_text": f"{prediction_id} の結果はどちらか？",
        "choice_a": "選択肢A",
        "choice_b": "選択肢B",
        "choice_c": "",
        "choice_d": "",
        "resolution_rule": "公式結果で判定する。",
        "primary_source_id": "SOURCE-1",
        "publish_at_jst": "2026-09-05T12:00:00+09:00",
        "close_at_jst": "2026-09-05T13:00:00+09:00",
        "result_due_at_jst": "2026-09-05T14:00:00+09:00",
        "published_at": "2026-09-05T12:00:00+09:00" if persisted else "",
        "git_publish_key": key,
        "article_slug": prediction_id.lower() if persisted else "",
        "result_status": "FINAL" if verified else "",
        "final_result": final_result,
        "result_source_url": "https://example.com/result" if verified else "",
        "settled_at": settled_at if status == "SETTLED" else "",
        "settlement_key": f"{key}|{final_result}" if verified else "",
        "needs_human_review": "FALSE",
        "publish_gate": publish_gate,
        "final_gate": final_gate,
    }


def write_fixture(
    path: Path,
    settled_at: str = "2026-09-05T14:30:00+09:00",
    *,
    extra_approved: bool = False,
) -> None:
    config_rows = [
        ["key", "value"],
        ["contract_id", IMPORTER.CONTRACT_ID],
        ["schema_version", IMPORTER.SCHEMA_VERSION],
        ["timezone", IMPORTER.TIMEZONE_NAME],
        ["release_version", "9.9.9"],
    ]
    source_headers = sorted(IMPORTER.SOURCE_HEADERS)
    source = {
        "source_id": "SOURCE-1",
        "source_name": "公式情報源",
        "url": "https://example.com/source",
        "status": "ACTIVE",
        "trust_tier": "A",
        "result_ok": "TRUE",
    }
    source_rows = [source_headers, [source[field] for field in source_headers]]

    prediction_headers = sorted(IMPORTER.PREDICTION_HEADERS)
    records = [
        prediction_record(
            "PRED-20260905-001",
            "APPROVED_FOR_PUBLISH",
            publish_gate="READY",
            final_gate="HOLD",
        ),
        prediction_record(
            "PRED-20260905-002",
            "PUBLISHED",
            publish_gate="HOLD",
            final_gate="HOLD",
        ),
        prediction_record(
            "PRED-20260905-003",
            "RESULT_APPROVED",
            publish_gate="HOLD",
            final_gate="READY",
            final_result="A",
        ),
        prediction_record(
            "PRED-20260905-004",
            "SETTLED",
            publish_gate="HOLD",
            final_gate="HOLD",
            final_result="B",
            settled_at=settled_at,
        ),
    ]
    if extra_approved:
        records.append(
            prediction_record(
                "PRED-20260905-005",
                "APPROVED_FOR_PUBLISH",
                publish_gate="READY",
                final_gate="HOLD",
            )
        )
    prediction_rows = [prediction_headers] + [
        [record[field] for field in prediction_headers] for record in records
    ]

    workbook = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<workbook xmlns="{IMPORTER.MAIN_NS}" '
        f'xmlns:r="{IMPORTER.OFFICE_REL_NS}">'
        '<workbookPr date1904="0"/><sheets>'
        '<sheet name="05_CONFIG" sheetId="1" r:id="rId1"/>'
        '<sheet name="07_SOURCE_MASTER" sheetId="2" r:id="rId2"/>'
        '<sheet name="06_PREDICTIONS" sheetId="3" r:id="rId3"/>'
        "</sheets></workbook>"
    )
    relationships = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<Relationships xmlns="{IMPORTER.PACKAGE_REL_NS}">'
        '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>'
        '<Relationship Id="rId3" Target="worksheets/sheet3.xml"/>'
        "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet_xml(config_rows))
        archive.writestr("xl/worksheets/sheet2.xml", worksheet_xml(source_rows))
        archive.writestr(
            "xl/worksheets/sheet3.xml", worksheet_xml(prediction_rows)
        )


def publication_plan(items: list[dict[str, object]], *, as_of=None):
    deferred = 0
    return {
        "plan_version": 1,
        "spreadsheet_id": IMPORTER.SPREADSHEET_ID,
        "contract_id": IMPORTER.CONTRACT_ID,
        "schema_version": IMPORTER.SCHEMA_VERSION,
        "release_version": "9.9.9",
        "as_of_jst": as_of or "2026-09-05T12:00:00+09:00",
        "snapshot_fingerprint": "a" * 64,
        "noop": not items,
        "deferred_count": deferred,
        "counts": {
            "ready_due": len(items) + deferred,
            "selected": len(items),
            "deferred": deferred,
        },
        "items": items,
    }


def plan_item(prediction_id="PRED-20260905-001", version=1):
    return {
        "row_number": 4,
        "prediction_id": prediction_id,
        "version": version,
        "key": f"{prediction_id}|{version}",
        "expected_status": "APPROVED_FOR_PUBLISH",
        "expected_publish_gate": "READY",
        "publish_at_jst": "2026-09-05T12:00:00+09:00",
        "state_token": "b" * 64,
    }


class PublicationClockTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.workbook_path = Path(self.temporary.name) / "fixture.xlsx"
        write_fixture(self.workbook_path)

    def tearDown(self):
        self.temporary.cleanup()

    def build_at(self, value: str):
        return IMPORTER.build(self.workbook_path, datetime.fromisoformat(value))

    def test_approved_row_stays_private_until_its_publish_instant(self):
        _, before, withdrawals = self.build_at("2026-09-05T11:59:59+09:00")
        before_keys = {f'{item["id"]}|{item["version"]}' for item in before}
        self.assertNotIn("PRED-20260905-001|1", before_keys)
        self.assertIn("PRED-20260905-001|1", withdrawals)

        _, at_boundary, _ = self.build_at("2026-09-05T12:00:00+09:00")
        boundary_keys = {
            f'{item["id"]}|{item["version"]}' for item in at_boundary
        }
        self.assertIn("PRED-20260905-001|1", boundary_keys)

    def test_persisted_statuses_remain_before_the_clock_boundary(self):
        _, catalog, _ = self.build_at("2026-09-05T11:59:59+09:00")
        self.assertEqual(
            {item["id"] for item in catalog},
            {
                "PRED-20260905-002",
                "PRED-20260905-003",
                "PRED-20260905-004",
            },
        )
        by_id = {item["id"]: item for item in catalog}
        self.assertNotIn("finalResult", by_id["PRED-20260905-003"])
        self.assertEqual(by_id["PRED-20260905-004"]["finalResult"], "B")

    def test_settled_time_cannot_precede_result_due_time(self):
        write_fixture(self.workbook_path, "2026-09-05T13:59:59+09:00")
        with self.assertRaisesRegex(
            IMPORTER.ImportFailure, "settled_at must not precede"
        ):
            self.build_at("2026-09-05T15:00:00+09:00")

    def test_injected_time_requires_an_explicit_timezone(self):
        with self.assertRaisesRegex(
            IMPORTER.ImportFailure, "must include a timezone"
        ):
            IMPORTER.build(
                self.workbook_path, datetime(2026, 9, 5, 13, 0, 0)
            )

    def test_plan_allowlist_excludes_unselected_approved_rows_only(self):
        _, catalog, withdrawals = IMPORTER.build(
            self.workbook_path,
            datetime.fromisoformat("2026-09-05T12:00:00+09:00"),
            approved_keys=set(),
        )

        self.assertEqual(
            {item["id"] for item in catalog},
            {
                "PRED-20260905-002",
                "PRED-20260905-003",
                "PRED-20260905-004",
            },
        )
        self.assertIn("PRED-20260905-001|1", withdrawals)

    def test_plan_allowlist_includes_selected_due_approved_row(self):
        write_fixture(self.workbook_path, extra_approved=True)
        _, catalog, withdrawals = IMPORTER.build(
            self.workbook_path,
            datetime.fromisoformat("2026-09-05T12:00:00+09:00"),
            approved_keys={"PRED-20260905-001|1"},
        )
        catalog_ids = {item["id"] for item in catalog}
        self.assertIn("PRED-20260905-001", catalog_ids)
        self.assertNotIn("PRED-20260905-005", catalog_ids)
        self.assertIn("PRED-20260905-005|1", withdrawals)

    def test_plan_allowlist_rejects_key_that_is_not_a_due_approved_row(self):
        with self.assertRaisesRegex(
            IMPORTER.ImportFailure, "does not match a due"
        ):
            IMPORTER.build(
                self.workbook_path,
                datetime.fromisoformat("2026-09-05T12:00:00+09:00"),
                approved_keys={"PRED-20260905-999|1"},
            )


class ImporterCliTests(unittest.TestCase):
    def test_as_of_cli_requires_explicit_timezone(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                IMPORTER.parse_args(["--as-of", "2026-09-05T12:00:00"])
        arguments = IMPORTER.parse_args(
            ["--as-of", "2026-09-05T03:00:00Z"]
        )
        self.assertEqual(
            arguments.as_of.isoformat(timespec="seconds"),
            "2026-09-05T12:00:00+09:00",
        )

    def test_plan_json_is_strict_and_supplies_keys_and_as_of(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "plan.json"
            path.write_text(
                json.dumps(publication_plan([plan_item()])), encoding="utf-8"
            )
            keys, as_of = IMPORTER.load_approved_plan(path)
            self.assertEqual(keys, {"PRED-20260905-001|1"})
            self.assertEqual(
                as_of.isoformat(timespec="seconds"),
                "2026-09-05T12:00:00+09:00",
            )

            malformed_item = plan_item()
            malformed_item["question_text"] = "must never enter the plan"
            path.write_text(
                json.dumps(publication_plan([malformed_item])), encoding="utf-8"
            )
            with self.assertRaisesRegex(
                IMPORTER.ImportFailure, "invalid item"
            ):
                IMPORTER.load_approved_plan(path)

            numeric_hash = publication_plan([plan_item()])
            numeric_hash["snapshot_fingerprint"] = int("1" * 64)
            path.write_text(json.dumps(numeric_hash), encoding="utf-8")
            with self.assertRaisesRegex(
                IMPORTER.ImportFailure, "fingerprint"
            ):
                IMPORTER.load_approved_plan(path)

    def test_run_passes_cli_as_of_and_plan_allowlist_to_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            workbook = directory / "fixture.xlsx"
            plan_path = directory / "plan.json"
            output = directory / "catalog.js"
            plan_path.write_text(
                json.dumps(publication_plan([plan_item()])), encoding="utf-8"
            )
            metadata = {
                "contractId": IMPORTER.CONTRACT_ID,
                "schemaVersion": IMPORTER.SCHEMA_VERSION,
                "releaseVersion": "9.9.9",
            }
            with (
                mock.patch.object(IMPORTER, "OUTPUT_PATH", output),
                mock.patch.object(
                    IMPORTER,
                    "build",
                    return_value=(metadata, [], set()),
                ) as build,
                mock.patch.object(IMPORTER, "protect_existing_history"),
                mock.patch.object(IMPORTER, "render_catalog", return_value="catalog\n"),
            ):
                result = IMPORTER.run(
                    [
                        str(workbook),
                        "--as-of",
                        "2026-09-05T12:00:00+09:00",
                        "--approved-keys-file",
                        str(plan_path),
                    ]
                )

            self.assertEqual(result, 0)
            called_path, called_as_of, called_keys = build.call_args.args
            self.assertEqual(called_path, workbook.resolve())
            self.assertEqual(
                called_as_of.isoformat(timespec="seconds"),
                "2026-09-05T12:00:00+09:00",
            )
            self.assertEqual(called_keys, {"PRED-20260905-001|1"})


if __name__ == "__main__":
    unittest.main()
