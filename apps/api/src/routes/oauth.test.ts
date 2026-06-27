import { test } from "node:test";
import assert from "node:assert/strict";
import type { LightMyRequestResponse } from "fastify";
import { buildApp } from "../app.js";
import type { Database, DatabaseClient } from "../db/client.js";
import { oauthAccounts, refreshTokens, users } from "../db/schema.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const OAUTH_STATE_COOKIE_NAME = "sketchcatch_oauth_state";
const REFRESH_TOKEN_COOKIE_NAME = "sketchcatch_refresh_token";
const CSRF_TOKEN_COOKIE_NAME = "sketchcatch_csrf_token";
const USER_ID = "11111111-1111-4111-8111-111111111111";

type OAuthAccountRow = typeof oauthAccounts.$inferSelect;
type RefreshTokenRow = typeof refreshTokens.$inferSelect;
type UserRow = typeof users.$inferSelect;

test("GET /api/auth/oauth/naver/start redirects to Naver authorize URL with a state cookie", async () => {
  const restoreEnv = setOAuthEnv();
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/naver/start"
    });

    assert.equal(response.statusCode, 302);

    const location = getHeaderValue(response, "location");
    const redirectUrl = new URL(location);
    const state = redirectUrl.searchParams.get("state");

    assert.equal(
      `${redirectUrl.origin}${redirectUrl.pathname}`,
      "https://nid.naver.com/oauth2.0/authorize"
    );
    assert.equal(redirectUrl.searchParams.get("response_type"), "code");
    assert.equal(redirectUrl.searchParams.get("client_id"), "naver-client-id");
    assert.equal(
      redirectUrl.searchParams.get("redirect_uri"),
      "http://localhost:3000/api/auth/oauth/naver/callback"
    );
    assert.ok(state);

    const cookie = getSetCookieHeader(response, OAUTH_STATE_COOKIE_NAME);
    const cookieValue = getCookieValue(cookie);

    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/api\/auth\/oauth/);
    assert.match(cookie, /Max-Age=300/);
    assert.deepEqual(JSON.parse(decodeURIComponent(cookieValue)), {
      provider: "naver",
      state
    });
  } finally {
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/kakao/start redirects to Kakao authorize URL with a state cookie", async () => {
  const restoreEnv = setOAuthEnv();
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/kakao/start"
    });

    assert.equal(response.statusCode, 302);

    const location = getHeaderValue(response, "location");
    const redirectUrl = new URL(location);
    const state = redirectUrl.searchParams.get("state");

    assert.equal(
      `${redirectUrl.origin}${redirectUrl.pathname}`,
      "https://kauth.kakao.com/oauth/authorize"
    );
    assert.equal(redirectUrl.searchParams.get("client_id"), "kakao-client-id");
    assert.equal(
      redirectUrl.searchParams.get("redirect_uri"),
      "http://localhost:3000/api/auth/oauth/kakao/callback"
    );
    assert.equal(redirectUrl.searchParams.get("scope"), "profile_nickname");
    assert.ok(state);

    const cookie = getSetCookieHeader(response, OAUTH_STATE_COOKIE_NAME);
    const cookieValue = getCookieValue(cookie);

    assert.deepEqual(JSON.parse(decodeURIComponent(cookieValue)), {
      provider: "kakao",
      state
    });
  } finally {
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/github/start redirects to GitHub authorize URL with a state cookie", async () => {
  const restoreEnv = setOAuthEnv();
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/github/start"
    });

    assert.equal(response.statusCode, 302);

    const location = getHeaderValue(response, "location");
    const redirectUrl = new URL(location);
    const state = redirectUrl.searchParams.get("state");

    assert.equal(
      `${redirectUrl.origin}${redirectUrl.pathname}`,
      "https://github.com/login/oauth/authorize"
    );
    assert.equal(redirectUrl.searchParams.get("client_id"), "github-client-id");
    assert.equal(
      redirectUrl.searchParams.get("redirect_uri"),
      "http://localhost:3000/api/auth/oauth/github/callback"
    );
    assert.equal(redirectUrl.searchParams.get("scope"), "read:user user:email");
    assert.ok(state);

    const cookie = getSetCookieHeader(response, OAUTH_STATE_COOKIE_NAME);
    const cookieValue = getCookieValue(cookie);

    assert.deepEqual(JSON.parse(decodeURIComponent(cookieValue)), {
      provider: "github",
      state
    });
  } finally {
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/google/start rejects providers that are not enabled yet", async () => {
  const restoreEnv = setOAuthEnv();
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/google/start"
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.headers["set-cookie"], undefined);
  } finally {
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/naver/callback completes login and redirects to mypage", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb({
    selectResults: [[], []]
  });
  const { requests, restoreFetch } = installOAuthFetch([
    jsonResponse({
      access_token: "provider-access-token"
    }),
    jsonResponse({
      response: {
        email: "Demo@Example.com",
        id: "naver-user-id",
        nickname: "Naver Demo",
        profile_image: "https://example.com/avatar.png"
      }
    })
  ]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("state-token")
      },
      method: "GET",
      url: "/api/auth/oauth/naver/callback?code=authorization-code&state=state-token"
    });

    assert.equal(response.statusCode, 302);
    assert.equal(getHeaderValue(response, "location"), "/mypage");
    assert.equal(requests.length, 2);

    const tokenRequestBody = new URLSearchParams(String(requests[0]?.init?.body));

    assert.equal(String(requests[0]?.input), "https://nid.naver.com/oauth2.0/token");
    assert.equal(tokenRequestBody.get("code"), "authorization-code");
    assert.equal(tokenRequestBody.get("state"), "state-token");
    assert.equal(
      tokenRequestBody.get("redirect_uri"),
      "http://localhost:3000/api/auth/oauth/naver/callback"
    );
    assert.equal(String(requests[1]?.input), "https://openapi.naver.com/v1/nid/me");
    assert.deepEqual(requests[1]?.init?.headers, {
      accept: "application/json",
      authorization: "Bearer provider-access-token"
    });

    assert.equal(fakeDb.userRows.length, 1);
    assert.equal(fakeDb.oauthAccountRows.length, 1);
    assert.equal(fakeDb.refreshTokenRows.length, 1);
    assert.equal(fakeDb.userRows[0]?.email, "demo@example.com");
    assert.equal(fakeDb.userRows[0]?.passwordHash, null);
    assert.equal(fakeDb.oauthAccountRows[0]?.provider, "naver");
    assert.equal(fakeDb.oauthAccountRows[0]?.providerUserId, "naver-user-id");
    assert.equal(fakeDb.oauthAccountRows[0]?.userId, fakeDb.userRows[0]?.id);
    assert.equal(fakeDb.refreshTokenRows[0]?.userId, fakeDb.userRows[0]?.id);

    const serializedRows = JSON.stringify({
      oauthAccounts: fakeDb.oauthAccountRows,
      refreshTokens: fakeDb.refreshTokenRows,
      users: fakeDb.userRows
    });

    assert.doesNotMatch(getHeaderValue(response, "location"), /provider-access-token/);
    assert.doesNotMatch(serializedRows, /provider-access-token/);
    assertRefreshTokenCookie(response.headers["set-cookie"]);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/kakao/callback completes login without an email scope", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb({
    selectResults: [[], []]
  });
  const { requests, restoreFetch } = installOAuthFetch([
    jsonResponse({
      access_token: "provider-access-token"
    }),
    jsonResponse({
      id: 123456789,
      kakao_account: {
        profile: {
          nickname: "Kakao Demo"
        }
      }
    })
  ]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("state-token", "kakao")
      },
      method: "GET",
      url: "/api/auth/oauth/kakao/callback?code=authorization-code&state=state-token"
    });

    assert.equal(response.statusCode, 302);
    assert.equal(getHeaderValue(response, "location"), "/mypage");
    assert.equal(requests.length, 2);
    assert.equal(String(requests[0]?.input), "https://kauth.kakao.com/oauth/token");
    assert.equal(String(requests[1]?.input), "https://kapi.kakao.com/v2/user/me");
    assert.equal(fakeDb.userRows[0]?.email, "kakao_123456789@oauth.local");
    assert.equal(fakeDb.userRows[0]?.username, "kakao_123456789");
    assert.equal(fakeDb.userRows[0]?.nickname, "Kakao Demo");
    assert.equal(fakeDb.oauthAccountRows[0]?.email, "kakao_123456789@oauth.local");
    assert.equal(fakeDb.oauthAccountRows[0]?.provider, "kakao");
    assert.equal(fakeDb.oauthAccountRows[0]?.providerUserId, "123456789");
    assert.equal(fakeDb.refreshTokenRows[0]?.userId, fakeDb.userRows[0]?.id);
    assertRefreshTokenCookie(response.headers["set-cookie"]);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/github/callback completes login with verified email fallback", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb({
    selectResults: [[], []]
  });
  const { requests, restoreFetch } = installOAuthFetch([
    jsonResponse({
      access_token: "provider-access-token"
    }),
    jsonResponse({
      avatar_url: "https://example.com/github.png",
      id: 987654321,
      login: "github-demo",
      name: "GitHub Demo"
    }),
    jsonResponse([
      {
        email: "github@example.com",
        primary: true,
        verified: true
      }
    ])
  ]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("state-token", "github")
      },
      method: "GET",
      url: "/api/auth/oauth/github/callback?code=authorization-code&state=state-token"
    });

    assert.equal(response.statusCode, 302);
    assert.equal(getHeaderValue(response, "location"), "/mypage");
    assert.equal(requests.length, 3);
    assert.equal(String(requests[0]?.input), "https://github.com/login/oauth/access_token");
    assert.equal(String(requests[1]?.input), "https://api.github.com/user");
    assert.equal(String(requests[2]?.input), "https://api.github.com/user/emails");
    assert.equal(fakeDb.userRows[0]?.email, "github@example.com");
    assert.equal(fakeDb.oauthAccountRows[0]?.provider, "github");
    assert.equal(fakeDb.oauthAccountRows[0]?.providerUserId, "987654321");
    assert.equal(fakeDb.refreshTokenRows[0]?.userId, fakeDb.userRows[0]?.id);
    assertRefreshTokenCookie(response.headers["set-cookie"]);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/naver/callback rejects state mismatches", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb();
  const { requests, restoreFetch } = installOAuthFetch([]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("cookie-state")
      },
      method: "GET",
      url: "/api/auth/oauth/naver/callback?code=authorization-code&state=query-state"
    });

    assertOAuthErrorRedirect(response, "state_mismatch");
    assert.equal(requests.length, 0);
    assert.equal(fakeDb.userRows.length, 0);
    assert.equal(fakeDb.oauthAccountRows.length, 0);
    assert.equal(fakeDb.refreshTokenRows.length, 0);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/naver/callback maps provider errors to login redirects", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb();
  const { requests, restoreFetch } = installOAuthFetch([]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("state-token")
      },
      method: "GET",
      url: "/api/auth/oauth/naver/callback?error=access_denied&state=state-token"
    });

    assertOAuthErrorRedirect(response, "provider_error");
    assert.equal(requests.length, 0);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/naver/callback maps token exchange failures to login redirects", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb();
  const { requests, restoreFetch } = installOAuthFetch([
    jsonResponse(
      {
        error: "invalid_request"
      },
      400
    )
  ]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("state-token")
      },
      method: "GET",
      url: "/api/auth/oauth/naver/callback?code=authorization-code&state=state-token"
    });

    assertOAuthErrorRedirect(response, "token_exchange_failed");
    assert.equal(requests.length, 1);
    assert.equal(fakeDb.refreshTokenRows.length, 0);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/naver/callback maps profile failures to login redirects", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb();
  const { requests, restoreFetch } = installOAuthFetch([
    jsonResponse({
      access_token: "provider-access-token"
    }),
    jsonResponse({
      response: {
        email: "demo@example.com"
      }
    })
  ]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("state-token")
      },
      method: "GET",
      url: "/api/auth/oauth/naver/callback?code=authorization-code&state=state-token"
    });

    assertOAuthErrorRedirect(response, "profile_fetch_failed");
    assert.equal(requests.length, 2);
    assert.equal(fakeDb.refreshTokenRows.length, 0);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/naver/callback maps untrusted email profiles to login redirects", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb();
  const { restoreFetch } = installOAuthFetch([
    jsonResponse({
      access_token: "provider-access-token"
    }),
    jsonResponse({
      response: {
        email: "",
        id: "naver-user-id",
        nickname: "Naver Demo"
      }
    })
  ]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      headers: {
        cookie: oauthStateCookie("state-token")
      },
      method: "GET",
      url: "/api/auth/oauth/naver/callback?code=authorization-code&state=state-token"
    });

    assertOAuthErrorRedirect(response, "email_required");
    assert.equal(fakeDb.userRows.length, 0);
    assert.equal(fakeDb.oauthAccountRows.length, 0);
    assert.equal(fakeDb.refreshTokenRows.length, 0);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

