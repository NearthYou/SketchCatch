import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { validateProductionAuthConfig } from "./production-auth-config.js";

const AUTH_ENV_NAMES = [
  "AUTH_TOKEN_SECRET",
  "GIT_OAUTH_CLIENT_ID",
  "GIT_OAUTH_CLIENT_SECRET",
  "KAKAO_OAUTH_CLIENT_ID",
  "KAKAO_OAUTH_CLIENT_SECRET",
  "NAVER_OAUTH_CLIENT_ID",
  "NAVER_OAUTH_CLIENT_SECRET",
  "OAUTH_REDIRECT_BASE_URL"
] as const;

const originalAuthEnv = new Map(AUTH_ENV_NAMES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const [name, value] of originalAuthEnv) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

test("production auth config accepts complete session and OAuth settings", () => {
  setValidAuthEnv();

  assert.doesNotThrow(() => validateProductionAuthConfig());
});

test("production auth config rejects a short token secret during startup", () => {
  setValidAuthEnv();
  process.env.AUTH_TOKEN_SECRET = "*";

  assert.throws(
    () => validateProductionAuthConfig(),
    /AUTH_TOKEN_SECRET must be at least 32 characters/
  );
});

test("production auth config rejects missing OAuth client IDs during startup", () => {
  setValidAuthEnv();
  delete process.env.NAVER_OAUTH_CLIENT_ID;

  assert.throws(() => validateProductionAuthConfig(), /NAVER_OAUTH_CLIENT_ID is required/);
});

function setValidAuthEnv(): void {
  process.env.AUTH_TOKEN_SECRET = "production-auth-token-secret-with-at-least-32-characters";
  process.env.GIT_OAUTH_CLIENT_ID = "github-client-id";
  process.env.GIT_OAUTH_CLIENT_SECRET = "github-client-secret";
  process.env.KAKAO_OAUTH_CLIENT_ID = "kakao-client-id";
  process.env.KAKAO_OAUTH_CLIENT_SECRET = "kakao-client-secret";
  process.env.NAVER_OAUTH_CLIENT_ID = "naver-client-id";
  process.env.NAVER_OAUTH_CLIENT_SECRET = "naver-client-secret";
  process.env.OAUTH_REDIRECT_BASE_URL = "https://sketchcatch.net";
}
