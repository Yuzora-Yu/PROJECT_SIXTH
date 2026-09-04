import test from "node:test";
import assert from "node:assert/strict";
import { characters as master } from "../data/prisma/catalog.js";
import { characters, isAvailableCharacter } from "../shared/roster.js";
import {
  newPlayer,
  perform,
  publicPlayer,
  starterIds,
} from "../worker/game.js";
import { simulateBattle } from "../js/battle/prisma-adapter.js";
const ms = Date.parse("2026-09-04T03:00:00Z");
const deferred = [401, 403, 402, 501];

test("26 available characters govern summons and actions while all 30 master records survive", () => {
  assert.equal(master.length, 30);
  assert.equal(characters.length, 26);
  assert.deepEqual(
    master
      .filter((c) => !isAvailableCharacter(c.id))
      .map((c) => c.name)
      .sort(),
    ["ルーナ", "ルーナ", "ゼノン", "リュシオン"].sort(),
  );
  assert.ok(starterIds.every(isAvailableCharacter));
  const p = newPlayer("roster", ms);
  p.rc = 30000;
  for (let i = 0; i < 20; i++) {
    const result = perform(p, "/api/gacha/draw", { count: 10 }, ms);
    assert.ok(result.draws.every((c) => isAvailableCharacter(c.characterId)));
  }
  for (const id of deferred) {
    p.characters[id] = { exp: 120, shards: 20 };
    for (const path of [
      "/api/character/icon",
      "/api/character/awaken",
      "/api/battle/start",
    ]) {
      assert.throws(() => perform(p, path, { characterId: id }, ms));
    }
    assert.throws(() => simulateBattle(p, id, 123));
    assert.deepEqual(p.characters[id], { exp: 120, shards: 20 });
  }
  p.profileIconCharacterId = 401;
  const before = structuredClone(p);
  const visible = publicPlayer(p, ms);
  assert.ok(Object.keys(visible.characters).every(isAvailableCharacter));
  assert.ok(isAvailableCharacter(visible.profileIconCharacterId));
  assert.deepEqual(p, before);
});

test("an existing deferred battle is hidden and settled once without blocking future battles", () => {
  const p = newPlayer("legacy", ms);
  p.characters[401] = { exp: 120, shards: 20 };
  p.profileIconCharacterId = 401;
  p.battleCount = 1;
  p.pendingBattle = {
    id: "old-battle",
    day: p.battleDay,
    result: { characterId: 401, rc: 10, exp: 20 },
  };
  assert.equal(publicPlayer(p, ms).pendingBattle, null);
  const started = perform(p, "/api/battle/start", { characterId: 101 }, ms);
  assert.equal(started.result.characterId, 101);
  assert.equal(p.rc, 310);
  assert.deepEqual(p.characters[401], { exp: 140, shards: 20 });
  assert.equal(p.battleHistory[0].id, "old-battle");
  assert.equal(publicPlayer(p, ms).battleHistory.length, 0);
  perform(p, "/api/profile/name", { name: "観測者" }, ms);
  assert.equal(p.rc, 310);
  assert.equal(p.characters[401].exp, 140);
});