test("GET /api/auth/oauth/naver/callback rejects callbacks without state", async () => {
  const restoreEnv = setOAuthEnv();
  const fakeDb = new OAuthRouteFakeDb();
  const { requests, restoreFetch } = installOAuthFetch([]);
  const app = buildApp({
    getDatabaseClient: () => fakeDb.client
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/oauth/naver/callback?code=authorization-code"
    });

    assertOAuthErrorRedirect(response, "invalid_callback");
    assert.equal(requests.length, 0);
    assertClearedOAuthStateCookie(response.headers["set-cookie"]);
  } finally {
    restoreFetch();
    restoreEnv();
    await app.close();
  }
});

function setOAuthEnv(): () => void {
  const previousEnv = {
    githubOauthClientId: process.env.GITHUB_OAUTH_CLIENT_ID,
    githubOauthClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    kakaoOauthClientId: process.env.KAKAO_OAUTH_CLIENT_ID,
    kakaoOauthClientSecret: process.env.KAKAO_OAUTH_CLIENT_SECRET,
    naverOauthClientId: process.env.NAVER_OAUTH_CLIENT_ID,
    naverOauthClientSecret: process.env.NAVER_OAUTH_CLIENT_SECRET,
    oauthRedirectBaseUrl: process.env.OAUTH_REDIRECT_BASE_URL
  };

  process.env.GITHUB_OAUTH_CLIENT_ID = "github-client-id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "github-client-secret";
  process.env.KAKAO_OAUTH_CLIENT_ID = "kakao-client-id";
  process.env.KAKAO_OAUTH_CLIENT_SECRET = "";
  process.env.NAVER_OAUTH_CLIENT_ID = "naver-client-id";
  process.env.NAVER_OAUTH_CLIENT_SECRET = "naver-client-secret";
  process.env.OAUTH_REDIRECT_BASE_URL = "http://localhost:3000";

  return () => {
    restoreEnvValue("GITHUB_OAUTH_CLIENT_ID", previousEnv.githubOauthClientId);
    restoreEnvValue("GITHUB_OAUTH_CLIENT_SECRET", previousEnv.githubOauthClientSecret);
    restoreEnvValue("KAKAO_OAUTH_CLIENT_ID", previousEnv.kakaoOauthClientId);
    restoreEnvValue("KAKAO_OAUTH_CLIENT_SECRET", previousEnv.kakaoOauthClientSecret);
    restoreEnvValue("NAVER_OAUTH_CLIENT_ID", previousEnv.naverOauthClientId);
    restoreEnvValue("NAVER_OAUTH_CLIENT_SECRET", previousEnv.naverOauthClientSecret);
    restoreEnvValue("OAUTH_REDIRECT_BASE_URL", previousEnv.oauthRedirectBaseUrl);
  };
}

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function getHeaderValue(response: LightMyRequestResponse, headerName: string): string {
  const value = response.headers[headerName];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  assert.fail(`Expected ${headerName} header`);
}

