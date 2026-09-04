import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("subdirectory training refresh, private profiles, image and X sharing", async ({
  page,
}) => {
  const errors = [],
    apiUrls = [],
    posts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiUrls.push(r.url());
    if (r.postData()) posts.push(r.postData());
  });
  await page.goto("/project_sixth/#training");
  await page
    .getByRole("button", { name: "研究所ロビーへ", exact: true })
    .click();
  await page.locator('#main [data-action="training-card"]').click();
  await page.locator('[data-card="0"]').click();
  await expect(page.locator("#main")).toContainText("記録 1 回");
  await expect(page.locator("#main")).toContainText("直近の記録");
  await page.locator("#card-result [data-share-image]").click();
  await expect(page.locator(".share-dialog")).toBeVisible();
  await expect(page.locator(".share-dialog img")).toHaveJSProperty(
    "naturalWidth",
    1080,
  );
  const xUrl = new URL(
    await page.locator('.share-dialog a[target="_blank"]').getAttribute("href"),
  );
  expect(xUrl.searchParams.get("url")).toBe(
    "https://yu-zora.com/project_sixth/",
  );
  expect(xUrl.searchParams.get("hashtags")).toBe("第六感強化計画,PROJECTSIXTH");
  await mkdir("test-results/screens", { recursive: true });
  const download = page.waitForEvent("download");
  await page.locator(".share-dialog a[download]").click();
  await (await download).saveAs("test-results/screens/training-share.png");
  await page.getByRole("button", { name: "共有画像を閉じる" }).click();
  await page.locator('#dialog [data-action="close"]').click();
  await page.goto("/project_sixth/#archive");
  await expect(page.locator(".record-row").first()).toContainText("訓練");
  await page.goto("/project_sixth/#analyze");
  await page.locator("#birth-date").fill("2000-01-08");
  await page.locator('[data-action="astrology"]').click();
  await expect(page.locator("#astrology-result")).toContainText(
    "数秘 11 / マスターナンバー",
  );
  await expect(page.locator("#astrology-result")).toContainText(
    "出生時刻は未入力",
  );
  await expect(page.locator("#astrology-result tbody tr")).toHaveCount(10);
  await page.locator("#birth-time").fill("08:30");
  await page.locator('[data-action="astrology"]').click();
  await expect(page.locator("#astrology-result")).toContainText(
    "入力した出生時刻",
  );
  await page.locator("#mbti-type").selectOption("INFJ");
  await page.locator('[data-action="mbti-save"]').click();
  await expect(page.locator("#mbti-result")).toContainText("INFJ");
  await page.reload();
  await expect(page.locator("#mbti-type")).toHaveValue("INFJ");
  await expect(page.locator("#birth-time")).toHaveValue("08:30");
  expect(
    posts.every(
      (s) =>
        !s.includes("2000-01-08") &&
        !s.includes("INFJ") &&
        !s.includes("08:30"),
    ),
  ).toBeTruthy();
  expect(
    apiUrls.every((url) =>
      new URL(url).pathname.startsWith("/project_sixth/api/"),
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/screens/profiles-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator('[data-action="birth-clear"]').click();
  await expect(page.locator("#birth-date")).toHaveValue("");
  await expect(page.locator("#birth-time")).toHaveValue("");
  await page.locator('[data-action="mbti-clear"]').click();
  await expect(page.locator("#mbti-result")).toBeEmpty();
  expect(errors).toEqual([]);
});
