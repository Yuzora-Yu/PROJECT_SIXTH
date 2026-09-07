---
name: settle-prediction-result
description: T5/T6の独立証拠とresolution_ruleを監査し、Git Action 2へ進める唯一の最終結果ゲートを管理する。
version: 2.4.1
---

# settle-prediction-result

Allowed Task IDs for this Skill: **T07**.
Required tabs: `05_CONFIG`, `06_PREDICTIONS`, `09_RESULTS`, `11_AUDIT_LOG`, `12_RUN_LOG`, `04_SCHEDULES`.

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




## Procedure

1. `09_RESULTS` を `prediction_id+version` の一意キーで扱う。重複行があるkeyはE018としてHOLD/ERRORにし、T5/T6が両方 `FINAL` の一意行だけを1実行最大10件処理する。
2. 両者のoption、fact、実URL、確認時刻を比較し、元問題の `resolution_rule` を再読する。
3. 一致しても証拠が弱い場合は `comparison=INSUFFICIENT`, `t7_decision=HOLD` とし最終結果を書かない。不一致は `comparison=CONFLICT`, `t7_decision=CONFLICT`, `needs_human_review=TRUE`, `result_status=CONFLICT` とし最終結果を書かない。
4. 十分な場合だけ `comparison=MATCH`, `t7_decision=APPROVE` とし、`09_RESULTS` の `t7_final_option`,`t7_final_url`,`t7_notes`,`t7_run_id`,`finalized_at` を記録する。同時に `06_PREDICTIONS` の `final_result`,`result_source_url`,`result_status=FINAL`,`status=RESULT_APPROVED`,`needs_human_review=FALSE` を設定する。
5. `settlement_key = prediction_id|version|final_result` を生成し、既存AUDIT/対象行で同keyが処理済みならNOOP。二重報酬を許可しない。
6. `reward_policy_id` が未定義なら報酬量を創作せず、結果ゲートと報酬保留を分離する。
7. 後日訂正は旧ログを削除せず `CORRECTION` として追加する。
8. 各最終判断を1 entityずつaudit記録する。run/NOOP記録は上記Deterministic I/O and loggingに従う。

## Do not

- T5/T6片方だけで確定しない。
- 証拠不足を自動補完しない。
- 報酬量を推測しない。
- settled_atやGitHub処理済み状態を設定しない。それはGit Action 2の責務。
- 監査ログを削除・書換しない。

## Missing / conflicting information

Use the stage-appropriate `HOLD`, `PENDING`, `ERROR`, `CONFLICT`, or `NOOP` state. Never invent missing facts.

## Write scope

`09_RESULTS` の比較/T7列・finalized_at、`06_PREDICTIONS` のfinal_result・result_source_url・result_status・status・settlement_key・needs_human_review・updated_at、`11_AUDIT_LOG`、`12_RUN_LOG`。
