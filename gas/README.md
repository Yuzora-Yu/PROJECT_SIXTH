# PROJECT SIXTH Prediction Ops - GAS v2.1.2

Workbook schema `2.0.0` と互換の固定target Overwriter。

## 現在の安定化内容

- source 15タブをstageして検証後にcommit
- copyTo一時障害はsheet単位で再試行
- cross-sheet数式をcanonical tab確定後に復元
- `#REF!` / temporary tab参照をfail closed
- Drive一覧は更新順の最大10件だけ取得
- 容量不足時だけ行を追加し、format / validation / formulaを延長
- `capacityGuard` を毎時実行可能
- trigger管理用 `script.scriptapp` OAuth scopeをmanifestへ明示
- `ensureTargetCapacity()` / trigger install/remove は実行ログを明示
- targetのfile ID / URLは維持
- destructive commit前にbackup必須

## 互換関係

- Workbook/Skill contract schema: `2.0.0`
- Public workbook release: `2.2.0`
- Skill package: `2.3.1`
- Task package: `2.2.0`
- GAS implementation: `2.1.2`
- Target Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- timezone: `Asia/Tokyo`
- gid dependency: `NONE`

GAS implementation versionはtransport / verification / capacity管理のversionであり、Workbook schemaを変更するものではない。

## 初回だけ行うこと

Apps Script editorで `installCapacityGuardTrigger()` を1回手動実行する。
権限承認後、`capacityGuard` が時間主導型で1件登録されていることを確認する。

## Webアプリ更新

既存Webアプリ:

デプロイ → デプロイを管理 → 対象デプロイを編集 → 新バージョン → デプロイ

`/exec` URLは既存deploymentを更新する限り変更しない。
