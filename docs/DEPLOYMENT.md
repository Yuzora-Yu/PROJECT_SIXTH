# 配信記録 — 2026-09-04

公開URL: https://yu-zora.com/project_sixth/

- アプリ: v0.2.0
- Worker: `project-sixth`
- Worker version: `f0e157ea-a440-45a8-9e90-47b91d1b34f2`
- D1: `project-sixth` / `410a83bb-0907-4ac0-8a1c-110152eba20e`
- Migration: `0001_initial.sql` 適用済み
- Routes: `yu-zora.com/project_sixth`、`yu-zora.com/project_sixth/*`

既存の `/games/Prisma-Abyss/*` などのルートは維持。DNS・既存ゲームのWorker・既存DBは変更していません。匿名セッションCookieはSecure / HttpOnly / SameSite=Lax、Pathは `/project_sixth/`。

HTMLに `Cache-Control: public, max-age=0, must-revalidate, no-transform` を付与。ドメイン全体の自動分析スクリプト挿入と、このアプリの同一オリジン限定CSPとの競合を解消しています。この設定はPROJECT SIXTHのHTMLだけに適用。

## 確認結果

- ユニット・APIテスト: 22件成功
- Edgeブラウザ: 5シナリオ成功（60秒粒子試験、離脱時の再試行、Daily、召喚、戦闘、訓練、プロフィール、スマホ幅）
- 公開URL: HTTP 200、末尾スラッシュなしから308リダイレクト
- 公開環境でDaily報酬がリロード後も保存されることを確認
- 公開環境で訓練終了直後の記録更新、PNG生成・保存を確認
- 数秘11、10天体、出生時刻・UTC差、任意MBTIの保存と削除を確認
- 出生日時とMBTIがゲームAPIへ送られないことを確認
- 共有PNGを目視確認（数秘レーダー・10天体・試験結果）
- 公開環境でページ例外・コンソールエラーなし
- 既存PRISMA ABYSS配信URLもHTTP 200

検証用の匿名プレイヤーで本番の保存確認を行いました。ユーザーのローカル試遊データは本番へ移行していません。

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
