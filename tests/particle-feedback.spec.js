import { test, expect } from "@playwright/test";
import { particleScene, particlePosition } from "../shared/particles.js";
import { mkdir } from "node:fs/promises";
async function enter(page) {
  await page.goto("/project_sixth/#home");
  await page
    .getByRole("button", { name: "研究所ロビーへ", exact: true })
    .click();
}
async function start(page) {
  await page.locator('#main [data-action="daily-particle"]').click();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/api/daily/particle/start"),
  );
  await page.locator("#particle-begin").click();
  const data = await (await response).json();
  await expect(page.locator("#particle-status")).toContainText("観測中");
  return data.result;
}
async function inputLogical(page, x, y) {
  await page.locator("#particle-canvas").evaluate(
    (canvas, p) => {
      const r = canvas.getBoundingClientRect(),
        s = getComputedStyle(canvas),
        l = parseFloat(s.borderLeftWidth),
        t = parseFloat(s.borderTopWidth);
      canvas.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "touch",
          clientX: r.left + l + (p.x / canvas.width) * (r.width - 2 * l),
          clientY: r.top + t + (p.y / canvas.height) * (r.height - 2 * t),
        }),
      );
    },
    { x, y },
  );
}
test("visible hit removes particle, miss and cooldown are explicit, server agrees at finish", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  const started = await start(page);
  expect(started.testVersion).toBe(4);
  await page.locator("#particle-canvas").click({ position: { x: 90, y: 60 } });
  await expect(page.locator("#particle-misses")).toHaveText("1");
  await inputLogical(page, 200, 100);
  await expect(page.locator("#particle-feedback")).toContainText("入力待ち");
  await expect(page.locator("#particle-misses")).toHaveText("1");
  await page.waitForFunction(
    () => Number(document.querySelector("#particle-timer")?.textContent) < 27.8,
  );
  const ms = Math.round(
      (30 - Number(await page.locator("#particle-timer").innerText())) * 1000,
    ),
    scene = particleScene(started.seed, 4),
    e = scene.events[0],
    pos = particlePosition(scene.particles[e.particleId], ms, e);
  const box = await page.locator("#particle-canvas").boundingBox();
  await page.mouse.click(
    box.x + 1 + (pos.x / 960) * (box.width - 2),
    box.y + 1 + (pos.y / 540) * (box.height - 2),
  );
  await expect(page.locator("#particle-found")).toHaveText("1 / 16");
  await expect(page.locator("#particle-feedback")).toContainText("発見！");
  await expect(page.locator("#particle-canvas")).toHaveAttribute(
    "data-discovered",
    "1",
  );
  await mkdir("test-results/screens", { recursive: true });
  await page
    .locator("#dialog")
    .screenshot({ path: "test-results/screens/particle-hit-feedback.png" });
  const result = page.waitForResponse(
    (r) => r.url().endsWith("/api/daily/particle/finish"),
    { timeout: 40000 },
  );
  const data = await (await result).json();
  expect(data.result.found).toBe(1);
  expect(data.result.falsePositives).toBe(1);
  expect(data.result.particleRuleVersion).toBe(4);
  await expect(page.locator("#dialog-title")).toHaveText("粒子観測の結果");
  expect(errors).toEqual([]);
});
test("phone-sized input area and reduced-motion feedback register the same anomaly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enter(page);
  const started = await start(page);
  await page.waitForFunction(
    () => Number(document.querySelector("#particle-timer")?.textContent) < 27.8,
  );
  const ms = Math.round(
      (30 - Number(await page.locator("#particle-timer").innerText())) * 1000,
    ),
    scene = particleScene(started.seed, 4),
    e = scene.events[0],
    pos = particlePosition(scene.particles[e.particleId], ms, e);
  // Deliberately offset by 45 logical px: within the visible 72px circle.
  await inputLogical(page, pos.x + (pos.x < 480 ? 45 : -45), pos.y);
  await expect(page.locator("#particle-found")).toHaveText("1 / 16");
  await expect(page.locator("#particle-feedback")).toContainText("発見！");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page
    .locator("#dialog")
    .screenshot({ path: "test-results/screens/particle-hit-mobile.png" });
  await page.keyboard.press("Escape");
});
