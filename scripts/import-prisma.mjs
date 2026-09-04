// Explicit, read-only source import. No writes, moves or deletes under sourceRoot.
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = process.argv[2];
if (!sourceRoot || path.resolve(sourceRoot) === root)
  throw new Error("Pass the read-only Prisma source directory.");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const records = [];
async function snapshot(dir, prefix = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, e.name);
    if (e.isDirectory())
      out.push(...(await snapshot(path.join(dir, e.name), rel)));
    else {
      const s = await stat(path.join(dir, e.name));
      out.push({ path: rel, size: s.size, mtime: s.mtimeMs });
    }
  }
  return out;
}
await mkdir(path.join(root, ".local"), { recursive: true });
await writeFile(
  path.join(root, ".local/prisma-before.json"),
  JSON.stringify(await snapshot(sourceRoot)),
);
async function copy(src, dest) {
  const bytes = await readFile(path.join(sourceRoot, src));
  await mkdir(path.dirname(path.join(root, dest)), { recursive: true });
  await copyFile(path.join(sourceRoot, src), path.join(root, dest));
  records.push({ source: src, destination: dest, sha256: sha(bytes) });
}
await copy("characters.js", "data/prisma/source/characters.js");
await copy("monsters.js", "data/prisma/source/monsters.js");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(
  await readFile(path.join(root, "data/prisma/source/characters.js"), "utf8"),
  context,
);
vm.runInContext(
  await readFile(path.join(root, "data/prisma/source/monsters.js"), "utf8"),
  context,
);
const axes = ["awareness", "foresight", "insight", "intuition", "resonance"];
const primary = [
  "awareness",
  "resonance",
  "foresight",
  "insight",
  "intuition",
  "resonance",
  "awareness",
  "foresight",
  "awareness",
  "resonance",
  "foresight",
  "insight",
];
const characters = context.window.CHARACTERS_DATA.slice(0, 12).map((c, i) => ({
  ...Object.fromEntries(
    ["id", "name", "job", "hp", "atk", "def", "spd", "mag", "mdef"].map((k) => [
      k,
      c[k],
    ]),
  ),
  primarySense: primary[i],
  senseAffinity: Object.fromEntries(
    axes.map((k, j) => [k, k === primary[i] ? 85 : 30 + ((i + j * 3) % 5) * 8]),
  ),
  face: `assets/prisma/face/${c.id}.webp`,
  image: `assets/prisma/characters/${c.id}.webp`,
}));
for (const c of characters) {
  await copy(`assets/characters/face/${c.id}.webp`, c.face);
  await copy(
    `assets/characters/fullbody-all-expressions/char_full_${c.id}_normal.webp`,
    c.image,
  );
}
const monsters = vm
  .runInContext("ALL_MONSTER_BASES.slice(0,3)", context)
  .map((c) => ({
    ...Object.fromEntries(
      ["id", "name", "hp", "atk", "def", "spd", "mag", "mdef"].map((k) => [
        k,
        c[k],
      ]),
    ),
    image: `assets/prisma/monsters/${c.id}.webp`,
  }));
for (const m of monsters)
  await copy(
    `assets/monsters/monster_${String(m.id).padStart(6, "0")}.webp`,
    m.image,
  );
await writeFile(
  path.join(root, "data/prisma/catalog.js"),
  `// Extracted from copies; affinity values are PROJECT SIXTH originals.\nexport const characters = ${JSON.stringify(characters, null, 2)};\nexport const monsters = ${JSON.stringify(monsters, null, 2)};\n`,
);
await writeFile(
  path.join(root, "docs/SOURCE_MAP.md"),
  `# コピー元・コピー先\n\n参照元: ${sourceRoot}\n\n画像・元マスタのコピーは無改変。data/prisma/catalog.jsはコピーしたマスタから名前/基本値を抽出し、新作独自適性を付加。source/の元マスタはブラウザ配信しない。\n\n|元ファイル|コピー先|SHA-256|\n|---|---|---|\n` +
    records
      .map((r) => `|${r.source}|${r.destination}|${r.sha256}|`)
      .join("\n") +
    "\n",
);
await writeFile(
  path.join(root, ".local/prisma-import.json"),
  JSON.stringify(records),
);
console.log(
  `Copied ${records.length} files; extracted ${characters.length} characters and ${monsters.length} monsters.`,
);
