import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  ApiErrorResponse,
  AuthResponse,
  LoginLockedErrorResponse,
  PasswordResetConfirmResponse,
  PasswordResetRequestResponse,
  SignupAvailabilityResponse,
  SignupRequest
} from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken, hashToken } from "../auth/tokens.js";
import { hashPassword } from "../auth/password.js";
import type { Database, DatabaseClient } from "../db/client.js";
import { loginAttempts, passwordResetTokens, refreshTokens, users } from "../db/schema.js";
import type { RateLimitResult, RateLimiter } from "../rate-limit/in-memory-rate-limiter.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";
process.env.OAUTH_REDIRECT_BASE_URL = "http://localhost:3000";
process.env.SKETCHCATCH_PUBLIC_BASE_URL = "http://localhost:3000";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PASSWORD = "demo-password-123";
const REFRESH_TOKEN_COOKIE_NAME = "sketchcatch_refresh_token";
const CSRF_TOKEN_COOKIE_NAME = "sketchcatch_csrf_token";
const CSRF_TOKEN_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN = "csrf-token";

type UserRow = typeof users.$inferSelect;
type LoginAttemptRow = typeof loginAttempts.$inferSelect;
type RefreshTokenRow = typeof refreshTokens.$inferSelect;
type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
type UpdateCall = {
  table: unknown;
  values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow & PasswordResetTokenRow>;
  whereArgs: unknown[];
};

test("POST /api/auth/signup creates a user and session", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], []]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: signupPayload()
  });

  assert.equal(response.statusCode, 201);
  const body = response.json() as AuthResponse;
  assertAuthResponse(body, response.headers["set-cookie"], { persistent: false });
  assert.equal(body.user.username, "demo");
  assert.equal(body.user.email, "demo@example.com");
  assert.equal(fakeDb.userRows.length, 1);
  assert.equal(fakeDb.refreshTokenRows.length, 1);

  await app.close();
});

test("POST /api/auth/signup returns 409 for duplicate username", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[{ id: USER_ID }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: signupPayload()
  });

  assert.equal(response.statusCode, 409);
  assertErrorResponse(response.json() as ApiErrorResponse, "conflict");
  assert.equal(fakeDb.userRows.length, 0);

  await app.close();
});

test("POST /api/auth/signup returns 409 for duplicate email", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], [{ id: USER_ID }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: signupPayload()
  });

  assert.equal(response.statusCode, 409);
  assertErrorResponse(response.json() as ApiErrorResponse, "conflict");
  assert.equal(fakeDb.userRows.length, 0);

  await app.close();
});

test("POST /api/auth/signup rejects unaccepted terms or privacy consent", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], []]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      ...signupPayload(),
      privacyAccepted: false
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(fakeDb.userRows.length, 0);
  assert.equal(fakeDb.refreshTokenRows.length, 0);

  await app.close();
});

test("POST /api/auth/signup rejects passwords without three character categories", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], []]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      ...signupPayload(),
      password: "password123"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(fakeDb.userRows.length, 0);
  assert.equal(fakeDb.refreshTokenRows.length, 0);

  await app.close();
});

test("POST /api/auth/signup/availability checks username and email duplicates", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[{ id: USER_ID }], []]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup/availability",
    payload: {
      username: "Demo",
      email: "available@example.com"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as SignupAvailabilityResponse;
  assert.deepEqual(body, {
    usernameAvailable: false,
    emailAvailable: true
  });

  await app.close();
});

test("POST /api/auth/login returns a browser-session cookie for valid credentials by default", async () => {
  const user = await makeUserWithPassword(PASSWORD);
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], [user]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "demo",
      password: PASSWORD
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as AuthResponse;
  assertAuthResponse(body, response.headers["set-cookie"], { persistent: false });
  assert.equal(body.user.id, USER_ID);
  assert.equal(fakeDb.loginAttemptRows.at(-1)?.success, true);
  assert.equal(fakeDb.refreshTokenRows.length, 1);

  await app.close();
});

test("POST /api/auth/login returns a persistent cookie when rememberMe is true", async () => {
  const user = await makeUserWithPassword(PASSWORD);
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], [user]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "demo",
      password: PASSWORD,
      rememberMe: true
    }
  });

  assert.equal(response.statusCode, 200);
  assertAuthResponse(response.json() as AuthResponse, response.headers["set-cookie"], {
    persistent: true
  });
  assert.equal(fakeDb.refreshTokenRows.length, 1);

  await app.close();
});

