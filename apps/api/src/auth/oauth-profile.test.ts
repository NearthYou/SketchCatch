import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchOAuthProfile,
  normalizeGitHubOAuthProfile,
  normalizeKakaoOAuthProfile,
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

test("normalizeKakaoOAuthProfile maps a Kakao response to a normalized profile", () => {
  const profile = normalizeKakaoOAuthProfile({
    id: 123456789,
    kakao_account: {
      email: " User@Example.COM ",
      is_email_valid: true,
      is_email_verified: true,
      profile: {
        nickname: " Kakao Demo ",
        profile_image_url: " https://example.com/kakao.png ",
        thumbnail_image_url: " https://example.com/kakao-thumb.png "
      }
    }
  });

  assert.deepEqual(profile, {
    provider: "kakao",
    providerUserId: "123456789",
    email: "user@example.com",
    emailVerified: true,
    displayName: "Kakao Demo",
    profileImageUrl: "https://example.com/kakao.png"
  });
});

test("normalizeKakaoOAuthProfile rejects unverified Kakao emails", () => {
  const profile = normalizeKakaoOAuthProfile({
    id: "kakao-user-id",
    kakao_account: {
      email: "user@example.com",
      is_email_valid: true,
      is_email_verified: false,
      profile: {
        nickname: ""
      }
    }
  });

  assert.deepEqual(profile, {
    provider: "kakao",
    providerUserId: "kakao-user-id",
    email: "user@example.com",
    emailVerified: false,
    displayName: "Kakao User",
    profileImageUrl: null
  });
});

test("normalizeGitHubOAuthProfile maps a GitHub response and primary verified email", () => {
  const profile = normalizeGitHubOAuthProfile(
    {
      avatar_url: " https://example.com/github.png ",
      email: null,
      id: 987654321,
      login: "github-demo",
      name: " GitHub Demo "
    },
    [
      {
        email: "secondary@example.com",
        primary: false,
        verified: true
      },
      {
        email: "Primary@Example.COM",
        primary: true,
        verified: true
      }
    ]
  );

  assert.deepEqual(profile, {
    provider: "github",
    providerUserId: "987654321",
    email: "primary@example.com",
    emailVerified: true,
    displayName: "GitHub Demo",
    profileImageUrl: "https://example.com/github.png"
  });
});

test("normalizeGitHubOAuthProfile falls back to any verified GitHub email", () => {
  const profile = normalizeGitHubOAuthProfile(
    {
      avatar_url: "",
      email: null,
      id: "github-user-id",
      login: "github-demo",
      name: ""
    },
    [
      {
        email: "unverified@example.com",
        primary: true,
        verified: false
      },
      {
        email: "verified@example.com",
        primary: false,
        verified: true
      }
    ]
  );

  assert.deepEqual(profile, {
    provider: "github",
    providerUserId: "github-user-id",
    email: "verified@example.com",
    emailVerified: true,
    displayName: "github-demo",
    profileImageUrl: null
  });
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
  assert.deepEqual(requests[0]?.init?.headers, expectedProfileRequestHeaders());
  assert.equal(profile.providerUserId, "naver-user-id");
  assert.equal(profile.email, "user@example.com");
});

test("fetchOAuthProfile fetches and normalizes a Kakao profile", async () => {
  const { fetcher, requests } = createFetch(async () =>
    jsonResponse({
      id: 123456789,
      kakao_account: {
        email: "user@example.com",
        is_email_valid: true,
        is_email_verified: true,
        profile: {
          nickname: "Kakao Demo"
        }
      }
    })
  );

  const profile = await fetchOAuthProfile({
    accessToken: "provider-access-token",
    fetcher,
    provider: "kakao"
  });

  assert.equal(requests.length, 1);
  assert.equal(String(requests[0]?.input), "https://kapi.kakao.com/v2/user/me");
  assert.deepEqual(requests[0]?.init?.headers, expectedProfileRequestHeaders());
  assert.equal(profile.provider, "kakao");
  assert.equal(profile.providerUserId, "123456789");
  assert.equal(profile.email, "user@example.com");
});

test("fetchOAuthProfile fetches GitHub profile and verified email list", async () => {
  const { fetcher, requests } = createFetch(async (input) => {
    if (String(input) === "https://api.github.com/user") {
      return jsonResponse({
        avatar_url: "https://example.com/github.png",
        id: 987654321,
        login: "github-demo",
        name: "GitHub Demo"
      });
    }

    return jsonResponse([
      {
        email: "primary@example.com",
        primary: true,
        verified: true
      }
    ]);
  });

  const profile = await fetchOAuthProfile({
    accessToken: "provider-access-token",
    fetcher,
    provider: "github"
  });

  assert.equal(requests.length, 2);
  assert.equal(String(requests[0]?.input), "https://api.github.com/user");
  assert.equal(String(requests[1]?.input), "https://api.github.com/user/emails");
  assert.deepEqual(requests[0]?.init?.headers, expectedProfileRequestHeaders());
  assert.deepEqual(requests[1]?.init?.headers, expectedProfileRequestHeaders());
  assert.equal(profile.provider, "github");
  assert.equal(profile.providerUserId, "987654321");
  assert.equal(profile.email, "primary@example.com");
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

function expectedProfileRequestHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    authorization: "Bearer provider-access-token",
    "user-agent": "SketchCatch-OAuth/1.0"
  };
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
