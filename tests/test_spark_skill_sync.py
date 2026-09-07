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
    "collect-prediction-candidates", "draft-prediction-question", "audit-prediction-question",
    "approve-prediction-publication", "verify-prediction-result-primary",
    "verify-prediction-result-secondary", "settle-prediction-result",
)
PACKAGE_ROOTS = (ROOT / "gemini-spark" / "packages", ROOT / "spark" / "packages", ROOT / "spark" / "skills" / "packages")

def frontmatter(text: str) -> str:
    m = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
    if not m: raise AssertionError("SKILL.md is missing YAML frontmatter")
    return m.group(1)

def top_level_field(block: str, key: str) -> list[str]:
    return re.findall(rf"(?m)^{re.escape(key)}:\s*(.*?)\s*$", block)

def files_under(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(x for x in root.rglob("*") if x.is_file())}

class SparkSkillSyncTests(unittest.TestCase):
    def test_v241_skill_sources_mirrors_and_packages(self):
        required_contracts = {"contracts/00_RUNTIME_CONTRACT.md","contracts/10_SHEET_IO.md","contracts/20_LOG_LANES.md","contracts/30_STATE_MACHINE.md","contracts/40_ERROR_POLICY.md"}
        for name in SKILL_NAMES:
            with self.subTest(skill=name):
                root = CANONICAL_SKILLS / name
                files = files_under(root)
                text = files["SKILL.md"].decode("utf-8")
                self.assertEqual(top_level_field(frontmatter(text), "name"), [name])
                self.assertEqual(top_level_field(frontmatter(text), "version"), ["2.4.1"])
                self.assertTrue(required_contracts.issubset(files))
                for needle in ("Required Skill Runtime=<TaskID>@2.4.1","dedicated lane","fixed A1 target","Cursor `+1` immediately after a log write is advisory only","re-count the eligible workset"):
                    self.assertIn(needle, text)
                self.assertEqual(files_under(MIRROR_SKILLS / name), files)
                for pkg_root in PACKAGE_ROOTS:
                    with zipfile.ZipFile(pkg_root / f"{name}.zip") as z:
                        names = {n for n in z.namelist() if not n.endswith("/")}
                        self.assertEqual(names, set(files))
                        for rel,data in files.items(): self.assertEqual(z.read(rel), data)

    def test_tasks_v241_are_mirrored_and_runtime_pinned(self):
        canonical_root=ROOT/"gemini-spark"/"tasks"; mirror_root=ROOT/"spark"/"tasks"
        for canonical in sorted(canonical_root.glob("T*.md")):
            if canonical.name == "TASKS.md": continue
            text=canonical.read_text(encoding="utf-8")
            tid=re.match(r"(T\d\d)_", canonical.name).group(1)
            self.assertIn(f"Required Skill Runtime={tid}@2.4.1", text)
            self.assertIn(f"05_CONFIG.{tid.lower()}_required_skill_version=2.4.1", text)
            self.assertEqual((mirror_root/canonical.name).read_bytes(), canonical.read_bytes())
        self.assertEqual((ROOT/"spark"/"TASKS.md").read_bytes(), (canonical_root/"TASKS.md").read_bytes())

    def test_ops_contract_v241(self):
        canonical=json.loads((ROOT/"gemini-spark"/"ops_contract.json").read_text(encoding="utf-8")); mirror=json.loads((ROOT/"spark"/"ops_contract.json").read_text(encoding="utf-8"))
        self.assertEqual(canonical, mirror)
        self.assertEqual(canonical["release_version"], "2.2.0")
        self.assertEqual(canonical["schema_version"], "2.0.0")
        self.assertEqual(canonical["skill_package_version"], "2.4.1")
        self.assertEqual(canonical["task_package_version"], "2.4.1")
        self.assertEqual(canonical["runtime_hardening_version"], "2.4.1")
        self.assertEqual(canonical["log_lane_contract_version"], "2.1.0")
        self.assertEqual(canonical["heartbeat_policy"], "FIXED_A1_RANGE_WITH_AB_GUARD_EXACT_WRITE")
        self.assertEqual(canonical["cursor_postwrite_policy"], "ADVISORY_ONLY_NOT_SUCCESS_CRITERION")
        self.assertEqual(canonical["heartbeat_targets"]["T05"]["target"], "04_SCHEDULES!H8:N8")
        self.assertEqual(canonical["heartbeat_targets"]["T05"]["guard_range"], "04_SCHEDULES!A8:B8")
        self.assertEqual(canonical["heartbeat_targets"]["T05"]["guard"], "SC05|T05")
        self.assertEqual(canonical["log_lanes"]["T03"], [2001,2500])
        self.assertEqual(canonical["log_lanes"]["T08"], [4501,5000])
        self.assertEqual(canonical["pure_scheduled_noop_policy"], "HEARTBEAT_ONLY")
        self.assertTrue(all(v=="2.4.1" for v in canonical["task_required_skill_versions"].values()))


    def test_t05_v241_regression_guards(self):
        root=CANONICAL_SKILLS/"verify-prediction-result-primary"
        log=(root/"contracts"/"20_LOG_LANES.md").read_text(encoding="utf-8")
        state=(root/"contracts"/"30_STATE_MACHINE.md").read_text(encoding="utf-8")
        task=(ROOT/"gemini-spark"/"tasks"/"T05_verify_result_primary.md").read_text(encoding="utf-8")
        for needle in ("directly re-read the exact row just written", "Task's own lane", "advisory only", "Cursor non-advance by itself is NOT a write failure"):
            self.assertIn(needle, log)
        for needle in ("not searched or inferred", "literal heartbeat target", "E027"):
            self.assertIn(needle, state)
        for needle in ("Heartbeat target: `04_SCHEDULES!H8:N8`", "Heartbeat guard range: `04_SCHEDULES!A8:B8` => `SC05|T05`", "cursorの即時+1反映は成功条件にしない"):
            self.assertIn(needle, task)

    def test_t03_domain_hardening_retained(self):
        text=(CANONICAL_SKILLS/"audit-prediction-question"/"SKILL.md").read_text(encoding="utf-8")
        for needle in ("prediction_id", "One prediction = one exact-row write", "Primary source hard gate", "last_error_code=E022", "E019"):
            self.assertIn(needle, text)

if __name__ == "__main__": unittest.main()
