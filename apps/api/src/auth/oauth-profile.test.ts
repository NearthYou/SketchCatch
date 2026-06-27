import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchOAuthProfile,
  normalizeNaverOAuthProfile,
  OAUTH_PROFILE_FETCH_FAILED,
  OAuthProfileFetchError
} from "./oauth-profile.js";

test("normalizeNaverOAuthProfile maps a Naver response to a normalized profile", () => {
  const profile = normalizeNaverOAuthProfile({
    resultcode: "00",
    message: "success",
    response: {
      id: "naver-user-id",
      email: " User@Example.COM ",
      nickname: " Demo User ",
      profile_image: " https://example.com/profile.png "
    }
  });

  assert.deepEqual(profile, {
    provider: "naver",
    providerUserId: "naver-user-id",
    email: "user@example.com",
    emailVerified: true,
    displayName: "Demo User",
    profileImageUrl: "https://example.com/profile.png"
  });
});

test("normalizeNaverOAuthProfile handles optional Naver profile fields", () => {
  const profile = normalizeNaverOAuthProfile({
    response: {
      id: "naver-user-id",
      email: "",
      name: " Legal Name ",
      nickname: "",
      profile_image: ""
    }
  });

  assert.deepEqual(profile, {
    provider: "naver",
    providerUserId: "naver-user-id",
    email: null,
    emailVerified: false,
    displayName: "Legal Name",
    profileImageUrl: null
  });
});

test("normalizeNaverOAuthProfile rejects malformed Naver profile responses", async () => {
  await assertProfileFetchError(() =>
    Promise.resolve(
      normalizeNaverOAuthProfile({
        response: {
          email: "not-an-email",
          nickname: "Demo User"
        }
      })
    )
  );
});

test("fetchOAuthProfile fetches and normalizes a Naver profile", async () => {
  const { fetcher, requests } = createFetch(async () =>
    jsonResponse({
      response: {
        id: "naver-user-id",
        email: "user@example.com",
        nickname: "Demo User",
        profile_image: "https://example.com/profile.png"
      }
    })
  );

  const profile = await fetchOAuthProfile({
    accessToken: "provider-access-token",
    fetcher,
    provider: "naver"
  });

  assert.equal(requests.length, 1);
  assert.equal(String(requests[0]?.input), "https://openapi.naver.com/v1/nid/me");
  assert.equal(requests[0]?.init?.method, "GET");
  assert.deepEqual(requests[0]?.init?.headers, {
    accept: "application/json",
    authorization: "Bearer provider-access-token"
  });
  assert.equal(profile.providerUserId, "naver-user-id");
  assert.equal(profile.email, "user@example.com");
});

test("fetchOAuthProfile maps provider HTTP failures to OAuth errors", async () => {
  const { fetcher } = createFetch(async () =>
    jsonResponse(
      {
        error: "invalid_token",
        message: "provider-access-token should not be exposed"
      },
      401
    )
  );

  await assertProfileFetchError(() =>
    fetchOAuthProfile({
      accessToken: "provider-access-token",
      fetcher,
      provider: "naver"
    })
  );
});

test("fetchOAuthProfile maps network failures to OAuth errors", async () => {
  const { fetcher } = createFetch(async () => {
    throw new Error("raw network error should not be exposed");
  });

  await assertProfileFetchError(() =>
    fetchOAuthProfile({
      accessToken: "provider-access-token",
      fetcher,
      provider: "naver"
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

async function assertProfileFetchError(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof OAuthProfileFetchError);
    assert.equal(error.provider, "naver");
    assert.equal(error.oauthError, OAUTH_PROFILE_FETCH_FAILED);
    assert.equal(error.message, "OAuth profile fetch failed");
    assert.doesNotMatch(error.message, /provider-access-token|secret|invalid_token/i);
    return;
  }

  assert.fail("Expected OAuthProfileFetchError");
}
