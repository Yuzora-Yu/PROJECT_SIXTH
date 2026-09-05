import { newPlayer } from "../worker/game.js";
import { characters } from "../shared/roster.js";
import { simulateBattle } from "../js/battle/prisma-adapter.js";
import { config } from "../shared/config.js";
const rows = characters.map((c) => {
  const p = newPlayer("simulation", 0);
  p.characters[c.id] = { exp: 0, shards: 0 };
  let wins = 0,
    rewardMismatches = 0;
  for (let s = 0; s < 1000; s++) {
    const result = simulateBattle(p, c.id, s);
    wins += Number(result.win);
    rewardMismatches += Number(result.rc !== config.battle.completionRC);
  }
  return { name: c.name, winRate: wins / 1000, rewardMismatches };
});
console.table(rows);
const testTotal = Object.values(config.economy.dailyTestRC).reduce(
    (sum, rc) => sum + rc,
    0,
  ),
  battleTotal = config.battle.completionRC * config.battle.dailyLimit,
  activityTotal = testTotal + battleTotal;
console.log(
  `Daily tests: ${testTotal} RC/day (${config.economy.dailyTestRC.card} card + ${config.economy.dailyTestRC.particle} particle). Battles: ${battleTotal} RC/day (${config.battle.completionRC} x ${config.battle.dailyLimit}). Activities total: ${activityTotal} RC/day. Access bonus: ${config.economy.dailyAccessRC} RC/day. Single summon: ${config.economy.drawCost} RC; ten summons: ${config.economy.tenDrawCost} RC. No training rewards.`,
);
if (rows.some((r) => r.winRate < 0.3))
  throw new Error("A starting character wins fewer than 30% of trials.");
if (rows.some((r) => r.rewardMismatches))
  throw new Error("A completed battle did not award the configured 10 RC.");
if (
  config.economy.dailyTestRC.card !== 20 ||
  config.economy.dailyTestRC.particle !== 30 ||
  config.battle.completionRC !== 10 ||
  config.battle.dailyLimit !== 5 ||
  activityTotal !== 100
)
  throw new Error("Daily activity rewards must total exactly 100 RC.");
