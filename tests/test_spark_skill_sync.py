from __future__ import annotations

import json
import re
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_SKILLS = ROOT / "gemini-spark" / "skills"
MIRROR_SKILLS = ROOT / "spark" / "skills"
SKILL_NAMES = (
    "collect-prediction-candidates",
    "draft-prediction-question",
    "audit-prediction-question",
    "approve-prediction-publication",
    "verify-prediction-result-primary",
    "verify-prediction-result-secondary",
    "settle-prediction-result",
)
PACKAGE_ROOTS = (
    ROOT / "gemini-spark" / "packages",
    ROOT / "spark" / "packages",
    ROOT / "spark" / "skills" / "packages",
)


def frontmatter(text: str) -> str:
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
    if not match:
        raise AssertionError("SKILL.md is missing YAML frontmatter")
    return match.group(1)


def top_level_field(block: str, key: str) -> list[str]:
    return re.findall(rf"(?m)^{re.escape(key)}:\s*(.*?)\s*$", block)


def version_tuple(value: str) -> tuple[int, int, int]:
    return tuple(int(part) for part in value.split("."))  # type: ignore[return-value]


class SparkSkillSyncTests(unittest.TestCase):
    def test_skill_sources_and_all_upload_packages_match_canonical(self):
        versions: list[str] = []
        for name in SKILL_NAMES:
            with self.subTest(skill=name):
                canonical = (CANONICAL_SKILLS / name / "SKILL.md").read_bytes()
                text = canonical.decode("utf-8")
                metadata = frontmatter(text)
                self.assertEqual(top_level_field(metadata, "name"), [name])
                version_fields = top_level_field(metadata, "version")
                self.assertEqual(len(version_fields), 1)
                version = version_fields[0]
                self.assertRegex(version, r"^[0-9]+\.[0-9]+\.[0-9]+$")
                versions.append(version)
                self.assertIn("Append each audit row **once only**", text)
                self.assertNotIn("append once more to a fresh row", text)
                self.assertEqual(
                    (MIRROR_SKILLS / name / "SKILL.md").read_bytes(), canonical
                )
                for package_root in PACKAGE_ROOTS:
                    with zipfile.ZipFile(package_root / f"{name}.zip") as archive:
                        self.assertEqual(archive.namelist(), ["SKILL.md"])
                        self.assertEqual(archive.read("SKILL.md"), canonical)

        expected_package_version = max(versions, key=version_tuple)
        canonical_contract = json.loads(
            (ROOT / "gemini-spark" / "ops_contract.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            canonical_contract["skill_package_version"], expected_package_version
        )

    def test_task_sources_are_mirrored(self):
        canonical_root = ROOT / "gemini-spark" / "tasks"
        mirror_root = ROOT / "spark" / "tasks"
        for canonical in sorted(canonical_root.glob("T*.md")):
            if canonical.name == "TASKS.md":
                continue
            mirror = mirror_root / canonical.name
            with self.subTest(task=canonical.name):
                self.assertTrue(mirror.exists())
                self.assertEqual(
                    mirror.read_bytes(),
                    canonical.read_bytes(),
                    "Run `npm run spark:sync` to repair task mirror drift.",
                )

        self.assertEqual(
            (ROOT / "spark" / "TASKS.md").read_bytes(),
            (canonical_root / "TASKS.md").read_bytes(),
            "Run `npm run spark:sync` to repair spark/TASKS.md drift.",
        )

    def test_ops_contract_mirrors_match_current_versions(self):
        canonical = json.loads(
            (ROOT / "gemini-spark" / "ops_contract.json").read_text(encoding="utf-8")
        )
        mirror = json.loads(
            (ROOT / "spark" / "ops_contract.json").read_text(encoding="utf-8")
        )
        self.assertEqual(canonical, mirror)
        self.assertEqual(canonical["release_version"], "2.2.0")
        self.assertEqual(canonical["task_package_version"], "2.2.1")
        self.assertEqual(canonical["gas_implementation_compatible"], "2.1.2")

    def test_t03_v233_runtime_and_log_hardening(self):
        skill = (CANONICAL_SKILLS / "audit-prediction-question" / "SKILL.md").read_text(encoding="utf-8")
        task = (ROOT / "gemini-spark" / "tasks" / "T03_audit_prediction_question.md").read_text(encoding="utf-8")
        contract = json.loads((ROOT / "gemini-spark" / "ops_contract.json").read_text(encoding="utf-8"))

        self.assertEqual(top_level_field(frontmatter(skill), "version"), ["2.3.3"])
        for required in (
            "Required Skill Runtime=T03@2.3.3",
            "greatest physical row number",
            "Never use an implicit append operation",
            "target_row = tail_row + 1",
            "terminal `12_RUN_LOG` row is mandatory",
            "last_error_code=E022",
            "Never carry these values from the prior entity",
        ):
            self.assertIn(required, skill)

        self.assertIn("Required Skill Runtime=T03@2.3.3", task)
        self.assertIn("t3_required_skill_version=2.3.3", task)
        self.assertEqual(contract["skill_package_version"], "2.3.3")
        self.assertEqual(contract["task_package_version"], "2.2.1")
        self.assertEqual(contract["t3_required_skill_version"], "2.3.3")
        self.assertEqual(contract["t3_log_write_mode"], "EXPLICIT_PHYSICAL_TAIL_PLUS_ONE")
        self.assertEqual(contract["t3_log_hole_policy"], "IGNORE_INTERIOR_BLANK_ROWS")
        self.assertTrue(contract["t3_terminal_run_log_required"])
        self.assertEqual(contract["t3_source_gate_error_code"], "E022")
        self.assertEqual(contract["t3_entity_error_state_policy"], "RESET_PER_ENTITY")


if __name__ == "__main__":
    unittest.main()