test("POST /api/auth/login returns 401 for wrong password", async () => {
  const user = await makeUserWithPassword(PASSWORD);
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], [user], [], [{ failedAttemptCount: 0 }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "demo",
      password: "wrong-password"
    }
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");
  assert.equal(fakeDb.loginAttemptRows.at(-1)?.success, false);
  assert.equal(fakeDb.refreshTokenRows.length, 0);

  await app.close();
});

test("POST /api/auth/login returns 401 for users without password credentials", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], [makeUser({ passwordHash: null })], [], [{ failedAttemptCount: 0 }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "demo",
      password: PASSWORD
    }
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");
  assert.equal(fakeDb.loginAttemptRows.at(-1)?.success, false);
  assert.equal(fakeDb.refreshTokenRows.length, 0);

  await app.close();
});

test("POST /api/auth/login records the forwarded client IP behind proxies", async () => {
  const user = await makeUserWithPassword(PASSWORD);
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], [user], [], [{ failedAttemptCount: 0 }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: {
      "x-forwarded-for": "203.0.113.10, 10.0.0.5"
    },
    payload: {
      username: "demo",
      password: "wrong-password"
    }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(fakeDb.loginAttemptRows.at(-1)?.ipAddress, "203.0.113.10");

  await app.close();
});

test("POST /api/auth/login returns 429 after five failed attempts", async () => {
  const user = await makeUserWithPassword(PASSWORD);
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[], [user], [], [{ failedAttemptCount: 4 }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "demo",
      password: "wrong-password"
    }
  });

  assert.equal(response.statusCode, 429);
  const body = response.json() as LoginLockedErrorResponse;
  assertLoginLockedErrorResponse(body);
  assert.ok(fakeDb.loginAttemptRows.at(-1)?.lockedUntil);

  await app.close();
});

test("POST /api/auth/login only counts failures after the latest successful login", async () => {
  const user = await makeUserWithPassword(PASSWORD);
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [
      [],
      [user],
      [{ createdAt: new Date("2026-06-24T00:05:00.000Z") }],
      [{ failedAttemptCount: 0 }]
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "demo",
      password: "wrong-password"
    }
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");
  assert.equal(fakeDb.loginAttemptRows.at(-1)?.success, false);
  assert.equal(fakeDb.loginAttemptRows.at(-1)?.lockedUntil, null);

  await app.close();
});

test("POST /api/auth/password-reset/request stores a hashed reset token", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[await makeUserWithPassword(PASSWORD)]]
  });
  const emailRateLimiter = new RecordingRateLimiter();
  const ipRateLimiter = new RecordingRateLimiter();
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    passwordResetRequestEmailRateLimiter: emailRateLimiter,
    passwordResetRequestIpRateLimiter: ipRateLimiter
  });

  const response = await app.inject({
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.10, 10.0.0.5"
    },
    url: "/api/auth/password-reset/request",
    payload: {
      email: "demo@example.com"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as PasswordResetRequestResponse;
  assert.equal(body.ok, true);
  assert.equal(typeof body.debugResetToken, "string");
  assert.match(body.debugResetUrl ?? "", /^http:\/\/localhost:3000\/password-reset\/confirm\?/);
  assert.equal(fakeDb.passwordResetTokenRows.length, 1);
  assert.equal(fakeDb.passwordResetTokenRows[0]?.tokenHash, hashToken(body.debugResetToken ?? ""));
  assert.notEqual(fakeDb.passwordResetTokenRows[0]?.tokenHash, body.debugResetToken);
  assert.deepEqual(ipRateLimiter.keys, ["password-reset:request:ip:203.0.113.10"]);
  assert.deepEqual(emailRateLimiter.keys, ["password-reset:request:email:demo@example.com"]);

  await app.close();
});

test("POST /api/auth/password-reset/request does not reveal unknown email addresses", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/password-reset/request",
    payload: {
      email: "unknown@example.com"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json() as PasswordResetRequestResponse, { ok: true });
  assert.equal(fakeDb.passwordResetTokenRows.length, 0);

  await app.close();
});

