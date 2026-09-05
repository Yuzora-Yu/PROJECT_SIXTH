# 作成ファイル一覧

初回MVPで作成した68件を下記に記載します。v0.2.0では、末尾の7ファイルを追加し、記録・プロフィール・共有・Cloudflare配信に関わる既存ファイルも更新しました。

- `.github/workflows/ci.yml`
- `.gitignore`
- `README.md`
- `assets/icon.svg`
- `assets/prisma/characters/101.webp`
- `assets/prisma/characters/102.webp`
- `assets/prisma/characters/103.webp`
- `assets/prisma/characters/104.webp`
- `assets/prisma/characters/105.webp`
- `assets/prisma/characters/106.webp`
- `assets/prisma/characters/107.webp`
- `assets/prisma/characters/108.webp`
- `assets/prisma/characters/109.webp`
- `assets/prisma/characters/110.webp`
- `assets/prisma/characters/201.webp`
- `assets/prisma/characters/202.webp`
- `assets/prisma/face/101.webp`
- `assets/prisma/face/102.webp`
- `assets/prisma/face/103.webp`
- `assets/prisma/face/104.webp`
- `assets/prisma/face/105.webp`
- `assets/prisma/face/106.webp`
- `assets/prisma/face/107.webp`
- `assets/prisma/face/108.webp`
- `assets/prisma/face/109.webp`
- `assets/prisma/face/110.webp`
- `assets/prisma/face/201.webp`
- `assets/prisma/face/202.webp`
- `assets/prisma/monsters/1.webp`
- `assets/prisma/monsters/2.webp`
- `assets/prisma/monsters/3.webp`
- `css/main.css`
- `css/screens.css`
- `data/prisma/catalog.js`
- `data/prisma/source/characters.js`
- `data/prisma/source/monsters.js`
- `docs/FILE_INVENTORY.md`
- `docs/IMPLEMENTATION_NOTES.md`
- `docs/INVENTORY.md`
- `docs/PRISMA_INTEGRITY.json`
- `docs/SOURCE_MAP.md`
- `docs/VALIDATION.md`
- `index.html`
- `js/api.js`
- `js/app.js`
- `js/battle/prisma-adapter.js`
- `js/trials.js`
- `js/ui.js`
- `migrations/0001_initial.sql`
- `package-lock.json`
- `package.json`
- `playwright.config.js`
- `scripts/build.mjs`
- `scripts/dev-server.mjs`
- `scripts/economy-check.mjs`
- `scripts/import-prisma.mjs`
- `scripts/sqlite.mjs`
- `scripts/verify-prisma.mjs`
- `shared/config.js`
- `shared/core.js`
- `shared/particles.js`
- `tests/api.test.mjs`
- `tests/browser.spec.js`
- `tests/core.test.mjs`
- `worker/api.js`
- `worker/game.js`
- `worker/index.js`
- `wrangler.jsonc`

生成物（dist、node_modules、.local、.wrangler、test-results、worker-configuration.d.ts）はGit管理外です。

## v0.2.0で追加したファイル

- `docs/DEPLOYMENT.md`
- `js/profile-ui.js`
- `js/sharing.js`
- `scripts/prepare-vendor.mjs`
- `shared/profiles.js`
- `tests/profiles.spec.js`
- `tests/profiles.test.mjs`

## v0.3.0の追加

- 18枠分の顔・立ち絵: `assets/prisma/face/`、`assets/prisma/characters/` に36ファイル
- `shared/profile-model.js`: 組合せによるプロフィール計算と所見
- `docs/CHARACTER_BIRTHDAYS.json`: 誕生日決定の内部記録
- `tests/signature.test.mjs`: 補正・初期選択・領域判定の検証

## v0.3.1の追加

- `js/particle-feedback.js`: 入力座標変換、発見・誤検知・待ち時間のエフェクト
- `tests/particle-feedback.test.mjs`: 即時判定と最終採点の一致・境界判定
- `tests/particle-feedback.spec.js`: PCとスマホ幅の入力・表示・保存

