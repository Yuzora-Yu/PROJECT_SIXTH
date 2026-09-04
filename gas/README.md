# PROJECT SIXTH Prediction Ops - GAS v2.0.2

## 今回の修正理由

v2.0.1で、正しいv2 sourceのcontract検証は通ったものの、
`STAGE_COPY` 中にGoogle Sheets側の `Sheet.copyTo()` が例外で停止しました。

この場合、rollbackが成功するため固定コピー先は旧v1.1のまま残ります。
これは「v1.1へ更新された」のではなく「v2更新に失敗して旧版が保全された」状態です。

## v2.0.2の変更

Spreadsheet / Skillのcontract schemaは **2.0.0のまま**です。
変更対象はGAS transport層だけです。

- sheetごとに `Sheet.copyTo()` を最大6回再試行
- 1.2秒 → 2.4秒 → 4.8秒 → 9.6秒 → 12秒 の指数バックオフ
- 各成功コピー後に800ms待機し、Sheets serviceへの連続負荷を緩和
- `phase=STAGE_COPY:06_PREDICTIONS` のように失敗tabを明示
- copyToが「サーバ側では成功したが例外を返した」ケースをsheetId差分で回収
- 全15tabのstaging完了前には既存target tabを変更しない
- 最終失敗時はrollbackし、固定コピー先の旧状態を維持

## 整合する組み合わせ

- Spreadsheet: `PROJECT_SIXTH_GeminiSpark_Prediction_Ops_v2.xlsx`
- Spreadsheet schema: `2.0.0`
- Skills: `PROJECT_SIXTH_GeminiSpark_7Skills_Pack_v2.0.zip`
- GAS implementation: `2.0.2`
- 固定target ID:
  `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- target timezone: `Asia/Tokyo`
- gid dependency: `NONE`

GAS implementationのpatch versionとcontract schemaは役割が異なるため、
GASだけ2.0.2でも不整合ではありません。

## 更新手順

既存GASの以下3ファイルをv2.0.2へ置換:

- Code.gs
- Index.html
- appsscript.json

その後:

`デプロイ` → `デプロイを管理` → 既存Webアプリを編集 →
`新バージョン` → `デプロイ`

WebアプリURLは維持できます。

## 成功条件

最終targetはexactly 15 tabs:

00_DASHBOARD
01_SPARK_SPEC
02_SKILLS
03_TASKS
04_SCHEDULES
05_CONFIG
06_PREDICTIONS
07_SOURCE_MASTER
08_SOURCE_CANDIDATES
09_RESULTS
10_EVENT_WATCH
11_AUDIT_LOG
12_RUN_LOG
13_ERROR_POLICY
14_GITHUB_IO

05_CONFIG:
- contract_id = PROJECT_SIXTH_PREDICTION_OPS
- schema_version = 2.0.0
- gid_dependency = NONE

`__OLD_*`, `__NEW_*`, `～のコピー`, `シート1` 等が残れば失敗です。