test("POST /api/auth/password-reset/request returns 429 when IP rate limit is exceeded", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[await makeUserWithPassword(PASSWORD)]]
  });
  const emailRateLimiter = new RecordingRateLimiter();
  const ipRateLimiter = new RecordingRateLimiter({
    allowed: false,
    retryAfterSeconds: 37
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    passwordResetRequestEmailRateLimiter: emailRateLimiter,
    passwordResetRequestIpRateLimiter: ipRateLimiter
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/password-reset/request",
    payload: {
      email: "demo@example.com"
    }
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "37");
  assertErrorResponse(response.json() as ApiErrorResponse, "too_many_requests");
  assert.deepEqual(ipRateLimiter.keys, ["password-reset:request:ip:127.0.0.1"]);
  assert.deepEqual(emailRateLimiter.keys, []);
  assert.equal(fakeDb.selectResults.length, 1);
  assert.equal(fakeDb.passwordResetTokenRows.length, 0);

  await app.close();
});

test("POST /api/auth/password-reset/request returns 429 when email rate limit is exceeded", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[await makeUserWithPassword(PASSWORD)]]
  });
  const emailRateLimiter = new RecordingRateLimiter({
    allowed: false,
    retryAfterSeconds: 61
  });
  const ipRateLimiter = new RecordingRateLimiter();
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client,
    passwordResetRequestEmailRateLimiter: emailRateLimiter,
    passwordResetRequestIpRateLimiter: ipRateLimiter
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/password-reset/request",
    payload: {
      email: "Demo@Example.com"
    }
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "61");
  assertErrorResponse(response.json() as ApiErrorResponse, "too_many_requests");
  assert.deepEqual(ipRateLimiter.keys, ["password-reset:request:ip:127.0.0.1"]);
  assert.deepEqual(emailRateLimiter.keys, ["password-reset:request:email:demo@example.com"]);
  assert.equal(fakeDb.selectResults.length, 1);
  assert.equal(fakeDb.passwordResetTokenRows.length, 0);

  await app.close();
});

test("POST /api/auth/password-reset/confirm changes the password and revokes sessions", async () => {
  const resetToken = "valid-password-reset-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [
      [
        makePasswordResetToken({
          tokenHash: hashToken(resetToken)
        })
      ],
      [await makeUserWithPassword(PASSWORD)]
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/password-reset/confirm",
    payload: {
      resetToken,
      newPassword: "new-demo-password-123"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json() as PasswordResetConfirmResponse, { ok: true });
  assert.equal(fakeDb.transactionCalls, 1);
  assert.equal(fakeDb.updateCalls.length, 3);
  assert.equal(fakeDb.updateCalls[0]?.table, users);
  assert.equal(typeof fakeDb.updateCalls[0]?.values.passwordHash, "string");
  assert.notEqual(fakeDb.updateCalls[0]?.values.passwordHash, PASSWORD);
  assert.equal(fakeDb.updateCalls[1]?.table, passwordResetTokens);
  assert.ok(fakeDb.updateCalls[1]?.values.usedAt instanceof Date);
  assert.deepEqual(collectSqlColumnNames(fakeDb.updateCalls[1]?.whereArgs[0]).sort(), [
    "used_at",
    "user_id"
  ]);
  assert.deepEqual(collectSqlParamValues(fakeDb.updateCalls[1]?.whereArgs[0]), [USER_ID]);
  assert.equal(fakeDb.updateCalls[2]?.table, refreshTokens);
  assert.ok(fakeDb.updateCalls[2]?.values.revokedAt instanceof Date);

  await app.close();
});

