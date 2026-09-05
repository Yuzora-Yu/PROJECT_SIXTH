import http from "node:http";
import { readFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { handleApi } from "../worker/api.js";
import { localDatabase } from "./sqlite.mjs";
const root = path.resolve(import.meta.dirname, "..");
await mkdir(path.join(root, ".local"), { recursive: true });
const db = localDatabase(path.join(root, ".local/sixth.sqlite"));
for (const migration of (await readdir(path.join(root, "migrations")))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort())
  db.native.exec(await readFile(path.join(root, "migrations", migration), "utf8"));

// Cloudflare's published dummy credentials are intentionally used only by the
// local development server. They accept dummy Turnstile tokens and have no
// production authority.
const localRuntime = {
  DB: db,
  ENVIRONMENT: "local",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  TURNSTILE_EXPECTED_HOSTNAME: "",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${process.env.PORT || 4173}`,
        url = new URL(req.url, origin);
      if (url.pathname === "/project_sixth") {
        res.writeHead(308, { Location: "/project_sixth/" });
        res.end();
        return;
      }
      const scoped = url.pathname.startsWith("/project_sixth/");
      if (scoped) url.pathname = url.pathname.slice("/project_sixth".length);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 32768) {
            res.writeHead(413);
            res.end();
            return;
          }
          chunks.push(chunk);
        }
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(!["GET", "HEAD"].includes(req.method)
            ? { body: Buffer.concat(chunks) }
            : {}),
        });
        const response = await handleApi(
          request,
          localRuntime,
          undefined,
          scoped ? "/project_sixth/" : "/",
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const pathname = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      if (
        !/^\/(index\.html|css\/|js\/|shared\/|assets\/|vendor\/|data\/prisma\/catalog\.js)/.test(
          pathname,
        ) ||
        pathname.includes("..")
      ) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const target = path.resolve(root, "." + pathname);
      if (!target.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      await stat(target);
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(await readFile(target));
    } catch (e) {
      res.writeHead(e.code === "ENOENT" ? 404 : 500);
      res.end("Not available");
    }
  })
  .listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
    console.log(`PROJECT SIXTH: http://127.0.0.1:${process.env.PORT || 4173}`),
  );
