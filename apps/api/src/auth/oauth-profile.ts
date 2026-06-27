import type { OAuthProvider } from "@sketchcatch/types";
import { z } from "zod";
import { getOAuthProviderStaticConfig } from "./oauth-providers.js";

export const OAUTH_PROFILE_FETCH_FAILED = "profile_fetch_failed";

const nullableTrimmedStringSchema = z
  .preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
  }, z.string().nullable().optional())
  .transform((value) => value ?? null);

const nullableEmailSchema = z
  .preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue.toLowerCase() : null;
  }, z.string().email().max(255).nullable().optional())
  .transform((value) => value ?? null);

const naverOAuthProfileResponseSchema = z
  .object({
    response: z
      .object({
        email: nullableEmailSchema,
        id: z.string().trim().min(1).max(255),
        name: nullableTrimmedStringSchema,
        nickname: nullableTrimmedStringSchema,
        profile_image: nullableTrimmedStringSchema
      })
      .passthrough()
  })
  .passthrough();

export type NormalizedOAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  profileImageUrl: string | null;
};

export type FetchOAuthProfileOptions = {
  provider: OAuthProvider;
  accessToken: string;
  fetcher?: typeof fetch;
};

export class OAuthProfileFetchError extends Error {
  readonly oauthError = OAUTH_PROFILE_FETCH_FAILED;

  constructor(readonly provider: OAuthProvider) {
    super("OAuth profile fetch failed");
    this.name = "OAuthProfileFetchError";
  }
}

export async function fetchOAuthProfile(
  options: FetchOAuthProfileOptions
): Promise<NormalizedOAuthProfile> {
  const providerConfig = getOAuthProviderStaticConfig(options.provider);
  const profileResponse = await requestProfile(
    options.fetcher ?? fetch,
    options.provider,
    providerConfig.profileUrl,
    options.accessToken
  );

  if (options.provider === "naver") {
    return normalizeNaverOAuthProfile(profileResponse);
  }

  throw new OAuthProfileFetchError(options.provider);
}

export function normalizeNaverOAuthProfile(profileResponse: unknown): NormalizedOAuthProfile {
  const parsedProfile = naverOAuthProfileResponseSchema.safeParse(profileResponse);

  if (!parsedProfile.success) {
    throw new OAuthProfileFetchError("naver");
  }

  const profile = parsedProfile.data.response;
  const displayName = profile.nickname ?? profile.name ?? "Naver User";

  return {
    provider: "naver",
    providerUserId: profile.id,
    email: profile.email,
    emailVerified: profile.email !== null,
    displayName: displayName.slice(0, 120),
    profileImageUrl: profile.profile_image
  };
}

async function requestProfile(
  fetcher: typeof fetch,
  provider: OAuthProvider,
  profileUrl: string,
  accessToken: string
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetcher(profileUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`
      },
      method: "GET"
    });
  } catch {
    throw new OAuthProfileFetchError(provider);
  }

  if (!response.ok) {
    throw new OAuthProfileFetchError(provider);
  }

  try {
    return await response.json();
  } catch {
    throw new OAuthProfileFetchError(provider);
  }
}
