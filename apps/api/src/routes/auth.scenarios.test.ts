import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiErrorResponse, AuthResponse, LoginLockedErrorResponse } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken, hashToken } from "../auth/tokens.js";
import { hashPassword } from "../auth/password.js";
import type { Database, DatabaseClient } from "../db/client.js";
import { loginAttempts, refreshTokens, users } from "../db/schema.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PASSWORD = "demo-password-123";
const REFRESH_TOKEN_COOKIE_NAME = "sketchcatch_refresh_token";

type UserRow = typeof users.$inferSelect;
type LoginAttemptRow = typeof loginAttempts.$inferSelect;
type RefreshTokenRow = typeof refreshTokens.$inferSelect;
type UpdateCall = {
  table: unknown;
  values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow>;
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
  assertAuthResponse(body, response.headers["set-cookie"]);
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

test("POST /api/auth/login returns a session for valid credentials", async () => {
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
  assertAuthResponse(body, response.headers["set-cookie"]);
  assert.equal(body.user.id, USER_ID);
  assert.equal(fakeDb.loginAttemptRows.at(-1)?.success, true);
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
    headers: {
      cookie: `${REFRESH_TOKEN_COOKIE_NAME}=${reusedRefreshToken}`
    }
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
    headers: {
      cookie: `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}`
    }
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

function signupPayload(): Record<string, string> {
  return {
    username: "demo",
    email: "demo@example.com",
    nickname: "Demo",
    password: PASSWORD
  };
}

async function authHeaders(userId: string): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(userId)}`
  };
}

function assertAuthResponse(body: AuthResponse, setCookieHeader: string | string[] | undefined): void {
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
  assertRefreshTokenCookie(setCookieHeader);
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

function assertRefreshTokenCookie(setCookieHeader: string | string[] | undefined): void {
  const cookie = getSingleSetCookieHeader(setCookieHeader);

  assert.match(cookie, new RegExp(`^${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\/api\/auth/);
}

function assertClearedRefreshTokenCookie(setCookieHeader: string | string[] | undefined): void {
  const cookie = getSingleSetCookieHeader(setCookieHeader);

  assert.match(cookie, new RegExp(`^${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.match(cookie, /Max-Age=0/);
}

function getSingleSetCookieHeader(setCookieHeader: string | string[] | undefined): string {
  const cookie = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;

  if (typeof cookie !== "string") {
    assert.fail("Expected Set-Cookie header");
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

class AuthScenarioFakeDb {
  selectResults: unknown[][];
  userRows: UserRow[] = [];
  loginAttemptRows: LoginAttemptRow[] = [];
  refreshTokenRows: RefreshTokenRow[] = [];
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
        values: (values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow>) => {
          const insertedRow = this.insertRow(table, values);

          return {
            returning: async () => [insertedRow]
          };
        }
      }),
      update: (table: unknown) => ({
        set: (values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow>) => {
          this.updateCalls.push({ table, values });

          return {
            where: async () => []
          };
        }
      })
    };
  }

  private insertRow(
    table: unknown,
    values: Partial<UserRow & LoginAttemptRow & RefreshTokenRow>
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

    return values;
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