function getSetCookieHeader(response: LightMyRequestResponse, cookieName: string): string {
  const setCookieHeaders = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : setCookieHeaders
      ? [setCookieHeaders]
      : [];
  const cookie = cookies.find((candidate) => candidate.startsWith(`${cookieName}=`));

  if (!cookie) {
    assert.fail(`Expected ${cookieName} Set-Cookie header`);
  }

  return cookie;
}

function getCookieValue(cookie: string): string {
  const [cookiePair] = cookie.split(";");
  const [, value] = cookiePair?.split("=") ?? [];

  if (!value) {
    assert.fail("Expected cookie value");
  }

  return value;
}

function assertOAuthErrorRedirect(response: LightMyRequestResponse, oauthError: string): void {
  assert.equal(response.statusCode, 302);
  assert.equal(getHeaderValue(response, "location"), `/login?oauthError=${oauthError}`);
}

function assertRefreshTokenCookie(setCookieHeader: string | string[] | undefined): void {
  const cookies = getSetCookieHeaders(setCookieHeader);
  const refreshTokenCookie = getCookieHeader(cookies, REFRESH_TOKEN_COOKIE_NAME);
  const csrfTokenCookie = getCookieHeader(cookies, CSRF_TOKEN_COOKIE_NAME);

  assert.match(refreshTokenCookie, new RegExp(`^${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.match(refreshTokenCookie, /HttpOnly/);
  assert.match(refreshTokenCookie, /SameSite=Lax/);
  assert.match(refreshTokenCookie, /Path=\/api\/auth/);
  assert.match(csrfTokenCookie, new RegExp(`^${CSRF_TOKEN_COOKIE_NAME}=`));
  assert.doesNotMatch(csrfTokenCookie, /HttpOnly/);
  assert.match(csrfTokenCookie, /SameSite=Lax/);
}

function assertClearedOAuthStateCookie(setCookieHeader: string | string[] | undefined): void {
  const cookies = getSetCookieHeaders(setCookieHeader);
  const oauthStateCookie = getCookieHeader(cookies, OAUTH_STATE_COOKIE_NAME);

  assert.match(oauthStateCookie, new RegExp(`^${OAUTH_STATE_COOKIE_NAME}=`));
  assert.match(oauthStateCookie, /Max-Age=0/);
  assert.match(oauthStateCookie, /Path=\/api\/auth\/oauth/);
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

function oauthStateCookie(state: string, provider = "naver"): string {
  return `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify({
      provider,
      state
    })
  )}`;
}

type CapturedFetchRequest = {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
};

function installOAuthFetch(responses: Response[]): {
  requests: CapturedFetchRequest[];
  restoreFetch: () => void;
} {
  const originalFetch = globalThis.fetch;
  const queuedResponses = [...responses];
  const requests: CapturedFetchRequest[] = [];

  globalThis.fetch = (async (input, init) => {
    requests.push({ input, init });

    const response = queuedResponses.shift();

    if (!response) {
      throw new Error("Unexpected OAuth fetch request");
    }

    return response;
  }) as typeof fetch;

  return {
    requests,
    restoreFetch: () => {
      globalThis.fetch = originalFetch;
    }
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

class OAuthRouteFakeDb {
  readonly client: DatabaseClient;
  readonly oauthAccountRows: Partial<OAuthAccountRow>[] = [];
  readonly refreshTokenRows: Partial<RefreshTokenRow>[] = [];
  readonly userRows: UserRow[] = [];
  private readonly selectResults: unknown[][];

  constructor(data: { selectResults?: unknown[][] } = {}) {
    this.selectResults = [...(data.selectResults ?? [])];
    this.client = {
      db: this.createDb() as Database,
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    const db = {
      insert: (table: unknown) => ({
        values: (values: Partial<UserRow & OAuthAccountRow & RefreshTokenRow>) => {
          const insertedRow = this.insertRow(table, values);

          return {
            returning: async () => [insertedRow]
          };
        }
      }),
      select: () => ({
        from: () => ({
          where: async () => this.selectResults.shift() ?? []
        })
      }),
      transaction: async <T>(callback: (tx: Database) => Promise<T>) =>
        callback(db as unknown as Database)
    };

    return db;
  }

  private insertRow(
    table: unknown,
    values: Partial<UserRow & OAuthAccountRow & RefreshTokenRow>
  ): unknown {
    if (table === users) {
      const row = makeUser(values as Partial<UserRow>);

      this.userRows.push(row);

      return row;
    }

    if (table === oauthAccounts) {
      this.oauthAccountRows.push(values as Partial<OAuthAccountRow>);

      return values;
    }

    if (table === refreshTokens) {
      this.refreshTokenRows.push(values as Partial<RefreshTokenRow>);

      return values;
    }

    return values;
  }
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
    deletedAt: null,
    email: "demo@example.com",
    id: USER_ID,
    nickname: "Demo",
    passwordHash: null,
    updatedAt: new Date("2026-06-24T00:00:00.000Z"),
    username: "demo",
    ...overrides
  };
}
