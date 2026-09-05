import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function enter(page) {
  await page.goto("/project_sixth/");
  await page
    .getByRole("button", { name: "研究所ロビーへ", exact: true })
    .click();
}

async function renderedLines(locator) {
  return locator.evaluate((element) => {
    const lines = new Map();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      for (let index = 0; index < node.data.length; index++) {
        const character = node.data[index];
        if (/\s/.test(character)) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        const key = Math.round(rect.top);
        lines.set(key, (lines.get(key) || "") + character);
      }
    }
    return [...lines.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, text]) => text);
  });
}

async function expectSixNavigationItemsToFit(page) {
  const visibleLinks = page.locator("#navigation .nav-link:visible");
  await expect(visibleLinks).toHaveCount(6);
  const metrics = await visibleLinks.evaluateAll((links) =>
    links.map((link) => {
      const label = link.querySelector(".nav-label-short");
      const style = getComputedStyle(label);
      const linkRect = link.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        text: label.textContent,
        whiteSpace: style.whiteSpace,
        labelFits:
          label.scrollWidth <= label.clientWidth + 1 &&
          labelRect.left >= linkRect.left - 1 &&
          labelRect.right <= linkRect.right + 1,
        left: linkRect.left,
        right: linkRect.right,
        height: linkRect.height,
      };
    }),
  );
  expect(metrics).toHaveLength(6);
  expect(metrics.every((item) => item.whiteSpace === "nowrap")).toBeTruthy();
  expect(
    metrics.every((item) => item.labelFits && item.height >= 44),
    JSON.stringify(metrics),
  ).toBeTruthy();
  for (let index = 1; index < metrics.length; index++) {
    expect(metrics[index - 1].right).toBeLessThanOrEqual(
      metrics[index].left + 1,
    );
  }
}

async function expectNoHorizontalOverflow(page, route) {
  const result = await page.evaluate(() => ({
    documentFits: document.documentElement.scrollWidth <= innerWidth + 1,
    internal: [...document.querySelectorAll("#main *")]
      .filter((element) => {
        if (element.offsetParent === null) return false;
        const style = getComputedStyle(element);
        return (
          element.scrollWidth > element.clientWidth + 1 &&
          !["auto", "scroll", "hidden", "clip"].includes(style.overflowX) &&
          !["svg", "CANVAS"].includes(element.tagName)
        );
      })
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        overflow: element.scrollWidth - element.clientWidth,
      })),
  }));
  expect(result.documentFits, `${route} document overflow`).toBeTruthy();
  expect(result.internal, `${route} internal overflow`).toEqual([]);
}

async function expectReadableLastLine(locator, minimum = 3) {
  const count = await locator.count();
  for (let index = 0; index < count; index++) {
    const lines = await renderedLines(locator.nth(index));
    const meaningful = lines.at(-1).replace(/[。、！？）」』】]/g, "");
    expect(meaningful.length, JSON.stringify(lines)).toBeGreaterThanOrEqual(
      minimum,
    );
  }
}

async function expectFooterReachableAboveNavigation(page, route) {
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const positions = await page.evaluate(() => ({
    navigationTop: document.querySelector(".sidebar").getBoundingClientRect()
      .top,
    footerBottom: document.querySelector(".footer").getBoundingClientRect()
      .bottom,
  }));
  expect(
    positions.footerBottom,
    `${route} footer hidden by navigation`,
  ).toBeLessThanOrEqual(positions.navigationTop + 1);
}

test("phone navigation and primary copy keep readable line breaks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await enter(page);

  await expectSixNavigationItemsToFit(page);

  const heroLines = await renderedLines(page.locator(".hero h2"));
  expect(heroLines).toHaveLength(2);
  expect(heroLines.at(-1).length).toBeGreaterThanOrEqual(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();

  await page.goto("/project_sixth/#training");
  const titleLines = await renderedLines(page.locator(".screen-heading h1"));
  expect(titleLines).toHaveLength(1);
  const descriptions = page.locator(".lab-row p");
  for (let index = 0; index < (await descriptions.count()); index++) {
    const lines = await renderedLines(descriptions.nth(index));
    expect(lines.at(-1).length, JSON.stringify(lines)).toBeGreaterThanOrEqual(
      4,
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();

  await mkdir("test-results/screens", { recursive: true });
  await page.screenshot({
    path: "test-results/screens/mobile-layout-training.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("large text remains readable across primary phone screens", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("project-sixth:large-text", "true"),
  );
  await page.setViewportSize({ width: 360, height: 844 });
  await enter(page);
  await expect(page.locator("html")).toHaveClass(/large-text/);
  await mkdir("test-results/screens", { recursive: true });

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["home", "training", "analyze", "prediction"]) {
      await page.goto(`/project_sixth/#${route}`);
      await expect(page.locator("#main h1")).toBeVisible();
      await expectSixNavigationItemsToFit(page);
      await expectNoHorizontalOverflow(page, `${route} at ${width}px`);

      const topbarGap = await page.evaluate(() => {
        const breadcrumb = document
          .querySelector(".breadcrumb")
          .getBoundingClientRect();
        const account = document
          .querySelector(".account")
          .getBoundingClientRect();
        return account.left - breadcrumb.right;
      });
      expect(
        topbarGap,
        `${route} top bar overlap at ${width}px`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        await renderedLines(page.locator(".breadcrumb")),
        `${route} breadcrumb wrap at ${width}px`,
      ).toHaveLength(1);
      expect(
        await renderedLines(page.locator(".account .coin")),
        `${route} account wrap at ${width}px`,
      ).toHaveLength(1);

      if (route === "home") {
        const heroLines = await renderedLines(page.locator(".hero h2"));
        expect(heroLines).toHaveLength(2);
        await expectReadableLastLine(page.locator(".feature-link p"));
      } else if (route === "training") {
        expect(
          await renderedLines(page.locator(".screen-heading h1")),
        ).toHaveLength(1);
        await expectReadableLastLine(page.locator(".lab-row p"));
      } else if (route === "analyze") {
        await expectReadableLastLine(page.locator(".profile-section > h2"));
      } else {
        await expect(page.locator(".prediction-card").first()).toBeVisible();
        await expectReadableLastLine(page.locator(".prediction-card h2"));
      }

      await expectFooterReachableAboveNavigation(
        page,
        `${route} at ${width}px`,
      );
      if (route === "prediction" && width === 390) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: "test-results/screens/mobile-layout-prediction-large.png",
          animations: "disabled",
        });
      }
    }
  }
});
