# 現実予測 公開自動化

## 対象

GitHub Actionsの `Publish approved predictions` は、固定Google Sheetで公開承認された問題をゲームへ反映する。対象はGit Action 1の公開処理であり、結果確定や報酬処理は含まない。

正本は次のGoogle Sheetとする。

- Spreadsheet ID: `1ZGb__FQT25BPkzovq2UTfO4clvE7G71PiRm3yywSj6Y`
- Contract: `PROJECT_SIXTH_PREDICTION_OPS`
- Schema: `2.0.0`
- Timezone: `Asia/Tokyo`

ワークフローは毎時55分に起動する。Sparkの実行枠である毎時00分、15分、30分、45分とは重ならない。GitHub ActionsのcronはUTC表記だが、日本時間との時差は分に影響しないため `55 * * * *` で毎時55分になる。

## 処理順序

1. GitHub OIDCでGoogle Cloudの専用サービスアカウントを一時的に借用する。
2. 固定時刻でlive Sheetの公開計画を読み、Google Drive APIから一時XLSXを取得して、同じ固定時刻でもう一度live計画を読む。
3. Sheet ID、15タブ、contract、schema、timezone、ヘッダー、gate、冪等キーと公開入力全体のfingerprintを照合する。
4. `APPROVED_FOR_PUBLISH`、`publish_gate=READY`、公開時刻到来済みの行を時刻・ID・version順に最大6件計画し、残りは次回へ送る。
5. 計画keyだけを許可した既存importerで `worker/prediction-catalog.generated.js` を生成し、既存項目の変更・削除や計画外の追加がないことを検証する。
6. Python、Node、build、Wrangler dry-runを通し、live Sheetのfingerprintをもう一度照合する。
7. 生成ファイルだけをGitへcommitして対象branchへpushし、既存Cloudflare Workerへdeployする。
8. 本番APIのcatalog version、key、公開内容を生成結果と照合する。
9. 確認済みの行だけを `PUBLISHED` にし、公開日時、URL、更新日時と `11_AUDIT_LOG` を一括記録する。

公開行の更新と監査ログは1回のSheets `spreadsheets.batchUpdate` にまとめる。リクエストの一部が不正なら全体を失敗させ、片方だけが保存される状態を避ける。更新直前と直後にも対象行を読み、他の処理による状態変更を検出した場合は失敗させる。

ダウンロードしたXLSXとpublication planはrunnerの一時領域だけに置く。artifactへ保存せず、commitにも含めず、ログには問題文やSheet内容を出さない。

## Google Cloudの設定

設定作業は固定Sheetの所有者アカウントで行う。GitHub Actionsが個人Googleアカウントへ対話ログインする構成にはしない。専用サービスアカウントへ固定Sheetだけを共有し、GitHub OIDCから短時間だけサービスアカウントを借用する。

1. Google Cloudでこの用途専用のprojectを作成または選択する。
2. Google Sheets APIとGoogle Drive APIを有効にする。
3. `project-sixth-sheets` という名前で専用サービスアカウントを作る。
4. 固定Sheetの共有画面で、サービスアカウントのメールアドレスを編集者として追加する。
5. Workload Identity PoolとGitHub OIDC providerを作る。
6. providerのattribute mappingへ `repository_owner_id`、`repository_id`、`ref`、`event_name`、`workflow_ref` を含める。
7. providerのattribute conditionを次の値へ限定する。

   - Repository owner ID: `234326330`
   - Repository ID: `1356751877`
   - Ref: `refs/heads/yuzora/mvp-foundation`
   - Workflow: `Yuzora-Yu/PROJECT_SIXTH/.github/workflows/publish-predictions.yml@refs/heads/yuzora/mvp-foundation`
   - Event: `schedule` または `workflow_dispatch`

8. このrepositoryのprincipalだけに、専用サービスアカウントの `roles/iam.workloadIdentityUser` を付ける。

providerのattribute mappingには次を設定する。

```text
google.subject=assertion.sub
attribute.repository_owner_id=assertion.repository_owner_id
attribute.repository_id=assertion.repository_id
attribute.ref=assertion.ref
attribute.event_name=assertion.event_name
attribute.workflow_ref=assertion.workflow_ref
```

attribute conditionは次の条件をすべて満たすtokenだけを受け入れる。

```text
assertion.repository_owner_id == '234326330' && assertion.repository_id == '1356751877' && assertion.ref == 'refs/heads/yuzora/mvp-foundation' && assertion.workflow_ref == 'Yuzora-Yu/PROJECT_SIXTH/.github/workflows/publish-predictions.yml@refs/heads/yuzora/mvp-foundation' && (assertion.event_name == 'schedule' || assertion.event_name == 'workflow_dispatch')
```

サービスアカウントへGoogle Cloud project全体のOwnerやEditorは付けない。固定Sheetの共有権限と、GitHub principalからサービスアカウントを借用する権限だけを設定する。

サービスアカウントのJSON鍵、個人OAuth refresh token、OAuth client secretは作成も保存もしない。Workload Identity Federationのprovider resource nameとサービスアカウントのメールアドレスは秘密情報ではないため、GitHub Variablesへ置く。

Google Cloudの画面でカード登録、無料トライアル開始、請求先アカウントの新規作成、有料quotaの有効化を求められた場合は、その場で作業を止める。

## GitHubの設定値

Repositoryの `Settings` → `Secrets and variables` → `Actions` に次を登録する。

