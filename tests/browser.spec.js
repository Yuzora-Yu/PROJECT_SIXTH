import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function enter(page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "第六感強化計画へようこそ。" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "研究所ロビーへ", exact: true })
    .click();
}
test("desktop and phone journeys, daily/training, summon, battle, privacy and responsive layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await mkdir("test-results/screens", { recursive: true });
  await page.screenshot({
    path: "test-results/screens/home-desktop.png",
    fullPage: true,
  });
  await page.locator('[data-action="training-card"]').count();
  await page.locator('[data-action="daily-card"]').click();
  await page.locator('[data-card="0"]').click();
  await expect(page.locator("#card-result")).toContainText("+10 RC");
  await page.locator('[data-action="close"]').click();
  await expect(page.locator("#account")).toContainText("310");
  await page.locator('[data-action="daily-card"]').click();
  await expect(page.locator("#dialog-title")).toHaveText(
    "本日の試験は完了しました。",
  );
  await page.locator('[data-action="training-card"]').click();
  await page.locator('[data-card="1"]').click();
  await expect(page.locator("#card-result")).toContainText(
    "恒久XP・RCへの反映はありません",
  );
  await page.locator('[data-action="close"]').click();
  await expect(page.locator("#account")).toContainText("310");
  await page.goto("/#characters");
  await expect(
    page.getByRole("heading", { name: "共鳴する、仲間たち。" }),
  ).toBeVisible();
  await page.locator('[data-action="draw-1"]').click();
  await page.locator('[data-action="summon-1"]').click();
  await expect(page.locator("#dialog-title")).toHaveText(
    "共鳴が応答しました。",
  );
  await page.locator('[data-action="close"]').click();
  await expect(page.locator("#account")).toContainText("210");
  await page.goto("/#battle");
  await page.locator('[data-action="battle-start"]').click();
  await expect(page.locator('[data-action^="battle-finish-"]')).toBeVisible({
    timeout: 20000,
  });
  await page.locator('[data-action^="battle-finish-"]').click();
  await expect(page.locator("#main")).toContainText("残り 4 / 5");
  await page.goto("/#analyze");
  await page.locator("#birth-date").fill("2000-02-29");
  const outbound = [];
  page.on("request", (r) => {
    if (r.postData()) outbound.push(r.postData());
  });
  await page.locator('[data-action="astrology"]').click();
  await expect(page.locator("#astrology-result")).toContainText("魚座");
  expect(outbound.every((s) => !s.includes("2000-02-29"))).toBeTruthy();
  await page.locator('[data-action="birth-clear"]').click();
  await expect(page.locator("#birth-date")).toHaveValue("");
  await page.goto("/#home");
  await page.locator('#main [data-action="coming"]').click({ force: true });
  await expect(page.locator("#dialog-title")).toHaveText("開発中");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/screens/home-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const route of [
    "home",
    "daily",
    "training",
    "characters",
    "battle",
    "analyze",
    "archive",
    "prediction",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("#main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route + " horizontal overflow",
    ).toBeTruthy();
  }
  await page.goto("/#home");
  await page.reload();
  await expect(page.locator("#account")).not.toContainText("300 RC");
  expect(errors).toEqual([]);
});
test("five sequential pattern questions complete with server reward", async ({
  page,
}) => {
  await enter(page);
  await page.locator('[data-action="daily-pattern"]').click();
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('[data-choice="0"]')).toBeEnabled({
      timeout: 10000,
    });
    await page.locator('[data-choice="0"]').click();
  }
  await expect(page.locator("#dialog-title")).toHaveText("潜在法則の観測結果");
  await expect(page.locator("#account")).toContainText("310");
});
test("60-second particle daily completes and replay renders", async ({
  page,
}) => {
  await enter(page);
  await page.locator('[data-action="daily-particle"]').click();
  await page.locator("#particle-begin").click();
  await expect(page.locator("#particle-status")).toContainText("観測中", {
    timeout: 10000,
  });
  await page
    .locator("#particle-canvas")
    .click({ position: { x: 200, y: 100 } });
  await expect(page.locator("#dialog-title")).toHaveText("粒子観測の結果", {
    timeout: 75000,
  });
  await expect(page.locator("#account")).toContainText("310");
  await page.locator("#particle-replay").click();
  await expect(page.locator("#dialog-title")).toHaveText("観測の答え合わせ");
  await page.locator("#replay-time").fill("45000");
  await expect(page.locator("#replay-value")).toHaveText("45.0秒");
});
test("particle exit returns the daily right without rewards", async ({
  page,
}) => {
  await enter(page);
  await page.locator('[data-action="daily-particle"]').click();
  await page.locator("#particle-begin").click();
  await expect(page.locator("#particle-status")).toContainText("観測中", {
    timeout: 10000,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#account")).toContainText("300");
  await page.locator('[data-action="daily-particle"]').click();
  await expect(page.locator("#particle-begin")).toBeVisible();
});
