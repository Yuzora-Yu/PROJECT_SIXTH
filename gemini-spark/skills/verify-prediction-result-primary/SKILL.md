---
name: verify-prediction-result-primary
description: 結果確認予定を過ぎた公開問題をprimary sourceで独立確認し、T5証拠だけを記録する。
version: 2.4.0
---

# verify-prediction-result-primary

Allowed Task IDs for this Skill: **T05**.
Required tabs: `05_CONFIG`, `06_PREDICTIONS`, `07_SOURCE_MASTER`, `09_RESULTS`, `11_AUDIT_LOG`, `12_RUN_LOG`, `04_SCHEDULES`.

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




## Procedure

1. `status=PUBLISHED` かつ `result_due_at_jst` 到来済みで未確定の問題のみ、1実行最大10件。
2. 先に `resolution_rule` を読み、`primary_source_id` の公式ページを開く。
3. `09_RESULTS` は `prediction_id+version` を一意キーとして検索する。0行ならprediction_id/versionを入れた新規1行を追加、1行ならその行だけを使用、2行以上ならE018としてHOLD/ERRORにして任意の1行を選ばない。確定結果、該当choice、短いfact、実ページURL、確認時刻、source_id、run_idをT5列へ記録し、確定時は `t5_status=FINAL` とする。
4. 試合中、暫定値、延期、訂正待ち、公式未確定は `PENDING`。source障害は `ERROR`。
5. T6の値は判断根拠にしない。
6. 各結果確認を1 entityずつaudit記録する。run/NOOP記録は上記Deterministic I/O and loggingに従う。

## Do not

- 非公式まとめだけでFINALにしない。
- 速報・暫定を確報扱いしない。
- T6の結論に合わせない。
- `06_PREDICTIONS.final_result` やT7列を変更しない。

## Missing / conflicting information

Use the stage-appropriate `HOLD`, `PENDING`, `ERROR`, `CONFLICT`, or `NOOP` state. Never invent missing facts.

## Write scope

`09_RESULTS` の `t5_*`、`11_AUDIT_LOG`、`12_RUN_LOG` のみ。
