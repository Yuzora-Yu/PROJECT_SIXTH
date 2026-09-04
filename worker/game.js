import { config } from "../shared/config.js";
import {
  dayKey,
  iso,
  randomInt,
  newSeed,
  emptySenses,
  senseStats,
  addXp,
  dailyCondition,
  patternQuestions,
  scorePattern,
} from "../shared/core.js";
import { scoreParticles } from "../shared/particles.js";
import { characters } from "../data/prisma/catalog.js";
import { simulateBattle } from "../js/battle/prisma-adapter.js";
export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const assert = (condition, message, status = 400) => {
  if (!condition) throw new GameError(message, status);
};
export function newPlayer(id, ms) {
  return {
    schemaVersion: 1,
    id,
    createdAt: iso(ms),
    rc: config.economy.initialRC,
    senseXp: emptySenses(),
    profileIconCharacterId: 101,
    characters: { 101: { exp: 0, shards: 0 } },
    attempts: {},
    history: [],
    battleDay: dayKey(ms),
    battleCount: 0,
    battleHistory: [],
    pendingBattle: null,
  };
}
export function publicPlayer(p, ms) {
  const day = dayKey(ms),
    status = {};
  for (const test of ["card", "particle", "pattern"])
    status[test] = p.attempts[`${day}:${test}`]?.completed
      ? "complete"
      : "ready";
  return {
    id: p.id,
    createdAt: p.createdAt,
    rc: p.rc,
    senseXp: p.senseXp,
    senseStats: senseStats(p.senseXp),
    characters: p.characters,
    profileIconCharacterId: p.profileIconCharacterId,
    dailyStatus: status,
    condition: dailyCondition(p, day),
    battleRemaining:
      p.battleDay === day
        ? config.battle.dailyLimit - p.battleCount
        : config.battle.dailyLimit,
    pendingBattle: p.pendingBattle
      ? { id: p.pendingBattle.id, result: p.pendingBattle.result }
      : null,
    history: p.history,
    battleHistory: p.battleHistory.slice(-30),
  };
}
function finish(p, a, result, ms) {
  a.completed = true;
  a.finishedAt = iso(ms);
  a.result = result;
  addXp(p, result.xp);
  p.rc += config.economy.dailyRC;
  const record = {
    attemptId: a.id,
    testId: a.test,
    testVersion: a.testVersion,
    dateJst: a.day,
    finishedAt: iso(ms),
    seed: a.seed,
    ...result,
    rc: config.economy.dailyRC,
  };
  p.history.push(record);
  return record;
}
export function perform(p, path, body, ms) {
  const day = dayKey(ms);
  let match = path.match(
    /^\/api\/daily\/(card|particle|pattern)\/(start|answer|finish|cancel)$/,
  );
  if (match) {
    const [, test, action] = match,
      key = `${day}:${test}`;
    let a = p.attempts[key];
    if (action === "start") {
      assert(
        !a?.completed,
        "本日の試験は完了しています。明日04:00 JSTに再開できます。",
        409,
      );
      if (!a) {
        a = {
          id: crypto.randomUUID(),
          day,
          test,
          testVersion:
            test === "particle"
              ? config.particleRuleVersion
              : config.testVersion,
          startedAt: ms,
          seed: newSeed(),
          completed: false,
        };
        if (test === "card") a.answerIndex = randomInt(5);
        p.attempts[key] = a;
      }
      // Refresh a measurement session on restart; discarded logs never earn rewards.
      if (test !== "card") {
        a.id = crypto.randomUUID();
        a.startedAt = ms;
        a.seed = newSeed();
      }
      return {
        attemptId: a.id,
        testVersion: a.testVersion,
        ...(test === "particle" ? { seed: a.seed } : {}),
        ...(test === "pattern"
          ? {
              questions: patternQuestions(a.seed).map((q) => ({
                id: q.id,
                sequence: q.sequence,
              })),
            }
          : {}),
      };
    }
    assert(
      a && a.id === body.attemptId,
      "試験の有効期限が切れました。もう一度開始してください。",
      409,
    );
    if (a.completed) return a.result;
    if (action === "cancel") {
      assert(test !== "card", "カードは選択を続けられます。");
      delete p.attempts[key];
      return { cancelled: true };
    }
    if (test === "card") {
      assert(
        action === "answer" &&
          Number.isInteger(body.selectedIndex) &&
          body.selectedIndex >= 0 &&
          body.selectedIndex < 5,
        "カードを1枚選択してください。",
      );
      const correct = body.selectedIndex === a.answerIndex,
        xp = emptySenses();
      xp.intuition = correct ? 6 : 1;
      return finish(
        p,
        a,
        {
          selectedIndex: body.selectedIndex,
          answerIndex: a.answerIndex,
          correct,
          xp,
        },
        ms,
      );
    }
    assert(action === "finish", "操作が無効です。");
    if (test === "pattern") {
      assert(
        ms - a.startedAt >= 5000 && ms - a.startedAt < 30 * 60000,
        "試験時間が無効です。再開してください。",
      );
      assert(
        Array.isArray(body.answers) &&
          body.answers.length === 5 &&
          body.answers.every(
            (a) =>
              Number.isInteger(a.selectedIndex) &&
              a.selectedIndex >= 0 &&
              a.selectedIndex < 4 &&
              Number.isFinite(a.reactionMs) &&
              a.reactionMs >= 0 &&
              a.reactionMs < 1800000 &&
              ["intuition", "reasoned", "unsure"].includes(a.selfReport),
          ),
        "回答ログが無効です。",
      );
      return finish(
        p,
        a,
        scorePattern(patternQuestions(a.seed), body.answers),
        ms,
      );
    }
    assert(
      ms - a.startedAt >= config.particle.durationMs &&
        ms - a.startedAt < 5 * 60000,
      "観測時間が無効です。再開してください。",
    );
    assert(body.valid === true, "観測は無効になりました。再挑戦できます。");
    let result;
    try {
      result = scoreParticles(a.seed, body.taps, a.testVersion);
    } catch (e) {
      throw new GameError(e.message);
    }
    return finish(
      p,
      a,
      {
        ...result,
        taps: body.taps,
        particleRuleVersion: a.testVersion,
      },
      ms,
    );
  }
  if (path === "/api/character/icon") {
    assert(
      Number.isInteger(body.characterId) &&
        characters.some((c) => c.id === body.characterId) &&
        Object.hasOwn(p.characters, body.characterId),
      "所持キャラクターのみ設定できます。",
      403,
    );
    p.profileIconCharacterId = Number(body.characterId);
    return { characterId: p.profileIconCharacterId };
  }
  if (path === "/api/gacha/draw") {
    assert(body.count === 1 || body.count === 10, "召喚回数が無効です。");
    const cost =
      body.count === 10 ? config.economy.tenDrawCost : config.economy.drawCost;
    assert(p.rc >= cost, "RCが不足しています。試験や戦闘で集めましょう。", 409);
    p.rc -= cost;
    const draws = [];
    for (let i = 0; i < body.count; i++) {
      const c = characters[randomInt(characters.length)],
        duplicate = Boolean(p.characters[c.id]);
      if (duplicate)
        p.characters[c.id].shards += config.economy.duplicateShards;
      else p.characters[c.id] = { exp: 0, shards: 0 };
      draws.push({
        characterId: c.id,
        duplicate,
        shards: duplicate ? config.economy.duplicateShards : 0,
      });
    }
    return { draws, cost };
  }
  if (path === "/api/character/awaken") {
    assert(
      Number.isInteger(body.characterId) &&
        Object.hasOwn(p.characters, body.characterId),
      "所持キャラクターを選択してください。",
      403,
    );
    const c = p.characters[body.characterId];
    assert(c && c.shards >= 10, "育成には欠片10個が必要です。", 409);
    c.shards -= 10;
    c.exp += 30;
    return { exp: c.exp, shards: c.shards };
  }
  if (path === "/api/battle/start") {
    if (p.pendingBattle)
      return { id: p.pendingBattle.id, result: p.pendingBattle.result };
    if (p.battleDay !== day) {
      p.battleDay = day;
      p.battleCount = 0;
    }
    assert(
      p.battleCount < config.battle.dailyLimit,
      "本日の戦闘は終了しました。明日04:00 JSTに再開できます。",
      409,
    );
    assert(
      Number.isInteger(body.characterId) &&
        Object.hasOwn(p.characters, body.characterId),
      "所持キャラクターを選択してください。",
    );
    const seed = newSeed(),
      result = simulateBattle(
        p,
        body.characterId,
        seed,
        dailyCondition(p, day),
      );
    p.battleCount++;
    p.pendingBattle = {
      id: crypto.randomUUID(),
      seed,
      result,
      startedAt: ms,
      day,
    };
    return { id: p.pendingBattle.id, result };
  }
  if (path === "/api/battle/finish") {
    const b = p.pendingBattle;
    const previous = p.battleHistory.find((b) => b.id === body.battleId);
    if (previous) return previous;
    assert(b && b.id === body.battleId, "戦闘記録が見つかりません。", 409);
    p.rc += b.result.rc;
    p.characters[b.result.characterId].exp += b.result.exp;
    const record = { ...b, finishedAt: iso(ms) };
    p.battleHistory.push(record);
    p.pendingBattle = null;
    return record;
  }
  throw new GameError("この機能は利用できません。", 404);
}
