# 第六感強化計画-PROJECT SIXTH-

被験者として「察知・予見・洞察・感応・共鳴」を観測し、キャラクター育成へつなぐブラウザゲーム。コード版v0.5.0です。

公開先: https://yu-zora.com/project_sixth/

## 起動

Node.js 24以上を使用します。

```powershell
npm ci
npm run dev
```

ブラウザで http://127.0.0.1:4173 を開きます。HTMLの直接ダブルクリックでは保存APIが動きません。
通常の開発用サーバーはNode標準SQLiteを使用し、`.local/sixth.sqlite` に進行を保存します。再起動しても同じCookieなら続きから遊べます。
本番と同じAPI処理・SQLを使い、RC・Daily・キャラクターはサーバーを正とします。訓練記録・表示設定・任意の出生情報とタイプは端末内保存です。初期値反映時に数秘・タイプ・星座区分を計算用に送り、サーバーには補正値だけを保存します。

## 現在遊べる機能

- 端末へ接続するノイズ演出と、04:00 JST以降の初回アクセスで受け取る100 RC
- ★カードDaily（20 RC。正解は選択前に送信しない）
- 30秒・100粒子・5種類の異常観測（30 RC）、発見時のエフェクト・粒子消去・即時カウンター、イベント記録とリプレイ
- 報酬のない反復訓練、試験ごとに直近30回の記録。終了時に回数・自己ベスト・直近記録を即時更新
- 第六感レーダー、日次コンディション、成績解析
- PRISMA由来26キャラクター・3モンスターを使った短時間戦闘、完了ごとに10 RC・1日5回
- 無料RCの1回/10連召喚、重複欠片による育成、所持キャラのプロフィール設定
- 数秘2と11・22・33の区別、太陽・月を含む10天体の配置と主な角度関係
- 任意の出生時刻・UTC差・日本語名付きMBTI。数秘×タイプ×惑星配置の総合レーダーと、組合せを読み分ける所見
- 総合プロフィールの10%を初期研究値へ反映。更新時は補正を置換し、研究XPを保持
- 任意の被験者名、研究開始日、開始日を含む総研究日数
- 最初の仲間をジョセフ・リュウ・アルス（冒険者）・アリサ・サラ・ソフィアから1人選択。未取得はシルエット
- 数秘、総合プロフィール、研究記録の3種類でPNG作成・X投稿画面・端末の共有メニュー
- 高コントラスト、文字拡大、スマホ縦持ち、動きの軽減設定への対応
- 公開審査済みの出来事へRCで投票する「現実予測」。10〜1000 RCを10刻みで投票し、各予想の最初の10 RCは無料。パリミュチュエルオッズ、結果確定後のRC払戻、的中時の予見XPを扱う

現実予測は、運用台帳の `status=APPROVED_FOR_PUBLISH` かつ `publish_gate=READY` を満たし、公開時刻を迎えた問題だけをアプリ用カタログへ反映します。問題・締切・最終結果はSheet由来のカタログ、個人bet・オッズ・払戻・XPはWorker/D1で分離管理し、ユーザーアクセス時に外部AIを呼び出しません。週末共同レイドは開発中です。

手元で運用台帳を確認する場合は、最新版をローカル専用の `ops/PROJECT_SIXTH_GeminiSpark_Prediction_Ops.xlsx` へコピーし、次のコマンドで公開カタログを検証します。xlsxはGitの追跡対象外です。公開済みのID・version・問題文・選択肢・判定条件を削除または上書きする更新は拒否されます。

```powershell
npm run predictions:import
npm run predictions:check
```

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

## Cloudflare Workers + D1でのローカル/staging検証

```powershell
npm run db:local
npm run dev:worker
```

Node開発サーバーとWranglerローカル環境のDBは別です。Wrangler localは`staging` environmentとCloudflare公式dummy Turnstile credentialを使い、本番D1・本番Turnstile secretへ接続しません。
本番は専用Worker `project-sixth` と専用D1 `project-sixth` を使用します。配信ルートは `yu-zora.com/project_sixth` と `yu-zora.com/project_sixth/*`。stagingは `project-sixth-staging` Worker/D1と`*.workers.dev`だけを使用します。

v0.5.0のD1 migrationは必ずstagingへ先に適用し、投票・オッズ・払戻・二重送信を確認してからproductionへ進めます。手順は `docs/PREDICTION_BETTING.md` を正とします。

Cloudflareへログイン済みの開発環境ではWranglerで手動配信できます。公開承認と公開時刻を満たす現実予測カタログは、専用GitHub Actionsが既存Workerへ自動反映します。通常のアプリ更新は自動配信しません。GitHub Pagesは不要です。匿名セッションCookieのPathも `/project_sixth/` に限定します。

惑星位置の計算にはMITライセンスのAstronomy Engine 2.1.19を使用。ビルド時にブラウザ用モジュールとライセンスを `vendor/` にコピーします。出生時刻が不明なら現地正午の概算と日内の星座候補を表示し、ASC・ハウスは算出しません。
X用ハッシュタグは `#第六感強化計画 #PROJECTSIXTH`。PNGは端末内で生成し、画像付き投稿は保存した画像をX画面で添付してください。

## 資料

- [調査・再利用判断](docs/INVENTORY.md)
- [素材の対応・ハッシュ](docs/SOURCE_MAP.md)
- [流用元の無変更検証](docs/PRISMA_INTEGRITY.json)
- [実装範囲・残課題](docs/IMPLEMENTATION_NOTES.md)
- [Gemini Spark 現実予測運用仕様](docs/GEMINI_SPARK_OPERATIONS.md)
- [現実予測 公開自動化](docs/PREDICTION_AUTOMATION.md)
- [現実予測 情報源ポリシー](docs/PREDICTION_SOURCE_POLICY.md)
- [現実予測 RC投票・オッズ・払戻](docs/PREDICTION_BETTING.md)
- [Gemini Spark Skills / Tasks](gemini-spark/README.md)
- 現実予測 運用スプレッドシート（ローカル専用: `ops/PROJECT_SIXTH_GeminiSpark_Prediction_Ops.xlsx`）

PRISMA ABYSSはRead Only。アセット・マスタはPROJECT_SIXTH内へコピーしたものだけを利用します。元プロジェクトのセーブキー・API・グローバル変数には依存しません。
