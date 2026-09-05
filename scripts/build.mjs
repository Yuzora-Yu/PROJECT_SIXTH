import { cp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
if (!dist.startsWith(root + path.sep))
  throw new Error("dist directory escaped the project root");
await import("./prepare-vendor.mjs");
for (const dir of ["shared", "js", "worker", "scripts"]) {
  async function check(folder) {
    for (const e of await readdir(folder, { withFileTypes: true })) {
      const f = path.join(folder, e.name);
      if (e.isDirectory()) await check(f);
      else if (/\.m?js$/.test(f)) {
        const r = spawnSync(process.execPath, ["--check", f], {
          encoding: "utf8",
        });
        if (r.status !== 0) throw new Error(r.stderr);
      }
    }
  }
  await check(path.join(root, dir));
}
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(root, "dist/data/prisma"), { recursive: true });
for (const f of ["index.html", "css", "js", "shared", "assets", "vendor"])
  await cp(path.join(root, f), path.join(root, "dist", f), { recursive: true });
await cp(
  path.join(root, "data/prisma/catalog.js"),
  path.join(root, "dist/data/prisma/catalog.js"),
);
await writeFile(
  path.join(root, "dist/_headers"),
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'\n`,
);
console.log("Build passed. dist contains public assets only.");