test("POST /api/auth/password-reset/confirm rejects passwords without three character categories", async () => {
  const resetToken = "valid-password-reset-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [
      [
        makePasswordResetToken({
          tokenHash: hashToken(resetToken)
        })
      ],
      [await makeUserWithPassword(PASSWORD)]
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/password-reset/confirm",
    payload: {
      resetToken,
      newPassword: "password123"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(fakeDb.updateCalls.length, 0);

  await app.close();
});

test("POST /api/auth/password-reset/confirm rejects expired reset tokens", async () => {
  const resetToken = "expired-password-reset-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [
      [
        makePasswordResetToken({
          expiresAt: new Date("2000-01-01T00:00:00.000Z"),
          tokenHash: hashToken(resetToken)
        })
      ]
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/password-reset/confirm",
    payload: {
      resetToken,
      newPassword: "new-demo-password-123"
    }
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");
  assert.equal(fakeDb.updateCalls.length, 0);

  await app.close();
});

test("POST /api/auth/refresh revokes active sessions when a revoked token is reused", async () => {
  const reusedRefreshToken = "reused-refresh-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [
      [
        makeRefreshToken({
          tokenHash: hashToken(reusedRefreshToken),
          revokedAt: new Date("2026-06-24T00:00:00.000Z")
        })
      ]
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    headers: authCookieHeaders(reusedRefreshToken)
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");
  assertClearedRefreshTokenCookie(response.headers["set-cookie"]);
  assert.equal(fakeDb.refreshTokenRows.length, 0);
  assert.equal(fakeDb.updateCalls.length, 1);
  assert.equal(fakeDb.updateCalls[0]?.table, refreshTokens);
  assert.ok(fakeDb.updateCalls[0]?.values.revokedAt instanceof Date);

  await app.close();
});

test("POST /api/auth/refresh rotates the cookie refresh token and returns a new session", async () => {
  const refreshToken = "valid-refresh-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [
      [
        makeRefreshToken({
          tokenHash: hashToken(refreshToken)
        })
      ],
      [makeUser()]
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    headers: authCookieHeaders(refreshToken)
  });

  assert.equal(response.statusCode, 200);
  assertAuthResponse(response.json() as AuthResponse, response.headers["set-cookie"]);
  assert.equal(fakeDb.updateCalls.length, 1);
  assert.equal(fakeDb.updateCalls[0]?.table, refreshTokens);
  assert.equal(fakeDb.refreshTokenRows.length, 1);

  await app.close();
});

test("POST /api/auth/refresh preserves browser-session refresh token persistence", async () => {
  const refreshToken = "session.valid-refresh-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [
      [
        makeRefreshToken({
          tokenHash: hashToken(refreshToken)
        })
      ],
      [makeUser()]
    ]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    headers: authCookieHeaders(refreshToken)
  });

  assert.equal(response.statusCode, 200);
  assertAuthResponse(response.json() as AuthResponse, response.headers["set-cookie"], {
    persistent: false
  });
  assert.equal(fakeDb.updateCalls.length, 1);
  assert.equal(fakeDb.refreshTokenRows.length, 1);

  await app.close();
});

test("POST /api/auth/refresh rejects requests without the CSRF header", async () => {
  const refreshToken = "csrf-refresh-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: []
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    headers: {
      cookie: `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}; ${CSRF_TOKEN_COOKIE_NAME}=${CSRF_TOKEN}`
    }
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");
  assertClearedRefreshTokenCookie(response.headers["set-cookie"]);
  assert.equal(fakeDb.updateCalls.length, 0);

  await app.close();
});

test("POST /api/auth/logout revokes the cookie refresh token and clears the cookie", async () => {
  const refreshToken = "logout-refresh-token";
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: []
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/logout",
    headers: authCookieHeaders(refreshToken)
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.equal(fakeDb.updateCalls.length, 1);
  assert.equal(fakeDb.updateCalls[0]?.table, refreshTokens);
  assertClearedRefreshTokenCookie(response.headers["set-cookie"]);

  await app.close();
});

test("GET /api/auth/me returns the active user", async () => {
  const user = makeUser();
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[{ id: USER_ID, deletedAt: null }], [user]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: await authHeaders(USER_ID)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.id, USER_ID);
  assert.equal(response.json().user.username, "demo");

  await app.close();
});

test("GET /api/auth/me returns 401 for a deleted user", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[{ id: USER_ID, deletedAt: new Date() }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: await authHeaders(USER_ID)
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

test("GET /api/projects returns 401 for a deleted user", async () => {
  const fakeDb = new AuthScenarioFakeDb({
    selectResults: [[{ id: USER_ID, deletedAt: new Date() }]]
  });
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/projects",
    headers: await authHeaders(USER_ID)
  });

  assert.equal(response.statusCode, 401);
  assertErrorResponse(response.json() as ApiErrorResponse, "unauthorized");

  await app.close();
});

function signupPayload(): SignupRequest {
  return {
    username: "demo",
    email: "demo@example.com",
    nickname: "Demo",
    password: PASSWORD,
    privacyAccepted: true,
    termsAccepted: true
  };
}

