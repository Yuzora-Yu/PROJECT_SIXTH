# PROJECT SIXTH Prediction Ops — Canonical Operations v2.0.0

この配布物は、Spreadsheet / Gemini Spark Skills / Tasks / GAS を **同じcontract** から生成した整合版。

## Single source of truth

- contract_id: `PROJECT_SIXTH_PREDICTION_OPS`
- schema_version: `2.0.0`
- target spreadsheet id: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- target base URL: `https://docs.google.com/spreadsheets/d/1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y/edit`
- timezone: `Asia/Tokyo`
- gid dependency: `NONE`

`gid` はタブ再生成で変わり得るため、どの成果物も契約・参照に使用しない。
タブ識別は exact tab name のみ。

## Workflow

T01 収集 → T02 ドラフト → T03 独立監査 → T04 掲載判定
→ Git Action 1 → T05/T06 独立結果確認 → T07 最終監査 → Git Action 2

時刻順は保証に使わない。`status` / `gate` だけを工程順の根拠にする。

## GAS overwrite

GASは固定target fileを削除しない。target Spreadsheet ID/URLを維持したまま、
contract v2.0.0 に一致するsource workbookの全タブをコピーする。

- sourceは読み取りだけ。削除・timezone変更をしない。
- targetは上書き前に必ずDrive backup。
- target timezoneは `Asia/Tokyo`。
- sourceのcontract/tab/gid policyをpreflight検証。
- copied sheetsを検証するまで旧target tabsを削除しない。
- Google SheetsへのXLSX変換で行数が縮んでも、`05_CONFIG` の min_rows をGASが復元。
- row 4 のvalidation/formulaを必要行まで延長。
- 成功後に `11_AUDIT_LOG` へGAS上書きイベントを追記。

## Future change rule

仕様変更するときは `schema_version` を上げ、
Spreadsheet / Skill ZIP / TASKS.md / GAS の4点を同時更新する。
GASは古いschemaのsourceを拒否するため、片方だけ更新した状態を本番へ入れない。
