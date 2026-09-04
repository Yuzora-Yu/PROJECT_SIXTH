import { config } from "./config.js";
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const now = () => Date.now();
export const iso = (ms = now()) => new Date(ms).toISOString();
export const calendarDate = (ms = now()) =>
  new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
export const dayKey = (ms = now()) =>
  new Date(ms + (9 - config.dailyResetHour) * 3600000)
    .toISOString()
    .slice(0, 10);
export const dateLabel = (ms = now()) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: config.timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(ms);
export function randomInt(max) {
  const limit = Math.floor(4294967296 / max) * max;
  let n;
  do {
    n = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (n >= limit);
  return n % max;
}
export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const emptySenses = () =>
  Object.fromEntries(config.senses.map((k) => [k, 0]));
export const senseStats = (xp, bonus = {}) =>
  Object.fromEntries(
    config.senses.map((k) => [
      k,
      Math.round(
        clamp(
          15 + (bonus?.[k] || 0) + Math.floor(Math.sqrt(xp[k] * 3)),
          1,
          100,
        ) * 10,
      ) / 10,
    ]),
  );
export function addXp(player, xp) {
  for (const k of config.senses) player.senseXp[k] += xp[k] || 0;
}
export function dailyCondition(player, day = dayKey()) {
  return clamp(
    player.history
      .filter((h) => h.dateJst === day)
      .reduce((s, h) => s + Object.values(h.xp).reduce((a, b) => a + b, 0), 0) /
      4,
    0,
    10,
  );
}
export function patternQuestions(seed) {
  const rng = seededRng(seed);
  const rules = [
    { values: [0, 1, 0, 2], rule: "4手で繰り返す A → B → A → C" },
    { values: [0, 1, 2, 3], rule: "1つずつ順に進む" },
    { values: [0, 2, 1, 3], rule: "2つの系列を交互に観測" },
    { values: [0, 0, 1, 1, 2, 2, 3, 3], rule: "同じ記号が2回ずつ続く" },
    { values: [0, 1, 2, 1], rule: "中央を挟んで往復する" },
  ];
  return rules.map((r, i) => {
    const shift = Math.floor(rng() * 4);
    const v = r.values.map((x) => (x + shift) % 4);
    const offset = Math.floor(rng() * v.length);
    return {
      id: i,
      sequence: Array.from({ length: 8 }, (_, j) => v[(offset + j) % v.length]),
      answer: v[(offset + 8) % v.length],
      rule: r.rule,
    };
  });
}
export function scorePattern(questions, answers) {
  const xp = emptySenses();
  xp.foresight = 1;
  xp.insight = 1;
  const details = answers.map((a, i) => ({
    ...a,
    correct: a.selectedIndex === questions[i].answer,
    answer: questions[i].answer,
    rule: questions[i].rule,
  }));
  for (const a of details)
    if (a.correct) {
      xp.foresight += 2;
      xp.insight += 2;
    }
  return {
    correct: details.filter((a) => a.correct).length,
    total: 5,
    details,
    xp,
  };
}
export function astrology(birthDate) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
    !Number.isFinite(Date.parse(birthDate)) ||
    new Date(birthDate).toISOString().slice(0, 10) !== birthDate ||
    birthDate > calendarDate()
  )
    throw new Error("有効な生年月日を入力してください。");
  let life = Array.from(birthDate.replaceAll("-", "")).reduce(
    (s, n) => s + Number(n),
    0,
  );
  while (life > 9 && ![11, 22, 33].includes(life))
    life = String(life)
      .split("")
      .reduce((s, n) => s + Number(n), 0);
  const [, m, d] = birthDate.split("-").map(Number),
    limits = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const zodiac = (m - 1 + (d >= limits[m - 1] ? 1 : 0)) % 12;
  const names = [
    "山羊座",
    "水瓶座",
    "魚座",
    "牡羊座",
    "牡牛座",
    "双子座",
    "蟹座",
    "獅子座",
    "乙女座",
    "天秤座",
    "蠍座",
    "射手座",
  ];
  return {
    ruleVersion: config.astrologyRuleVersion,
    life,
    zodiac: names[zodiac],
    stats: Object.fromEntries(
      config.senses.map((k, i) => [
        k,
        30 + ((life * 7 + zodiac * 11 + i * 13) % 51),
      ]),
    ),
  };
}
