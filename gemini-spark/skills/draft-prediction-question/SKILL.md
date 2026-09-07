---
name: draft-prediction-question
description: DISCOVERED候補を、明確な問題文、排他的な選択肢、解決ルール、情報源を持つ公開前ドラフトへ整える。
version: 2.4.0
---

# draft-prediction-question

Allowed Task IDs for this Skill: **T02**.
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




## Procedure

1. 1実行最大8件。まず `status=HOLD` かつ `last_error_code` が `05_CONFIG.t2_repairable_hold_error_codes` に含まれ、`needs_human_review` がTRUEでない行を最大4件まで古い順に再修正し、残り枠で `status=DISCOVERED` を処理する。
2. repairable HOLDを再修正する場合、先に `11_AUDIT_LOG` へ `REWORK_STARTED` を追記し、前回T3判定は削除せず監査証跡として残す。修正完了時のみ旧 `t3_status/t3_notes/t3_run_id` をクリアして `status=DRAFTED` へ戻し、T3再監査を必須とする。
3. 候補を採用するかを先に選定し、曖昧・弱い候補はHOLDまたはREJECTEDにする。
4. 問題文は「何を判定するか」が一読で明確な短文にし、選択肢は相互排他的で原則網羅的にする。
5. `resolution_rule` に公式判定源、同率、延期、中止、訂正、未確定時、timezoneの扱いを明記する。統計・市場・気象等の定量問題は、公式series/fieldの正確な名称または一意に特定できる項目、単位、観測/公表時点、集計期間境界、timezone基準、初回値/訂正値の採用方針を明記する。確認できない場合はDRAFTEDへ進めず `E019/HOLD`。
6. `primary_source_id` と可能なら独立した `secondary_source_id` を `07_SOURCE_MASTER` のACTIVE/許可済みsourceから選ぶ。ドラフト中により適切な公式sourceを見つけても未登録なら結果判定sourceとしては使わず、`08_SOURCE_CANDIDATES` に一意candidate_idで候補化してT3/T4へ回す。
7. `event_at` と `source_timezone` は確認できる場合だけ設定する。`publish_at_jst`, `close_at_jst`, `result_due_at_jst` はT4が決めるため設定しない。
8. 必要条件が揃った行だけ `status=DRAFTED` とし `t2_run_id`, `updated_at` を記録する。
9. 各状態変更をaudit記録し、run/NOOP記録は上記Deterministic I/O and loggingに従う。

## Do not

- 後から複数解釈できる文章を作らない。
- 締切前に既に結果が判明する問題を作らない。
- 未承認sourceを結果判定sourceとして採用しない。
- 公開日時、締切日時、報酬値、最終結果を創作しない。

## Missing / conflicting information

Use the stage-appropriate `HOLD`, `PENDING`, `ERROR`, `CONFLICT`, or `NOOP` state. Never invent missing facts.

## Write scope

`06_PREDICTIONS` の問題文・選択肢・resolution_rule・source_id・event_at・source_timezone・T2列・status・updated_at、`08_SOURCE_CANDIDATES` の候補作成列、および repairable HOLD の再修正時に限り監査記録後の旧T3列クリア、`11_AUDIT_LOG`、`12_RUN_LOG`。
