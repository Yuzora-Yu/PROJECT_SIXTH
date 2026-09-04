import test from "node:test";
import assert from "node:assert/strict";
import {
  seededRng,
  dayKey,
  senseStats,
  emptySenses,
  patternQuestions,
  scorePattern,
  astrology,
} from "../shared/core.js";
import {
  particleScene,
  particlePosition,
  scoreParticles,
} from "../shared/particles.js";
import { newPlayer, perform, publicPlayer } from "../worker/game.js";
import { senseBonuses, simulateBattle } from "../js/battle/prisma-adapter.js";
import { characters } from "../data/prisma/catalog.js";
const time = Date.parse("2026-09-04T02:00:00Z");
test("JST 04:00 is the day boundary, including year rollover", () => {
  assert.equal(dayKey(Date.parse("2026-09-03T18:59:59Z")), "2026-09-03");
  assert.equal(dayKey(Date.parse("2026-09-03T19:00:00Z")), "2026-09-04");
  assert.equal(dayKey(Date.parse("2026-12-31T19:00:00Z")), "2027-01-01");
});
test("seed and particle coordinates reproduce independently of frame frequency", () => {
  const a = seededRng(123),
    b = seededRng(123);
  assert.deepEqual(
    Array.from({ length: 100 }, a),
    Array.from({ length: 100 }, b),
  );
  assert.deepEqual(particleScene(42), particleScene(42));
  const s = particleScene(42);
  for (const e of s.events) {
    const p = s.particles[e.particleId];
    const a = particlePosition(p, 9000, e);
    for (let t = 0; t < 9000; t += 1000 / 30) particlePosition(p, t, e);
    assert.deepEqual(a, particlePosition(p, 9000, e));
  }
});
test("legacy flow retains five anomaly classes, 16 unique events and hidden-rule region", () => {
  for (let seed = 0; seed < 30; seed++) {
    const s = particleScene(seed, 4);
    assert.equal(s.events.length, 16);
    assert.equal(new Set(s.events.map((e) => e.type)).size, 5);
    assert.equal(new Set(s.events.map((e) => e.particleId)).size, 16);
    for (const e of s.events.filter((e) => e.type === "hidden-rule")) {
      const pos = particlePosition(
        s.particles[e.particleId],
        e.startMs + 1000,
        e,
      );
      assert.ok(pos.x > 390 && pos.x < 670);
    }
  }
});
test("particle hits validated spatially, duplicates counted once, spam rejected", () => {
  const s = particleScene(22),
    e = s.events[0],
    p = s.particles[e.particleId],
    ms = e.startMs + 500,
    pos = particlePosition(p, ms, e);
  const first = { ms, x: pos.x, y: pos.y },
    second = { ms: ms + 500, ...particlePosition(p, ms + 500, e) };
  const r = scoreParticles(22, [first, second]);
  assert.equal(r.found, 1);
  assert.equal(r.hits[0].eventId, e.id);
  assert.throws(() => scoreParticles(22, [first, { ...first, ms: ms + 1 }]));
  assert.throws(() => scoreParticles(22, [{ ms: NaN, x: 1, y: 1 }]));
});
test("particle hit radius accepts nearby taps and preserves old rule scoring", () => {
  const taps = [{ ms: 4000, x: 901.7179740276188, y: 506.072233576117 }];
  assert.equal(scoreParticles(22, taps, 1).found, 0);
  const current = scoreParticles(22, taps, 2);
  assert.equal(current.found, 1);
  assert.equal(current.hitRadius, 36);
  assert.equal(current.particleRuleVersion, 2);
  const p = newPlayer("legacy", time);
  const attempt = perform(p, "/api/daily/particle/start", {}, time);
  assert.equal(attempt.testVersion, 5);
  p.attempts[`${dayKey(time)}:particle`].testVersion = 1;
  const result = perform(
    p,
    "/api/daily/particle/finish",
    { attemptId: attempt.attemptId, taps: [], valid: true },
    time + 65000,
  );
  assert.equal(result.hitRadius, 26);
  assert.equal(result.testVersion, 1);
});
test("Daily gives rewards once; secret and seed are absent from public player", () => {
  const p = newPlayer("x", time),
    start = perform(p, "/api/daily/card/start", {}, time);
  assert.deepEqual(Object.keys(start).sort(), ["attemptId", "testVersion"]);
  assert.equal(
    JSON.stringify(publicPlayer(p, time)).includes("answerIndex"),
    false,
  );
  const answer = p.attempts[`${dayKey(time)}:card`].answerIndex;
  const r = perform(
    p,
    "/api/daily/card/answer",
    { attemptId: start.attemptId, selectedIndex: answer },
    time + 1000,
  );
  assert.equal(r.correct, true);
  assert.equal(p.rc, 310);
  assert.equal(p.senseXp.intuition, 6);
  perform(
    p,
    "/api/daily/card/answer",
    { attemptId: start.attemptId, selectedIndex: answer },
    time + 2000,
  );
  assert.equal(p.rc, 310);
  assert.throws(() => perform(p, "/api/daily/card/start", {}, time));
  assert.ok(perform(p, "/api/daily/card/start", {}, time + 86400000).attemptId);
});
test("retired trial has no public entry or mutation", () => {
  const p = newPlayer("x", time);
  assert.throws(() => perform(p, "/api/daily/pattern/start", {}, time));
  assert.equal(publicPlayer(p, time).dailyStatus.pattern, undefined);
});

