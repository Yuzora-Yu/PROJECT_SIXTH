import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
await mkdir(path.join(root, "vendor"), { recursive: true });
await copyFile(
  path.join(root, "node_modules/astronomy-engine/esm/astronomy.js"),
  path.join(root, "vendor/astronomy.js"),
);
const source = await readFile(path.join(root, "vendor/astronomy.js"), "utf8");
await writeFile(
  path.join(root, "vendor/ASTRONOMY-LICENSE.txt"),
  source.slice(0, source.indexOf("*/") + 2) + "\n",
);
