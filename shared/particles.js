import { config } from "./config.js";
import { seededRng, emptySenses, clamp } from "./core.js";
export function particleScene(seed, ruleVersion = config.particleRuleVersion) {
  const rng = seededRng(seed);
  const particles = Array.from({ length: config.particle.count }, (_, id) => ({
    id,
    x: rng() * 900 + 30,
    y: rng() * 480 + 30,
    phase: rng() * 6.28,
    speed: 20 + rng() * 12,
  }));
  if (ruleVersion >= 5) {
    const heading = rng() * Math.PI * 2;
    for (const p of particles) {
      p.heading = heading + ((rng() - 0.5) * Math.PI) / 2;
      p.speed = 18 + rng() * 20;
    }
  }
  const types = Object.entries(config.particle.events).flatMap(([t, n]) =>
    Array(n).fill(t),
  );
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  const ids = Array.from({ length: 100 }, (_, i) => i);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const events = types.map((type, i) => ({
    id: `e${i}`,
    type,
    particleId: ids[i],
    startMs: ruleVersion >= 3 ? 1500 + i * 1500 : 3000 + i * 3000,
    revealMs: ruleVersion >= 3 ? 3000 + i * 1500 : 6000 + i * 3000,
    endMs: ruleVersion >= 3 ? 5500 + i * 1500 : 11000 + i * 3000,
    maxBaseScore: 10,
  }));
  // Place hidden-rule particles at the observable region during their event window.
  for (const e of events)
    if (e.type === "hidden-rule" && ruleVersion < 5)
      particles[e.particleId].x =
        420 - (e.startMs / 1000 + 1) * particles[e.particleId].speed;
  return { particles, events };
}
function bounce(v, max) {
  const n = ((v % (max * 2)) + max * 2) % (max * 2);
  return n > max ? 2 * max - n : n;
}
export function particlePosition(p, ms, event, out = {}) {
  const t = ms / 1000;
  let x = p.x + t * p.speed,
    y = p.y + Math.sin(t * 0.6 + p.phase) * 20;
  out.radius = 3.4 + Math.sin(t * 2) * 0.7;
  out.visible = true;
  if (event) {
    if (event.type === "emergence" && ms < event.startMs) out.visible = false;
    if (ms >= event.startMs && ms <= event.endMs) {
      const e = (ms - event.startMs) / 1000;
      if (event.type === "deviation") {
        x -= e * 60;
        y += Math.sin(e) * 65;
      }
      if (event.type === "precursor") {
        x += e * e * 5;
        y -= e * e * 3;
      }
      if (event.type === "desync") {
        out.radius = 3.4 + Math.sin(t * 2 + Math.PI) * 2;
      }
      if (event.type === "hidden-rule") {
        const bx = bounce(x, 940);
        if (p.heading !== undefined)
          y +=
            Math.sin(((e * 1000) / (event.endMs - event.startMs)) * Math.PI) *
            75;
        else if (bx > 380 && bx < 660)
          y += Math.sin(((bx - 380) / 280) * Math.PI) * 75;
      }
    }
  }
  if (p.heading !== undefined) {
    const dx = x - p.x,
      dy = y - p.y;
    x = p.x + dx * Math.cos(p.heading) - dy * Math.sin(p.heading);
    y = p.y + dx * Math.sin(p.heading) + dy * Math.cos(p.heading);
  }
  out.x = 10 + bounce(x, 940);
  out.y = 10 + bounce(y, 520);
  return out;
}
// One spatial/time decision drives both immediate feedback and server rescoring.
export function judgeParticleTap(
  scene,
  tap,
  found,
  ruleVersion = config.particleRuleVersion,
) {
  const hitRadius = config.particle.hitRadiusByVersion[ruleVersion];
  if (!hitRadius) throw Error("未対応の粒子試験バージョンです。");
  const candidates = scene.particles
    .map((p) => {
      const e = scene.events.find((e) => e.particleId === p.id),
        pos = particlePosition(p, tap.ms, e);
      return {
        p,
        e,
        pos,
        dist: pos.visible ? Math.hypot(tap.x - pos.x, tap.y - pos.y) : Infinity,
      };
    })
    .sort((a, b) => a.dist - b.dist);
  const active = candidates.filter(
    (c) =>
      c.dist <= hitRadius &&
      c.e &&
      tap.ms >= c.e.startMs &&
      tap.ms <= c.e.endMs,
  );
  const nearest =
    ruleVersion >= 3
      ? active.find((c) => !found.has(c.e.id)) || active[0] || candidates[0]
      : candidates[0];
  const e = nearest.e;
  if (nearest.dist > hitRadius || !e || tap.ms < e.startMs || tap.ms > e.endMs)
    return { kind: "miss" };
  return {
    kind: found.has(e.id) ? "duplicate" : "hit",
    event: e,
    particleId: nearest.p.id,
    x: nearest.pos.x,
    y: nearest.pos.y,
  };
}
export function scoreParticles(
  seed,
  taps,
  ruleVersion = config.particleRuleVersion,
) {
  const hitRadius = config.particle.hitRadiusByVersion[ruleVersion];
  if (!hitRadius) throw new Error("未対応の粒子試験バージョンです。");
  if (!Array.isArray(taps) || taps.length > 120)
    throw new Error("無効な観測ログです。");
  const duration = config.particle.durationByVersion[ruleVersion];
  const scene = particleScene(seed, ruleVersion),
    found = new Set(),
    xp = emptySenses();
  let last = -500,
    falsePositives = 0;
  const hits = [];
  for (const tap of taps) {
    if (
      !Number.isFinite(tap.ms) ||
      tap.ms < 0 ||
      tap.ms > duration ||
      tap.ms - last < config.particle.cooldownMs ||
      !Number.isFinite(tap.x) ||
      !Number.isFinite(tap.y) ||
      tap.x < 0 ||
      tap.x > 960 ||
      tap.y < 0 ||
      tap.y > 540
    )
      throw new Error("観測ログの時間または座標が無効です。");
    last = tap.ms;
    const decision = judgeParticleTap(scene, tap, found, ruleVersion);
    if (decision.kind === "miss") {
      falsePositives++;
      continue;
    }
    if (decision.kind === "duplicate") continue;
    const e = decision.event;
    found.add(e.id);
    const lead = e.type === "precursor" ? Math.max(0, e.revealMs - tap.ms) : 0;
    const reaction = Math.max(0, tap.ms - e.startMs);
    const gain = clamp(Math.ceil(4 - reaction / 2000), 1, 4);
    if (e.type === "hidden-rule") xp.insight += gain;
    else if (e.type === "desync") {
      xp.resonance += gain;
      xp.awareness++;
    } else if (lead > 0) xp.foresight += gain;
    else xp.awareness += gain;
    hits.push({
      eventId: e.id,
      type: e.type,
      ms: tap.ms,
      reactionMs: reaction,
      leadMs: lead,
    });
  }
  for (const k of ["awareness", "foresight", "insight", "resonance"])
    xp[k] = Math.max(1, xp[k] - Math.floor(falsePositives / 4));
  return {
    particleRuleVersion: ruleVersion,
    hitRadius,
    found: found.size,
    total: 16,
    falsePositives,
    hits,
    xp,
    score: Math.max(0, found.size * 10 - falsePositives * 2),
    meanReactionMs: hits.length
      ? Math.round(hits.reduce((s, h) => s + h.reactionMs, 0) / hits.length)
      : null,
  };
}