async function authHeaders(userId: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(userId)}`
  };
}

function authCookieHeaders(refreshToken: string): Record<string, string> {
  return {
    cookie: `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}; ${CSRF_TOKEN_COOKIE_NAME}=${CSRF_TOKEN}`,
    [CSRF_TOKEN_HEADER_NAME]: CSRF_TOKEN
  };
}

function assertAuthResponse(
  body: AuthResponse,
  setCookieHeader: string | string[] | undefined,
  options: {
    persistent?: boolean;
  } = {}
): void {
  assert.deepEqual(Object.keys(body).sort(), ["session", "user"]);
  assert.deepEqual(Object.keys(body.user).sort(), [
    "createdAt",
    "email",
    "id",
    "nickname",
    "username"
  ]);
  assert.deepEqual(Object.keys(body.session).sort(), ["accessToken", "expiresInSeconds"]);
  assert.equal(typeof body.session.accessToken, "string");
  assert.equal(typeof body.session.expiresInSeconds, "number");
  assertRefreshTokenCookie(setCookieHeader, {
    persistent: options.persistent !== false
  });
}

function assertErrorResponse(
  body: ApiErrorResponse,
  expectedError: ApiErrorResponse["error"]
): void {
  assert.deepEqual(Object.keys(body).sort(), ["error", "message"]);
  assert.equal(body.error, expectedError);
  assert.equal(typeof body.message, "string");
}

function assertLoginLockedErrorResponse(body: LoginLockedErrorResponse): void {
  assert.deepEqual(Object.keys(body).sort(), ["error", "lockedUntil", "message"]);
  assert.equal(body.error, "too_many_requests");
  assert.equal(typeof body.message, "string");
  assert.equal(typeof body.lockedUntil, "string");
}

function assertRefreshTokenCookie(
  setCookieHeader: string | string[] | undefined,
  options: {
    persistent: boolean;
  }
): void {
  const cookies = getSetCookieHeaders(setCookieHeader);
  const cookie = getCookieHeader(cookies, REFRESH_TOKEN_COOKIE_NAME);
  const csrfCookie = getCookieHeader(cookies, CSRF_TOKEN_COOKIE_NAME);

  assert.match(cookie, new RegExp(`^${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/api\/auth/);
  assert.match(csrfCookie, new RegExp(`^${CSRF_TOKEN_COOKIE_NAME}=`));
  assert.doesNotMatch(csrfCookie, /HttpOnly/);
  assert.match(csrfCookie, /SameSite=Lax/);

  if (options.persistent) {
    assert.match(cookie, /Max-Age=2592000/);
    assert.match(csrfCookie, /Max-Age=2592000/);
  } else {
    assert.doesNotMatch(cookie, /Max-Age=/);
    assert.doesNotMatch(csrfCookie, /Max-Age=/);
  }
}

function assertClearedRefreshTokenCookie(setCookieHeader: string | string[] | undefined): void {
  const cookies = getSetCookieHeaders(setCookieHeader);
  const cookie = getCookieHeader(cookies, REFRESH_TOKEN_COOKIE_NAME);
  const csrfCookie = getCookieHeader(cookies, CSRF_TOKEN_COOKIE_NAME);

  assert.match(cookie, new RegExp(`^${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.match(cookie, /Max-Age=0/);
  assert.match(csrfCookie, new RegExp(`^${CSRF_TOKEN_COOKIE_NAME}=`));
  assert.match(csrfCookie, /Max-Age=0/);
}

function getSetCookieHeaders(setCookieHeader: string | string[] | undefined): string[] {
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  if (cookies.length === 0) {
    assert.fail("Expected Set-Cookie header");
  }

  return cookies;
}

function getCookieHeader(cookies: string[], cookieName: string): string {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${cookieName}=`));

  if (!cookie) {
    assert.fail(`Expected ${cookieName} Set-Cookie header`);
  }

  return cookie;
}

async function makeUserWithPassword(password: string): Promise<UserRow> {
  return makeUser({
    passwordHash: await hashPassword(password)
  });
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER_ID,
    username: "demo",
    email: "demo@example.com",
    nickname: "Demo",
    passwordHash: "unused",
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    deletedAt: null,
    ...overrides
  };
}

function makeRefreshToken(overrides: Partial<RefreshTokenRow> = {}): RefreshTokenRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: USER_ID,
    tokenHash: hashToken("refresh-token"),
    expiresAt: new Date("2026-07-24T00:00:00.000Z"),
    revokedAt: null,
    userAgent: null,
    ipAddress: null,
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

