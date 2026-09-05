import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDatabase } from "../scripts/sqlite.mjs";
import { emptySenses } from "../shared/core.js";
import {
  calculatePredictionSettlement,
  ensurePredictionMarketSnapshots,
  marketOdds,
  paidPredictionStake,
  predictionPayout,
  predictionXpForOdds,
  settlePlayerPredictions,
} from "../worker/prediction-betting.js";

function database() {
  const db = localDatabase();
  for (const migration of ["0001_initial.sql", "0002_prediction_betting.sql"])
    db.native.exec(
      readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"),
    );
  return db;
}

test("prediction stake economics keep the first 10 RC free", () => {
  assert.equal(paidPredictionStake(10), 0);
  assert.equal(paidPredictionStake(100), 90);
  assert.equal(paidPredictionStake(1000), 990);
});

test("parimutuel payout is uncapped while prediction XP caps odds at 8x", () => {
  assert.equal(marketOdds(200, 10), 20);
  assert.equal(predictionPayout(10, 200, 10), 200);
  const xp = predictionXpForOdds(20);
  assert.equal(xp.xpOdds, 8);
  assert.equal(xp.baseXp, 20);
  assert.equal(xp.oddsBonusXp, 30);
  assert.equal(xp.awardedXp, 50);
  const settlement = calculatePredictionSettlement({
    stakeRc: 10,
    optionId: "B",
    resultOptionId: "B",
    totalPoolRc: 200,
    optionPools: { A: 190, B: 10 },
  });
  assert.equal(settlement.finalOdds, 20);
  assert.equal(settlement.payoutRc, 200);
  assert.equal(settlement.awardedXp, 50);
});

test("misses award neither payout nor prediction XP", () => {
  const settlement = calculatePredictionSettlement({
    stakeRc: 100,
    optionId: "A",
    resultOptionId: "B",
    totalPoolRc: 300,
    optionPools: { A: 200, B: 100 },
  });
  assert.equal(settlement.correct, false);
  assert.equal(settlement.finalOdds, 1.5);
  assert.equal(settlement.payoutRc, 0);
  assert.equal(settlement.awardedXp, 0);
});


