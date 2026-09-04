import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("starter, profile layers, baseline, name and three consolidated share cards", async ({
  page,
}) => {
  const errors = [],
    posts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.postData()) posts.push(r.postData());
  });
  await page.goto("/project_sixth/#home");
  await expect(page.locator(".starter-choice")).toHaveCount(6);
  await page.locator('[data-action="starter-301"]').click();
  await expect(page.locator(".character-copy")).toContainText("アルス");
  await expect(page.locator(".character-copy")).toContainText("冒険者");
  await page.goto("/project_sixth/#characters");
  await expect(page.locator(".character-tile")).toHaveCount(30);
  await expect(page.locator(".character-tile.unowned")).toHaveCount(29);
  await page.locator('[data-action="character-301"]').click();
  await expect(page.locator("#dialog")).toContainText(/誕生日：\d{2}月\d{2}日/);
  await page.keyboard.press("Escape");
  await page.goto("/project_sixth/#training");
  await expect(page.locator('#main [data-action^="training-"]')).toHaveCount(2);
  await page.locator('#main [data-action="training-card"]').click();
  await page.locator('[data-card="0"]').click();
  await expect(page.locator("#main")).toContainText("記録 1 回");
  await expect(page.locator("#dialog [data-share-image]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto("/project_sixth/#home");
  await page.locator('#main [data-action="daily-card"]').click();
  await page.locator('[data-card="0"]').click();
  await expect(page.locator("#card-result")).toContainText("+10 RC");
  await page.keyboard.press("Escape");
  await page.goto("/project_sixth/#analyze");
  await page.locator("#subject-name").fill("夕空の観測者");
  await page.locator('[data-action="name-save"]').click();
  await expect(page.locator("#account")).toContainText("夕空の観測者");
  await page.locator("#birth-date").fill("2000-01-08");
  await page.locator("#birth-time").fill("08:30");
  await page.locator('[data-action="astrology"]').click();
  const base = await page
    .locator("#astrology-result svg")
    .first()
    .getAttribute("aria-label");
  const initial = await page
    .locator("#astrology-result svg")
    .nth(1)
    .getAttribute("aria-label");
  await page.locator("#mbti-type").selectOption("INFJ");
  await page.locator('[data-action="mbti-save"]').click();
  await expect(page.locator("#mbti-result")).toHaveText("INFJ（提唱者）");
  expect(
    await page
      .locator("#astrology-result svg")
      .first()
      .getAttribute("aria-label"),
  ).toBe(base);
  expect(
    await page
      .locator("#astrology-result svg")
      .nth(1)
      .getAttribute("aria-label"),
  ).not.toBe(initial);
  await expect(page.locator(".reading-letter p")).toHaveCount(3);
  await expect(page.locator("#panel-comprehensive")).toBeVisible();
  await page.locator("#tab-numeric").click();
  await expect(page.locator("#panel-numeric")).toBeVisible();
  await expect(page.locator("#panel-comprehensive")).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-comprehensive")).toBeFocused();
  await expect(page.locator("#panel-comprehensive")).toBeVisible();
  await page
    .locator(".signature-comparison")
    .screenshot({ path: "test-results/screens/profile-tabs.png" });
  await page.locator('[data-action="profile-apply"]').click();
  await expect(page.locator('[data-action="profile-apply"]')).toBeDisabled();
  await page.reload();
  await expect(page.locator('[data-action="profile-apply"]')).toBeDisabled();
  await expect(page.locator("#subject-name")).toHaveValue("夕空の観測者");
  await expect(page.locator("#main [data-share-image]")).toHaveCount(3);
  await expect(page.locator("#main")).toContainText("研究開始日");
  await expect(page.locator("#main")).toContainText("総研究日数");
  await mkdir("test-results/screens", { recursive: true });
  for (const [i, kind] of ["research", "numeric", "comprehensive"].entries()) {
    if (i > 0)
      await page
        .locator(i === 1 ? "#tab-numeric" : "#tab-comprehensive")
        .click();
    await page.locator("#main [data-share-image]").nth(i).click();
    await expect(page.locator(".share-dialog img")).toHaveJSProperty(
      "naturalWidth",
      1080,
    );
    const imageHeight = await page
      .locator(".share-dialog img")
      .evaluate((img) => img.naturalHeight);
    expect(imageHeight).toBeGreaterThanOrEqual(i === 1 ? 1080 : 1440);
    expect(imageHeight).toBeLessThan(2400);
    const x = new URL(
      await page
        .locator('.share-dialog a[target="_blank"]')
        .getAttribute("href"),
    );
    expect(x.searchParams.get("url")).toBe(
      "https://yu-zora.com/project_sixth/",
    );
    expect(x.searchParams.get("text")).toContain("夕空の観測者");
    const d = page.waitForEvent("download");
    await page.locator(".share-dialog a[download]").click();
    await (await d).saveAs("test-results/screens/v3-" + kind + ".png");
    await page.getByRole("button", { name: "共有画像を閉じる" }).click();
  }
  expect(
    posts.every((s) => !s.includes("2000-01-08") && !s.includes("08:30")),
  ).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/screens/v3-mobile.png",
    fullPage: true,
  });
  await page.locator('[data-action="mbti-clear"]').click();
  await expect(page.locator("#mbti-result")).toBeEmpty();
  await page.locator('[data-action="profile-reset"]').click();
  await expect(page.locator('[data-action="profile-reset"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
