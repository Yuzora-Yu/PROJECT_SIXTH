import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('initial HTML explains the game and development status without JavaScript', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
  assert.match(main, /第六感強化計画 — PROJECT SIXTH/);
  assert.match(main, /現実予測メニューは開発中/);
  assert.match(main, /<noscript>/);
  assert.match(html, /href="https:\/\/yu-zora.com\/contact\/"/);
});
