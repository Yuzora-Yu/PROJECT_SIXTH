# PROJECT SIXTH Gemini Spark Tasks — Final v2.2.1

固定Sheet: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`  
Contract: `PROJECT_SIXTH_PREDICTION_OPS` / schema `2.0.0`

## 7本の正規Schedule

| 時刻 | Task |
|---|---|
| :00 | T01 / T05 |
| :15 | T02 / T06 |
| :30 | T03 / T07 |
| :45 | T04 |

任意T08: 毎日 06:45 JST。

同時刻Task同士は開始/終了順に依存しない。Gemini Sparkのscheduled taskは実行時刻が近似になり得るため、工程順はSpreadsheetのstatus/gateで保証する。

T03 runtime pin: Task package 2.2.1 では `Required Skill Runtime=T03@2.3.3` と `05_CONFIG.t3_required_skill_version=2.3.3` を実行前に一致確認し、旧Skillが選ばれた場合はFAIL CLOSEDする。

## ファイル
- `tasks/T01_collect_prediction_candidates.md`
- `tasks/T02_draft_prediction_question.md`
- `tasks/T03_audit_prediction_question.md`
- `tasks/T04_approve_prediction_publication.md`
- `tasks/T05_verify_result_primary.md`
- `tasks/T06_verify_result_secondary.md`
- `tasks/T07_settle_prediction_result.md`
- `tasks/T08_collect_major_events_optional.md`

※ ZIP内のファイル名は文字化け防止のためASCII英数字のみ。本文は日本語のままです。
