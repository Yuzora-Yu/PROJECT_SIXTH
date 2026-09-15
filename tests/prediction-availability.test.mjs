import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../shared/config.js";
import { handleApi } from "../worker/api.js";

test("reality prediction is under development in the shared release config", () => {
  assert.equal(config.predictionsEnabled, false);
});

test("disabled prediction endpoints cannot access data, settle, or accept votes", async () => {
  const runtime = {
    DB: {
      prepare() {
        throw new Error("Database must stay untouched");
      },
    },
  };
  for (const [method, path] of [
    ["GET", "/api/predictions"],
    ["POST", "/api/predictions/PRED-20260904-001/bet"],
    ["POST", "/api/predictions/PRED-20260904-001/vote"],
  ]) {
    const response = await handleApi(
      new Request("http://localhost" + path, {
        method,
        headers: { "X-Sixth-Client": "1" },
      }),
      runtime,
    );
    assert.equal(response.status, 409);
    assert.match(JSON.stringify(await response.json()), /現実予測は開発中/);
  }
});
