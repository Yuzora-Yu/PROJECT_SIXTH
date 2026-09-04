# 第六感強化計画-PROJECT SIXTH-

被験者として「察知・予見・洞察・感応・共鳴」を観測し、キャラクター育成へつなぐブラウザゲーム。v0.2.0のMVPです。

公開先: https://yu-zora.com/project_sixth/

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
- 報酬のない反復訓練、試験ごとに直近30回の記録。終了時に回数・自己ベスト・直近記録を即時更新
- 第六感レーダー、日次コンディション、成績解析
- PRISMA由来12キャラクター・3モンスターを使った短時間戦闘、1日5回
- 無料RCの1回/10連召喚、重複欠片による育成、所持キャラのプロフィール設定
- 数秘2と11・22・33の区別、太陽・月を含む10天体の配置と主な角度関係
- 任意の出生時刻・UTC差・MBTIタイプを端末内だけに保存。研究員が語りかける短い所見
- 各試験結果・プロフィール・所持キャラ・戦闘結果のPNG作成、X投稿画面、端末の共有メニュー
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
本番は専用Worker `project-sixth` と専用D1 `project-sixth` を使用します。配信ルートは `yu-zora.com/project_sixth` と `yu-zora.com/project_sixth/*`。他のパスは担当しません。

```powershell
npx wrangler d1 migrations apply project-sixth --remote
npm run deploy
```

Cloudflareへログイン済みの開発環境で実行します。GitHub Actionsは検証のみで、Git pushによる本番自動デプロイは設定していません。GitHub Pagesは不要です。匿名セッションCookieのPathも `/project_sixth/` に限定します。

惑星位置の計算にはMITライセンスのAstronomy Engine 2.1.19を使用。ビルド時にブラウザ用モジュールとライセンスを `vendor/` にコピーします。出生時刻が不明なら現地正午の概算と日内の星座候補を表示し、ASC・ハウスは算出しません。
X用ハッシュタグは `#第六感強化計画 #PROJECTSIXTH`。PNGは端末内で生成し、画像付き投稿は保存した画像をX画面で添付してください。

## 資料

- [調査・再利用判断](docs/INVENTORY.md)
- [素材の対応・ハッシュ](docs/SOURCE_MAP.md)
- [流用元の無変更検証](docs/PRISMA_INTEGRITY.json)
- [実装範囲・残課題](docs/IMPLEMENTATION_NOTES.md)

PRISMA ABYSSはRead Only。アセット・マスタはPROJECT_SIXTH内へコピーしたものだけを利用します。元プロジェクトのセーブキー・API・グローバル変数には依存しません。
