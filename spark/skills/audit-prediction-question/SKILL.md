---
name: audit-prediction-question
description: 公開前ドラフトを独立監査し、事実、日時、選択肢、情報源、重複、判定可能性と新規source候補を検証する。
version: 2.4.0
---

# audit-prediction-question

Allowed Task IDs for this Skill: **T03**.
Required tabs: `05_CONFIG`, `06_PREDICTIONS`, `07_SOURCE_MASTER`, `08_SOURCE_CANDIDATES`, `11_AUDIT_LOG`, `12_RUN_LOG`, `04_SCHEDULES`.

## Fixed contract and required support files

- Target Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- Target base URL: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`
- Contract ID: `PROJECT_SIXTH_PREDICTION_OPS`
- Schema version: `2.0.0`
- Runtime version: `2.4.0`
- Timezone: `Asia/Tokyo`
- GID dependency: `NONE`

Before any operational Sheet write, read **all five** packaged support files in `contracts/`: `00_RUNTIME_CONTRACT.md`, `10_SHEET_IO.md`, `20_LOG_LANES.md`, `30_STATE_MACHINE.md`, `40_ERROR_POLICY.md`. Their requirements are mandatory and supplement this SKILL.md.

Open only the fixed Spreadsheet above. Verify `contract_id`, `schema_version`, `spark_sheet_id`, `spark_sheet_url`, `gid_dependency`, `skill_package_version=2.4.0`, `task_package_version=2.4.0`, and `runtime_hardening_version=2.4.0`. Never use a gid URL, similarly named workbook, replacement workbook, or Drive fallback.

## Runtime / Task binding

This Skill runtime is exactly `2.4.0`. The invoking prompt must provide one allowed Task ID and the literal token `Required Skill Runtime=<TaskID>@2.4.0`. Exact-search `05_CONFIG` for `<taskid lower>_required_skill_version` and require `2.4.0`. The active runtime, Task token, and Sheet value must all match. Otherwise return `E024` and FAIL CLOSED before business writes.

Generate one random 16-hex run nonce and one run_id `RUN-<TaskID>-YYYYMMDD-HHMMSS-<nonce>` per invocation. Never reuse short suffixes.

## Deterministic I/O and logging

- Existing entity rows are always re-resolved by authoritative logical ID/key immediately before each write; one entity = one exact-row write. Never use list position, cached rows, relative offsets, or multi-entity rectangular writes.
- After every business write, exact-search and read back identity plus written fields.
- Never directly write `06_PREDICTIONS!AQ:AR`.
- Logs use only the current Task's dedicated lane and Sheet-owned cursor from `05_CONFIG`; never global tail/first blank/implicit append.
- Each audit_id is `AUD-<TaskID>-YYYYMMDD-HHMMSS-<nonce>-<4 digit sequence>` and is globally exact-searched before and after its single explicit-row write. Audit rows are one entity at a time.
- Update heartbeat only on the exact `04_SCHEDULES` row whose task_id equals the current Task.
- Scheduled pure NOOP => heartbeat only. Manual NOOP or any changed/HOLD/ERROR run => exactly one terminal RUN_LOG row in the Task's run lane plus heartbeat.
- Immediately before terminal completion, re-count the eligible workset and report the real remaining count in the note. A contradiction is `E025`.
- URL fields accept only http(s) URLs or blank. `SUCCESS`/`NOOP` run rows keep error fields blank.


## Entity row targeting / replay fence

The `prediction_id` is the only authoritative row locator for `06_PREDICTIONS`. Never infer a physical row from list order, filtered-result order, prior row numbers, contiguous blocks, or an offset from another entity.

For every prediction handled by T03:

1. Keep only the logical key `(prediction_id, version)` from the candidate selection step.
2. **Immediately before every operational write**, exact-search column A for `prediction_id`. There MUST be exactly one matching row. Re-read column B on that same row and require the expected `version`.
3. For a fresh T03 decision, require the row's current `status=DRAFTED`. If the row no longer satisfies the precondition, do not write it; re-evaluate or skip it.
4. Never reuse a cached physical row number for the next prediction. Re-resolve each entity independently.
5. Write T03-owned fields only to that exact row. For `06_PREDICTIONS`, never issue a multi-row rectangular write that contains T03 results for two or more predictions. **One prediction = one exact-row write.**
6. Immediately after the write, exact-search `prediction_id` again and re-read `(prediction_id, version, status, t3_status, t3_notes, t3_run_id, last_error_code, last_error_at, updated_at)`. The row identity and all written values MUST match the intended entity.
7. A row with blank `prediction_id` MUST never receive T03-owned non-formula data. Before ending the run, search for rows whose `t3_run_id=current run_id`; every such row MUST have a valid nonblank `prediction_id` and the expected version.
8. If row identity is missing, duplicated, shifts between pre-write and read-back, or any T03 data appears on a blank/wrong entity row, **FAIL CLOSED immediately**. Do not continue with later entities and do not try to compensate by writing neighboring rows.

Entity-local error fields MUST be isolated:

- At the start of every entity, initialize the intended `last_error_code` and `last_error_at` to blank in local state. Never carry these values from the prior entity.
- `PASS/CHECK_PASSED` clears both fields.
- Primary-source publication gate failure uses `E022` and the current verification timestamp.
- Resolution-definition mismatch uses `E019` and the current verification timestamp.
- Any other code may be written only when its exact `13_ERROR_POLICY` trigger matches.

## Primary source hard gate

This gate is mandatory and must be evaluated **before any `PASS` / `CHECK_PASSED` write**. It is independent of whether the URL looks official or whether an earlier Task accepted the row.

For the row's `primary_source_id`:

1. Exact-match `07_SOURCE_MASTER.source_id`. There MUST be exactly one matching row.
2. The matching source MUST satisfy all three conditions simultaneously:
   - `status = ACTIVE`
   - `trust_tier = A`
   - `result_ok = TRUE`
3. `PROBATION`, `DEPRECATED`, `BLOCKED`, blank, missing, duplicated, or any value other than the exact allowed values above is **not publication-eligible**.
4. Do not auto-promote or rewrite an existing `PROBATION`/non-ACTIVE source merely to make the prediction pass.
5. If the hard gate fails, set/keep the prediction in `HOLD`; do **not** set `t3_status=PASS` or `status=CHECK_PASSED`. Record the exact failed field(s), source_id, and observed values in `t3_notes` and the audit reason. Set `last_error_code=E022` and `last_error_at=<current verification time>`.
6. Use any other `13_ERROR_POLICY` code only when its defined trigger exactly matches. Never copy a prior entity's error code.

A source being an official government/company page does **not** override this gate. `PROBATION` is never treated as equivalent to `ACTIVE`.

## Procedure

1. `status=DRAFTED` のみ、1実行最大8件。対象抽出時は論理キー `(prediction_id, version)` だけを保持し、書込時は必ず **Entity row targeting / replay fence** に従って各entityを再検索する。T1/T2の判断を追認せず一次情報を開き直す。
2. 固有名詞、イベント日時、選択肢の排他性・網羅性、resolution_rule、primary/secondary sourceの到達性、既に結果が判明していないかを確認する。加えて、`primary_source_id` は上記 **Primary source hard gate**（`ACTIVE` / `A` / `TRUE`）を必ず満たすことを確認する。
3. 統計・市場・気象等の定量問題は、URLが公式であるだけではPASSしない。公式ページ上のseries/fieldの意味、単位、観測時点または公表時点、集計期間境界、timezone基準、初回値/訂正値の扱いが `resolution_rule` と一致することを個別に照合する。「関連する系列」や「同じページにある別系列」は一致とみなさない。
4. 検索見出し・スニペットだけでPASSしない。問題内容と既存問題の重複も確認する。
5. 問題が完全で、かつ **Primary source hard gateを満たす場合だけ** `t3_status=PASS` と `status=CHECK_PASSED` とし、`last_error_code/last_error_at` を空欄へ戻す。primary source gate不成立は `t3_status=HOLD`, `status=HOLD`, `last_error_code=E022` とする。series/field・期間・timezone等の定義不一致は `t3_status=HOLD`, `status=HOLD`, `last_error_code=E019` としてT02の再修正へ戻す。重大かつ自動修正不能な不整合は `FAIL/CHECK_FAILED`、その他の情報不足・source競合は `HOLD`。各entityのerror fieldsは必ずそのentity内で初期化し、前entityから値を引き継がない。
6. `08_SOURCE_CANDIDATES` の未監査候補を最大5件検証し、公式運営者、安定URL、ログイン不要、結果判定能力を確認して `VERIFIED/REJECTED/HOLD` を記録する。
7. 根拠URLとexact issueを `t3_notes` 等へ残す。
8. 各判断を1 entityずつaudit記録する。run/NOOP記録は上記Deterministic I/O and loggingに従う。

## Do not

- 問題文を自分で大幅修正してPASSしない。
- 一次情報同士の不一致を丸めない。
- 404、ログイン必須、閲覧不能sourceを正常扱いしない。
- `PROBATION` / `DEPRECATED` / `BLOCKED` / 非A / `result_ok!=TRUE` のprimary sourceをPASS扱いしない。
- T4列や最終結果列を変更しない。
- 複数predictionのT3結果を連続行・相対offset・一括矩形rangeへ書かない。
- prediction_idが空欄の行へT3-owned値を書かない。
- 既に `t3_run_id=current run_id` のentityを再度書き直したり、auditを追加し直したりしない。
- 前entityの `last_error_code` / `last_error_at` を次entityへ流用しない。

## Missing / conflicting information

Use the stage-appropriate `HOLD`, `PENDING`, `ERROR`, `CONFLICT`, or `NOOP` state. Never invent missing facts.

## Write scope

`06_PREDICTIONS` のT3列・status・updated_at・last_error_code・last_error_at、`08_SOURCE_CANDIDATES` のT3列、`11_AUDIT_LOG`、`12_RUN_LOG`。
