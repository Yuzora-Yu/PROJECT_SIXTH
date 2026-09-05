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
  await expect(page.locator("#card-result")).toContainText("+20 RC");
  await page.locator('[data-action="close"]').click();
  await expect(page.locator("#account")).toContainText("420");
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
  await expect(page.locator("#account")).toContainText("420");
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
  await expect(page.locator("#account")).toContainText("320");
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
  await page.goto("/#prediction");
  await expect(page.getByRole("heading", { name: "現実予測" })).toBeVisible();
  await expect(page.locator(".prediction-card")).toHaveCount(12);
  await expect(page.locator("#main")).not.toContainText("開発中");
  const firstPrediction = page.locator(".prediction-card").first();
  const firstChoice = firstPrediction.locator(".prediction-choice").first();
  await firstChoice.click();
  await expect(firstChoice).toHaveAttribute("aria-pressed", "true");
  await expect(firstPrediction).toContainText("記録済み");
  await page.reload();
  await expect(
    page
      .locator(".prediction-card")
      .first()
      .locator(".prediction-choice")
      .first(),
  ).toHaveAttribute("aria-pressed", "true");
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
test("30-second particle daily completes and replay renders", async ({
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
    timeout: 45000,
  });
  await expect(page.locator("#account")).toContainText("430");
  await page.locator("#particle-replay").click();
  await expect(page.locator("#dialog-title")).toHaveText("観測の答え合わせ");
  await page.locator("#replay-time").fill("25000");
  await expect(page.locator("#replay-value")).toHaveText("25.0秒");
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
  await expect(page.locator("#account")).toContainText("400");
  await page.locator('[data-action="daily-particle"]').click();
  await expect(page.locator("#particle-begin")).toBeVisible();
});
