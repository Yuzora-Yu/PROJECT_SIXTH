# 現実予測 RC投票・オッズ・払戻 — v0.5.0

## 状態

この文書は **v0.5.0実装用**。本番D1への `0002_prediction_betting.sql` 適用と本番Worker配信は、staging検証完了までは行わない。

Gemini Spark本番Sheetは引き続きowner-onlyとし、個人の投票、オッズ、RC、XP、払戻をSheetへ書き戻さない。

```text
Gemini Spark owner-only Sheet
  -> GitHub Action / Apps Script bridge
  -> prediction catalog（問題・締切・最終結果だけ）

Browser
  -> Worker API
  -> D1（player / bet / market / ledger）
```

## 固定したゲーム仕様

- 1 prediction versionにつき1プレイヤー1ticket。
- stakeは10〜1000 RC、10 RC刻み。
- 各 `prediction_id|version` の最初の10 RCは無料stake。残高0でも10 RC投票できる。
- 最大1000 RCは無料10込み。最大の実残高消費は990 RC。
- 無料10 RCもpool、表示オッズ、払戻のすべてへ含める。
- 締切までは選択肢・stakeを変更可能。
  - 増額: 有料部分の差額だけ追加消費。
  - 減額: 有料部分の差額を即時返却。
  - 10 RCまで戻すと有料部分は全返却。ただしticket自体は残る。
- 締切後は変更不可。
- 明示的なhouse takeは0%。
- integer RCなので、払戻の `floor` による端数は未発行となる。
- 的中optionに投票者が0人の場合は全員MISS、払戻0 RC、最終オッズ表示は `—`。

### オッズ

パリミュチュエル方式。

```text
option odds = total pool RC / option pool RC
```

受付中はcurrent odds。締切後の最初のsnapshot作成時にpoolを固定し、以後の払戻はそのsnapshotだけを使う。Workerはサーバー時刻で締切を判定するため、締切後にpoolへ新規stakeは入らない。

### 払戻

```text
payout RC = floor(stake RC * final total pool RC / final winning pool RC)
```

RC払戻のオッズには上限を設けない。

### Prediction XP

的中時だけ既存研究XPの `foresight`（予見）へ加算する。stake額には比例させない。

```text
xpOdds = min(finalOdds, 8)
XP = 20 + floor(10 * log2(xpOdds))
MISS = 0 XP
```

初期版のXP odds capは8x、最大50 XP。

`shared/config.js` には、参加者数が十分増えた将来に16xへ変更する候補をコメントで残す。RC払戻側に8x/16x capを流用してはいけない。

## Cloudflare構成

### production

- Worker: `project-sixth`
- D1: `project-sixth`
- D1 ID: `410a83bb-0907-4ac0-8a1c-110152eba20e`
- production route:
  - `yu-zora.com/project_sixth`
  - `yu-zora.com/project_sixth/*`
- Turnstile widget: `project-sixth-prediction-bet-prod`
- Turnstile Site Key: `0x4AAAAAAEpWH28hrSKeDjR-`
- Worker Secret: `TURNSTILE_SECRET_KEY`（Cloudflareへ登録済み。値をGitへ保存しない）
- Rate Limiting binding: `PREDICTION_BET_RATE_LIMITER`
  - 20 calls / 60 sec / anonymous player ID
  - namespace `26090601`
- observability sampling: 0.1（本番導入直後に一時的に1へ上げる場合は、ログ量を確認して戻す）

### staging

- Worker environment: `staging`
- 実Worker名: `project-sixth-staging`
- `workers.dev`のみ。production routeは持たない。
- D1: `project-sixth-staging`
- D1 ID: `17fdcc79-71b2-45de-82de-212f74201656`
- D1 region: APAC
- Rate Limiting namespace: `26090602`
- observability sampling: 1
- TurnstileはCloudflare公式dummy credentialsを使用。
  - Site Key: `1x00000000000000000000AA`
  - server validation key: `1x0000000000000000000000000000000AA`
  - dummy credentialsにはproduction権限がなく、staging/test専用。

productionのreal Turnstile secretをstagingやローカルへコピーしない。

## Turnstileの適用位置

毎回の投票ではなく、匿名playerの **最初のRC投票だけ** 実施する。

```text
first bet
 -> browser Turnstile
 -> token
 -> POST /api/predictions/:id/bet
 -> Worker Siteverify
 -> success + action=prediction-bet
 -> productionでは hostname=yu-zora.com も一致確認
 -> player.predictionBettingVerifiedAt を保存

second and later bets
 -> Turnstile不要
```

Cookie削除による新player生成まで「同一人物」として追跡するものではない。Turnstileは無料10 RCを使った自動大量session生成を難しくするためのbot対策であり、本人確認ではない。

Rate Limiting bindingも会計の正確性には使用しない。Cloudflare Rate Limitingは荒らし抑制のみ。二重消費・二重払戻の防止はD1のCAS、transaction batch、UNIQUE key、Idempotency-Keyで行う。

## D1 schema

`migrations/0002_prediction_betting.sql` が追加する。

### prediction_bets

1 player / 1 prediction versionの現在ticketとsettlement結果。

主キー:

```text
(prediction_id, version, player_id)
```

### prediction_option_pools

受付中の表示用aggregate cache。bet更新transactionの中でmarket全体を `prediction_bets` から再集計する。会計上の正本は `prediction_bets`。

### prediction_market_snapshots

締切後のfinal pool。払戻の分母・分子を固定する。

### prediction_rc_ledger

