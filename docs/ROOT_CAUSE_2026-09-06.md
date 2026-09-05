# PROJECT SIXTH prediction publication — root cause and hardening (2026-09-06)

## Executive finding

The repeated GitHub Action failures were not one single Google Apps Script transport defect.
The current failure in `Capture the initial live publication plan` is caused by duplicate **T03** audit IDs in the shared Sheet, while the publication bridge treats *every* duplicate `11_AUDIT_LOG.audit_id` as a fatal publication error.

This created a brittle coupling: an unrelated Spark-stage logging defect could take GitHub Action 1 offline even when the actual publication rows and GitHub publication audits were valid.

## Evidence from the 2026-09-06 snapshot

The workbook contains eight duplicate T03 IDs:

- `AUD-T03-20260906-054407-019` — rows 173 and 181
- `AUD-T03-20260906-054407-020` — rows 174 and 182
- `AUD-T03-20260906-054407-021` — rows 175 and 183
- `AUD-T03-20260906-054407-023` — rows 176 and 184
- `AUD-T03-20260906-054407-024` — rows 177 and 185
- `AUD-T03-20260906-054407-025` — rows 178 and 186
- `AUD-T03-20260906-054407-026` — rows 179 and 187
- `AUD-T03-20260906-054407-028` — rows 180 and 188

`12_RUN_LOG` contains only one corresponding run: `RUN-T03-20260906-054407-a1`, Skill version `2.2.0`.
Therefore this is not evidence that T03 ran twice. The same run produced/replayed two audit batches.

The first batch (rows 173–180) also uses a legacy/misaligned audit shape: column B contains `T03`, column C the run ID, column D `06_PREDICTIONS`, etc. The second batch (181–188) uses the canonical 16-column schema. This is a logging-protocol problem, not a publication-data problem.

## Root causes

### 1. Unsafe Spark log retry rule

The deployed/repository T03 Skill 2.2.0 says: append the log, search for the ID, and if missing **or duplicated, append once more to a fresh row**.
A delayed/ambiguous read-back can therefore turn a successful first append into a duplicate second append.
The same dangerous instruction existed across the Skill set.

### 2. Audit row schema was implicit

The older Skills did not explicitly require the canonical 16-field `11_AUDIT_LOG` order. This allowed a legacy/short row layout to be written before the canonical row was appended.

### 3. Publication Action was coupled to all Spark audit integrity

`scripts/google-sheets-bridge.py::_publication_audits()` rejected any duplicate audit ID before filtering for `PREDICTION_PUBLISHED`. This means a T03/T04/T05 logging defect can block Action 1 even if the Action 1 idempotency records are healthy.

### 4. Repository had multiple drifting Skill sources

Before this hardening:

- `gemini-spark/skills/*` = 2.1.0
- `spark/skills/*` = 2.2.0
- `gemini-spark/packages/*` = 2.1.0
- `spark/packages/*` = 2.2.0
- `spark/skills/packages/*` = 2.1.0

Documentation says `gemini-spark/` is canonical, but it was not the newest copy. This made it easy to install a stale Skill accidentally.

## Hardening in this patch

### GitHub Action / bridge

- Non-publication duplicate audit IDs become a **health warning**, not a publication outage.
- Successful `PREDICTION_PUBLISHED` audit IDs and publication idempotency keys remain strictly fail-closed.
- The plan contains `audit_health`; the workflow emits a GitHub warning when unrelated duplicate IDs exist.
- Current workbook duplicates are therefore visible without preventing Action 1.

### Gemini Spark Skills 2.3.0

All seven Skills now use the same log protocol:

- 16-hex random run nonce.
- `RUN-<TaskID>-YYYYMMDD-HHMMSS-<nonce>`.
- Exact canonical 16-field AUDIT layout.
- Audit sequence `0001`, `0002`, ... within one run.
- Precheck ID count must be 0.
- **Append once only. No append retry for unknown/missing/delayed read-back.**
- Postcheck ID count must be exactly 1; otherwise E017 and stop.
- Exact 15-field RUN_LOG layout.
- Explicit `SPARK_<TaskID>` actor and `immutable=TRUE` validation.

### Repository source of truth

- `gemini-spark/skills/` remains canonical.
- `spark/skills/` is synchronized byte-for-byte.
- All three package locations contain the same canonical `SKILL.md` bytes.
- `tests/test_spark_skill_sync.py` prevents future source/package drift.
- `gemini-spark/tasks/` and `spark/tasks/` are synchronized for T01–T08.

### GAS diagnostics

The bridge gains a harmless `doGet()` health probe returning only service/protocol/version information. It exposes no Sheet ID, user data, token, or secret.

## Operational rule for workbook replacement

Full-workbook GAS overwrite should be treated as a maintenance event, not a routine repair mechanism.
When it is unavoidable, pause Spark schedules and the publication workflow first, overwrite/verify, then resume. Do not overlap a workbook replacement with a Spark run.

## What is intentionally not repaired

The historical T03 duplicate rows are not rewritten by this patch. They are evidence of the failure and the log is append-only. Action 1 no longer requires unrelated historical Spark audit IDs to be globally unique, while health warnings keep the defect visible.
