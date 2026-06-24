import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

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

test("GET /api/projects requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/projects"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "unauthorized");

  await app.close();
});

test("POST /api/auth/logout-all requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/logout-all"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "unauthorized");

  await app.close();
});
