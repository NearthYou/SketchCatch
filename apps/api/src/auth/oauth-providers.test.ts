import { test } from "node:test";
import assert from "node:assert/strict";
import type { RuntimeEnv } from "../config/env.js";
import { getOAuthProviderStaticConfig, requireOAuthProviderConfig } from "./oauth-providers.js";

test("Naver OAuth static config uses Naver endpoints", () => {
  const config = getOAuthProviderStaticConfig("naver");

  assert.equal(config.authorizationUrl, "https://nid.naver.com/oauth2.0/authorize");
  assert.equal(config.tokenUrl, "https://nid.naver.com/oauth2.0/token");
  assert.equal(config.profileUrl, "https://openapi.naver.com/v1/nid/me");
  assert.deepEqual(config.scopes, []);
});

test("Kakao OAuth static config uses Kakao endpoints", () => {
  const config = getOAuthProviderStaticConfig("kakao");

  assert.equal(config.authorizationUrl, "https://kauth.kakao.com/oauth/authorize");
  assert.equal(config.tokenUrl, "https://kauth.kakao.com/oauth/token");
  assert.equal(config.profileUrl, "https://kapi.kakao.com/v2/user/me");
  assert.deepEqual(config.scopes, ["profile_nickname"]);
});

test("GitHub OAuth static config uses GitHub endpoints", () => {
  const config = getOAuthProviderStaticConfig("github");

  assert.equal(config.authorizationUrl, "https://github.com/login/oauth/authorize");
  assert.equal(config.tokenUrl, "https://github.com/login/oauth/access_token");
  assert.equal(config.profileUrl, "https://api.github.com/user");
  assert.equal(config.emailUrl, "https://api.github.com/user/emails");
  assert.deepEqual(config.scopes, ["read:user", "user:email"]);
});

test("requireOAuthProviderConfig returns trimmed Naver runtime config", () => {
  const config = requireOAuthProviderConfig("naver", makeRuntimeEnv());

  assert.deepEqual(config, {
    clientId: "naver-client-id",
    clientSecret: "naver-client-secret",
    redirectBaseUrl: "http://localhost:3000"
  });
});

test("requireOAuthProviderConfig allows optional Kakao client secret", () => {
  const config = requireOAuthProviderConfig(
    "kakao",
    makeRuntimeEnv({
      kakaoOauthClientId: " kakao-client-id ",
      kakaoOauthClientSecret: ""
    })
  );

  assert.deepEqual(config, {
    clientId: "kakao-client-id",
    clientSecret: null,
    redirectBaseUrl: "http://localhost:3000"
  });
});

test("requireOAuthProviderConfig returns trimmed GitHub runtime config", () => {
  const config = requireOAuthProviderConfig(
    "github",
    makeRuntimeEnv({
      githubOauthClientId: " github-client-id ",
      githubOauthClientSecret: " github-client-secret "
    })
  );

  assert.deepEqual(config, {
    clientId: "github-client-id",
    clientSecret: "github-client-secret",
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

test("requireOAuthProviderConfig reports missing Kakao env values", () => {
  assert.throws(
    () =>
      requireOAuthProviderConfig(
        "kakao",
        makeRuntimeEnv({
          kakaoOauthClientId: ""
        })
      ),
    /KAKAO_OAUTH_CLIENT_ID is required/
  );
});

test("requireOAuthProviderConfig reports missing GitHub env values", () => {
  assert.throws(
    () =>
      requireOAuthProviderConfig(
        "github",
        makeRuntimeEnv({
          githubOauthClientId: "github-client-id",
          githubOauthClientSecret: ""
        })
      ),
    /GIT_OAUTH_CLIENT_SECRET is required/
  );
});

function makeRuntimeEnv(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  return {
    awsRegion: "ap-northeast-2",
    authTokenSecret: "test-auth-token-secret-with-at-least-32-characters",
    cloudFormationTemplateTokenSecret: undefined,
    databaseUrl: "postgresql://example",
    databaseSsl: false,
    githubOauthClientId: undefined,
    githubOauthClientSecret: undefined,
    kakaoOauthClientId: undefined,
    kakaoOauthClientSecret: undefined,
    naverOauthClientId: " naver-client-id ",
    naverOauthClientSecret: " naver-client-secret ",
    oauthRedirectBaseUrl: "http://localhost:3000/",
    s3BucketName: "test-bucket",
    sketchcatchAwsCallerPrincipalArn: undefined,
    sketchcatchPublicBaseUrl: undefined,
    ...overrides
  };
}
