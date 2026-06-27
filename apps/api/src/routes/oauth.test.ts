import { test } from "node:test";
import assert from "node:assert/strict";
import type { LightMyRequestResponse } from "fastify";
import { buildApp } from "../app.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const OAUTH_STATE_COOKIE_NAME = "sketchcatch_oauth_state";

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

function setOAuthEnv(): () => void {
  const previousEnv = {
    naverOauthClientId: process.env.NAVER_OAUTH_CLIENT_ID,
    naverOauthClientSecret: process.env.NAVER_OAUTH_CLIENT_SECRET,
    oauthRedirectBaseUrl: process.env.OAUTH_REDIRECT_BASE_URL
  };

  process.env.NAVER_OAUTH_CLIENT_ID = "naver-client-id";
  process.env.NAVER_OAUTH_CLIENT_SECRET = "naver-client-secret";
  process.env.OAUTH_REDIRECT_BASE_URL = "http://localhost:3000";

  return () => {
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
