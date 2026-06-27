import { test } from "node:test";
import assert from "node:assert/strict";
import type { RuntimeEnv } from "../config/env.js";
import {
  getOAuthProviderStaticConfig,
  requireOAuthProviderConfig
} from "./oauth-providers.js";

test("Naver OAuth static config uses Naver endpoints", () => {
  const config = getOAuthProviderStaticConfig("naver");

  assert.equal(config.authorizationUrl, "https://nid.naver.com/oauth2.0/authorize");
  assert.equal(config.tokenUrl, "https://nid.naver.com/oauth2.0/token");
  assert.equal(config.profileUrl, "https://openapi.naver.com/v1/nid/me");
  assert.deepEqual(config.scopes, []);
});

test("requireOAuthProviderConfig returns trimmed Naver runtime config", () => {
  const config = requireOAuthProviderConfig("naver", makeRuntimeEnv());

  assert.deepEqual(config, {
    clientId: "naver-client-id",
    clientSecret: "naver-client-secret",
    redirectBaseUrl: "http://localhost:3000"
  });
});

test("requireOAuthProviderConfig reports missing Naver env values", () => {
  assert.throws(
    () =>
      requireOAuthProviderConfig(
        "naver",
        makeRuntimeEnv({
          naverOauthClientSecret: ""
        })
      ),
    /NAVER_OAUTH_CLIENT_SECRET is required/
  );
});

test("requireOAuthProviderConfig rejects providers without static config", () => {
  assert.throws(
    () => requireOAuthProviderConfig("google", makeRuntimeEnv()),
    /google OAuth provider is not configured yet/
  );
});

function makeRuntimeEnv(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return {
    awsRegion: "ap-northeast-2",
    authTokenSecret: "test-auth-token-secret-with-at-least-32-characters",
    databaseUrl: "postgresql://example",
    databaseSsl: false,
    githubOauthClientId: undefined,
    githubOauthClientSecret: undefined,
    googleOauthClientId: undefined,
    googleOauthClientSecret: undefined,
    kakaoOauthClientId: undefined,
    kakaoOauthClientSecret: undefined,
    naverOauthClientId: " naver-client-id ",
    naverOauthClientSecret: " naver-client-secret ",
    oauthRedirectBaseUrl: "http://localhost:3000/",
    s3BucketName: "test-bucket",
    ...overrides
  };
}
