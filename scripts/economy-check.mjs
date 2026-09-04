import { newPlayer } from "../worker/game.js";
import { characters } from "../data/prisma/catalog.js";
import { simulateBattle } from "../js/battle/prisma-adapter.js";
import { config } from "../shared/config.js";
const rows = characters.map((c) => {
  const p = newPlayer("simulation", 0);
  p.characters[c.id] = { exp: 0, shards: 0 };
  let wins = 0;
  for (let s = 0; s < 1000; s++) wins += Number(simulateBattle(p, c.id, s).win);
  return { name: c.name, winRate: wins / 1000 };
});
console.table(rows);
console.log(
  `Daily tests: ${config.economy.dailyRC * 3} RC/day. Battles: at most ${config.battle.winRC * 5} RC/day. Combined daily ceiling: 80 RC. Single summon: 100 RC; ten summons: 900 RC. No training rewards.`,
);
if (rows.some((r) => r.winRate < 0.3))
  throw new Error("A starting character wins fewer than 30% of trials.");
