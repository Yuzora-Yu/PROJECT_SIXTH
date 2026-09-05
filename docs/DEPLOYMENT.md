# 配信記録 — 2026-09-05

公開URL: https://yu-zora.com/project_sixth/

- アプリ / 公開API: v0.4.2
- Worker: `project-sixth`
- Worker version: `eda8544d-1dce-4dc3-86ed-13ffc4797b7f`
- Worker version作成: 2026-09-05 16:37:06 JST
- D1: `project-sixth` / `410a83bb-0907-4ac0-8a1c-110152eba20e`（既存）
- Bindings: 既存のD1 `DB` と静的アセット `ASSETS` のみ
- Routes: `yu-zora.com/project_sixth`、`yu-zora.com/project_sixth/*`（既存ルートを維持）

## v0.4.2の配信内容

- アクセス時にノイズ、走査線、信号帯、端末接続表示を約1.15秒表示する演出を追加しました。操作を遮らず、OSの動きを減らす設定では省略します。
- 毎日04:00 JST以降の初回アクセス時に100 RCを付与し、画面上で取得を通知します。同時アクセス時もD1の条件付き更新で1回だけ付与します。
- カード20 RC、粒子30 RC、戦闘完了1回10 RC・1日5回として、毎日の活動報酬を合計100 RCに調整しました。研究所アクセスボーナス100 RCは別枠です。

## v0.4.2の確認結果

- 公開HTMLがHTTP 200を返し、端末接続演出とアクセスボーナス通知の要素、v0.4.2表記が含まれることを確認。
- 本番の新規匿名セッションで初回bootstrapが400 RCと `awarded: true` を返し、同じCookieによる再取得が400 RCのまま `awarded: false` になることを確認。
- 自動検証で、試験2種と戦闘5回の活動報酬が合計100 RC、アクセスボーナスを含めた最大獲得量が200 RC/日になることを確認。
- 390px幅の本番画面で端末接続演出、アクセスボーナス通知、横あふれ0pxを確認。
- Playwright: 8件中8件成功。
- Pythonテスト: prediction importer 10件、Google Sheets bridge 24件の計34件中34件成功。
- Nodeテスト: 38件中38件成功。
- Wrangler 4.129.0によるdry-runと本番配信が成功。既存D1 `DB` と静的アセット `ASSETS` だけを使用。

## Cloudflareの構成と料金方針

今回の手動配信とGitHub Actionsによる現実予測の公開では、既存Worker、既存D1、既存静的アセット、既存ルートだけを使用しました。新しいCloudflare資源、D1 migration、有料機能、有料プラン、追加の請求設定は作成・適用していません。

