import type { OAuthProvider } from "@sketchcatch/types";
import { getRuntimeEnv, type RuntimeEnv } from "../config/env.js";

export type OAuthProviderStaticConfig = {
  authorizationUrl: string;
  tokenUrl: string;
  profileUrl: string;
  scopes: string[];
};

export type OAuthProviderRuntimeConfig = {
  clientId: string;
  clientSecret: string;
  redirectBaseUrl: string;
};

export const oauthProviderConfigs: Partial<Record<OAuthProvider, OAuthProviderStaticConfig>> = {
  naver: {
    authorizationUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    profileUrl: "https://openapi.naver.com/v1/nid/me",
    scopes: []
  }
};

export function getOAuthProviderStaticConfig(
  provider: OAuthProvider
): OAuthProviderStaticConfig {
  const config = oauthProviderConfigs[provider];

  if (!config) {
    throw new Error(`${provider} OAuth provider is not configured yet`);
  }

  return config;
}

export function requireOAuthProviderConfig(
  provider: OAuthProvider,
  env: RuntimeEnv = getRuntimeEnv()
): OAuthProviderRuntimeConfig {
  getOAuthProviderStaticConfig(provider);

  const { clientId, clientSecret } = getOAuthProviderCredentials(provider, env);

  return {
    clientId,
    clientSecret,
    redirectBaseUrl: requireEnvValue("OAUTH_REDIRECT_BASE_URL", env.oauthRedirectBaseUrl).replace(
      /\/+$/,
      ""
    )
  };
}

function getOAuthProviderCredentials(
  provider: OAuthProvider,
  env: RuntimeEnv
): Pick<OAuthProviderRuntimeConfig, "clientId" | "clientSecret"> {
  switch (provider) {
    case "naver":
      return {
        clientId: requireEnvValue("NAVER_OAUTH_CLIENT_ID", env.naverOauthClientId),
        clientSecret: requireEnvValue("NAVER_OAUTH_CLIENT_SECRET", env.naverOauthClientSecret)
      };
    case "google":
      return {
        clientId: requireEnvValue("GOOGLE_OAUTH_CLIENT_ID", env.googleOauthClientId),
        clientSecret: requireEnvValue("GOOGLE_OAUTH_CLIENT_SECRET", env.googleOauthClientSecret)
      };
    case "kakao":
      return {
        clientId: requireEnvValue("KAKAO_OAUTH_CLIENT_ID", env.kakaoOauthClientId),
        clientSecret: requireEnvValue("KAKAO_OAUTH_CLIENT_SECRET", env.kakaoOauthClientSecret)
      };
    case "github":
      return {
        clientId: requireEnvValue("GITHUB_OAUTH_CLIENT_ID", env.githubOauthClientId),
        clientSecret: requireEnvValue("GITHUB_OAUTH_CLIENT_SECRET", env.githubOauthClientSecret)
      };
  }
}

function requireEnvValue(name: string, value: string | undefined): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required`);
  }

  return normalizedValue;
}
