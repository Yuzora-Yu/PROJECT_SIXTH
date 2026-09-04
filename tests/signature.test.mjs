import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateProfile,
  profileReading,
  mbtiNames,
  numberVectors,
  profileRuleVersion,
} from "../shared/profile-model.js";
import { combinedProfile } from "../shared/profiles.js";
import {
  newPlayer,
  perform,
  publicPlayer,
  starterIds,
} from "../worker/game.js";
import {
  particleScene,
  particlePosition,
  scoreParticles,
} from "../shared/particles.js";
import { config } from "../shared/config.js";
import { characters } from "../data/prisma/catalog.js";
const time = Date.parse("2026-09-04T02:00:00Z");
test("all number profiles have distinct axes and shared readings include every supplied layer", () => {
  for (const life of Object.keys(numberVectors).map(Number)) {
    const vector = numberVectors[life];
    assert.ok(Math.max(...vector) - Math.min(...vector) >= 40);
    for (const mbti of ["", ...Object.keys(mbtiNames)]) {
      const model = calculateProfile({
        version: profileRuleVersion,
        life,
        mbti,
        signs: [0, 3, 2, 5, 6, 1, 9, 8, 10, 11],
      });
      const reading = profileReading(model);
      assert.match(reading.short, new RegExp("数秘" + life));
      assert.match(reading.short, /惑星配置/);
      assert.match(reading.short, /太陽と月/);
      assert.ok(!reading.short.includes("undefined"));
      if (mbti) {
        assert.ok(reading.short.includes(mbti));
        assert.match(reading.short, /水星/);
      }
      assert.deepEqual(reading.short, reading.paragraphs.join("\n\n"));
      for (const k of config.senses)
        assert.equal(model.bonus[k], model.stats[k] / 10);
    }
  }
});
test("numeric base, all 16 corrections, celestial input and differentiated readings", () => {
  const plain = combinedProfile("2000-01-08", "08:30", 9),
    mbti = combinedProfile("2000-01-08", "08:30", 9, "INFJ");
  assert.equal(plain.numerology.life, 11);
  assert.deepEqual(plain.base, mbti.base);
  assert.notDeepEqual(plain.stats, mbti.stats);
  const readings = new Set();
  for (const type of Object.keys(mbtiNames)) {
    const p = calculateProfile({ ...mbti.features, mbti: type });
    assert.ok(Object.values(p.stats).every((v) => v >= 20 && v <= 100));
    readings.add(profileReading(p).paragraphs.join(""));
  }
  assert.equal(readings.size, 16);
  const alternate = calculateProfile({
    ...mbti.features,
    signs: Array(10).fill(0),
  });
  assert.notDeepEqual(alternate.stats, mbti.stats);
  assert.notEqual(
    profileReading(alternate).paragraphs.join(""),
    mbti.reading.paragraphs.join(""),
  );
  assert.throws(() => calculateProfile({ ...mbti.features, signs: [99] }));
  assert.throws(() =>
    calculateProfile({ ...mbti.features, mbti: "__proto__" }),
  );
});
test("initial bonus is exactly ten percent, replacement never stacks and growth survives", () => {
  const p = newPlayer("p", time);
  p.senseXp.intuition = 24;
  const f = combinedProfile("2000-01-08", "08:30", 9, "INFJ").features;
  const before = publicPlayer(p, time).senseStats;
  const bonus = perform(
    p,
    "/api/profile/baseline",
    { features: f, bonus: { awareness: 999 } },
    time,
  ).bonus;
  for (const k of config.senses)
    assert.equal(bonus[k], calculateProfile(f).stats[k] / 10);
  perform(p, "/api/profile/baseline", { features: f }, time);
  assert.deepEqual(p.profileBonus, bonus);
  assert.equal(p.senseXp.intuition, 24);
  const replacement = { ...f, mbti: "ESTP" };
  perform(p, "/api/profile/baseline", { features: replacement }, time);
  assert.deepEqual(p.profileBonus, calculateProfile(replacement).bonus);
  assert.equal(JSON.stringify(p).includes("INFJ"), false);
  assert.equal(JSON.stringify(p).includes("2000-01-08"), false);
  perform(p, "/api/profile/baseline", { features: null }, time);
  assert.deepEqual(publicPlayer(p, time).senseStats, before);
});
test("six starters, one grant, legacy progress preserved, all thirty birthdays valid", () => {
  assert.equal(characters.length, 30);
  assert.deepEqual(
    starterIds.map((id) => characters.find((c) => c.id === id).name),
    ["ジョセフ", "リュウ", "アルス", "アリサ", "サラ", "ソフィア"],
  );
  for (const id of starterIds) {
    const p = newPlayer("p", time);
    perform(p, "/api/character/starter", { characterId: id }, time);
    assert.equal(p.profileIconCharacterId, id);
    assert.equal(Object.keys(p.characters).length, 1);
    assert.throws(() =>
      perform(p, "/api/character/starter", { characterId: 101 }, time),
    );
  }
  const legacy = newPlayer("old", time);
  delete legacy.provisionalStarter;
  delete legacy.starterChosen;
  legacy.characters[101].exp = 60;
  perform(legacy, "/api/character/starter", { characterId: 301 }, time);
  assert.equal(legacy.characters[101].exp, 60);
  assert.equal(legacy.rc, 300);
  assert.equal(characters.find((c) => c.id === 301).job, "冒険者");
  for (const c of characters) assert.match(c.birthday, /^\d{2}-\d{2}$/);
});
test("30-second area scoring accepts an anomaly even beside a closer normal particle", () => {
  assert.equal(config.particle.durationMs, 30000);
  assert.equal(config.particle.hitRadiusByVersion[3], 72);
  let found = false;
  for (let seed = 0; seed < 20 && !found; seed++) {
    const s = particleScene(seed, 3);
    assert.ok(s.events.every((e) => e.endMs <= 30000));
    for (const e of s.events) {
      const ms = e.startMs + 500,
        pos = particlePosition(s.particles[e.particleId], ms, e);
      for (const n of s.particles.filter(
        (p) => !s.events.some((e) => e.particleId === p.id),
      )) {
        const q = particlePosition(n, ms);
        if (Math.hypot(pos.x - q.x, pos.y - q.y) > 55) continue;
        const result = scoreParticles(seed, [{ ms, x: q.x, y: q.y }], 3);
        assert.equal(result.found, 1);
        assert.equal(result.falsePositives, 0);
        found = true;
        break;
      }
      if (found) break;
    }
  }
  assert.ok(found);
  assert.throws(() => scoreParticles(1, [{ ms: 30001, x: 100, y: 100 }], 3));
  assert.doesNotThrow(() =>
    scoreParticles(1, [{ ms: 50000, x: 100, y: 100 }], 2),
  );
});
test("optional name validates length and renders as plain data", () => {
  const p = newPlayer("p", time);
  perform(p, "/api/profile/name", { name: "  ユーゾラ  " }, time);
  assert.equal(publicPlayer(p, time).displayName, "ユーゾラ");
  assert.throws(() =>
    perform(p, "/api/profile/name", { name: "名".repeat(25) }, time),
  );
  perform(p, "/api/profile/name", { name: "" }, time);
  assert.equal(p.displayName, "");
});
