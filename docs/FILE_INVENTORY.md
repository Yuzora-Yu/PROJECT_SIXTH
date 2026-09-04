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

## v0.3.3の追加ファイル

- `shared/roster.js` — マスタを保持した公開対象の選定。
- `tests/roster.test.mjs` — 召喚・操作制限・既存進行の保持を検証。