今後もWorkers・D1などの無料枠内で運用し、ドメイン料を除く追加料金が必要になる操作は実行前に停止します。利用量と仕様はCloudflareの[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)および[D1料金](https://developers.cloudflare.com/d1/platform/pricing/)の公式情報で確認します。

GitHub Pagesは使用しません。通常のアプリ更新は手動配信とし、公開承認と公開時刻を満たす現実予測カタログだけを専用GitHub Actionsで既存Workerへ自動反映します。Cloudflare tokenは対象accountと `yu-zora.com` zoneへ限定しています。

## 更新手順

```powershell
npm ci
npm run predictions:check
npm run check
npm run deploy
```

v0.4.2ではD1 migrationを追加していません。アクセスボーナスの取得日は既存プレイヤーJSON内に保存します。

## 過去の配信履歴

### v0.4.1 — 2026-09-05

#### 配信内容

- 全画面共通フッターに「YU-ZORAトップ」「プライバシーポリシー」「利用規約」「免責事項」「お問い合わせ」の5リンクを追加しました。
- 各リンクのタップ領域を44px以上確保し、スマホ幅でも読みやすく折り返すよう調整しました。
- 公開承認と公開時刻を満たす現実予測を最大6件ずつ検証し、既存Workerへ反映してSheetへ書き戻す専用GitHub Actionsを追加しました。

#### 確認結果

- Worker version: `50809065-ac7e-40ad-9ac9-02213ea42f68`（2026-09-05 14:30:03 JST作成）
- 公開HTMLがHTTP 200を返し、共通フッターの5リンクが含まれることを確認。
- 公開APIのversionがv0.4.1であることを確認。
- [dry-run](https://github.com/Yuzora-Yu/PROJECT_SIXTH/actions/runs/33950745512)はcommit `9814476`から公開予定6件を検証し、Git・Cloudflare・Google Sheetへの変更なしで成功。
- [本番公開](https://github.com/Yuzora-Yu/PROJECT_SIXTH/actions/runs/33950796966)はcommit `9814476`から6件を公開し、生成commit `a140757`の本番確認とGoogle Sheetへの原子的な書き戻しを2026-09-05 15:48:43 JSTに完了。
- このv0.4.1実行時点ではGitHub OIDCとWorkload Identity Federationを使用していましたが、Gemini Spark本番Sheetを共有状態にするため**現在は廃止**しています。現行はowner-executed Apps Script bridgeを使用し、Sheet共有は所有者のみにします。

### v0.4.0 — 2026-09-05

#### 配信内容

- 「現実予測」を公開。prediction catalogはv2.2.0で、公開6件・受付中6件を配信しています。
- 公開日時、受付期限、予測ID・版、選択肢をサーバー側で照合し、匿名セッションの回答を保存・再取得できるようにしました。予測回答によるRC・経験値・報酬はありません。
- 360px・390px幅と文字拡大時に、下部メニュー、見出し、カード本文が不自然に分断されたり横にはみ出したりしないよう調整しました。
- 数秘・MBTI・惑星配置と研究記録に対する「研究員の所見」を、自然で簡潔な日本語へ調整しました。
- リポジトリ直下の `AGENTS.md` で `pink-elephant-guard` を必須スキルに指定し、却下・削除・修正済みの表現を閲覧者向け成果物へ再登場させない運用を明文化しました。

#### 確認結果

- Worker version: `df50a215-0276-404d-8b8a-6604a19d79ae`（2026-09-05 14:11:49 JST作成）
- 公開APIのversionがv0.4.0であることを確認。
- 公開APIのprediction catalogがv2.2.0、公開6件・受付中6件であることを確認。
- 新規匿名セッションで現実予測へ回答し、再取得後も選択内容が保存されていることを本番環境で確認。
- Pythonテスト: 4件中4件成功。
- Nodeテスト: 34件中34件成功。
- Playwright: 8件中8件成功。現実予測、スマホ幅・文字拡大、30秒粒子試験、プロフィールと共有画像を含みます。

### v0.3.3 — 2026-09-04

- アプリ: v0.3.3
- Worker version: `1267d8d1-4975-4a2d-ae9e-7389f1b1836b`
- 公開環境で仲間一覧26人、召喚の全26名表示、保留対象の名前が画面に出ないことを確認。ブラウザ例外なし。
- 元の30件のマスタと既存の所持・育成記録は保持。公開対象の操作制限と、開始済み戦闘の精算をユニットテストで確認。

### v0.3.2

- 数秘／総合タブをマウス・左右キーで切り替え、390px幅でも横にはみ出さないことを確認。
- 数秘・MBTI・惑星配置を含む3段落の所見と、全文を含む総合PNG（確認例1080×1817）を公開環境で確認。ブラウザ例外なし。
- 粒子ルールv5のPC・スマホ入力、30秒終了時のサーバー保存との一致をローカルで確認。公開配信でもv5とシードごとの方向差を確認。

### v0.3.1

- PCクリック・スマホ幅のタップの2シナリオを実行。緑の発見表示・粒子消去・ライブカウンターを確認。
- 正常範囲の入力は誤検知、0.5秒以内の入力は待ち表示となりカウントされないことを確認。
- 画面に描かれたフレーム時刻と同じ座標判定をサーバーへ渡し、途中のカウンターと終了時の採点を照合。
- 動きの軽減設定と枠線を除いた座標変換を確認。

### v0.3.0以前

- Migration `0001_initial.sql` 適用済み。
- 匿名セッションCookieはSecure / HttpOnly / SameSite=Strict、Pathは `/project_sixth/`。
- HTMLに `Cache-Control: public, max-age=0, must-revalidate, no-transform` を付与し、同一オリジン限定CSPとの競合を解消。この設定はPROJECT SIXTHのHTMLだけに適用。
- 公開URLのHTTP 200と末尾スラッシュなしからの308リダイレクト、Daily報酬・訓練記録の保存、共有PNG、数秘11、10天体、任意MBTI、総合補正、26枠の仲間を確認。
- 既存の `/games/Prisma-Abyss/*` などのルート、DNS、既存ゲームのWorker、既存DBは変更していません。

## 一次資料

- [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1料金](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Web Analytics FAQ — no-transform](https://developers.cloudflare.com/web-analytics/faq/)
- [Astronomy Engine JavaScript](https://github.com/cosinekitty/astronomy/tree/master/source/js)
