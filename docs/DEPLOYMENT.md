# 配信記録 — 2026-09-04

公開URL: https://yu-zora.com/project_sixth/

- アプリ: v0.3.3
- Worker: `project-sixth`
- Worker version: `1267d8d1-4975-4a2d-ae9e-7389f1b1836b`
- D1: `project-sixth` / `410a83bb-0907-4ac0-8a1c-110152eba20e`
- Migration: `0001_initial.sql` 適用済み
- Routes: `yu-zora.com/project_sixth`、`yu-zora.com/project_sixth/*`

既存の `/games/Prisma-Abyss/*` などのルートは維持。DNS・既存ゲームのWorker・既存DBは変更していません。匿名セッションCookieはSecure / HttpOnly / SameSite=Strict、Pathは `/project_sixth/`。

HTMLに `Cache-Control: public, max-age=0, must-revalidate, no-transform` を付与。ドメイン全体の自動分析スクリプト挿入と、このアプリの同一オリジン限定CSPとの競合を解消しています。この設定はPROJECT SIXTHのHTMLだけに適用。

## 確認結果

- ユニット・APIテスト: 33件成功
- Edgeブラウザ: 4シナリオ成功（30秒粒子試験、離脱時の再試行、Daily、召喚、戦闘、訓練、プロフィール、スマホ幅）
- 公開URL: HTTP 200、末尾スラッシュなしから308リダイレクト
- 公開環境でDaily報酬がリロード後も保存されることを確認
- 公開環境で訓練終了直後の記録更新、PNG生成・保存を確認
- 数秘11、10天体、出生時刻・UTC差、任意MBTI日本語名、総合補正と10%初期値反映・置換・解除を確認
- 26枠の仲間、未取得シルエット、初期6人からの選択、誕生日の月日表示を確認
- 任意名・研究開始日・総研究日数・Daily成績を研究共有画像に集約
- 出生日時がゲームAPIへ送られないことを確認。初期値反映時だけ数秘・MBTI・星座区分を計算用に送り、サーバーでは補正値のみ保存
- 共有PNGを目視確認（数秘レーダー・総合プロフィール・研究記録）
- 公開環境でページ例外・コンソールエラーなし
- 既存PRISMA ABYSS配信URLもHTTP 200

検証用の匿名プレイヤーで本番の保存確認を行いました。ユーザーのローカル試遊データは本番へ移行していません。

## v0.3.1の追加確認

- PCクリック・スマホ幅のタップの2シナリオを実行。緑の発見表示・粒子消去・ライブカウンターを確認
- 正常範囲の入力は誤検知、0.5秒以内の入力は待ち表示となりカウントされないことを確認
- 画面に描かれたフレーム時刻と同じ座標判定をサーバーへ渡し、途中のカウンターと終了時の採点を照合
- 動きの軽減設定と枠線を除いた座標変換を確認

## 更新手順

```powershell
npm ci
npx wrangler d1 migrations apply project-sixth --remote
npm run deploy
```

GitHub Pagesは使用しません。GitHub Actionsは検証のみで、自動デプロイ用トークンは設定していません。

## 一次資料

- [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Cloudflare Web Analytics FAQ — no-transform](https://developers.cloudflare.com/web-analytics/faq/)
- [Astronomy Engine JavaScript](https://github.com/cosinekitty/astronomy/tree/master/source/js)

## v0.3.2の追加確認

- 数秘／総合タブをマウス・左右キーで切り替え、390px幅でも横にはみ出さないことを確認。
- 数秘・MBTI・惑星配置を含む3段落の所見と、全文を含む総合PNG（確認例1080×1817）を公開環境で確認。ブラウザ例外なし。
- 粒子ルールv5のPC・スマホ入力、30秒終了時のサーバー保存との一致をローカルで確認。公開配信でもv5とシードごとの方向差を確認。

## v0.3.3の追加確認

- 公開環境で仲間一覧26人、召喚の全26名表示、保留対象の名前が画面に出ないことを確認。ブラウザ例外なし。
- 元の30件のマスタと既存の所持/育成記録は保持。公開対象の操作制限と、開始済み戦闘の精算をユニットテストで確認。
