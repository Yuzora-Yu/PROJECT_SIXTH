import test from "node:test";
import assert from "node:assert/strict";
import {
  particleScene,
  particlePosition,
  judgeParticleTap,
  scoreParticles,
} from "../shared/particles.js";
test("live hit/miss/duplicate decisions match final scoring on the same recorded frames", () => {
  for (let seed = 0; seed < 20; seed++) {
    const scene = particleScene(seed, 4),
      found = new Set(),
      taps = [];
    let misses = 0;
    for (let ms = 0; ms <= 30000; ms += 500) {
      const active = scene.events.find((e) => ms >= e.startMs && ms <= e.endMs);
      const pos = active
        ? particlePosition(scene.particles[active.particleId], ms, active)
        : { x: 480, y: 270 };
      const tap = { ms, x: pos.x, y: pos.y };
      taps.push(tap);
      const d = judgeParticleTap(scene, tap, found, 4);
      if (d.kind === "hit") found.add(d.event.id);
      else if (d.kind === "miss") misses++;
    }
    const result = scoreParticles(seed, taps, 4);
    assert.equal(result.found, found.size);
    assert.equal(result.falsePositives, misses);
    assert.deepEqual(
      result.hits.map((h) => h.eventId),
      [...found],
    );
  }
});
test("area boundary, duplicate and normal particles produce explicit decisions", () => {
  const scene = particleScene(22, 4),
    event = scene.events[0],
    ms = event.startMs + 500;
  const pos = particlePosition(scene.particles[event.particleId], ms, event),
    found = new Set();
  const tap = { ms, x: pos.x, y: pos.y };
  const d = judgeParticleTap(scene, tap, found, 4);
  assert.equal(d.kind, "hit");
  assert.equal(d.particleId, event.particleId);
  found.add(d.event.id);
  assert.equal(judgeParticleTap(scene, tap, found, 4).kind, "duplicate");
  const direction = pos.x < 480 ? 1 : -1;
  assert.equal(
    judgeParticleTap(
      scene,
      { ...tap, x: pos.x + direction * 71.9 },
      new Set(),
      4,
    ).kind,
    "hit",
  );
  assert.equal(
    judgeParticleTap(
      scene,
      { ...tap, x: pos.x + direction * 72.1 },
      new Set(),
      4,
    ).kind,
    "miss",
  );
  assert.equal(
    judgeParticleTap(scene, { ms: 0, x: pos.x, y: pos.y }, new Set(), 4).kind,
    "miss",
  );
});
