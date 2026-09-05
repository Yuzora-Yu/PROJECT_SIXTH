import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDatabase } from "../scripts/sqlite.mjs";
import { handleApi } from "../worker/api.js";
const time = Date.parse("2026-09-04T02:00:00Z");
async function session(at = time) {
  const db = localDatabase();
  db.native.exec(
    readFileSync(
      new URL("../migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  const r = await handleApi(
    new Request("http://localhost/api/bootstrap", {
      headers: { "X-Sixth-Client": "1" },
    }),
    db,
    () => at,
  );
  return {
    db,
    cookie: r.headers.get("set-cookie").split(";")[0],
    bootstrap: await r.json(),
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
    s.db,
    () => s.now,
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
test("published predictions load, save one bounded choice and never change RC", async () => {
  const s = await session(Date.parse("2026-09-05T02:59:59Z"));
  const hidden = await call(s, "/api/predictions");
  assert.equal(hidden.data.predictions.items.length, 0);
  s.now = Date.parse("2026-09-05T04:30:00Z");
  const feed = await call(s, "/api/predictions");
  assert.equal(feed.status, 200);
  assert.equal(feed.data.predictions.items.length, 6);
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
        optionId: "Z",
      })
    ).status,
    400,
  );
  const first = await call(s, "/api/predictions/PRED-20260905-001/vote", {
    version: 1,
    optionId: "A",
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.player.rc, 400);
  assert.equal(first.data.predictions.stats.recorded, 1);
  const changed = await call(s, "/api/predictions/PRED-20260905-001/vote", {
    version: 1,
    optionId: "B",
  });
  assert.equal(changed.data.result.selection.optionId, "B");
  assert.equal(changed.data.player.rc, 400);
  s.now = Date.parse("2026-09-12T05:00:00Z");
  assert.equal(
    (
      await call(s, "/api/predictions/PRED-20260905-001/vote", {
        version: 1,
        optionId: "A",
      })
    ).status,
    409,
  );
  assert.equal((await call(s, "/api/raid/attack", {})).status, 404);
  assert.equal((await call(s, "/api/me")).data.player.rc, 500);
  s.db.native.close();
});
