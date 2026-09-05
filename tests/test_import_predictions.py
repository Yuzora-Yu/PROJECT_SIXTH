from __future__ import annotations

import importlib.util
import tempfile
import unittest
import zipfile
from datetime import datetime
from pathlib import Path
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
    path: Path, settled_at: str = "2026-09-05T14:30:00+09:00"
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


if __name__ == "__main__":
    unittest.main()
