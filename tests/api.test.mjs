import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { localDatabase } from "../scripts/sqlite.mjs";
import { handleApi } from "../worker/api.js";
const time = Date.parse("2026-09-04T02:00:00Z");
async function session() {
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
    () => time,
  );
  return {
    db,
    cookie: r.headers.get("set-cookie").split(";")[0],
    bootstrap: await r.json(),
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
    () => time,
  );
  return { status: r.status, data: await r.json() };
}
test("anonymous cookie hides bearer, unauthorized and cross-site mutations rejected", async () => {
  const s = await session();
  assert.ok(s.cookie.startsWith("sixth_session="));
  assert.equal(s.bootstrap.player.rc, 300);
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
  assert.equal(b.data.player.rc, 200);
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
  assert.equal(me.data.player.rc, 300 - successful * 100);
  assert.ok(me.data.player.rc >= 0);
  assert.ok(results.every((r) => [200, 409].includes(r.status)));
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
  assert.equal(me.data.player.rc, 310);
  assert.equal(me.data.player.history.length, 1);
  assert.equal((await call(s, "/api/daily/card/start", {})).status, 409);
  s.db.native.close();
});
test("future prediction and raid have no mutation endpoints", async () => {
  const s = await session();
  assert.equal(
    (await call(s, "/api/predictions/x/vote", { optionId: "A" })).status,
    404,
  );
  assert.equal((await call(s, "/api/raid/attack", {})).status, 404);
  assert.equal((await call(s, "/api/me")).data.player.rc, 300);
  s.db.native.close();
});
