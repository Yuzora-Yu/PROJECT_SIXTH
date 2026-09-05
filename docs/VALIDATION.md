# 検証結果 — 2026-09-05

> 現行の絶対条件: Gemini Spark本番Sheetは所有者のみ。下記の過去実行記録にあるWIF/service account方式は廃止し、GitHub Actionsはowner-executed Apps Script bridge経由へ移行する。

## 自動検証

- `npm test`: 38件成功。匿名セッション、アクセスボーナスの日次境界と同時取得、Daily、30秒粒子、戦闘、旧報酬ルールで開始済みの戦闘、26名の公開対象、数秘・MBTI・惑星配置、初期値補正、共有、現実予測の公開期間・回答保存を確認。
- `npm run test:predictions-import`: 10件成功。承認行の公開時刻境界、plan key許可リスト、公開済み状態の保持、結果確定時刻、タイムゾーンなしの時刻入力拒否を確認。
- `npm run test:google-sheets-bridge`: 24件成功。live NOOP、前後snapshot、最大6件と延期、原子的なSheet確定、競合拒否、限定GET再試行、重複source_idの行番号診断を確認。
- `npm run predictions:check`: release 2.2.0、公開対象12件で生成カタログが最新であることを確認。
- `npm run build`: 成功。`dist/`を毎回消去してから公開素材だけを再生成し、運用xlsx・予測のWorker用カタログ・内部資料を含まないことを確認。
- `npm run deploy:check`: Wrangler 4.129.0でWorkerと静的素材を検証。D1 `project-sixth` とASSETSの既存2 bindingだけを使用し、新規リソース作成なし。
- `node scripts/economy-check.mjs`: 公開対象26名で勝敗を問わず戦闘完了時に10 RCを付与。カード20 RC、粒子30 RC、戦闘5回50 RCで活動報酬が合計100 RC/日、アクセスボーナスを含めた最大獲得量が200 RC/日になる設定を検証。
- `git diff --check`: 空白エラーなし。

## v0.4.2 本番確認

- Worker version `eda8544d-1dce-4dc3-86ed-13ffc4797b7f` を2026-09-05 16:37:06 JSTに既存ルートへ配信。
- `https://yu-zora.com/project_sixth/` がHTTP 200、末尾スラッシュなしが同URLへ308を返すことを確認。
- 新規匿名セッションは初回アクセス時に300 RCから400 RCとなり、同じ日・同じCookieの再取得では400 RCのまま二重付与されないことを確認。
- 390×844の本番画面で端末接続演出、アクセスボーナス通知、横あふれ0pxを確認。

## GitHub Actions実行確認

- [dry-run](https://github.com/Yuzora-Yu/PROJECT_SIXTH/actions/runs/33950745512): commit `9814476`から公開予定6件を抽出し、固定時刻での再読、公開スナップショットのfingerprint、plan許可リスト、生成カタログ、repository checksを検証。Git commit・push、Cloudflare deploy、Google Sheet書き込みを行わず成功。
- [本番公開](https://github.com/Yuzora-Yu/PROJECT_SIXTH/actions/runs/33950796966): commit `9814476`から予定どおり6件を公開。生成commit `a140757`を既存Cloudflare Workerへ配信し、公開APIで全6件を確認後、2026-09-05 15:48:43 JSTに6件の状態更新と監査ログ追記を1回の原子的なSheet更新で完了。
- この本番公開実行時点ではGitHub OIDC + Workload Identity Federationを使用していた。Gemini Spark本番Sheetの共有状態を避けるため、この経路は廃止対象。現行workflowはApps Script bridgeのHMAC認証へ置き換える。
- Cloudflareは既存Workerと既存bindingだけを使用し、新しい資源、有料機能、追加の請求設定は作成していません。

## 現実予測

- 運用xlsxのcontract `PROJECT_SIXTH_PREDICTION_OPS`、schema 2.0.0、release 2.2.0を検証し、公開ゲートと公開時刻を満たす項目を1実行最大6件ずつ生成。現在の公開カタログは12件。
- 問題ID・version、2〜4択、日時順序、ACTIVE・tier A・結果確認可のHTTPS情報源を取込時に検証。
- 予測行と参照情報源の全公開入力をfingerprintで固定し、重複source_idやplan後の状態変更を公開前に拒否。
- 公開時刻前の承認行、候補、下書き、内部監査列を生成カタログとAPIから除外。
- 同じID・versionの公開内容変更、公開済み履歴の削除、確定結果の差し替えを取込時に拒否。
- 正解は `SETTLED` だけで公開し、`settled_at` が結果確認予定より前の行を拒否。
- 回答は匿名プレイヤーの既存D1 JSONへ保存。締切まで変更でき、RC・XP・確率表示には影響しない。
- 運用xlsxはローカル専用としてGitの追跡対象から除外。配信物には含めない。

## ブラウザ

Edge / Playwrightで8件成功。

1. PCの主要導線、Daily、訓練、召喚、戦闘、出生情報の端末内保存・削除、現実予測の回答・再読込後の復元、全画面の横あふれ。
2. 30秒粒子Dailyの完了、保存、答え合わせ。
3. 粒子Daily離脱時の権利保持と再試行。
4. 360px幅の6項目下部メニュー、ホーム・訓練本文の改行。
5. 360/390px幅かつ文字拡大時のホーム・訓練・解析・現実予測、上部バー、フッター到達。
6. 粒子発見時の消去・エフェクト・カウンター、誤検知・入力待ち表示、サーバー採点との一致。
7. スマホ幅と動きの軽減設定での粒子入力。
8. 初期キャラ、数秘／総合タブ、10%初期値、任意名、3種類の共有画像。

スクリーンショットはローカルの `test-results/screens/` に保存。Android Chromeの提示画像と同じ狭い幅・文字拡大条件を自動化し、下部ラベルを一行に固定した。実機固有のフォント設定やブラウザUIの差は公開後の実機確認対象。

## 日本語所見

- 12種類の数秘、16種類のMBTI、四元素、太陽と月、水星、5軸の強弱を組み合わせる全816条件で3段落が生成され、欠落値がないことを確認。
- 数秘・MBTI・惑星配置・観測記録・各試験の文を、研究員が被験者へ観測結果を伝える自然な文体へ改稿。
- 総合所見は数秘を含む全レイヤーを扱い、総合共有画像にも同じ全文を使用。

## 流用元

本作業では `Prisma-Abyss` を読取参照し、同フォルダへのコピー・編集・削除は行っていない。PROJECT SIXTH側で今回変更したファイルに、コピー済み素材・マスタは含まれない。

旧 `PRISMA_INTEGRITY.json` との再照合では、元フォルダが基準取得後に別作業で更新され、ファイル増分と `monsters.js` のhash差を検出した。このため、現在の元フォルダ全体を旧スナップショットと同一とは判定していない。
