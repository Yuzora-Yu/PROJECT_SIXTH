import test from "node:test";
import assert from "node:assert/strict";
import {
  numerologyProfile,
  planetaryProfile,
  mbtiNotes,
} from "../shared/profiles.js";
import { xIntent } from "../js/sharing.js";
import worker from "../worker/index.js";
import { SunPosition } from "../vendor/astronomy.js";
test("numerology distinguishes 2, 11, 22 and 33 with separate authored notes", () => {
  assert.equal(numerologyProfile("1980-01-01").life, 2);
  assert.equal(numerologyProfile("2000-01-08").life, 11);
  assert.equal(numerologyProfile("2000-09-29").life, 22);
  assert.equal(numerologyProfile("1990-09-05").life, 33);
  assert.notEqual(
    numerologyProfile("1980-01-01").comment,
    numerologyProfile("2000-01-08").comment,
  );
});
test("planet positions honor explicit UTC offset and distinguish unknown birth time", () => {
  const a = planetaryProfile("2000-02-29", "12:00", 9),
    b = planetaryProfile("2000-02-29", "03:00", 0);
  assert.deepEqual(a.planets, b.planets);
  assert.equal(a.planets.length, 10);
  assert.equal(a.planets[0].sign, "魚座");
  assert.equal(a.approximate, false);
  const solar = SunPosition(new Date("2000-02-29T03:00:00Z")).elon;
  assert.ok(Math.abs(a.planets[0].longitude - solar) < 0.03);
  assert.ok(a.planets.every((p) => p.longitude >= 0 && p.longitude < 360));
  const unknown = planetaryProfile("2000-02-29");
  assert.equal(unknown.approximate, true);
  assert.ok(unknown.aspects.every((a) => a.bodyA !== "月" && a.bodyB !== "月"));
  assert.throws(() => planetaryProfile("1700-01-01"));
  assert.throws(() => planetaryProfile("2000-01-01", "25:00"));
  assert.throws(() => planetaryProfile("2000-01-01", "12:00", 99));
});
test("16 MBTI results are explicit optional records, not generated diagnoses", () => {
  assert.equal(Object.keys(mbtiNotes).length, 16);
  assert.ok(Object.keys(mbtiNotes).every((k) => /^[IE][NS][TF][JP]$/.test(k)));
  assert.equal(new Set(Object.values(mbtiNotes)).size, 16);
});
test("X intent contains a short result, canonical URL and valid hashtags only", () => {
  const url = new URL(
    xIntent({ title: "数秘11", summary: "プロフィールを記録しました。" }),
  );
  assert.equal(url.hostname, "twitter.com");
  assert.equal(url.pathname, "/intent/tweet");
  assert.equal(
    url.searchParams.get("url"),
    "https://yu-zora.com/project_sixth/",
  );
  assert.equal(url.searchParams.get("hashtags"), "第六感強化計画,PROJECTSIXTH");
});
test("Worker scopes the subdirectory and canonical redirect without origin fallthrough", async () => {
  const env = {
    ASSETS: { fetch: (req) => new Response(new URL(req.url).pathname) },
  };
  const redirect = await worker.fetch(
    new Request("https://yu-zora.com/project_sixth?ref=x"),
    env,
  );
  assert.equal(redirect.status, 308);
  assert.equal(
    redirect.headers.get("Location"),
    "https://yu-zora.com/project_sixth/?ref=x",
  );
  assert.equal(
    await (
      await worker.fetch(new Request("https://yu-zora.com/project_sixth/"), env)
    ).text(),
    "/index.html",
  );
  assert.equal(
    await (
      await worker.fetch(
        new Request("https://yu-zora.com/project_sixth/js/app.js"),
        env,
      )
    ).text(),
    "/js/app.js",
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://yu-zora.com/project_sixth/api/bootstrap", {
          headers: { "X-Sixth-Client": "1" },
        }),
        env,
      )
    ).status,
    503,
  );
});