test("invalidated particle attempt grants retry; stale session cannot finish", () => {
  const p = newPlayer("x", time),
    a = perform(p, "/api/daily/particle/start", {}, time);
  perform(
    p,
    "/api/daily/particle/cancel",
    { attemptId: a.attemptId },
    time + 1000,
  );
  const b = perform(p, "/api/daily/particle/start", {}, time + 2000);
  assert.notEqual(a.attemptId, b.attemptId);
  assert.throws(() =>
    perform(
      p,
      "/api/daily/particle/finish",
      { attemptId: a.attemptId, taps: [], valid: true },
      time + 65000,
    ),
  );
  assert.equal(p.rc, 300);
  assert.equal(
    perform(
      p,
      "/api/daily/particle/finish",
      { attemptId: b.attemptId, taps: [], valid: true },
      time + 65000,
    ).found,
    0,
  );
});
test("gacha cannot overspend or set an unowned/prototype icon", () => {
  const p = newPlayer("x", time);
  assert.throws(() => perform(p, "/api/gacha/draw", { count: 10 }, time));
  assert.equal(p.rc, 300);
  assert.throws(() =>
    perform(p, "/api/character/icon", { characterId: 102 }, time),
  );
  assert.throws(() =>
    perform(p, "/api/character/icon", { characterId: "__proto__" }, time),
  );
  for (let i = 0; i < 3; i++) perform(p, "/api/gacha/draw", { count: 1 }, time);
  assert.equal(p.rc, 0);
  assert.throws(() => perform(p, "/api/gacha/draw", { count: 1 }, time));
  assert.equal(p.rc, 0);
});
test("battle quota, server rewards, replay idempotency, reset", () => {
  const p = newPlayer("x", time);
  let expected = 300;
  for (let i = 0; i < 5; i++) {
    const b = perform(p, "/api/battle/start", { characterId: 101 }, time);
    assert.deepEqual(
      perform(p, "/api/battle/start", { characterId: 101 }, time),
      b,
    );
    perform(
      p,
      "/api/battle/finish",
      { battleId: b.id, rc: 9999, win: true },
      time,
    );
    perform(p, "/api/battle/finish", { battleId: b.id }, time);
    expected += b.result.rc;
    assert.equal(p.rc, expected);
  }
  assert.throws(() =>
    perform(p, "/api/battle/start", { characterId: 101 }, time),
  );
  assert.ok(
    perform(p, "/api/battle/start", { characterId: 101 }, time + 86400000),
  );
});
test("sense stats and battle bonuses are bounded; on/off both terminate", () => {
  assert.deepEqual(
    senseStats(emptySenses()),
    Object.fromEntries(Object.keys(emptySenses()).map((k) => [k, 15])),
  );
  const p = newPlayer("x", time);
  p.senseXp = Object.fromEntries(
    Object.keys(emptySenses()).map((k) => [k, 999999]),
  );
  const stats = senseStats(p.senseXp),
    b = senseBonuses(stats, characters[0], 99);
  assert.ok(Object.values(stats).every((x) => x === 100));
  assert.equal(b.evade, 0.08);
  assert.equal(b.condition, 0.1);
  assert.ok(b.synergy <= 0.02);
  for (const on of [true, false])
    for (let seed = 0; seed < 40; seed++)
      assert.ok(simulateBattle(p, 101, seed, 10, on).turns.length <= 24);
});
test("astrology is deterministic, validates leap dates and never affects XP", () => {
  assert.deepEqual(astrology("2000-02-29"), astrology("2000-02-29"));
  assert.throws(() => astrology("2001-02-29"));
  assert.throws(() => astrology("not-a-date"));
});
