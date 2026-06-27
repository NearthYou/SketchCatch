import { test } from "node:test";
import assert from "node:assert/strict";
import type { RuntimeEnv } from "../config/env.js";
import {
  exchangeOAuthCodeForAccessToken,
  OAUTH_TOKEN_EXCHANGE_FAILED,
  OAuthTokenExchangeError
} from "./oauth-token.js";

test("exchangeOAuthCodeForAccessToken exchanges a Naver code for an access token", async () => {
  const { fetcher, requests } = createFetch(async () =>
    jsonResponse({
      access_token: "provider-access-token",
      expires_in: "3600",
      refresh_token: "provider-refresh-token",
      token_type: "bearer"
    })
  );

  const token = await exchangeOAuthCodeForAccessToken({
    code: "authorization-code",
    env: makeRuntimeEnv(),
    fetcher,
    provider: "naver",
    state: "state-token"
  });

  assert.deepEqual(token, {
    accessToken: "provider-access-token"
  });
  assert.equal(requests.length, 1);
  assert.equal(String(requests[0]?.input), "https://nid.naver.com/oauth2.0/token");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(requests[0]?.init?.headers, expectedTokenRequestHeaders());

  const body = new URLSearchParams(String(requests[0]?.init?.body));

  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("client_id"), "naver-client-id");
  assert.equal(body.get("client_secret"), "naver-client-secret");
  assert.equal(body.get("code"), "authorization-code");
  assert.equal(body.get("state"), "state-token");
  assert.equal(body.get("redirect_uri"), "http://localhost:3000/api/auth/oauth/naver/callback");
});

test("exchangeOAuthCodeForAccessToken exchanges a Kakao code without client secret", async () => {
  const { fetcher, requests } = createFetch(async () =>
    jsonResponse({
      access_token: "provider-access-token",
      token_type: "bearer"
    })
  );

  const token = await exchangeOAuthCodeForAccessToken({
    code: "authorization-code",
    env: makeRuntimeEnv({
      kakaoOauthClientId: "kakao-client-id",
      kakaoOauthClientSecret: ""
    }),
    fetcher,
    provider: "kakao",
    state: "state-token"
  });

  assert.deepEqual(token, {
    accessToken: "provider-access-token"
  });
  assert.equal(String(requests[0]?.input), "https://kauth.kakao.com/oauth/token");
  assert.deepEqual(requests[0]?.init?.headers, expectedTokenRequestHeaders());

  const body = new URLSearchParams(String(requests[0]?.init?.body));

  assert.equal(body.get("client_id"), "kakao-client-id");
  assert.equal(body.get("client_secret"), null);
  assert.equal(body.get("redirect_uri"), "http://localhost:3000/api/auth/oauth/kakao/callback");
});

test("exchangeOAuthCodeForAccessToken exchanges a GitHub code for an access token", async () => {
  const { fetcher, requests } = createFetch(async () =>
    jsonResponse({
      access_token: "provider-access-token",
      scope: "read:user,user:email",
      token_type: "bearer"
    })
  );

  const token = await exchangeOAuthCodeForAccessToken({
    code: "authorization-code",
    env: makeRuntimeEnv({
      githubOauthClientId: "github-client-id",
      githubOauthClientSecret: "github-client-secret"
    }),
    fetcher,
    provider: "github",
    state: "state-token"
  });

  assert.deepEqual(token, {
    accessToken: "provider-access-token"
  });
  assert.equal(String(requests[0]?.input), "https://github.com/login/oauth/access_token");
  assert.deepEqual(requests[0]?.init?.headers, expectedTokenRequestHeaders());

  const body = new URLSearchParams(String(requests[0]?.init?.body));

  assert.equal(body.get("client_id"), "github-client-id");
  assert.equal(body.get("client_secret"), "github-client-secret");
  assert.equal(body.get("redirect_uri"), "http://localhost:3000/api/auth/oauth/github/callback");
});

test("exchangeOAuthCodeForAccessToken maps provider HTTP failures to OAuth errors", async () => {
  const { fetcher } = createFetch(async () =>
    jsonResponse(
      {
        error: "invalid_request",
        error_description: "secret value should not be exposed"
      },
      400
    )
  );

  await assertTokenExchangeError(() =>
    exchangeOAuthCodeForAccessToken({
      code: "authorization-code",
      env: makeRuntimeEnv(),
      fetcher,
      provider: "naver",
      state: "state-token"
    })
  );
});

test("exchangeOAuthCodeForAccessToken rejects malformed token responses", async () => {
  const { fetcher } = createFetch(async () =>
    jsonResponse({
      refresh_token: "provider-refresh-token",
      token_type: "bearer"
    })
  );

  await assertTokenExchangeError(() =>
    exchangeOAuthCodeForAccessToken({
      code: "authorization-code",
      env: makeRuntimeEnv(),
      fetcher,
      provider: "naver",
      state: "state-token"
    })
  );
});

test("exchangeOAuthCodeForAccessToken maps network failures to OAuth errors", async () => {
  const { fetcher } = createFetch(async () => {
    throw new Error("raw network error should not be exposed");
  });

  await assertTokenExchangeError(() =>
    exchangeOAuthCodeForAccessToken({
      code: "authorization-code",
      env: makeRuntimeEnv(),
      fetcher,
      provider: "naver",
      state: "state-token"
    })
  );
});

type CapturedFetchRequest = {
  input: Parameters<typeof fetch>[0];
  init: Parameters<typeof fetch>[1];
};

function createFetch(
  handler: (
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1]
  ) => Promise<Response>
): {
  fetcher: typeof fetch;
  requests: CapturedFetchRequest[];
} {
  const requests: CapturedFetchRequest[] = [];
  const fetcher = (async (input, init) => {
    requests.push({ input, init });

    return handler(input, init);
  }) as typeof fetch;

  return {
    fetcher,
    requests
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

function expectedTokenRequestHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "SketchCatch-OAuth/1.0"
  };
}

async function assertTokenExchangeError(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof OAuthTokenExchangeError);
    assert.equal(error.provider, "naver");
    assert.equal(error.oauthError, OAUTH_TOKEN_EXCHANGE_FAILED);
    assert.equal(error.message, "OAuth token exchange failed");
    assert.doesNotMatch(error.message, /provider-access-token|provider-refresh-token|secret/i);
    return;
  }

  assert.fail("Expected OAuthTokenExchangeError");
}

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
    naverOauthClientId: "naver-client-id",
    naverOauthClientSecret: "naver-client-secret",
    oauthRedirectBaseUrl: "http://localhost:3000",
    s3BucketName: "test-bucket",
    sketchcatchAwsCallerPrincipalArn: undefined,
    sketchcatchPublicBaseUrl: undefined,
    ...overrides
  };
}