test("market snapshot reads source-of-truth bets instead of a stale pool cache", async () => {
  const db = database();
  const basePlayer = {
    schemaVersion: 1,
    createdAt: "2026-09-06T00:00:00.000Z",
    rc: 100,
    senseXp: emptySenses(),
    characters: {},
    attempts: {},
    history: [],
    battleHistory: [],
    predictions: {},
  };
  for (const [id, hash] of [["snapshot-a", "c"], ["snapshot-b", "d"]])
    db.native
      .prepare("INSERT INTO players (id,session_hash,data,revision) VALUES (?,?,?,0)")
      .run(id, hash.repeat(64), JSON.stringify({ ...basePlayer, id }));
  const insertBet = db.native.prepare(
    `INSERT INTO prediction_bets
     (prediction_id,version,player_id,option_id,stake_rc,free_stake_rc,paid_stake_rc,placed_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  insertBet.run("PRED-20990101-002", 1, "snapshot-a", "A", 10, 10, 0, "2026-09-05T00:00:00.000Z", "2026-09-05T00:00:00.000Z");
  insertBet.run("PRED-20990101-002", 1, "snapshot-b", "B", 90, 10, 80, "2026-09-05T00:00:00.000Z", "2026-09-05T00:00:00.000Z");
  // Deliberately stale cache. Snapshot creation must ignore it.
  db.native
    .prepare(
      `INSERT INTO prediction_option_pools
       (prediction_id,version,option_id,stake_rc,bettor_count,updated_at)
       VALUES (?,?,?,?,?,?)`,
    )
    .run("PRED-20990101-002", 1, "A", 999, 99, "2026-09-05T00:00:00.000Z");
  const item = {
    id: "PRED-20990101-002",
    version: 1,
    choices: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    publishAt: "2026-09-01T00:00:00.000Z",
    closeAt: "2026-09-05T12:00:00.000Z",
  };
  await ensurePredictionMarketSnapshots(
    db,
    Date.parse("2026-09-06T00:00:00.000Z"),
    [item],
  );
  const snapshot = db.native
    .prepare(
      `SELECT total_pool_rc,bettor_count,option_pools_json
       FROM prediction_market_snapshots WHERE prediction_id=? AND version=?`,
    )
    .get(item.id, item.version);
  assert.equal(snapshot.total_pool_rc, 100);
  assert.equal(snapshot.bettor_count, 2);
  assert.deepEqual(JSON.parse(snapshot.option_pools_json), { A: 10, B: 90, C: 0, D: 0 });
  db.native.close();
});

test("a market with no bets on the winning option still records the losing ticket odds", () => {
  const settlement = calculatePredictionSettlement({
    stakeRc: 40,
    optionId: "A",
    resultOptionId: "B",
    totalPoolRc: 100,
    optionPools: { A: 100, B: 0 },
  });
  assert.equal(settlement.correct, false);
  assert.equal(settlement.finalOdds, 1);
  assert.equal(settlement.payoutRc, 0);
  assert.equal(settlement.awardedXp, 0);
});

test("lazy settlement pays RC and foresight XP exactly once", async () => {
  const db = database();
  const player = {
    schemaVersion: 1,
    id: "player-a",
    createdAt: "2026-09-06T00:00:00.000Z",
    rc: 100,
    senseXp: emptySenses(),
    characters: {},
    attempts: {},
    history: [],
    battleHistory: [],
    predictions: {
      "PRED-20990101-001|1": {
        optionId: "B",
        selectedAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
        stakeRc: 10,
      },
    },
  };
  const other = { ...player, id: "player-b", rc: 100, predictions: {} };
  db.native
    .prepare("INSERT INTO players (id,session_hash,data,revision) VALUES (?,?,?,0)")
    .run(player.id, "a".repeat(64), JSON.stringify(player));
  db.native
    .prepare("INSERT INTO players (id,session_hash,data,revision) VALUES (?,?,?,0)")
    .run(other.id, "b".repeat(64), JSON.stringify(other));
  db.native
    .prepare(
      `INSERT INTO prediction_bets
       (prediction_id,version,player_id,option_id,stake_rc,free_stake_rc,paid_stake_rc,placed_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "PRED-20990101-001",
      1,
      player.id,
      "B",
      10,
      10,
      0,
      "2026-09-06T00:00:00.000Z",
      "2026-09-06T00:00:00.000Z",
    );
  db.native
    .prepare(
      `INSERT INTO prediction_bets
       (prediction_id,version,player_id,option_id,stake_rc,free_stake_rc,paid_stake_rc,placed_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "PRED-20990101-001",
      1,
      other.id,
      "A",
      70,
      10,
      60,
      "2026-09-06T00:00:00.000Z",
      "2026-09-06T00:00:00.000Z",
    );
  db.native
    .prepare(
      `INSERT INTO prediction_option_pools
       (prediction_id,version,option_id,stake_rc,bettor_count,updated_at)
       VALUES (?,?,?,?,?,?),(?,?,?,?,?,?)`,
    )
    .run(
      "PRED-20990101-001",
      1,
      "A",
      70,
      1,
      "2026-09-06T00:00:00.000Z",
      "PRED-20990101-001",
      1,
      "B",
      10,
      1,
      "2026-09-06T00:00:00.000Z",
    );
  const item = {
    id: "PRED-20990101-001",
    version: 1,
    choices: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ],
    publishAt: "2026-09-01T00:00:00.000Z",
    closeAt: "2026-09-05T00:00:00.000Z",
    finalResult: "B",
  };
  const row = db.native.prepare("SELECT * FROM players WHERE id=?").get(player.id);
  const first = await settlePlayerPredictions(
    db,
    row,
    Date.parse("2026-09-06T00:00:00.000Z"),
    [item],
  );
  assert.equal(first.player.rc, 180);
  assert.equal(first.player.senseXp.foresight, 50);
  const settledBet = db.native
    .prepare(
      "SELECT payout_rc,prediction_xp,final_odds,correct FROM prediction_bets WHERE player_id=?",
    )
    .get(player.id);
  assert.equal(settledBet.payout_rc, 80);
  assert.equal(settledBet.prediction_xp, 50);
  assert.equal(settledBet.final_odds, 8);
  assert.equal(settledBet.correct, 1);
  const second = await settlePlayerPredictions(
    db,
    db.native.prepare("SELECT * FROM players WHERE id=?").get(player.id),
    Date.parse("2026-09-06T01:00:00.000Z"),
    [item],
  );
  assert.equal(second.player.rc, 180);
  assert.equal(second.player.senseXp.foresight, 50);
  assert.equal(
    db.native.prepare("SELECT COUNT(*) AS n FROM prediction_rc_ledger").get().n,
    1,
  );
  assert.equal(
    db.native.prepare("SELECT COUNT(*) AS n FROM prediction_xp_ledger").get().n,
    1,
  );
  db.native.close();
});
