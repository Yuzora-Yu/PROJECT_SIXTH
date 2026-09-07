---
name: collect-prediction-candidates
description: 承認済み情報源と公開情報から、結果を一意に確認できる予言問題候補を収集する。T08では大型イベントの先読みだけを行う。
version: 2.4.1
---

# collect-prediction-candidates

Allowed Task IDs for this Skill: **T01 / T08**.
Required tabs: `05_CONFIG`, `06_PREDICTIONS`, `07_SOURCE_MASTER`, `08_SOURCE_CANDIDATES`, `10_EVENT_WATCH`, `11_AUDIT_LOG`, `12_RUN_LOG`, `04_SCHEDULES`.

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

1. Taskのmodeを最初に判定する。T01はcandidate、T08はevent_watch。
2. candidate modeでは最初に `05_CONFIG` の `t1_open_inventory_statuses`, `t1_open_inventory_low_watermark`, `t1_open_inventory_target`, `t1_hold_stop_threshold`, `max_candidates_per_t1` を読む。open inventoryとHOLD数を `06_PREDICTIONS` 全行から数える。
3. open inventoryがlow watermark以上、またはHOLD数がstop threshold以上なら候補を追加せず正常NOOP。low watermark未満の場合だけ `min(max_candidates_per_t1, target-open_inventory)` 件を上限に補充する。固定12件を毎回追加してはいけない。
4. 候補が特定日時の試合・発表・統計公表を前提にする場合、T01時点でも公式sourceで「イベント/公表の存在」と「対象日」を最低限確認する。存在や日付が確認できない候補をDISCOVEREDへ入れない。
5. 初期運用は面白さより、公式結果源の安定性、結果の一意性、誰でも確認できることを優先する。
6. 新規問題は `prediction_id` を既存 `06_PREDICTIONS` 全行と照合して一意に生成し、同じIDを再利用しない。`prediction_id`, `version=1`, `status=DISCOVERED`, `category`, `horizon`, `priority`, 短い候補 `question_text`, 既知なら `primary_source_id`, `source_timezone`, `created_by_run`, `created_at`, `updated_at` だけを中心に作る。選択肢・公開日時・締切日時・最終判定は作らない。
7. 未登録サイトは最終証拠に使わず `08_SOURCE_CANDIDATES` に候補として記録する。`candidate_id` は既存候補と重複しない一意IDとする。
8. 同一イベント・ほぼ同義の重複候補を追加しない。月次長期問題は同月1〜2件を目安にする。
9. event_watch modeでは1週間〜12か月先の大イベントを `10_EVENT_WATCH` に最大20件追記し、`event_id` は既存イベントと重複しない一意IDとする。`06_PREDICTIONS` へ問題を作らない。
10. 新規候補・イベントごとに判断auditを記録する。run/NOOP記録は上記Deterministic I/O and loggingに従う。

## Do not

- 検索スニペットだけで事実を確定しない。
- 匿名SNSを一次情報扱いしない。
- 災害、死亡、重大事故の規模を娯楽的予測問題にしない。
- 不足する日時や事実を推測しない。
- 公開承認列、結果列、Git gate列を変更しない。

## Missing / conflicting information

Use the stage-appropriate `HOLD`, `PENDING`, `ERROR`, `CONFLICT`, or `NOOP` state. Never invent missing facts.

## Write scope

`06_PREDICTIONS` の候補作成列、`08_SOURCE_CANDIDATES`、T08時のみ `10_EVENT_WATCH`、`11_AUDIT_LOG`、`12_RUN_LOG`。
