# 現実予測 公開自動化

## 対象

GitHub Actions の `Publish approved predictions` は、固定Google Sheetで公開承認された問題をゲームへ反映する。対象はGit Action 1の公開処理であり、GitHub Actions自身はplayerのRC/XPを操作しない。最終結果がcatalogへ反映された後のRC払戻・予見XP精算はWorker/D1側が各playerの次回アクセス時に冪等実行する。

正本は次のGoogle Sheetとする。

- Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- Contract: `PROJECT_SIXTH_PREDICTION_OPS`
- Schema: `2.0.0`
- Timezone: `Asia/Tokyo`
- **共有条件: 所有者のみ。GitHub Actions用サービスアカウントを含め、他アカウントへ共有しない。**

ワークフローは毎時55分に起動する。Sparkの実行枠である毎時00分、15分、30分、45分とは重ならない。GitHub ActionsのcronはUTC表記だが、日本時間との時差は分に影響しないため `55 * * * *` で毎時55分になる。

## Gemini Spark と GitHub Actions の境界

Gemini Spark は所有者だけがアクセスできる固定Sheetを直接編集する。GitHub Actions はそのSheetの共同編集者にならない。

GitHub Actionsからの公開処理は、**Sheet所有者として実行する専用Apps Script Web App**を経由する。

1. GitHub ActionsはGoogleへ直接ログインしない。
2. GitHub ActionsはApps Script Web AppへHMAC署名したHTTPS POSTだけを送る。
3. Apps Scriptはデプロイした所有者として実行し、固定Sheetへアクセスする。
4. Apps ScriptのGoogle OAuth tokenはApps Script内部だけで使い、GitHubへ返さない。
5. Web Appは固定Sheet、固定4レンジ、XLSX export、Action 1の限定されたpublication batchUpdateだけを許可する。

この構成により、Sheetの共有画面は所有者のみのまま維持できる。Gemini Spark向けSheetへサービスアカウントやCI botを追加してはならない。

## 処理順序

1. HMAC署名したリクエストでowner-executed Apps Script bridgeへ接続する。
2. 固定時刻でlive Sheetの公開計画を読み、bridge経由で一時XLSXを取得して、同じ固定時刻でもう一度live計画を読む。
3. Sheet ID、15タブ、contract、schema、timezone、ヘッダー、gate、冪等キーと公開入力全体のfingerprintを照合する。
4. `APPROVED_FOR_PUBLISH`、`publish_gate=READY`、公開時刻到来済みの行を時刻・ID・version順に最大6件計画し、残りは次回へ送る。
5. 計画keyだけを許可した既存importerで `worker/prediction-catalog.generated.js` を生成し、既存項目の変更・削除や計画外の追加がないことを検証する。
6. Python、Node、build、Wrangler dry-runを通し、live Sheetのfingerprintをもう一度照合する。
7. 生成ファイルだけをGitへcommitして対象branchへpushし、既存Cloudflare Workerへdeployする。
8. 本番APIのcatalog version、key、公開内容を生成結果と照合する。
9. 確認済みの行だけをbridge経由で `PUBLISHED` にし、公開日時、URL、更新日時と `11_AUDIT_LOG` を一括記録する。

公開行の更新と監査ログはApps Script側でも書き込み形状を再検証したうえで、1回のSheets `spreadsheets.batchUpdate` にまとめる。リクエストの一部が不正なら全体を失敗させ、片方だけが保存される状態を避ける。更新直前と直後にも対象行を読み、他の処理による状態変更を検出した場合は失敗させる。

ダウンロードしたXLSXとpublication planはrunnerの一時領域だけに置く。artifactへ保存せず、commitにも含めず、ログには問題文やSheet内容を出さない。

## Apps Script bridge の設定

実装正本は `gas-github-bridge/`。既存の `gas/` は手動上書きUI用であり、匿名アクセス可能なWeb Appへ変更してはならない。

1. 固定Sheet所有者と同じGoogleアカウントで、新しい**独立した**Apps Script projectを作る。
2. `gas-github-bridge/Code.gs` と `gas-github-bridge/appsscript.json` を配置する。
3. Apps Scriptの **Project Settings → Script Properties** に `GITHUB_BRIDGE_SECRET` を作る。
4. 値は32 random bytesをhex化した**64文字の小文字hex**とする。
5. Web Appとして新規deploymentを作る。
6. **Execute as: Me** を選ぶ。
7. **Who has access: Anyone** を選ぶ。Web App自体の入口は公開だが、処理はHMAC認証済みPOSTだけを受け付け、UIや汎用Sheet APIは提供しない。
8. productionの `/exec` URLをGitHub Variableへ保存する。`/dev` URLは禁止。

Apps Scriptは次だけを許可する。

- 固定Spreadsheet IDのみ
- `05_CONFIG`, `06_PREDICTIONS`, `07_SOURCE_MASTER`, `11_AUDIT_LOG` の固定レンジ読み取り
- 固定SheetのXLSX export
- `06_PREDICTIONS` の `status`, `published_at`, `article_slug`, `updated_at` に対するAction 1の定型更新
- `11_AUDIT_LOG` への `PREDICTION_PUBLISHED` 定型append

HMACリクエストはprotocol version、Unix timestamp、nonce、operation、canonical payloadを署名する。5分を超えた時刻差、再利用nonce、不正署名、未許可operation、未許可range、未許可write shapeはfail closedとする。

## GitHubの設定値

Repositoryの `Settings` → `Secrets and variables` → `Actions` に次を登録する。

