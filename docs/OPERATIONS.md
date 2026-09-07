# PROJECT SIXTH Prediction Ops — Canonical Operations

Spreadsheet / Gemini Spark Skills / Tasks / GAS は同じcontractで運用する。

## Single source of truth

- contract_id: `PROJECT_SIXTH_PREDICTION_OPS`
- schema_version: `2.0.0`
- release_version: `2.2.0`
- skill_package_version: `2.4.0`
- task_package_version: `2.4.0`
- compatible GAS: `2.1.2`
- target spreadsheet id: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- target base URL: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`
- timezone: `Asia/Tokyo`
- gid dependency: `NONE`

`gid` は契約・参照に使用しない。タブ識別はexact tab nameのみ。

## Workflow / schedule

T01 収集 → T02 ドラフト → T03 独立監査 → T04 掲載判定 → Git Action 1 → T05/T06 独立結果確認 → T07 最終監査 → Git Action 2

- `:00` T01 / T05
- `:15` T02 / T06
- `:30` T03 / T07
- `:45` T04
- daily `06:45` T08 optional

同一時刻Task同士を含め、開始/終了順は保証に使わない。`status` / `gate` だけを工程順の根拠にする。

## Canonical repository files

- Workbook: `ops/PROJECT_SIXTH_GeminiSpark_Prediction_Ops.xlsx`
- Skill sources: `gemini-spark/skills/*/SKILL.md`
- Skill upload ZIPs: `gemini-spark/packages/*.zip`
- Task register text: `gemini-spark/tasks/*.md`
- Contract: `gemini-spark/ops_contract.json`

既存の `spark/` と `spreadsheet/` はcompatibility mirror。canonical側と同じ内容を保持し、独立編集しない。

## Safety / concurrency

- fail closed
- T5/T6は独立確認
- `09_RESULTS` は `prediction_id|version` を一意キーとしてcreate-or-update
- T01〜T08は共有global tail/first blankを使わず、`05_CONFIG` のTask専用AUDIT/RUN laneとSheet-owned cursorだけを使う。書込前にcursorと対象row空欄を再確認し、1行明示write後にcursor+1とID一意性を検証する。
- 全Taskは `Required Skill Runtime=Txx@2.4.0`・active Skill runtime・`05_CONFIG.txx_required_skill_version=2.4.0` の3点一致を実行前に確認する。旧runtime/確認不能はE024で書込前FAIL CLOSED。
- `04_SCHEDULES` H:NをTask heartbeatとする。scheduled pure NOOPはheartbeatのみ。manual NOOP・業務変更・HOLD/ERRORはTask RUN laneへterminal rowを1件＋heartbeat。
- terminal直前にeligible worksetを再検索し、残件主張との矛盾はE025で停止する。
- source成長は T1/T2 discover → T3 verify → T4 approve/promote
- audit/run logはappend-only
- Git Action 1: `prediction_id|version`
- Git Action 2: `prediction_id|version|final_result`

## GAS overwrite

固定target fileは削除しない。sourceはread only、targetは事前backup、timezoneは`Asia/Tokyo`。contract/tab/gid policyをpreflightし、stage/verify後にcommitする。compatible implementationは2.1.2。

## Versioning rule

構造契約を破壊的に変更する場合だけ `schema_version` を上げる。公開Prediction Catalog自体を変更しないSkill/Task/runtime hardeningでは `release_version=2.2.0` を維持し、`skill_package_version` / `task_package_version` / `runtime_hardening_version` を更新する。GASのtransport/verification patchはcontract互換ならimplementation versionだけを上げられる。

Spark Runtime 2.4.0: 全Task runtime pin、logical-key exact-row、Task専用log lane、Sheet-owned cursor、heartbeat、scheduled pure NOOP heartbeat-only、terminal workset recountを共通化。
