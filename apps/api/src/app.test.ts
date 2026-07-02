import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorResponse } from "@sketchcatch/types";
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
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("POST /api/auth/logout-all requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/logout-all"
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("DELETE /api/auth/me requires authentication", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "DELETE",
    url: "/api/auth/me"
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("unknown routes return the standard 404 error response", async () => {
  const app = buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/api/unknown"
  });

  assert.equal(response.statusCode, 404);
  assertErrorResponse(response.json() as ApiErrorResponse, "not_found");

  await app.close();
});

test("OPTIONS preflight allows project draft PUT requests", async () => {
  const app = buildApp();

  const response = await app.inject({
    headers: {
      "access-control-request-headers": "content-type,authorization",
      "access-control-request-method": "PUT",
      origin: "http://localhost:3000"
    },
    method: "OPTIONS",
    url: "/api/projects/11111111-1111-4111-8111-111111111111/draft"
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.match(String(response.headers["access-control-allow-methods"]), /PUT/);
  assert.match(String(response.headers["access-control-allow-headers"]), /authorization/);

  await app.close();
});

test("production 500 responses do not expose internal error messages", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const app = buildApp();

  app.get("/boom", async () => {
    throw new Error("internal diagnostic detail should stay server-side");
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/boom"
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: "internal_server_error",
      message: "Internal server error"
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    await app.close();
  }
});

function assertErrorResponse(
  body: ApiErrorResponse,
  expectedError: ApiErrorResponse["error"]
): void {
  assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
  assert.equal(body.error, expectedError);
  assert.equal(typeof body.message, "string");
}