| 種類     | 名前                         | 内容 |
| -------- | ---------------------------- | ---- |
| Variable | `GEMINI_SPARK_BRIDGE_URL`    | Apps Script Web Appのproduction `/exec` URL |
| Secret   | `GEMINI_SPARK_BRIDGE_SECRET` | Apps Script Script Propertyと同じ64文字hex |
| Secret/Variable | `GOOGLE_SPREADSHEET_ID` | 固定Spreadsheet ID |
| Secret   | `CLOUDFLARE_API_TOKEN`       | 対象accountのWorkerスクリプトと `yu-zora.com` route更新に必要な権限だけを持つtoken |
| Variable | `CLOUDFLARE_ACCOUNT_ID`      | Cloudflare account ID |

旧構成の `GCP_WIF_PROVIDER`、`GCP_SERVICE_ACCOUNT` は使用しない。公開ワークフローから `id-token: write` も削除する。

Repositoryの `Settings` → `Actions` → `General` では既定の `Read repository contents and packages permissions` を維持する。公開ワークフローだけがYAML内で `contents: write` を要求する。checkoutの認証情報は保持せず、pushするstepだけに短時間の `GITHUB_TOKEN` を渡す。

Cloudflare tokenは対象accountと `yu-zora.com` zoneだけに限定し、Workerスクリプト更新、route更新、account参照に必要な権限だけを付ける。D1、KV、R2、AIなどの権限は付けない。ワークフローと `wrangler.jsonc` は既存の `project-sixth` Workerだけをdeployする。

## 旧サービスアカウント構成からの移行

この手順は重要。bridgeを用意しただけでは、既に付与したSheet共有権限は消えない。

1. `gas-github-bridge/` を新規Apps Script projectへdeployする。
2. GitHubへ `GEMINI_SPARK_BRIDGE_URL` と `GEMINI_SPARK_BRIDGE_SECRET` を登録する。
3. scheduled workflowを一時的に無効化している場合は、そのまま維持する。
4. 固定Sheetの共有画面で `project-sixth-sheets@project-sixth-ops.iam.gserviceaccount.com` を削除する。
5. 固定Sheetに所有者以外のviewer/editorが残っていないことを確認する。
6. GitHubから旧 `GCP_WIF_PROVIDER`、`GCP_SERVICE_ACCOUNT` variablesを削除する。
7. `dry_run=true` を手動実行し、bridge経由のread/exportが成功し、外部変更が0であることを確認する。
8. 問題なければscheduleを有効にする。
9. 旧Google CloudのWorkload Identity provider/service accountは、ロールバック不要と判断した時点でdisable/deleteしてよい。

**順序上、Sheetから旧サービスアカウントを削除した後に旧workflowを実行すると失敗する。必ずrepository側もこの新workflowへ更新してから再開する。**

## 初回確認

初回はGitHubの `Actions` → `Publish approved predictions` → `Run workflow` から `dry_run=true` のまま実行する。

dry runで行う処理:

- Apps Script bridgeのHMAC認証
- Sheetの読み取りと一時XLSX出力
- contractと公開計画の検証
- 一時runner内でのカタログ生成
- Python/Nodeテスト、build、Wrangler dry-run

`dry_run=true` ではGit commit、Git push、Cloudflare deploy、Google Sheet更新を行わない。Summaryの `External changes: none` とテスト結果を確認する。問題がなければ `dry_run=false` で手動実行し、本番APIとSheetのread-backまで成功することを確認する。

手動実行が成功した後もcronは同じ処理を毎時55分に行う。公開対象が0件ならcommit、deploy、Sheet更新をすべて省略する。

## 失敗時の状態

| 失敗箇所 | 残る状態 | 次回の動作 |
| --- | --- | --- |
| bridge認証・Sheet読取、contract検証、テスト | Sheetは `APPROVED_FOR_PUBLISH` のまま | 設定/原因修正後に同じkeyを再計画する |
| Git commitまたはpush | deployせず、Sheetも更新しない | 最新branchから再生成する |
| Cloudflare deploy | 生成commitが残る場合があるが、Sheetは更新しない | 同じcommitを再deployして本番確認する |
| 本番確認 | Sheetは更新しない | 本番に全keyが見えるまで再確認する |
| Sheet確定更新 | 本番には反映済みでもSheetはREADYのまま | 同じcatalogを確認し、冪等keyで確定更新を再試行する |

`concurrency: prediction-publication` により、このワークフロー同士は同時実行しない。途中のrunを新しいrunでcancelしない。`PREDICTION_PUBLISHED` の成功監査が同じkeyですでに存在する場合はNOOPとし、同じ監査行を増やさない。

## 追加料金を避ける運用

標準quota内だけで運用する。1時間に1回、最大6件とし、Sheet全体への細かな逐次アクセスを避けてbatch readと1回のatomic writeへまとめる。HTTP 429やquotaエラー時は短いbackoff後に失敗させ、無制限retryやquota増量を自動申請しない。

- Google Sheets/Drive/Apps Scriptのquota増量やquota超過課金を自動化しない。
- Google Cloudの請求先登録をこの自動化のために要求しない。
- GitHub-hosted runnerは公開repositoryの標準枠を使用する。
- Cloudflareは既存Workerと既存D1だけをdeploy対象にする。

公式資料:

- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/properties
- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/workspace/sheets/api/limits
- https://developers.google.com/drive/api/reference/rest/v3/files/export

## ローカル検証

認証を使わない範囲は次のコマンドで確認する。

```powershell
npx prettier --check .github/workflows/publish-predictions.yml docs/PREDICTION_AUTOMATION.md
npm run check
```

Apps Script deploymentとowner-only Sheetへのread-backはGitHubのmanual `dry_run=true` で確認する。
