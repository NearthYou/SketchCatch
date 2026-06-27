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

const kakaoOAuthProfileResponseSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform(String),
    kakao_account: z
      .object({
        email: nullableEmailSchema,
        is_email_valid: z.boolean().optional(),
        is_email_verified: z.boolean().optional(),
        profile: z
          .object({
            nickname: nullableTrimmedStringSchema,
            profile_image_url: nullableTrimmedStringSchema,
            thumbnail_image_url: nullableTrimmedStringSchema
          })
          .passthrough()
          .optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const githubOAuthProfileResponseSchema = z
  .object({
    avatar_url: nullableTrimmedStringSchema,
    email: nullableEmailSchema,
    id: z.union([z.number(), z.string()]).transform(String),
    login: z.string().trim().min(1).max(255),
    name: nullableTrimmedStringSchema
  })
  .passthrough();

const githubEmailResponseSchema = z.array(
  z
    .object({
      email: nullableEmailSchema,
      primary: z.boolean().optional(),
      verified: z.boolean().optional()
    })
    .passthrough()
);

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

  if (options.provider === "kakao") {
    return normalizeKakaoOAuthProfile(profileResponse);
  }

  if (options.provider === "github") {
    if (!providerConfig.emailUrl) {
      throw new OAuthProfileFetchError(options.provider);
    }

    const emailResponse = await requestProfile(
      options.fetcher ?? fetch,
      options.provider,
      providerConfig.emailUrl,
      options.accessToken
    );

    return normalizeGitHubOAuthProfile(profileResponse, emailResponse);
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

export function normalizeKakaoOAuthProfile(profileResponse: unknown): NormalizedOAuthProfile {
  const parsedProfile = kakaoOAuthProfileResponseSchema.safeParse(profileResponse);

  if (!parsedProfile.success) {
    throw new OAuthProfileFetchError("kakao");
  }

  const profile = parsedProfile.data;
  const kakaoAccount = profile.kakao_account;
  const kakaoProfile = kakaoAccount?.profile;
  const displayName = kakaoProfile?.nickname ?? "Kakao User";
  const email = kakaoAccount?.email ?? null;
  const emailVerified = Boolean(
    email && kakaoAccount?.is_email_valid !== false && kakaoAccount?.is_email_verified === true
  );

  return {
    provider: "kakao",
    providerUserId: profile.id,
    email,
    emailVerified,
    displayName: displayName.slice(0, 120),
    profileImageUrl: kakaoProfile?.profile_image_url ?? kakaoProfile?.thumbnail_image_url ?? null
  };
}

export function normalizeGitHubOAuthProfile(
  profileResponse: unknown,
  emailResponse: unknown
): NormalizedOAuthProfile {
  const parsedProfile = githubOAuthProfileResponseSchema.safeParse(profileResponse);
  const parsedEmails = githubEmailResponseSchema.safeParse(emailResponse);

  if (!parsedProfile.success || !parsedEmails.success) {
    throw new OAuthProfileFetchError("github");
  }

  const profile = parsedProfile.data;
  const verifiedEmail = findGitHubVerifiedEmail(parsedEmails.data);
  const displayName = profile.name ?? profile.login;

  return {
    provider: "github",
    providerUserId: profile.id,
    email: verifiedEmail,
    emailVerified: verifiedEmail !== null,
    displayName: displayName.slice(0, 120),
    profileImageUrl: profile.avatar_url
  };
}

function findGitHubVerifiedEmail(emails: z.infer<typeof githubEmailResponseSchema>): string | null {
  const primaryVerifiedEmail = emails.find(
    (email) => email.primary && email.verified && email.email
  );

  if (primaryVerifiedEmail?.email) {
    return primaryVerifiedEmail.email;
  }

  return emails.find((email) => email.verified && email.email)?.email ?? null;
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