| 種類     | 名前                    | 内容                                                                                                  |
| -------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Variable | `GCP_PROJECT_ID`        | `project-sixth-ops`                                                                                   |
| Variable | `GCP_WIF_PROVIDER`      | `projects/380972443725/locations/global/workloadIdentityPools/github-actions/providers/project-sixth` |
| Variable | `GCP_SERVICE_ACCOUNT`   | `project-sixth-sheets@project-sixth-ops.iam.gserviceaccount.com`                                      |
| Secret   | `GOOGLE_SPREADSHEET_ID` | 固定Spreadsheet ID                                                                                    |
| Secret   | `CLOUDFLARE_API_TOKEN`  | 対象accountのWorkerスクリプトと `yu-zora.com` routeの更新に必要な権限だけを持つtoken                  |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID                                                                                 |

Spreadsheet IDはRepository Secretへ保存済み。ワークフローは同名のRepository Variableも受け付け、Variableが設定されている場合はVariableを優先する。

Repositoryの `Settings` → `Actions` → `General` では既定の `Read repository contents and packages permissions` を維持する。公開ワークフローだけがYAML内で `contents: write` と `id-token: write` を要求する。すべての外部Actionはfull commit SHAへ固定し、repository policyでも固定SHAを必須にする。checkoutの認証情報は保持せず、pushするstepだけに短時間の `GITHUB_TOKEN` を渡す。

Cloudflare tokenは対象accountと `yu-zora.com` zoneだけに限定し、Workerスクリプト更新、route更新、account参照に必要な権限だけを付ける。D1、KV、R2、AIなどの権限は付けない。ワークフローと `wrangler.jsonc` は既存の `project-sixth` Workerだけをdeployする。

## 初回確認

初回はGitHubの `Actions` → `Publish approved predictions` → `Run workflow` から `dry_run=true` のまま実行する。

dry runで行う処理:

- WIF認証
- Sheetの読み取りと一時XLSX出力
- contractと公開計画の検証
- 一時runner内でのカタログ生成
- Python/Nodeテスト、build、Wrangler dry-run

dry runではGit commit、Git push、Cloudflare deploy、Google Sheet更新を行わない。Summaryの `External changes: none` とテスト結果を確認する。問題がなければ `dry_run=false` で手動実行し、本番APIとSheetのread-backまで成功することを確認する。

最初の `dry_run=false` 手動実行ではCloudflare APIの応答本文を破棄したままtokenと既存Workerへの参照権限を確認する。公開対象が0件ならdeployとSheet更新は行わない。

手動実行が成功した後もcronは同じ処理を毎時55分に行う。公開対象が0件ならcommit、deploy、Sheet更新をすべて省略する。

## 失敗時の状態

| 失敗箇所                        | 残る状態                                        | 次回の動作                                         |
| ------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Sheet読取、contract検証、テスト | Sheetは `APPROVED_FOR_PUBLISH` のまま           | 原因修正後に同じkeyを再計画する                    |
| Git commitまたはpush            | deployせず、Sheetも更新しない                   | 最新branchから再生成する                           |
| Cloudflare deploy               | 生成commitが残る場合があるが、Sheetは更新しない | 同じcommitを再deployして本番確認する               |
| 本番確認                        | Sheetは更新しない                               | 本番に全keyが見えるまで再確認する                  |
| Sheet確定更新                   | 本番には反映済みでもSheetはREADYのまま          | 同じcatalogを確認し、冪等keyで確定更新を再試行する |

`concurrency: prediction-publication` により、このワークフロー同士は同時実行しない。途中のrunを新しいrunでcancelしない。`PREDICTION_PUBLISHED` の成功監査が同じkeyですでに存在する場合はNOOPとし、同じ監査行を増やさない。

Cloudflareの秘密情報がないscheduled runは最初に失敗する。これにより、Gitだけ更新されてdeployできない定期処理を開始しない。manual dry runではCloudflare秘密情報を要求しない。

## 追加料金を避ける運用

標準quota内だけで運用する。1時間に1回、最大6件とし、Sheet全体への細かな逐次アクセスを避けてbatch readと1回のatomic writeへまとめる。HTTP 429やquotaエラー時は短いbackoff後に失敗させ、無制限retryやquota増量を自動申請しない。

- Google Sheets APIのquota増量やquota超過課金を有効にしない。
- Google Cloudの請求先登録を自動化しない。
- GitHub-hosted runnerは公開repositoryの標準枠を使用する。
- Cloudflareは既存Workerと既存D1だけをdeploy対象にする。
- XLSX exportがDrive APIの10 MB制限へ近づいた場合は処理を止め、Sheetの分割や保持期間を先に検討する。

料金、quota、プランの画面に有料変更が表示された場合は実行せず、内容を確認してから進める。

公式資料:

- [Google Cloud: Workload Identity Federation for deployment pipelines](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Google Workspace: サービスアカウントの作成](https://developers.google.com/workspace/guides/create-credentials#service-account)
- [Google Sheets API: 使用制限](https://developers.google.com/workspace/sheets/api/limits)
- [Google Drive API: files.export](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)
- [GitHub Actions: OIDC](https://docs.github.com/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

## ローカル検証

認証を使わない範囲は次のコマンドで確認する。

```powershell
npx prettier --check .github/workflows/publish-predictions.yml docs/PREDICTION_AUTOMATION.md
npm run check
```

Google認証とSheet read-backはGitHub OIDC tokenが必要なため、初回manual dry runで確認する。
