import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  source = process.argv[2];
if (!source) throw new Error("Specify the original read-only directory.");
const before = JSON.parse(
  await readFile(path.join(root, ".local/prisma-before.json"), "utf8"),
);
async function snapshot(dir, prefix = "") {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, e.name);
    if (e.isDirectory())
      result.push(...(await snapshot(path.join(dir, e.name), rel)));
    else {
      const s = await stat(path.join(dir, e.name));
      result.push({ path: rel, size: s.size, mtime: s.mtimeMs });
    }
  }
  return result;
}
const after = await snapshot(source),
  old = new Map(before.map((f) => [f.path, f])),
  current = new Map(after.map((f) => [f.path, f]));
const changed = after
  .filter((f) => JSON.stringify(f) !== JSON.stringify(old.get(f.path)))
  .map((f) => f.path);
const removed = before.filter((f) => !current.has(f.path)).map((f) => f.path);
const imports = JSON.parse(
    await readFile(path.join(root, ".local/prisma-import.json"), "utf8"),
  ),
  hashMismatch = [];
const hash = (b) => createHash("sha256").update(b).digest("hex");
for (const f of imports)
  for (const [kind, file] of [
    ["source", path.join(source, f.source)],
    ["copy", path.join(root, f.destination)],
  ])
    if (hash(await readFile(file)) !== f.sha256)
      hashMismatch.push({ kind, file });
const result = {
  checkedAt: new Date().toISOString(),
  sourceFiles: before.length,
  afterFiles: after.length,
  metadataChanged: changed,
  removed,
  verifiedCopies: imports.length,
  hashMismatch,
  passed:
    changed.length === 0 && removed.length === 0 && hashMismatch.length === 0,
};
await writeFile(
  path.join(root, "docs/PRISMA_INTEGRITY.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
