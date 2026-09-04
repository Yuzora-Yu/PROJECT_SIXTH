import http from "node:http";
import { readFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { handleApi } from "../worker/api.js";
import { localDatabase } from "./sqlite.mjs";
const root = path.resolve(import.meta.dirname, "..");
await mkdir(path.join(root, ".local"), { recursive: true });
const db = localDatabase(path.join(root, ".local/sixth.sqlite"));
db.native.exec(
  await readFile(path.join(root, "migrations/0001_initial.sql"), "utf8"),
);
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
        const response = await handleApi(request, db);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const pathname = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      if (
        !/^\/(index\.html|css\/|js\/|shared\/|assets\/|data\/prisma\/catalog\.js)/.test(
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