- `BET_ADJUST`
- `PAYOUT`

betの増減、返却、払戻を監査する。`(player_id, op_key)` が一意。

### prediction_xp_ledger

HIT/MISS、実final odds、XP計算用odds、base/bonus/awarded XPを記録する。XP軸は `foresight` 固定。

## API

### GET `/api/predictions`

既存catalogに加えて次を返す。

- `betting`: stake契約、無料stake、XP cap、Turnstile sitekey、player検証済みフラグ
- item `market`: total stake、bettor count、各optionのstake/current or final odds
- item `bet`: 自分のticket、settlement結果

### POST `/api/predictions/:prediction_id/bet`

```json
{
  "version": 1,
  "optionId": "A",
  "stakeRc": 100,
  "turnstileToken": "first-bet-only"
}
```

従来の `/vote` endpointは410。旧selectionは読み取り互換として表示するが、自動で新しいRC marketへ投入しない。締切前の旧selectionをRC ticketにしたい利用者は、自分で「この予想に投票する」を押して10 RC以上を確定する。

## Settlement

専用Cronは追加しない。catalogに `finalResult` が入り、該当playerが次に通常APIへアクセスしたときに未精算ticketをlazy settlementする。

1. final market snapshotを取得/作成
2. exact integer payoutを計算
3. HITならforesight XPを計算
4. player RC / foresight XPをCAS更新
5. betをsettled化
6. RC/XP ledger追加
7. snapshotへresult記録

同じplayer・同じprediction versionは一度しかsettleしない。

## ローカル開発

`npm run dev` はCloudflare公式dummy Turnstile credentialsを使用する。`scripts/dev-server.mjs` は `migrations/` の全SQLを番号順にローカルSQLiteへ適用する。

```powershell
npm ci
npm run dev
```

Wrangler local runtimeはstaging environmentを使う。

```powershell
npm run db:local
npm run dev:worker
```

## staging rollout

### 1. コード適用後の確認

```powershell
npm ci
npm run check
npm run deploy:staging:check
```

### 2. staging D1へ0002を適用

**productionではないことを必ず確認する。**

```powershell
npx wrangler d1 migrations list project-sixth-staging --remote --env staging
npx wrangler d1 migrations apply project-sixth-staging --remote --env staging
```

表示されるmigrationが `0002_prediction_betting.sql` だけであることを確認してから `yes`。

確認:

```powershell
npx wrangler d1 execute project-sixth-staging --remote --env staging --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'prediction_%' ORDER BY name;"
```

### 3. staging Worker deploy

```powershell
npm run deploy:staging
```

Wranglerは環境名から `project-sixth-staging` Workerを作り、`*.workers.dev` URLを表示する。本番routeは変更しない。

### 4. stagingで確認すること

- 新規playerの最初の10 RC投票で残高が減らない。
- player RC=0でも10 RCを投票可能。
- 100 RCへ増額すると90 RCだけ減る。
- 100 -> 50で50 RC戻る。
- 選択肢変更後もtotal poolとDB betが一致。
- 1000 RCは990 RC消費。
- 101 RCなど10刻みでない値を拒否。
- 1000超過を拒否。
- 締切後変更を拒否。
- 同じIdempotency-Keyの再送で二重消費しない。
- 同時更新でplayer残高とpoolがずれない。
- final result後、HITの払戻とforesight XPが一回だけ入る。
- RC payoutは8xを超えてもcapされない。
- XPは8xでcapされる（最大50 XP）。
- MISSは0 XP / 0 payout。

## production rollout — staging合格後のみ

### 1. 直前復旧bookmark

```powershell
npx wrangler d1 time-travel info project-sixth
```

bookmarkをローカルの安全なメモへ保存する。`restore` は事故時以外実行しない。

### 2. production未適用migrationを確認

```powershell
npx wrangler d1 migrations list project-sixth --remote
```

`0002_prediction_betting.sql` だけであることを確認する。

### 3. production migration

この操作から本番DBを変更する。

```powershell
npx wrangler d1 migrations apply project-sixth --remote
```

### 4. production deploy前dry-run

```powershell
npm run deploy:check
```

### 5. production deploy

```powershell
npm run deploy
```

### 6. smoke test

本番で無料10 RCの新規ticketを1件だけ作り、残高不変、オッズ表示、再読込後の復元を確認する。結果確定済みのテストmarketを作るためにproduction catalogやSheetを改変しない。払戻は最初の自然な結果確定時にledgerとplayer残高を確認する。

## rollback方針

コードだけ問題の場合は旧Worker versionへrollbackする。DB migration `0002` は既存テーブルを変更せず新規テーブルだけ追加するため、通常はDBを巻き戻さず旧コードへ戻せる。

会計データを含めてD1自体を巻き戻す必要がある重大事故だけ、事前bookmarkとCloudflare D1 Time Travelを使う。Time Travel restoreはbookmark以後の正当なplayer進行も巻き戻すため、通常のコードrollback代わりには使用しない。

## Security / privacy

- Turnstile production secretはCloudflare Worker Secretのみ。
- session cookieは引き続きHttpOnly / SameSite=Strict。
- clientからplayer RC、odds、payoutを正として受け取らない。
- bet対象、締切、resultはserver catalogを正とする。
- Siteverifyはserver-side mandatory。
- productionではTurnstile `action=prediction-bet` と `hostname=yu-zora.com` を検証。
- Gemini Spark Sheetへplayer ID、bet、RC、odds、payout、XPを保存しない。