## 2026-09-04 現実予測運用設計で追加（初版release 2.1.0）

- `docs/GEMINI_SPARK_OPERATIONS.md`
- `docs/PREDICTION_SOURCE_POLICY.md`
- `docs/OPERATIONS.md`
- `ops/PROJECT_SIXTH_GeminiSpark_Prediction_Ops.xlsx` — ローカル運用正本（現在release 2.2.0、Git管理外）
- `gemini-spark/README.md`
- `gemini-spark/ops_contract.json`
- `gemini-spark/tasks/TASKS.md` — task index / schedule
- `gemini-spark/tasks/T01_collect_prediction_candidates.md`
- `gemini-spark/tasks/T02_draft_prediction_question.md`
- `gemini-spark/tasks/T03_audit_prediction_question.md`
- `gemini-spark/tasks/T04_approve_prediction_publication.md`
- `gemini-spark/tasks/T05_verify_result_primary.md`
- `gemini-spark/tasks/T06_verify_result_secondary.md`
- `gemini-spark/tasks/T07_settle_prediction_result.md`
- `gemini-spark/tasks/T08_collect_major_events_optional.md` — optional
- `gemini-spark/skills/*/SKILL.md` — 7 Skills readable source
- `gemini-spark/packages/*.zip` — 7 Gemini Spark upload packages
- `spark/` — compatibility mirror of task/skill/contract files

予測ゲーム本体コードとGitHub Actionsはこの段階では未実装。

## v0.3.3の追加ファイル

- `shared/roster.js` — マスタを保持した公開対象の選定。
- `tests/roster.test.mjs` — 召喚・操作制限・既存進行の保持を検証。

## v0.4.0の追加ファイル

- `AGENTS.md` / `.agents/skills/pink-elephant-guard/` — 表示物更新時の必須Skill。
- `scripts/import-predictions.py` — 運用xlsxを検証し、公開可能な行だけを決定的に抽出。
- `worker/prediction-catalog.generated.js` — release 2.2.0から生成したWorker専用カタログ。
- `worker/predictions.js` — カタログ検証、公開期間、結果状態を扱うドメイン層。
- `tests/mobile-layout.spec.js` — 360/390pxと文字拡大時の改行・下部メニュー・横あふれを検証。
- `tests/test_import_predictions.py` — 公開時刻境界と時刻入力を検証。

## v0.4.1の公開自動化で追加

- `.github/workflows/publish-predictions.yml` — 公開条件を満たす予測だけをSheetからGit、既存Worker、Sheet確定記録へ反映。
- `scripts/google-sheets-bridge.py` — 固定Sheetのexport、公開計画、atomic確定更新を扱うbridge client。初版はGoogle OIDCだったが、現在はowner-executed Apps Script bridgeへ移行。
- `tests/test_google_sheets_bridge.py` — NOOP、競合、冪等監査、限定セル更新、XLSX検査を確認。
- `docs/PREDICTION_AUTOMATION.md` — owner-only Sheet、Apps Script bridge、GitHub、Cloudflareの設定と運用手順。

## 2026-09-05 Gemini Spark owner-only Sheet hotfix

- `gas-github-bridge/Code.gs` — GitHub Actions用のHMAC認証付きowner-executed Apps Script bridge。
- `gas-github-bridge/appsscript.json` — bridge専用の最小Google scope定義。
- `gas-github-bridge/README.md` — deploy、GitHub設定、旧サービスアカウント権限削除の移行手順。
- `.github/workflows/publish-predictions.yml` — WIF/service accountと`id-token: write`を廃止し、Apps Script bridgeへ切替。

## v0.4.2で追加

- `tests/economy.test.mjs` — カード、粒子、戦闘5回の活動報酬が合計100 RCになることと、開始済み戦闘の新報酬への移行を検証。
