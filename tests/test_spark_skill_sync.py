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


class SparkSkillSyncTests(unittest.TestCase):
    def test_skill_sources_and_all_upload_packages_match_canonical(self):
        for name in SKILL_NAMES:
            with self.subTest(skill=name):
                canonical = (CANONICAL_SKILLS / name / "SKILL.md").read_bytes()
                text = canonical.decode("utf-8")
                self.assertRegex(text, r"(?m)^version: 2\.3\.0$")
                self.assertIn("Append each audit row **once only**", text)
                self.assertNotIn("append once more to a fresh row", text)
                self.assertEqual(
                    (MIRROR_SKILLS / name / "SKILL.md").read_bytes(), canonical
                )
                for package_root in PACKAGE_ROOTS:
                    with zipfile.ZipFile(package_root / f"{name}.zip") as archive:
                        self.assertEqual(archive.namelist(), ["SKILL.md"])
                        self.assertEqual(archive.read("SKILL.md"), canonical)

    def test_task_sources_are_mirrored(self):
        for canonical in sorted((ROOT / "gemini-spark" / "tasks").glob("T*.md")):
            if canonical.name == "TASKS.md":
                continue
            mirror = ROOT / "spark" / "tasks" / canonical.name
            with self.subTest(task=canonical.name):
                self.assertTrue(mirror.exists())
                self.assertEqual(mirror.read_bytes(), canonical.read_bytes())

    def test_ops_contract_mirrors_match_current_versions(self):
        canonical = json.loads((ROOT / "gemini-spark" / "ops_contract.json").read_text(encoding="utf-8"))
        mirror = json.loads((ROOT / "spark" / "ops_contract.json").read_text(encoding="utf-8"))
        self.assertEqual(canonical, mirror)
        self.assertEqual(canonical["release_version"], "2.2.0")
        self.assertEqual(canonical["skill_package_version"], "2.3.0")
        self.assertEqual(canonical["task_package_version"], "2.2.0")


if __name__ == "__main__":
    unittest.main()
