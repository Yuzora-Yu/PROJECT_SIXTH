# PROJECT SIXTH Prediction Ops — Canonical Operations

Spreadsheet / Gemini Spark Skills / Tasks / GAS は同じcontractで運用する。

## Single source of truth

- contract_id: `PROJECT_SIXTH_PREDICTION_OPS`
- schema_version: `2.0.0`
- release_version: `2.2.0`
- skill_package_version: `2.3.3`
- task_package_version: `2.2.1`
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
- T03のログ追記は「first blank」やimplicit appendを使わず、column Aの最終非空物理行+1へ1行の明示range writeを行う。interior blankは触らない。pre/postで旧tail不変・新row完全一致・ID一意を検証し、不明/欠落/重複時はE017で停止する
- T03は `Required Skill Runtime=T03@2.3.3` と `05_CONFIG.t3_required_skill_version=2.3.3` を実行前に一致確認する。旧runtimeなら書込前にFAIL CLOSED
- source成長は T1/T2 discover → T3 verify → T4 approve/promote
- audit/run logはappend-only
- Git Action 1: `prediction_id|version`
- Git Action 2: `prediction_id|version|final_result`

## GAS overwrite

固定target fileは削除しない。sourceはread only、targetは事前backup、timezoneは`Asia/Tokyo`。contract/tab/gid policyをpreflightし、stage/verify後にcommitする。compatible implementationは2.1.2。

## Versioning rule

構造契約を変更する場合は `schema_version` を上げる。Prompt・Task文・validation・QA等の互換修正は `release_version` / package versionを上げ、Spreadsheet / Skills / Tasksを同時更新する。GASのtransport/verification patchはcontract互換ならimplementation versionだけを上げられる。

T03 runtime hardening 2.3.3: exact-row entity targeting、physical-tail+1 log write、terminal RUN_LOG、entity-local error state、E022 source-gate分類を適用。

Static QA release 2.1.0: 89/89 PASS。次の境界はGemini Spark runtime verification。
