import { config } from "../shared/config.js";
import { iso } from "../shared/core.js";
import {
  findPrediction,
  predictionCatalog,
  predictionKey,
  predictionState,
} from "./predictions.js";
import { GameError } from "./game.js";

const OPTION_IDS = new Set(["A", "B", "C", "D"]);
const SETTLEMENT_RETRIES = 3;
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SECRET_KEY =
  "1x0000000000000000000000000000000AA";

const rows = async (statement) => {
  const result = await statement.all();
  return Array.isArray(result) ? result : result.results || [];
};

export const paidPredictionStake = (stakeRc) =>
  Math.max(0, stakeRc - config.predictionBetting.freeStakeRC);

export function validatePredictionStake(stakeRc) {
  const { minStakeRC, maxStakeRC, stakeStepRC } = config.predictionBetting;
  if (
    !Number.isInteger(stakeRc) ||
    stakeRc < minStakeRC ||
    stakeRc > maxStakeRC ||
    stakeRc % stakeStepRC !== 0
  )
    throw new GameError(
      `${minStakeRC}〜${maxStakeRC} RCを${stakeStepRC} RC単位で指定してください。`,
    );
  return stakeRc;
}

export function marketOdds(totalPoolRc, optionPoolRc) {
  if (!Number.isSafeInteger(totalPoolRc) || totalPoolRc < 0) return null;
  if (!Number.isSafeInteger(optionPoolRc) || optionPoolRc <= 0) return null;
  return totalPoolRc / optionPoolRc;
}

export function predictionXpForOdds(finalOdds) {
  if (!Number.isFinite(finalOdds) || finalOdds < 1)
    throw new Error("finalOdds must be at least 1");
  const xpOdds = Math.min(finalOdds, config.predictionBetting.xpOddsCap);
  const baseXp = config.predictionBetting.hitBaseXP;
  const oddsBonusXp = Math.floor(
    config.predictionBetting.xpOddsLog2Multiplier * Math.log2(xpOdds),
  );
  return {
    xpOdds,
    baseXp,
    oddsBonusXp,
    awardedXp: baseXp + oddsBonusXp,
  };
}

export function predictionPayout(stakeRc, totalPoolRc, winningPoolRc) {
  if (
    !Number.isSafeInteger(stakeRc) ||
    !Number.isSafeInteger(totalPoolRc) ||
    !Number.isSafeInteger(winningPoolRc) ||
    stakeRc < 0 ||
    totalPoolRc < 0 ||
    winningPoolRc <= 0
  )
    return 0;
  const payout =
    (BigInt(stakeRc) * BigInt(totalPoolRc)) / BigInt(winningPoolRc);
  return payout <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(payout) : 0;
}

export function calculatePredictionSettlement({
  stakeRc,
  optionId,
  resultOptionId,
  totalPoolRc,
  optionPools,
}) {
  const selectedPoolRc = Number(optionPools?.[optionId] || 0);
  const winningPoolRc = Number(optionPools?.[resultOptionId] || 0);
  const finalOdds = marketOdds(totalPoolRc, selectedPoolRc);
  const correct = optionId === resultOptionId;
  if (!correct)
    return {
      correct: false,
      // Store/display the final odds of this player's own ticket.
      finalOdds,
      payoutRc: 0,
      xpOdds: finalOdds
        ? Math.min(finalOdds, config.predictionBetting.xpOddsCap)
        : 1,
      baseXp: 0,
      oddsBonusXp: 0,
      awardedXp: 0,
    };
  if (!finalOdds || winningPoolRc <= 0)
    throw new Error("a winning bet requires a non-zero winning pool");
  const xp = predictionXpForOdds(finalOdds);
  return {
    correct: true,
    finalOdds,
    payoutRc: predictionPayout(stakeRc, totalPoolRc, winningPoolRc),
    ...xp,
  };
}

function marketFilter(items) {
  if (!items.length) return { clause: "0", params: [] };
  return {
    clause: items.map(() => "(prediction_id=? AND version=?)").join(" OR "),
    params: items.flatMap((item) => [item.id, item.version]),
  };
}

function emptyPool(item) {
  return Object.fromEntries(
    item.choices.map((choice) => [
      choice.id,
      { stakeRc: 0, bettorCount: 0, odds: null },
    ]),
  );
}

