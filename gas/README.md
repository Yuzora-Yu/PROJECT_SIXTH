# PROJECT SIXTH Prediction Ops - GAS v2.0.3

## 修正理由

v2.0.2では `STAGE_COPY` は成功しましたが、
`VERIFY_FINAL` で `00_DASHBOARD` の数式文字列がsourceと完全一致しないため
ロールバックしました。

Google Sheetsはシートコピー・リネーム・setFormulasの過程で
数式文字列を正規化する場合があります。
そのため「文字列が1文字でも違えば失敗」は監査として過剰でした。

## v2.0.3の数式検証

完全一致を外しただけではありません。
成功には以下をすべて要求します。

- sourceの各数式セルにtargetにも数式が存在
- source/targetの数式セル数が一致
- target数式に `#REF!` がない
- target数式に `__OLD_`, `__NEW_`, `__ROLLBACK_` がない
- source/targetで明示的な参照先sheet集合が一致
- old tabs削除後にもう一度同じ検証を実施
- 最終tab構成がexactly 15
- target timezoneがAsia/Tokyo
- canonical contractが2.0.0

数式文字列の表記だけが異なり、上記が全部正常な場合のみwarningとして記録します。

## 互換関係

- Workbook/Skill contract schema: 2.0.0
- Spreadsheet release: 2.0.1
- Skill/Task release: 2.0.1
- GAS implementation: 2.0.3
- Target Spreadsheet ID:
  1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y
- timezone: Asia/Tokyo
- gid dependency: NONE

GAS patch versionはtransport/verification実装のversionであり、
Workbook schemaを変更するものではありません。

## 更新

既存Webアプリなら:

デプロイ → デプロイを管理 → 対象デプロイを編集 →
新バージョン → デプロイ

新しく作ったWebアプリを現在の正本URLにした場合は、
今後そのデプロイを同じ方法で更新してください。
