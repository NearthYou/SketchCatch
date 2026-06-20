import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";

process.env.NODE_ENV = "test";

test("GET /health returns ok", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });

  await app.close();
});