function snapshotPools(item, snapshot) {
  const parsed = snapshot?.option_pools_json
    ? JSON.parse(snapshot.option_pools_json)
    : {};
  const totalPoolRc = Number(snapshot?.total_pool_rc || 0);
  return Object.fromEntries(
    item.choices.map((choice) => {
      const stakeRc = Number(parsed[choice.id] || 0);
      return [
        choice.id,
        { stakeRc, bettorCount: null, odds: marketOdds(totalPoolRc, stakeRc) },
      ];
    }),
  );
}

export async function ensurePredictionMarketSnapshots(
  db,
  ms,
  catalog = predictionCatalog,
) {
  const closable = catalog.filter((item) =>
    ["closed", "settled"].includes(predictionState(item, ms)),
  );
  if (!closable.length) return;
  const filter = marketFilter(closable);
  const existing = await rows(
    db
      .prepare(
        `SELECT prediction_id,version FROM prediction_market_snapshots
         WHERE ${filter.clause}`,
      )
      .bind(...filter.params),
  );
  const existingKeys = new Set(
    existing.map((row) => `${row.prediction_id}|${Number(row.version)}`),
  );
  const missing = closable.filter(
    (item) => !existingKeys.has(predictionKey(item)),
  );
  if (!missing.length) return;
  const timestamp = iso(ms);
  const statements = missing.map((item) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO prediction_market_snapshots
         (prediction_id,version,total_pool_rc,bettor_count,option_pools_json,closed_at,snapshot_at)
         VALUES (
           ?,?,
           (SELECT COALESCE(SUM(stake_rc),0) FROM prediction_bets WHERE prediction_id=? AND version=?),
           (SELECT COUNT(*) FROM prediction_bets WHERE prediction_id=? AND version=?),
           json_object(
             'A',(SELECT COALESCE(SUM(stake_rc),0) FROM prediction_bets WHERE prediction_id=? AND version=? AND option_id='A'),
             'B',(SELECT COALESCE(SUM(stake_rc),0) FROM prediction_bets WHERE prediction_id=? AND version=? AND option_id='B'),
             'C',(SELECT COALESCE(SUM(stake_rc),0) FROM prediction_bets WHERE prediction_id=? AND version=? AND option_id='C'),
             'D',(SELECT COALESCE(SUM(stake_rc),0) FROM prediction_bets WHERE prediction_id=? AND version=? AND option_id='D')
           ),
           ?,?
         )`,
      )
      .bind(
        item.id,
        item.version,
        item.id,
        item.version,
        item.id,
        item.version,
        item.id,
        item.version,
        item.id,
        item.version,
        item.id,
        item.version,
        item.id,
        item.version,
        item.closeAt,
        timestamp,
      ),
  );
  // D1 batch executes the snapshot statements transactionally. Each INSERT
  // reads prediction_bets at execution time, so a close/bet race cannot freeze
  // a pre-transaction pool cache.
  await db.batch(statements);
}

export async function loadPredictionMarketState(
  db,
  playerId,
  ms,
  catalog = predictionCatalog,
) {
  const visible = catalog.filter((item) => ms >= Date.parse(item.publishAt));
  if (!visible.length) return new Map();
  await ensurePredictionMarketSnapshots(db, ms, catalog);
  const filter = marketFilter(visible);
  const [poolRows, snapshots, bets] = await Promise.all([
    rows(
      db
        .prepare(
          `SELECT prediction_id,version,option_id,stake_rc,bettor_count
           FROM prediction_option_pools WHERE ${filter.clause}`,
        )
        .bind(...filter.params),
    ),
    rows(
      db
        .prepare(
          `SELECT * FROM prediction_market_snapshots WHERE ${filter.clause}`,
        )
        .bind(...filter.params),
    ),
    rows(
      db
        .prepare(
          `SELECT * FROM prediction_bets WHERE player_id=? AND (${filter.clause})`,
        )
        .bind(playerId, ...filter.params),
    ),
  ]);
  const result = new Map();
  for (const item of visible) {
    const key = predictionKey(item);
    const snapshot = snapshots.find(
      (row) =>
        row.prediction_id === item.id && Number(row.version) === item.version,
    );
    const currentRows = poolRows.filter(
      (row) =>
        row.prediction_id === item.id && Number(row.version) === item.version,
    );
    const final = Boolean(snapshot);
    const totalPoolRc = final
      ? Number(snapshot.total_pool_rc)
      : currentRows.reduce((sum, row) => sum + Number(row.stake_rc || 0), 0);
    const bettorCount = final
      ? Number(snapshot.bettor_count)
      : currentRows.reduce(
          (sum, row) => sum + Number(row.bettor_count || 0),
          0,
        );
    let choices = final ? snapshotPools(item, snapshot) : emptyPool(item);
    if (!final)
      choices = Object.fromEntries(
        item.choices.map((choice) => {
          const row = currentRows.find((candidate) => candidate.option_id === choice.id);
          const stakeRc = Number(row?.stake_rc || 0);
          return [
            choice.id,
            {
              stakeRc,
              bettorCount: Number(row?.bettor_count || 0),
              odds: marketOdds(totalPoolRc, stakeRc),
            },
          ];
        }),
      );
    const betRow = bets.find(
      (row) =>
        row.prediction_id === item.id && Number(row.version) === item.version,
    );
    result.set(key, {
      final,
      totalPoolRc,
      bettorCount,
      choices,
      bet: betRow
        ? {
            optionId: betRow.option_id,
            stakeRc: Number(betRow.stake_rc),
            freeStakeRc: Number(betRow.free_stake_rc),
            paidStakeRc: Number(betRow.paid_stake_rc),
            placedAt: betRow.placed_at,
            updatedAt: betRow.updated_at,
            settledAt: betRow.settled_at || null,
            payoutRc:
              betRow.payout_rc == null ? null : Number(betRow.payout_rc),
            predictionXp:
              betRow.prediction_xp == null
                ? null
                : Number(betRow.prediction_xp),
            finalOdds:
              betRow.final_odds == null ? null : Number(betRow.final_odds),
            correct:
              betRow.correct == null ? null : Boolean(betRow.correct),
          }
        : null,
    });
  }
  return result;
}

export function publicPredictionBettingConfig(player, env = {}) {
  return {
    minStakeRc: config.predictionBetting.minStakeRC,
    maxStakeRc: config.predictionBetting.maxStakeRC,
    stakeStepRc: config.predictionBetting.stakeStepRC,
    freeStakeRc: config.predictionBetting.freeStakeRC,
    xpOddsCap: config.predictionBetting.xpOddsCap,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
    verified: Boolean(player?.predictionBettingVerifiedAt),
  };
}

async function verifyTurnstile(request, token, env, deps, opKey) {
  if (typeof token !== "string" || token.length < 10 || token.length > 2048)
    throw new GameError("初回投票の確認を完了してください。", 403);
  if (!env.TURNSTILE_SECRET_KEY)
    throw new GameError("投票確認サービスを利用できません。", 503);
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) form.set("remoteip", remoteIp);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(opKey || "")))
    form.set("idempotency_key", opKey);
  let response;
  try {
    // Cloudflare's workerd enforces the receiver of some runtime APIs. Calling
    // a detached global fetch through an object property (deps.fetch(...)) can
    // supply the wrong `this` value and fail with `TypeError: Illegal invocation`.
    // Detach the injected/global function before calling it.
    const fetchImpl = deps.fetch;
    response = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("turnstile_siteverify_fetch_failed", {
      name: error?.name || "Error",
      message: error?.message || String(error),
    });
    throw new GameError("投票確認サービスへ接続できません。", 503);
  }
  if (!response.ok)
    throw new GameError("投票確認サービスへ接続できません。", 503);
  const result = await response.json();
  const expectedHostname = String(env.TURNSTILE_EXPECTED_HOSTNAME || "").trim();
  const testing =
    ["local", "staging"].includes(String(env.ENVIRONMENT || "")) &&
    env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET_KEY;
  const testingResponse =
    testing &&
    (result.action === "test" ||
      result.metadata?.result_with_testing_key === true);
  const actionValid = result.action === "prediction-bet" || testingResponse;
  if (
    !result.success ||
    !actionValid ||
    (expectedHostname && result.hostname !== expectedHostname)
  )
    throw new GameError("初回投票の確認に失敗しました。もう一度お試しください。", 403);
  return true;
}

async function enforceBetRateLimit(env, playerId) {
  if (!env.PREDICTION_BET_RATE_LIMITER?.limit) return;
  const { success } = await env.PREDICTION_BET_RATE_LIMITER.limit({
    key: `project-sixth:prediction-bet:${playerId}`,
  });
  if (!success)
    throw new GameError("投票操作が多すぎます。少し待ってからお試しください。", 429);
}

export async function placePredictionBet({
  request,
  db,
  row,
  player,
  predictionId,
  body,
  opKey,
  fingerprint,
  ms,
  env = {},
  deps = { fetch },
}) {
  await enforceBetRateLimit(env, row.id);
  if (!Number.isInteger(body.version))
    throw new GameError("予測versionを確認してください。");
  const item = findPrediction(predictionId, body.version);
  if (!item) throw new GameError("予測問題が見つかりません。", 404);
  if (predictionState(item, ms) !== "open")
    throw new GameError("この予測は現在受け付けていません。", 409);
  if (
    typeof body.optionId !== "string" ||
    !OPTION_IDS.has(body.optionId) ||
    !item.choices.some((choice) => choice.id === body.optionId)
  )
    throw new GameError("選択肢を確認してください。");
  const stakeRc = validatePredictionStake(body.stakeRc);
  const previous = await db
    .prepare(
      `SELECT * FROM prediction_bets
       WHERE prediction_id=? AND version=? AND player_id=?`,
    )
    .bind(item.id, item.version, row.id)
    .first();
  if (!player.predictionBettingVerifiedAt)
    await verifyTurnstile(request, body.turnstileToken, env, deps, opKey);

  const paidStakeRc = paidPredictionStake(stakeRc);
  const previousPaidStakeRc = Number(previous?.paid_stake_rc || 0);
  const balanceAfter = player.rc + previousPaidStakeRc - paidStakeRc;
  if (balanceAfter < 0)
    throw new GameError("RCが不足しています。無料10 RC分は残高0でも投票できます。", 409);

  const timestamp = iso(ms);
  const markerRevision = Number(row.revision) + 1;
  const oldSelection = player.predictions?.[predictionKey(item)] || null;
  player.predictions ||= {};
  player.predictions[predictionKey(item)] = {
    optionId: body.optionId,
    selectedAt: oldSelection?.selectedAt || previous?.placed_at || timestamp,
    updatedAt: timestamp,
    stakeRc,
  };
  player.predictionBettingVerifiedAt ||= timestamp;
  player.rc = balanceAfter;

  const result = {
    predictionId: item.id,
    version: item.version,
    bet: {
      optionId: body.optionId,
      stakeRc,
      freeStakeRc: config.predictionBetting.freeStakeRC,
      paidStakeRc,
      placedAt: previous?.placed_at || timestamp,
      updatedAt: timestamp,
    },
    rcDelta: previousPaidStakeRc - paidStakeRc,
  };
  const playerMarker =
    "EXISTS(SELECT 1 FROM players WHERE id=? AND revision=? AND last_op=?)";
  const statements = [
    db
      .prepare(
        `UPDATE players SET data=?, revision=revision+1, last_op=?
         WHERE id=? AND revision=?
           AND NOT EXISTS (
             SELECT 1 FROM prediction_market_snapshots
             WHERE prediction_id=? AND version=?
           )`,
      )
      .bind(
        JSON.stringify(player),
        opKey,
        row.id,
        row.revision,
        item.id,
        item.version,
      ),
    db
      .prepare(
        `INSERT INTO prediction_bets
         (prediction_id,version,player_id,option_id,stake_rc,free_stake_rc,paid_stake_rc,placed_at,updated_at)
         SELECT ?,?,?,?,?,?,?,?,? WHERE ${playerMarker}
         ON CONFLICT(prediction_id,version,player_id) DO UPDATE SET
           option_id=excluded.option_id,
           stake_rc=excluded.stake_rc,
           free_stake_rc=excluded.free_stake_rc,
           paid_stake_rc=excluded.paid_stake_rc,
           updated_at=excluded.updated_at`,
      )
      .bind(
        item.id,
        item.version,
        row.id,
        body.optionId,
        stakeRc,
        config.predictionBetting.freeStakeRC,
        paidStakeRc,
        previous?.placed_at || timestamp,
        timestamp,
        row.id,
        markerRevision,
        opKey,
      ),
    db
      .prepare(
        `DELETE FROM prediction_option_pools
         WHERE prediction_id=? AND version=? AND ${playerMarker}`,
      )
      .bind(item.id, item.version, row.id, markerRevision, opKey),
    db
      .prepare(
        `INSERT INTO prediction_option_pools
         (prediction_id,version,option_id,stake_rc,bettor_count,updated_at)
         SELECT prediction_id,version,option_id,SUM(stake_rc),COUNT(*),?
         FROM prediction_bets
         WHERE prediction_id=? AND version=?
         GROUP BY prediction_id,version,option_id
         HAVING ${playerMarker}`,
      )
      .bind(timestamp, item.id, item.version, row.id, markerRevision, opKey),
    db
      .prepare(
        `INSERT INTO prediction_rc_ledger
         (player_id,op_key,prediction_id,version,operation,delta_rc,balance_after,stake_rc,created_at)
         SELECT ?,?,?,?,?,?,?,?,? WHERE ${playerMarker}`,
      )
      .bind(
        row.id,
        opKey,
        item.id,
        item.version,
        "BET_ADJUST",
        previousPaidStakeRc - paidStakeRc,
        balanceAfter,
        stakeRc,
        timestamp,
        row.id,
        markerRevision,
        opKey,
      ),
    db
      .prepare(
        `INSERT INTO operations (player_id,op_key,fingerprint,result,created_at)
         SELECT ?,?,?,?,? WHERE ${playerMarker}`,
      )
      .bind(
        row.id,
        opKey,
        fingerprint,
        JSON.stringify(result),
        timestamp,
        row.id,
        markerRevision,
        opKey,
      ),
  ];
  const applied = await db.batch(statements);
  if (applied[0].meta.changes !== 1 || applied.at(-1).meta.changes !== 1) {
    const closedSnapshot = await db
      .prepare(
        `SELECT 1 AS present FROM prediction_market_snapshots
         WHERE prediction_id=? AND version=?`,
      )
      .bind(item.id, item.version)
      .first();
    if (closedSnapshot)
      throw new GameError("受付締切と重なったため投票を保存できませんでした。", 409);
    throw new GameError("別の操作が保存されました。もう一度お試しください。", 409);
  }
  return {
    result,
    row: {
      ...row,
      data: JSON.stringify(player),
      revision: markerRevision,
      last_op: opKey,
    },
    player,
  };
}

async function snapshotForItem(db, item, ms) {
  await ensurePredictionMarketSnapshots(db, ms, [item]);
  return db
    .prepare(
      `SELECT * FROM prediction_market_snapshots
       WHERE prediction_id=? AND version=?`,
    )
    .bind(item.id, item.version)
    .first();
}

export async function settlePlayerPredictions(
  db,
  inputRow,
  ms,
  catalog = predictionCatalog,
) {
  let row = inputRow;
  let player = JSON.parse(row.data);
  const readyByKey = new Map(
    catalog
      .filter((item) => item.finalResult && ms >= Date.parse(item.closeAt))
      .map((item) => [predictionKey(item), item]),
  );
  if (!readyByKey.size) return { row, player };

  // One indexed query is enough for the normal no-op path. Historic catalog
  // growth must not add one D1 read per old prediction on every API request.
  const unsettled = await rows(
    db
      .prepare(
        `SELECT prediction_id,version FROM prediction_bets
         WHERE player_id=? AND settled_at IS NULL`,
      )
      .bind(row.id),
  );

  for (const pending of unsettled) {
    const item = readyByKey.get(
      `${pending.prediction_id}|${Number(pending.version)}`,
    );
    if (!item) continue;
    for (let attempt = 0; attempt < SETTLEMENT_RETRIES; attempt++) {
      const bet = await db
        .prepare(
          `SELECT * FROM prediction_bets
           WHERE prediction_id=? AND version=? AND player_id=?`,
        )
        .bind(item.id, item.version, row.id)
        .first();
      if (!bet || bet.settled_at) break;
      const snapshot = await snapshotForItem(db, item, ms);
      if (!snapshot)
        throw new GameError("予測市場の確定情報を読み込めません。", 503);
      const optionPools = JSON.parse(snapshot.option_pools_json);
      const settlement = calculatePredictionSettlement({
        stakeRc: Number(bet.stake_rc),
        optionId: bet.option_id,
        resultOptionId: item.finalResult,
        totalPoolRc: Number(snapshot.total_pool_rc),
        optionPools,
      });
      const timestamp = iso(ms);
      const settleKey = `prediction-settle:${item.id}:v${item.version}`;
      const nextPlayer = structuredClone(player);
      nextPlayer.rc += settlement.payoutRc;
      nextPlayer.senseXp ||= {};
      nextPlayer.senseXp.foresight =
        Number(nextPlayer.senseXp.foresight || 0) + settlement.awardedXp;
      const markerRevision = Number(row.revision) + 1;
      const playerMarker =
        "EXISTS(SELECT 1 FROM players WHERE id=? AND revision=? AND last_op=?)";
      const statements = [
        db
          .prepare(
            `UPDATE players SET data=?,revision=revision+1,last_op=?
             WHERE id=? AND revision=?`,
          )
          .bind(JSON.stringify(nextPlayer), settleKey, row.id, row.revision),
        db
          .prepare(
            `UPDATE prediction_bets SET
               settled_at=?,payout_rc=?,prediction_xp=?,final_odds=?,correct=?
             WHERE prediction_id=? AND version=? AND player_id=? AND settled_at IS NULL
               AND ${playerMarker}`,
          )
          .bind(
            timestamp,
            settlement.payoutRc,
            settlement.awardedXp,
            settlement.finalOdds,
            settlement.correct ? 1 : 0,
            item.id,
            item.version,
            row.id,
            row.id,
            markerRevision,
            settleKey,
          ),
        db
          .prepare(
            `INSERT INTO prediction_rc_ledger
             (player_id,op_key,prediction_id,version,operation,delta_rc,balance_after,stake_rc,created_at)
             SELECT ?,?,?,?,?,?,?,?,? WHERE ${playerMarker}`,
          )
          .bind(
            row.id,
            settleKey,
            item.id,
            item.version,
            "PAYOUT",
            settlement.payoutRc,
            nextPlayer.rc,
            Number(bet.stake_rc),
            timestamp,
            row.id,
            markerRevision,
            settleKey,
          ),
        db
          .prepare(
            `INSERT INTO prediction_xp_ledger
             (player_id,op_key,prediction_id,version,sense_key,result,final_odds,xp_odds,base_xp,odds_bonus_xp,awarded_xp,created_at)
             SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${playerMarker}`,
          )
          .bind(
            row.id,
            settleKey,
            item.id,
            item.version,
            "foresight",
            settlement.correct ? "HIT" : "MISS",
            settlement.finalOdds,
            settlement.xpOdds,
            settlement.baseXp,
            settlement.oddsBonusXp,
            settlement.awardedXp,
            timestamp,
            row.id,
            markerRevision,
            settleKey,
          ),
        db
          .prepare(
            `UPDATE prediction_market_snapshots
             SET result_option_id=?,result_recorded_at=COALESCE(result_recorded_at,?)
             WHERE prediction_id=? AND version=?`,
          )
          .bind(item.finalResult, timestamp, item.id, item.version),
      ];
      let applied;
      try {
        applied = await db.batch(statements);
      } catch (error) {
        if (String(error?.message || "").includes("UNIQUE")) {
          const latest = await db
            .prepare("SELECT * FROM players WHERE id=?")
            .bind(row.id)
            .first();
          if (latest) {
            row = latest;
            player = JSON.parse(latest.data);
          }
          break;
        }
        throw error;
      }
      if (applied[0].meta.changes === 1 && applied[1].meta.changes === 1) {
        row = {
          ...row,
          data: JSON.stringify(nextPlayer),
          revision: markerRevision,
          last_op: settleKey,
        };
        player = nextPlayer;
        break;
      }
      const latest = await db
        .prepare("SELECT * FROM players WHERE id=?")
        .bind(row.id)
        .first();
      if (!latest)
        throw new GameError("研究記録を読み込めませんでした。", 503);
      row = latest;
      player = JSON.parse(latest.data);
    }
  }
  return { row, player };
}
