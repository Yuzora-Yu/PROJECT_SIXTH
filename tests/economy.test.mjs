import test from "node:test";
import assert from "node:assert/strict";
import { dayKey } from "../shared/core.js";
import { config } from "../shared/config.js";
import { newPlayer, perform, publicPlayer } from "../worker/game.js";

const time = Date.parse("2026-09-04T02:00:00Z");

test("two Daily tests and five completed battles award exactly 100 RC", () => {
  const player = newPlayer("economy", time);
  const initialRC = player.rc;

  const card = perform(player, "/api/daily/card/start", {}, time);
  const answer = player.attempts[`${dayKey(time)}:card`].answerIndex;
  const cardResult = perform(
    player,
    "/api/daily/card/answer",
    { attemptId: card.attemptId, selectedIndex: answer },
    time + 1000,
  );
  assert.equal(cardResult.rc, 20);

  const particle = perform(player, "/api/daily/particle/start", {}, time);
  const particleResult = perform(
    player,
    "/api/daily/particle/finish",
    { attemptId: particle.attemptId, taps: [], valid: true },
    time + config.particle.durationMs,
  );
  assert.equal(particleResult.rc, 30);

  for (let index = 0; index < config.battle.dailyLimit; index++) {
    const battle = perform(
      player,
      "/api/battle/start",
      { characterId: 101 },
      time + config.particle.durationMs,
    );
    assert.equal(battle.result.rc, 10);
    perform(
      player,
      "/api/battle/finish",
      { battleId: battle.id },
      time + config.particle.durationMs,
    );
  }

  assert.equal(player.rc - initialRC, 100);
});

test("a pending battle from the prior reward rule settles for 10 RC", () => {
  const player = newPlayer("legacy-battle", time);
  player.pendingBattle = {
    id: "legacy-loss",
    seed: 1,
    startedAt: time - 1000,
    day: dayKey(time),
    result: {
      characterId: 101,
      monsterId: 1,
      win: false,
      turns: [],
      rc: 0,
      exp: 5,
    },
  };

  assert.equal(publicPlayer(player, time).pendingBattle.result.rc, 10);
  const record = perform(
    player,
    "/api/battle/finish",
    { battleId: "legacy-loss" },
    time,
  );
  assert.equal(record.result.rc, 10);
  assert.equal(player.rc, config.economy.initialRC + 10);
});