function makePasswordResetToken(
  overrides: Partial<PasswordResetTokenRow> = {}
): PasswordResetTokenRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    userId: USER_ID,
    tokenHash: hashToken("password-reset-token"),
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    usedAt: null,
    userAgent: null,
    ipAddress: null,
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    ...overrides
  };
}

class AuthScenarioFakeDb {
  selectResults: unknown[][];
  userRows: UserRow[] = [];
  loginAttemptRows: LoginAttemptRow[] = [];
  refreshTokenRows: RefreshTokenRow[] = [];
  passwordResetTokenRows: PasswordResetTokenRow[] = [];
  transactionCalls = 0;
  updateCalls: UpdateCall[] = [];
  client: DatabaseClient;

  constructor(data: { selectResults: unknown[][] }) {
    this.selectResults = [...data.selectResults];
    this.client = {
      db: this.createDb() as Database,
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      delete: () => ({
        where: async () => undefined
      }),
      select: () => ({
        from: () => new SelectQuery(() => this.selectResults.shift() ?? [])
      }),
      insert: (table: unknown) => ({
        values: (
          values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow & PasswordResetTokenRow>
        ) => {
          const insertedRow = this.insertRow(table, values);

          return {
            returning: async () => [insertedRow]
          };
        }
      }),
      update: (table: unknown) => ({
        set: (
          values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow & PasswordResetTokenRow>
        ) => {
          const updateCall: UpdateCall = { table, values, whereArgs: [] };
          this.updateCalls.push(updateCall);

          return {
            where: async (...whereArgs: unknown[]) => {
              updateCall.whereArgs = whereArgs;

              return [];
            }
          };
        }
      }),
      transaction: async <T>(callback: (tx: Database) => Promise<T>) => {
        this.transactionCalls += 1;

        return callback(this.createDb() as Database);
      }
    };
  }

  private insertRow(
    table: unknown,
    values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow & PasswordResetTokenRow>
  ): unknown {
    if (table === users) {
      const row = makeUser(values as Partial<UserRow>);
      this.userRows.push(row);

      return row;
    }

    if (table === loginAttempts) {
      const row = values as LoginAttemptRow;
      this.loginAttemptRows.push(row);

      return row;
    }

    if (table === refreshTokens) {
      const row = values as RefreshTokenRow;
      this.refreshTokenRows.push(row);

      return row;
    }

    if (table === passwordResetTokens) {
      const row = values as PasswordResetTokenRow;
      this.passwordResetTokenRows.push(row);

      return row;
    }

    return values;
  }
}

class RecordingRateLimiter implements RateLimiter {
  readonly keys: string[] = [];

  constructor(private readonly result: RateLimitResult = { allowed: true }) {}

  consume(key: string): RateLimitResult {
    this.keys.push(key);

    return this.result;
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  orderBy(): Promise<unknown[]> {
    return Promise.resolve(this.resolveRows());
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}

function collectSqlColumnNames(value: unknown): string[] {
  const columnNames: string[] = [];
  collectSqlConditionParts(value, {
    onColumn: (name) => columnNames.push(name)
  });

  return columnNames;
}

function collectSqlParamValues(value: unknown): unknown[] {
  const paramValues: unknown[] = [];
  collectSqlConditionParts(value, {
    onParam: (paramValue) => paramValues.push(paramValue)
  });

  return paramValues;
}

function collectSqlConditionParts(
  value: unknown,
  visitors: {
    onColumn?: (name: string) => void;
    onParam?: (value: unknown) => void;
  }
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  const candidate = value as {
    columnType?: unknown;
    encoder?: unknown;
    name?: unknown;
    queryChunks?: unknown[];
    table?: unknown;
    value?: unknown;
  };

  if (
    typeof candidate.name === "string" &&
    typeof candidate.columnType === "string" &&
    candidate.table
  ) {
    visitors.onColumn?.(candidate.name);
    return;
  }

  if ("value" in candidate && candidate.encoder) {
    visitors.onParam?.(candidate.value);
    return;
  }

  if (Array.isArray(candidate.queryChunks)) {
    for (const chunk of candidate.queryChunks) {
      collectSqlConditionParts(chunk, visitors);
    }
  }
}
