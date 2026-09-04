# 第六感強化計画-PROJECT SIXTH-

被験者として「察知・予見・洞察・感応・共鳴」を観測し、キャラクター育成へつなぐブラウザゲーム。初回MVPのローカル検証版です。

## 起動

Node.js 24以上を使用します。

```powershell
npm ci
npm run dev
```

ブラウザで http://127.0.0.1:4173 を開きます。HTMLの直接ダブルクリックでは保存APIが動きません。
通常の開発用サーバーはNode標準SQLiteを使用し、`.local/sixth.sqlite` に進行を保存します。再起動しても同じCookieなら続きから遊べます。
本番と同じAPI処理・SQLを使い、RC・Daily・キャラクターはサーバーを正とします。訓練記録・表示設定・任意の出生情報だけ端末内保存です。

## 現在遊べる機能

- ★カードDaily（正解は選択前に送信しない）
- 60秒・100粒子・5種類の異常観測、イベント記録とリプレイ
- 潜在法則5問のDaily
- 報酬のない反復訓練、直近30回の記録
- 第六感レーダー、日次コンディション、成績解析
- PRISMA由来12キャラクター・3モンスターを使った短時間戦闘、1日5回
- 無料RCの1回/10連召喚、重複欠片による育成、所持キャラのプロフィール設定
- 出生情報を送信しない娯楽用の星座・数秘プロフィール
- 高コントラスト、文字拡大、スマホ縦持ち、動きの軽減設定への対応

現実予測・レイド・予測カレンダーは「開発中」。投票、オッズ、外部AI、予測用API、運用Excelの取り込みは実装していません。

## 検証

```powershell
npm test
npm run build
npx playwright test
npm run deploy:check
node scripts/economy-check.mjs
```

ブラウザテストはEdgeを使用します。Edge未導入環境は `playwright.config.js` のchannelを環境に合わせて変更してください。
`dist/` は公開可能な静的ファイルのみです。元マスタ、DB、開発資料、セッション情報は含めません。

## Cloudflare Workers + D1でのローカル検証

```powershell
npm run db:local
npm run dev:worker
```

Node開発サーバーとWranglerローカル環境のDBは別です。
本番公開時は専用D1を作成し、`wrangler.jsonc` のゼロ埋め `database_id` を実値に置き換え、remote migrationを適用してからdeployします。ゼロ埋めIDはローカル用の明示的な未設定値です。本番D1作成・公開・Git pushは実施していません。

## 資料

- [調査・再利用判断](docs/INVENTORY.md)
- [素材の対応・ハッシュ](docs/SOURCE_MAP.md)
- [流用元の無変更検証](docs/PRISMA_INTEGRITY.json)
- [実装範囲・残課題](docs/IMPLEMENTATION_NOTES.md)

PRISMA ABYSSはRead Only。アセット・マスタはPROJECT_SIXTH内へコピーしたものだけを利用します。元プロジェクトのセーブキー・API・グローバル変数には依存しません。
