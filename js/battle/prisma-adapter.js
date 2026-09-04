import { characters, monsters } from "../../data/prisma/catalog.js";
import { config } from "../../shared/config.js";
import { seededRng, clamp, senseStats } from "../../shared/core.js";
export function senseBonuses(stats, character, condition = 0) {
  const n = (k) => clamp((stats[k] - 20) / 80, 0, 1);
  return {
    evade: n("awareness") * 0.08,
    initiative: n("foresight") * 0.1,
    critical: n("insight") * 0.04,
    luck: n("intuition") * 0.05,
    support: n("resonance") * 0.08,
    damage: n("insight") * 0.1,
    synergy: clamp((stats[character.primarySense] / 100) * 0.02, 0, 0.02),
    condition: clamp(condition, 0, 10) / 100,
  };
}
// The copied base masters are adapted to a short auto battle; no legacy runtime globals.
export function simulateBattle(
  player,
  characterId,
  seed,
  condition = 0,
  withSense = true,
) {
  const c = characters.find((c) => c.id === characterId);
  const owned = player.characters[characterId];
  if (!c || !owned) throw new Error("所持キャラクターを選択してください。");
  const rng = seededRng(seed),
    enemy = monsters[Math.floor(rng() * monsters.length)];
  const level = 1 + Math.floor(owned.exp / 60),
    b = withSense
      ? senseBonuses(senseStats(player.senseXp), c, condition)
      : Object.fromEntries(
          Object.keys(senseBonuses(senseStats(player.senseXp), c)).map((k) => [
            k,
            0,
          ]),
        );
  const maxHp = c.hp * 3 + level * 4,
    enemyMaxHp = enemy.hp * 4;
  let hp = maxHp,
    enemyHp = enemyMaxHp;
  const turns = [];
  const attack = (power, def) =>
    Math.max(1, Math.floor((power * 0.5 - def * 0.25) * (0.9 + rng() * 0.2)));
  for (
    let turn = 1;
    turn <= config.battle.maxTurns && hp > 0 && enemyHp > 0;
    turn++
  ) {
    const heroFirst = c.spd + level >= enemy.spd || rng() < b.initiative;
    for (const who of heroFirst ? ["hero", "enemy"] : ["enemy", "hero"]) {
      if (hp <= 0 || enemyHp <= 0) break;
      if (who === "hero") {
        const crit = rng() < 0.05 + b.critical + b.luck / 2;
        const damage = Math.ceil(
          attack(Math.max(c.atk, c.mag) * 2 + level * 2, enemy.def) *
            (1 + b.damage + b.synergy + b.condition) *
            (crit ? 1.5 : 1),
        );
        enemyHp = Math.max(0, enemyHp - damage);
        turns.push({ turn, who, damage, crit, hp, enemyHp });
      } else {
        const evade = rng() < b.evade,
          damage = evade ? 0 : attack(enemy.atk * 1.4, c.def + level);
        hp = Math.max(0, hp - damage);
        if (hp > 0 && b.support > 0 && turn % 3 === 0)
          hp = Math.min(maxHp, hp + Math.ceil(maxHp * b.support));
        turns.push({ turn, who, damage, evade, hp, enemyHp });
      }
    }
  }
  const win = enemyHp === 0;
  return {
    battleCoreVersion: config.battleCoreVersion,
    characterId,
    enemyId: enemy.id,
    maxHp,
    enemyMaxHp,
    hp,
    enemyHp,
    win,
    turns,
    bonuses: b,
    rc: win ? config.battle.winRC : 0,
    exp: win ? config.battle.winEXP : config.battle.loseEXP,
  };
}
