from __future__ import annotations

import argparse
import json
import re
import sys
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
CONTRACT_PATHS = (
    ROOT / "gemini-spark" / "ops_contract.json",
    ROOT / "spark" / "ops_contract.json",
)
CANONICAL_TASKS = ROOT / "gemini-spark" / "tasks"
MIRROR_TASKS = ROOT / "spark" / "tasks"
CANONICAL_TASK_SUMMARY = CANONICAL_TASKS / "TASKS.md"
MIRROR_TASK_SUMMARY = ROOT / "spark" / "TASKS.md"


def parse_frontmatter(data: bytes, expected_name: str) -> str:
    text = data.decode("utf-8")
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.S)
    if not match:
        raise ValueError(f"{expected_name}: missing YAML frontmatter")
    block = match.group(1)
    names = re.findall(r"(?m)^name:\s*(\S.*?)\s*$", block)
    versions = re.findall(
        r"(?m)^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$", block
    )
    if names != [expected_name]:
        raise ValueError(f"{expected_name}: top-level name metadata is invalid")
    if len(versions) != 1:
        raise ValueError(f"{expected_name}: top-level version metadata is invalid")
    return versions[0]


def version_tuple(value: str) -> tuple[int, int, int]:
    return tuple(int(part) for part in value.split("."))  # type: ignore[return-value]


def package_bytes(canonical: bytes) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    info = zipfile.ZipInfo("SKILL.md", date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(info, canonical)
    return buffer.getvalue()


def expected_state() -> tuple[dict[str, bytes], str]:
    skills: dict[str, bytes] = {}
    versions: list[str] = []
    for name in SKILL_NAMES:
        canonical = (CANONICAL_SKILLS / name / "SKILL.md").read_bytes()
        versions.append(parse_frontmatter(canonical, name))
        skills[name] = canonical
    return skills, max(versions, key=version_tuple)


def check() -> list[str]:
    errors: list[str] = []
    try:
        skills, package_version = expected_state()
    except (OSError, ValueError) as error:
        return [str(error)]

    for name, canonical in skills.items():
        mirror = MIRROR_SKILLS / name / "SKILL.md"
        if not mirror.exists() or mirror.read_bytes() != canonical:
            errors.append(f"mirror drift: spark/skills/{name}/SKILL.md")
        for package_root in PACKAGE_ROOTS:
            path = package_root / f"{name}.zip"
            try:
                with zipfile.ZipFile(path) as archive:
                    if archive.namelist() != ["SKILL.md"] or archive.read("SKILL.md") != canonical:
                        errors.append(f"package drift: {path.relative_to(ROOT)}")
            except (OSError, zipfile.BadZipFile, KeyError):
                errors.append(f"package drift: {path.relative_to(ROOT)}")

    # Tasks are canonical under gemini-spark/tasks. Check them byte-for-byte so
    # Windows CRLF/LF drift cannot silently survive a "sync OK".
    for canonical_task in sorted(CANONICAL_TASKS.glob("T*.md")):
        if canonical_task.name == "TASKS.md":
            continue
        mirror_task = MIRROR_TASKS / canonical_task.name
        if not mirror_task.exists() or mirror_task.read_bytes() != canonical_task.read_bytes():
            errors.append(f"task mirror drift: spark/tasks/{canonical_task.name}")

    if (
        not MIRROR_TASK_SUMMARY.exists()
        or MIRROR_TASK_SUMMARY.read_bytes() != CANONICAL_TASK_SUMMARY.read_bytes()
    ):
        errors.append("task summary drift: spark/TASKS.md")

    contracts = []
    for path in CONTRACT_PATHS:
        try:
            contract = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"invalid contract {path.relative_to(ROOT)}: {error}")
            continue
        contracts.append((path, contract))
        if contract.get("skill_package_version") != package_version:
            errors.append(
                f"{path.relative_to(ROOT)} skill_package_version must be {package_version}"
            )
    if len(contracts) == 2 and contracts[0][1] != contracts[1][1]:
        errors.append("ops contract mirror drift: gemini-spark != spark")
    return errors


def sync() -> str:
    skills, package_version = expected_state()
    for name, canonical in skills.items():
        mirror = MIRROR_SKILLS / name / "SKILL.md"
        mirror.parent.mkdir(parents=True, exist_ok=True)
        mirror.write_bytes(canonical)
        expected_zip = package_bytes(canonical)
        for package_root in PACKAGE_ROOTS:
            package_root.mkdir(parents=True, exist_ok=True)
            path = package_root / f"{name}.zip"
            current_ok = False
            if path.exists():
                try:
                    with zipfile.ZipFile(path) as archive:
                        current_ok = (
                            archive.namelist() == ["SKILL.md"]
                            and archive.read("SKILL.md") == canonical
                        )
                except (OSError, zipfile.BadZipFile, KeyError):
                    current_ok = False
            if not current_ok:
                path.write_bytes(expected_zip)

    MIRROR_TASKS.mkdir(parents=True, exist_ok=True)
    for canonical_task in sorted(CANONICAL_TASKS.glob("T*.md")):
        if canonical_task.name == "TASKS.md":
            continue
        (MIRROR_TASKS / canonical_task.name).write_bytes(canonical_task.read_bytes())
    MIRROR_TASK_SUMMARY.write_bytes(CANONICAL_TASK_SUMMARY.read_bytes())

    canonical_contract = json.loads(CONTRACT_PATHS[0].read_text(encoding="utf-8"))
    canonical_contract["skill_package_version"] = package_version
    serialized = json.dumps(canonical_contract, ensure_ascii=False, indent=2) + "\n"
    for path in CONTRACT_PATHS:
        path.write_text(serialized, encoding="utf-8")
    return package_version


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync Gemini Spark canonical Skills/Tasks into mirrors and upload packages."
    )
    parser.add_argument("--check", action="store_true", help="report drift without writing")
    args = parser.parse_args()
    if args.check:
        errors = check()
        if errors:
            for error in errors:
                print(f"ERROR: {error}", file=sys.stderr)
            return 1
        _, version = expected_state()
        print(f"Spark Skill/Task sync OK (package {version})")
        return 0
    version = sync()
    print(f"Spark Skill/Task mirrors/packages synced (package {version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
