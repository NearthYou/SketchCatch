import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Writable } from "node:stream";
import Fastify from "fastify";
import type { ApiErrorResponse } from "@sketchcatch/types";
import { buildApp, createApiLoggerOptions } from "./app.js";

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

test("trusts ALB forwarded protocol and client IP headers", async () => {
  const app = buildApp();

  app.get("/forwarded-context", async (request) => ({
    ip: request.ip,
    protocol: request.protocol
  }));

  const response = await app.inject({
    headers: {
      "x-forwarded-for": "203.0.113.10, 10.0.0.5",
      "x-forwarded-proto": "https"
    },
    method: "GET",
    url: "/forwarded-context"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ip: "203.0.113.10",
    protocol: "https"
  });

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

test("OPTIONS preflight allows the configured public web origin", async () => {
  const previousPublicBaseUrl = process.env.SKETCHCATCH_PUBLIC_BASE_URL;
  process.env.SKETCHCATCH_PUBLIC_BASE_URL = "http://127.0.0.1:3002";
  const app = buildApp();

  try {
    const response = await app.inject({
      headers: {
        "access-control-request-headers": "content-type,authorization",
        "access-control-request-method": "POST",
        origin: "http://127.0.0.1:3002"
      },
      method: "OPTIONS",
      url: "/api/projects/11111111-1111-4111-8111-111111111111/source-repositories"
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "http://127.0.0.1:3002");
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  } finally {
    if (previousPublicBaseUrl === undefined) {
      delete process.env.SKETCHCATCH_PUBLIC_BASE_URL;
    } else {
      process.env.SKETCHCATCH_PUBLIC_BASE_URL = previousPublicBaseUrl;
    }
    await app.close();
  }
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

test("API logger options stay disabled in tests", () => {
  assert.equal(createApiLoggerOptions({ nodeEnv: "test" }), false);
});

test("API logger redaction explicitly covers root and request/response header wrappers", () => {
  const loggerOptions = createApiLoggerOptions({ nodeEnv: "production" });

  assert.notEqual(loggerOptions, false);
  if (loggerOptions === false) {
    assert.fail("Expected production logger options");
  }

  const redact = loggerOptions.redact;
  assert.ok(redact && !Array.isArray(redact));
  const paths = redact.paths;

  for (const wrapper of ["", "req.", "request.", "res.", "response."]) {
    assert.ok(paths.includes(`${wrapper}headers.authorization`));
    assert.ok(paths.includes(`${wrapper}headers.cookie`));
    assert.ok(paths.includes(`${wrapper}headers["set-cookie"]`));
  }
});

test("API logger censors sensitive headers in actual serialized Fastify output", async () => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    }
  });
  const loggerOptions = createApiLoggerOptions({
    nodeEnv: "production",
    stream
  });
  const app = Fastify({ logger: loggerOptions });
  const probes = {
    rootAuthorization: "Bearer root-authorization-probe",
    rootCookie: "root-cookie-probe=secret",
    rootSetCookie: "root-set-cookie-probe=secret",
    requestAuthorization: "Bearer request-authorization-probe",
    requestCookie: "request-cookie-probe=secret",
    requestSetCookie: "request-set-cookie-probe=secret",
    responseAuthorization: "Bearer response-authorization-probe",
    responseCookie: "response-cookie-probe=secret",
    responseSetCookie: "response-set-cookie-probe=secret"
  };

  app.log.info({
    headers: {
      authorization: probes.rootAuthorization,
      cookie: probes.rootCookie,
      "set-cookie": probes.rootSetCookie,
      "x-visible-root": "visible-root-probe"
    },
    request: {
      headers: {
        authorization: probes.requestAuthorization,
        cookie: probes.requestCookie,
        "set-cookie": probes.requestSetCookie,
        "x-visible-request": "visible-request-probe"
      }
    },
    response: {
      headers: {
        authorization: probes.responseAuthorization,
        cookie: probes.responseCookie,
        "set-cookie": probes.responseSetCookie,
        "x-visible-response": "visible-response-probe"
      }
    }
  });

  await app.close();
  stream.end();
  await once(stream, "finish");

  for (const probe of Object.values(probes)) {
    assert.equal(output.includes(probe), false);
  }
  assert.match(output, /visible-root-probe/);
  assert.match(output, /visible-request-probe/);
  assert.match(output, /visible-response-probe/);
});

function assertErrorResponse(
  body: ApiErrorResponse,
  expectedError: ApiErrorResponse["error"]
): void {
  assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
  assert.equal(body.error, expectedError);
  assert.equal(typeof body.message, "string");
}
