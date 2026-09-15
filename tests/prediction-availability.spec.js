import { test, expect } from "@playwright/test";

test("development menu works without fetching a prediction feed", async ({
  page,
}) => {
  const predictionRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/predictions"))
      predictionRequests.push(request.url());
  });
  await page.goto("/project_sixth/#prediction");
  await page
    .getByRole("button", { name: "研究所ロビーへ", exact: true })
    .click();
  await expect(page.locator("#main")).toContainText("現実予測は開発中です。");
  await expect(page.locator(".prediction-card")).toHaveCount(0);
  await page.locator('#main [data-action="training"]').click();
  await expect(page.locator("#main h1")).toContainText(
    "何度でも、観測しよう。",
  );
  await page.goto("/project_sixth/#archive");
  await expect(page.locator(".prediction-log")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/project_sixth/#prediction");
  await expect(page.locator("#main")).toContainText("現実予測は開発中です。");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(predictionRequests).toEqual([]);
});
