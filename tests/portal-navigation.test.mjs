import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("header and footer share the portal category order", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const menus = [...html.matchAll(/<nav class="(?:portal-navigation|footer-site-nav)"[^>]*>([\s\S]*?)<\/nav>/g)];
  assert.equal(menus.length, 2);
  for (const [, menu] of menus) {
    assert.match(menu, /href="https:\/\/yu-zora\.com\/games\/" aria-current="location"/);
    const links = [...menu.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
      .filter(([, , label]) => label !== "YU-ZORAトップ")
      .map(([, href, label]) => [href, label]);
    assert.deepEqual(links, [
      ["https://yu-zora.com/games/", "GAMES"],
      ["https://yu-zora.com/tools/", "TOOLS"],
      ["https://yu-zora.com/bookshelf/", "BOOKS"],
      ["https://yu-zora.com/others/", "OTHERS"],
      ["https://yu-zora.com/about/", "ABOUT"],
    ]);
  }
});
