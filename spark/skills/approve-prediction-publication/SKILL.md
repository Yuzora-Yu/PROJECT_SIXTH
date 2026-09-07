---
name: approve-prediction-publication
description: CHECK_PASSED問題を最終監査し、公開日、締切日、結果確認予定日時を決め、Git Action 1の公開ゲートを承認する。
version: 2.4.1
---

# approve-prediction-publication

Allowed Task IDs for this Skill: **T04**.
Required tabs: `05_CONFIG`, `06_PREDICTIONS`, `07_SOURCE_MASTER`, `08_SOURCE_CANDIDATES`, `11_AUDIT_LOG`, `12_RUN_LOG`, `04_SCHEDULES`.

## Fixed contract and required support files

- Target Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- Target base URL: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`
- Contract ID: `PROJECT_SIXTH_PREDICTION_OPS`
- Schema version: `2.0.0`
- Runtime version: `2.4.1`
- Timezone: `Asia/Tokyo`
- GID dependency: `NONE`

Before any operational Sheet write, read **all five** packaged support files in `contracts/`: `00_RUNTIME_CONTRACT.md`, `10_SHEET_IO.md`, `20_LOG_LANES.md`, `30_STATE_MACHINE.md`, `40_ERROR_POLICY.md`. Their requirements are mandatory and supplement this SKILL.md.

Open only the fixed Spreadsheet above. Verify `contract_id`, `schema_version`, `spark_sheet_id`, `spark_sheet_url`, `gid_dependency`, `skill_package_version=2.4.1`, `task_package_version=2.4.1`, and `runtime_hardening_version=2.4.1`, and `log_cursor_contract_version=2.1.0`. Never use a gid URL, similarly named workbook, replacement workbook, or Drive fallback.

## Runtime / Task binding

This Skill runtime is exactly `2.4.1`. The invoking prompt must provide one allowed Task ID and the literal token `Required Skill Runtime=<TaskID>@2.4.1`. Exact-search `05_CONFIG` for `<taskid lower>_required_skill_version` and require `2.4.1`. The active runtime, Task token, and Sheet value must all match. Otherwise return `E024` and FAIL CLOSED before business writes.

Generate one random 16-hex run nonce and one run_id `RUN-<TaskID>-YYYYMMDD-HHMMSS-<nonce>` per invocation. Never reuse short suffixes.

## Deterministic I/O and logging

- Existing entity rows are always re-resolved by authoritative logical ID/key immediately before each write; one entity = one exact-row write. Never use list position, cached rows, relative offsets, or multi-entity rectangular writes.
- After every business write, exact-search and read back identity plus written fields.
- Never directly write `06_PREDICTIONS!AQ:AR`.
- Logs use only the current Task's dedicated lane and Sheet-owned cursor from `05_CONFIG`; never global tail/first blank/implicit append.
- Each audit_id is `AUD-<TaskID>-YYYYMMDD-HHMMSS-<nonce>-<4 digit sequence>`. Pre/post uniqueness checks are limited to the Task's own lane. After write, the exact target row is directly re-read and must match the full payload.
- Cursor `+1` immediately after a log write is advisory only; do not call a successful exact-row write failed merely because formula recalculation/read caching has not advanced the cursor yet.
- Heartbeat uses only the literal fixed A1 target and literal guard in the Task text/`05_CONFIG`. Never search `04_SCHEDULES` to derive a row and never add/subtract a row offset.
- Scheduled pure NOOP => fixed heartbeat only. Manual NOOP or any changed/HOLD/ERROR run => exactly one terminal RUN_LOG row in the Task's run lane plus fixed heartbeat.
- Immediately before terminal completion, re-count the eligible workset and report the real remaining count in the note. A contradiction is `E025`.
- URL fields accept only http(s) URLs or blank. `SUCCESS`/`NOOP` run rows keep error fields blank.


## Primary source publication gate

This gate is mandatory and must be evaluated **again at T04**, even when T03 already wrote `PASS` / `CHECK_PASSED`. T04 must not trust T03's source eligibility decision.

Immediately before any `APPROVE` / `APPROVED_FOR_PUBLISH` write:

1. Exact-match the current row's `primary_source_id` in `07_SOURCE_MASTER`. There MUST be exactly one matching row.
2. The matching source MUST satisfy all three conditions simultaneously:
   - `status = ACTIVE`
   - `trust_tier = A`
   - `result_ok = TRUE`
3. `PROBATION`, `DEPRECATED`, `BLOCKED`, blank, missing, duplicated, or any value other than the exact allowed values above is **not publication-eligible**.
4. Do not auto-promote or rewrite an existing non-ACTIVE source merely to make the prediction publishable.
5. If the gate fails, keep/set the prediction to `HOLD`; do **not** set `t4_decision=APPROVE`, `status=APPROVED_FOR_PUBLISH`, or create a publish-ready state. Record the exact source_id and observed eligibility fields in `t4_notes` and the audit reason.
6. If a new source candidate is promoted during T04, re-run this hard gate against the newly created `07_SOURCE_MASTER` row **after promotion and before approval**. The promoted row must already be `ACTIVE` / `A` / `TRUE`; otherwise HOLD.
7. Use an existing `13_ERROR_POLICY` code only when its defined trigger actually matches. Do not invent a new error code solely for this gate.

An official-looking or reachable URL does not override this gate. `PROBATION` is never treated as equivalent to `ACTIVE`.

## Procedure

1. `status=CHECK_PASSED` のみ、1実行最大6件。
2. 必須列、resolution_rule、一次/二次source状態、重複、結果リーク、日時実現性を再確認する。`primary_source_id` はT03の判定を信用せず、上記 **Primary source publication gate**（`ACTIVE` / `A` / `TRUE`）を独立して再確認する。
3. `publish_at_jst`, `close_at_jst`, `result_due_at_jst` をここで初めて確定する。原則 `publish_at_jst < close_at_jst` かつ、締切後に結果が判明する設計にする。
4. 新規source候補を採用する場合は `t3_status=VERIFIED` を確認し、domain/example_urlが `07_SOURCE_MASTER` に既存でないことを再確認する。公式owner・ログイン不要・閲覧安定・判定用途が確認できる場合だけ、一意のsource_idで `07_SOURCE_MASTER` へ1行だけ昇格する。昇格後の行が `status=ACTIVE`, `trust_tier=A`, `result_ok=TRUE` を満たすことを再読込で確認できた場合だけ後続の公開承認判定へ進む。条件不足はHOLD/REJECTEDとし昇格しない。
5. 全条件を満たし、かつ **Primary source publication gateを満たす場合だけ** `t4_decision=APPROVE`, `status=APPROVED_FOR_PUBLISH` とする。gate不成立なら必ずHOLDし、公開承認へ進めない。
6. `git_publish_key = prediction_id|version` を生成し、既存AUDIT/対象行に同keyの公開済み処理があればNOOPにする。
7. 各判断を `11_AUDIT_LOG`、実行全体を `12_RUN_LOG` に追記する。

## Do not

- 欠損を推測して承認しない。
- PROPOSED/未検証sourceで承認しない。
- `PROBATION` / `DEPRECATED` / `BLOCKED` / 非A / `result_ok!=TRUE` のprimary sourceで承認しない。
- 過去時刻の締切を持つ新規問題を承認しない。
- 既公開版を同versionのまま意味変更しない。
- published_atやarticle_slugを設定しない。それはGit Action 1の責務。

## Missing / conflicting information

Use the stage-appropriate `HOLD`, `PENDING`, `ERROR`, `CONFLICT`, or `NOOP` state. Never invent missing facts.

## Write scope

`06_PREDICTIONS` のT4列・publish_at_jst・close_at_jst・result_due_at_jst・status・git_publish_key・updated_at、`08_SOURCE_CANDIDATES` のT4列・approved_source_id・last_updated、承認時のみ `07_SOURCE_MASTER` の新規昇格行、`11_AUDIT_LOG`、`12_RUN_LOG`。
