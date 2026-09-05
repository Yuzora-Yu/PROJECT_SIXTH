import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDatabase } from "../scripts/sqlite.mjs";
import { handleApi } from "../worker/api.js";
const time = Date.parse("2026-09-04T02:00:00Z");
async function session(at = time) {
  const db = localDatabase();
  for (const migration of ["0001_initial.sql", "0002_prediction_betting.sql"])
    db.native.exec(
      readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"),
    );
  let turnstileCalls = 0;
  const runtime = {
    DB: db,
    TURNSTILE_SITE_KEY: "test-site-key",
    TURNSTILE_SECRET_KEY: "test-secret-key",
    TURNSTILE_EXPECTED_HOSTNAME: "localhost",
  };
  const dependencies = {
    fetch: async () => {
      turnstileCalls += 1;
      return Response.json({
        success: true,
        hostname: "localhost",
        action: "prediction-bet",
        "error-codes": [],
      });
    },
  };
  const r = await handleApi(
    new Request("http://localhost/api/bootstrap", {
      headers: { "X-Sixth-Client": "1" },
    }),
    runtime,
    () => at,
    "/",
    dependencies,
  );
  return {
    db,
    cookie: r.headers.get("set-cookie").split(";")[0],
    bootstrap: await r.json(),
    runtime,
    dependencies,
    turnstileCalls: () => turnstileCalls,
    now: at,
  };
}
async function call(s, path, body, key = crypto.randomUUID(), headers = {}) {
  const r = await handleApi(
    new Request("http://localhost" + path, {
      method: body ? "POST" : "GET",
      headers: {
        cookie: s.cookie,
        "X-Sixth-Client": "1",
        ...(body
          ? { "Content-Type": "application/json", "Idempotency-Key": key }
          : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    s.runtime,
    () => s.now,
    "/",
    s.dependencies,
  );
  return { status: r.status, data: await r.json() };
}
test("anonymous cookie hides bearer, unauthorized and cross-site mutations rejected", async () => {
  const s = await session();
  assert.ok(s.cookie.startsWith("sixth_session="));
  assert.equal(s.bootstrap.player.rc, 400);
  assert.deepEqual(s.bootstrap.accessBonus, {
    awarded: true,
    amount: 100,
    dayJst: "2026-09-04",
  });
  assert.ok(!JSON.stringify(s.bootstrap).includes("session_hash"));
  assert.equal(
    (
      await call(s, "/api/gacha/draw", { count: 1 }, undefined, {
        Origin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(s, "/api/gacha/draw", { count: 1 }, undefined, {
        "X-Sixth-Client": "0",
      })
    ).status,
    403,
  );
  s.db.native.close();
});
test("same operation is charged once and payload reuse is rejected", async () => {
  const s = await session(),
    key = crypto.randomUUID();
  const a = await call(s, "/api/gacha/draw", { count: 1 }, key),
    b = await call(s, "/api/gacha/draw", { count: 1 }, key);
  assert.equal(a.status, 200);
  assert.deepEqual(a.data.result, b.data.result);
  assert.equal(b.data.player.rc, 300);
  assert.equal(
    (await call(s, "/api/gacha/draw", { count: 10 }, key)).status,
    409,
  );
  s.db.native.close();
});
test("concurrent purchases cannot lose updates or spend RC twice", async () => {
  const s = await session();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => call(s, "/api/gacha/draw", { count: 1 })),
  );
  const successful = results.filter((r) => r.status === 200).length;
  const me = await call(s, "/api/me");
  assert.equal(me.data.player.rc, 400 - successful * 100);
  assert.ok(me.data.player.rc >= 0);
  assert.ok(results.every((r) => [200, 409].includes(r.status)));
  s.db.native.close();
});
test("access bonus is atomic once per 04:00 JST day", async () => {
  const s = await session(Date.parse("2026-09-03T18:59:59Z"));
  assert.equal(s.bootstrap.accessBonus.awarded, true);
  assert.equal(s.bootstrap.accessBonus.dayJst, "2026-09-03");
  assert.equal(s.bootstrap.player.rc, 400);

  const sameDay = await call(s, "/api/me");
  assert.deepEqual(sameDay.data.accessBonus, {
    awarded: false,
    amount: 100,
    dayJst: "2026-09-03",
  });
  assert.equal(sameDay.data.player.rc, 400);

  s.now = Date.parse("2026-09-03T19:00:00Z");
  const simultaneous = await Promise.all(
    Array.from({ length: 8 }, () => call(s, "/api/me")),
  );
  assert.equal(
    simultaneous.filter((response) => response.data.accessBonus.awarded).length,
    1,
  );
  assert.ok(
    simultaneous.every(
      (response) =>
        response.status === 200 &&
        response.data.accessBonus.amount === 100 &&
        response.data.accessBonus.dayJst === "2026-09-04",
    ),
  );
  const after = await call(s, "/api/me");
  assert.equal(after.data.accessBonus.awarded, false);
  assert.equal(after.data.player.rc, 500);
  s.db.native.close();
});
test("existing legacy player earns access bonus without losing saved fields", async () => {
  const s = await session();
  const id = s.bootstrap.player.id;
  const row = s.db.native
    .prepare("SELECT data FROM players WHERE id=?")
    .get(id);
  const legacy = JSON.parse(row.data);
  delete legacy.lastAccessBonusDayJst;
  legacy.rc = 725;
  legacy.legacyExtension = { retained: true, note: "保存済み" };
  s.db.native
    .prepare("UPDATE players SET data=? WHERE id=?")
    .run(JSON.stringify(legacy), id);

  const response = await call(s, "/api/me");
  assert.equal(response.data.accessBonus.awarded, true);
  assert.equal(response.data.player.rc, 825);
  const saved = JSON.parse(
    s.db.native.prepare("SELECT data FROM players WHERE id=?").get(id).data,
  );
  assert.deepEqual(saved.legacyExtension, legacy.legacyExtension);
  assert.equal(saved.lastAccessBonusDayJst, "2026-09-04");
  s.db.native.close();
});
test("Daily secret never returned before selection, concurrent answers reward once", async () => {
  const s = await session(),
    start = await call(s, "/api/daily/card/start", {});
  assert.equal(start.data.result.answerIndex, undefined);
  const id = start.data.result.attemptId;
  await Promise.all([
    call(s, "/api/daily/card/answer", { attemptId: id, selectedIndex: 0 }),
    call(s, "/api/daily/card/answer", { attemptId: id, selectedIndex: 1 }),
  ]);
  const me = await call(s, "/api/me");
  assert.equal(me.data.player.rc, 420);
  assert.equal(me.data.player.history.length, 1);
  assert.equal((await call(s, "/api/daily/card/start", {})).status, 409);
  s.db.native.close();
});
test("prediction betting uses one free 10 RC stake, updates odds and refunds reductions", async () => {
  const s = await session(Date.parse("2026-09-05T02:59:59Z"));
  const hidden = await call(s, "/api/predictions");
  assert.equal(hidden.data.predictions.items.length, 0);
  s.now = Date.parse("2026-09-05T04:30:00Z");
  const feed = await call(s, "/api/predictions");
  assert.equal(feed.status, 200);
  assert.equal(feed.data.predictions.items.length, 6);
  assert.equal(feed.data.predictions.betting.freeStakeRc, 10);
  assert.equal(feed.data.predictions.betting.maxStakeRc, 1000);
  assert.equal(feed.data.predictions.betting.xpOddsCap, 8);
  assert.equal(feed.data.predictions.betting.verified, false);
  assert.equal(
    feed.data.predictions.items.find((item) => item.id.endsWith("008")).choices
      .length,
    2,
  );
  assert.equal(feed.data.predictions.items[0].state, "open");
  assert.ok(!JSON.stringify(feed.data).includes("publish_gate"));
  assert.ok(!JSON.stringify(feed.data).includes("gitPublishKey"));
  assert.equal(
    (
      await call(s, "/api/predictions/PRED-20260905-001/vote", {
        version: 1,
        optionId: "A",
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await call(s, "/api/predictions/PRED-20260905-001/bet", {
        version: 1,
        optionId: "Z",
        stakeRc: 10,
        turnstileToken: "valid-turnstile-token",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(s, "/api/predictions/PRED-20260905-001/bet", {
        version: 1,
        optionId: "A",
        stakeRc: 10,
      })
    ).status,
    403,
  );
  assert.equal(s.turnstileCalls(), 0);

  const firstKey = crypto.randomUUID();
  const firstBody = {
    version: 1,
    optionId: "A",
    stakeRc: 10,
    turnstileToken: "valid-turnstile-token",
  };
  const first = await call(
    s,
    "/api/predictions/PRED-20260905-001/bet",
    firstBody,
    firstKey,
  );
  assert.equal(first.status, 200);
  assert.equal(first.data.player.rc, 400);
  assert.equal(first.data.player.predictionBettingVerified, true);
  assert.equal(first.data.predictions.betting.verified, true);
  assert.equal(first.data.predictions.stats.recorded, 1);
  assert.equal(first.data.result.bet.freeStakeRc, 10);
  assert.equal(first.data.result.bet.paidStakeRc, 0);
  const firstItem = first.data.predictions.items.find(
    (item) => item.id === "PRED-20260905-001",
  );
  assert.equal(firstItem.market.totalStakeRc, 10);
  assert.equal(firstItem.market.choices.A.odds, 1);
  assert.equal(s.turnstileCalls(), 1);

  const repeated = await call(
    s,
    "/api/predictions/PRED-20260905-001/bet",
    firstBody,
    firstKey,
  );
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.data.result, first.data.result);
  assert.equal(repeated.data.player.rc, 400);
  assert.equal(s.turnstileCalls(), 1);

  const raised = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "A",
    stakeRc: 100,
  });
  assert.equal(raised.status, 200);
  assert.equal(raised.data.player.rc, 310);
  assert.equal(raised.data.result.rcDelta, -90);
  assert.equal(s.turnstileCalls(), 1);

  const changed = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "B",
    stakeRc: 50,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.result.bet.optionId, "B");
  assert.equal(changed.data.result.rcDelta, 50);
  assert.equal(changed.data.player.rc, 360);
  const changedItem = changed.data.predictions.items.find(
    (item) => item.id === "PRED-20260905-001",
  );
  assert.equal(changedItem.market.totalStakeRc, 50);
  assert.equal(changedItem.market.choices.A.stakeRc, 0);
  assert.equal(changedItem.market.choices.B.stakeRc, 50);
  assert.equal(changedItem.market.choices.B.odds, 1);

  s.now = Date.parse("2026-09-12T05:00:00Z");
  assert.equal(
    (
      await call(s, "/api/predictions/PRED-20260905-001/bet", {
        version: 1,
        optionId: "A",
        stakeRc: 10,
      })
    ).status,
    409,
  );
  assert.equal((await call(s, "/api/raid/attack", {})).status, 404);
  assert.equal((await call(s, "/api/me")).data.player.rc, 460);
  s.db.native.close();
});


test("concurrent prediction bet updates keep the player balance and pool in sync", async () => {
  const s = await session(Date.parse("2026-09-05T04:30:00Z"));
  const first = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "A",
    stakeRc: 10,
    turnstileToken: "valid-turnstile-token",
  });
  assert.equal(first.status, 200);

  const attempts = await Promise.all(
    [20, 30, 40, 50, 60].map((stakeRc, index) =>
      call(s, "/api/predictions/PRED-20260905-001/bet", {
        version: 1,
        optionId: index % 2 ? "A" : "B",
        stakeRc,
      }),
    ),
  );
  assert.ok(attempts.some((response) => response.status === 200));
  assert.ok(attempts.every((response) => [200, 409].includes(response.status)));

  const savedBet = s.db.native
    .prepare(
      `SELECT option_id,stake_rc,paid_stake_rc FROM prediction_bets
       WHERE prediction_id=? AND version=? AND player_id=?`,
    )
    .get("PRED-20260905-001", 1, s.bootstrap.player.id);
  const savedPlayer = JSON.parse(
    s.db.native
      .prepare("SELECT data FROM players WHERE id=?")
      .get(s.bootstrap.player.id).data,
  );
  assert.equal(savedPlayer.rc, 400 - savedBet.paid_stake_rc);

  const pool = s.db.native
    .prepare(
      `SELECT option_id,stake_rc,bettor_count FROM prediction_option_pools
       WHERE prediction_id=? AND version=?`,
    )
    .all("PRED-20260905-001", 1);
  assert.equal(pool.reduce((sum, row) => sum + row.stake_rc, 0), savedBet.stake_rc);
  assert.equal(pool.reduce((sum, row) => sum + row.bettor_count, 0), 1);
  assert.equal(pool.find((row) => row.option_id === savedBet.option_id).stake_rc, savedBet.stake_rc);
  s.db.native.close();
});

test("a frozen market snapshot blocks an in-flight bet update without changing RC", async () => {
  const s = await session(Date.parse("2026-09-05T04:30:00Z"));
  const first = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "A",
    stakeRc: 10,
    turnstileToken: "valid-turnstile-token",
  });
  assert.equal(first.status, 200);
  s.db.native
    .prepare(
      `INSERT INTO prediction_market_snapshots
       (prediction_id,version,total_pool_rc,bettor_count,option_pools_json,closed_at,snapshot_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      "PRED-20260905-001",
      1,
      10,
      1,
      JSON.stringify({ A: 10, B: 0, C: 0, D: 0 }),
      "2026-09-12T03:00:00.000Z",
      "2026-09-12T03:00:00.000Z",
    );

  const blocked = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "B",
    stakeRc: 100,
  });
  assert.equal(blocked.status, 409);
  const saved = JSON.parse(
    s.db.native
      .prepare("SELECT data FROM players WHERE id=?")
      .get(s.bootstrap.player.id).data,
  );
  assert.equal(saved.rc, 400);
  const bet = s.db.native
    .prepare(
      `SELECT option_id,stake_rc,paid_stake_rc FROM prediction_bets
       WHERE prediction_id=? AND version=? AND player_id=?`,
    )
    .get("PRED-20260905-001", 1, s.bootstrap.player.id);
  assert.equal(bet.option_id, "A");
  assert.equal(bet.stake_rc, 10);
  assert.equal(bet.paid_stake_rc, 0);
  s.db.native.close();
});


test("Turnstile fetch is called without an invalid runtime receiver", async () => {
  const s = await session(Date.parse("2026-09-05T04:30:00Z"));
  s.dependencies.fetch = async function () {
    assert.equal(this, undefined);
    return Response.json({
      success: true,
      hostname: "localhost",
      action: "prediction-bet",
      "error-codes": [],
    });
  };
  const response = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "A",
    stakeRc: 10,
    turnstileToken: "valid-turnstile-token",
  });
  assert.equal(response.status, 200);
  s.db.native.close();
});

test("Turnstile testing metadata is accepted when the test response omits action", async () => {
  const s = await session(Date.parse("2026-09-05T04:30:00Z"));
  s.dependencies.fetch = async () =>
    Response.json({
      success: true,
      hostname: "example.com",
      "error-codes": [],
      metadata: { result_with_testing_key: true },
    });
  s.runtime.ENVIRONMENT = "staging";
  s.runtime.TURNSTILE_SECRET_KEY =
    "1x0000000000000000000000000000000AA";
  s.runtime.TURNSTILE_EXPECTED_HOSTNAME = "";
  const accepted = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "A",
    stakeRc: 10,
    turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
  });
  assert.equal(accepted.status, 200);
  s.db.native.close();
});

test("Turnstile dummy action is accepted only outside production", async () => {
  const s = await session(Date.parse("2026-09-05T04:30:00Z"));
  s.dependencies.fetch = async () =>
    Response.json({
      success: true,
      hostname: "localhost",
      action: "test",
      "error-codes": [],
    });
  s.runtime.ENVIRONMENT = "production";
  const rejected = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "A",
    stakeRc: 10,
    turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
  });
  assert.equal(rejected.status, 403);

  s.runtime.ENVIRONMENT = "staging";
  s.runtime.TURNSTILE_SECRET_KEY =
    "1x0000000000000000000000000000000AA";
  const accepted = await call(s, "/api/predictions/PRED-20260905-001/bet", {
    version: 1,
    optionId: "A",
    stakeRc: 10,
    turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
  });
  assert.equal(accepted.status, 200);
  s.db.native.close();
});
