# PROJECT SIXTH Gemini Spark Tasks — Deterministic I/O v2.4.1

固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`  
Contract: `PROJECT_SIXTH_PREDICTION_OPS` / schema `2.0.0`

すべてのTaskは `Required Skill Runtime=Txx@2.4.1` を持ち、active Skill runtimeと `05_CONFIG.txx_required_skill_version` の3点一致を実行前に検証する。Task本文にはTask専用log lane・literal heartbeat target・guard rangeも固定する。

## Schedule

| 時刻 | Task |
|---|---|
| :00 | T01 / T05 |
| :15 | T02 / T06 |
| :30 | T03 / T07 |
| :45 | T04 |

任意T08: 毎日06:45 JST。工程順はstatus/gateだけで保証する。

## v2.4.1 safety

- 1 entity = 1 exact-row write。
- T01〜T08はAUDIT/RUNの専用物理laneを持ち、Sheet-owned cursorだけを使う。
- log write後はexact target rowを直接読戻し、Task lane内ID count=1を確認。cursor即時+1はadvisory。
- heartbeatはTaskごとのliteral `04_SCHEDULES!Hn:Nn` と `An:Bn` guardを使い、Schedule検索結果やrelative offsetから行を求めない。
- scheduled pure NOOPはfixed heartbeatのみ。
- terminal前にeligible worksetを再計数する。
- Skill差替え時は各Scheduled Taskで最新Skillを再選択して保存する。
