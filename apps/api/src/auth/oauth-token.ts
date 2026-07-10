import type { OAuthProvider } from "@sketchcatch/types";
import { z } from "zod";
import type { RuntimeEnv } from "../config/env.js";
import { getOAuthProviderStaticConfig, requireOAuthProviderConfig } from "./oauth-providers.js";

export const OAUTH_TOKEN_EXCHANGE_FAILED = "token_exchange_failed";

const OAUTH_TOKEN_USER_AGENT = "SketchCatch-OAuth/1.0";

const oauthTokenResponseSchema = z
  .object({
    access_token: z.string().min(1)
  })
  .passthrough();

export type OAuthProviderAccessToken = {
  accessToken: string;
};

export type ExchangeOAuthCodeForAccessTokenOptions = {
  provider: OAuthProvider;
  code: string;
  state: string;
  redirectPath?: string;
  env?: RuntimeEnv;
  fetcher?: typeof fetch;
};

export class OAuthTokenExchangeError extends Error {
  readonly oauthError = OAUTH_TOKEN_EXCHANGE_FAILED;

  constructor(readonly provider: OAuthProvider) {
    super("OAuth token exchange failed");
    this.name = "OAuthTokenExchangeError";
  }
}

export async function exchangeOAuthCodeForAccessToken(
  options: ExchangeOAuthCodeForAccessTokenOptions
): Promise<OAuthProviderAccessToken> {
  const providerConfig = getOAuthProviderStaticConfig(options.provider);
  const runtimeConfig = requireOAuthProviderConfig(options.provider, options.env);
  const redirectPath = options.redirectPath ?? `/api/auth/oauth/${options.provider}/callback`;
  const redirectUri = `${runtimeConfig.redirectBaseUrl}${redirectPath}`;
  const body = new URLSearchParams({
    client_id: runtimeConfig.clientId,
    code: options.code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    state: options.state
  });

  if (runtimeConfig.clientSecret) {
    body.set("client_secret", runtimeConfig.clientSecret);
  }

  const tokenResponse = await requestToken(
    options.fetcher ?? fetch,
    options.provider,
    providerConfig.tokenUrl,
    body
  );
  const parsedResponse = oauthTokenResponseSchema.safeParse(tokenResponse);

  if (!parsedResponse.success) {
    throw new OAuthTokenExchangeError(options.provider);
  }

  return {
    accessToken: parsedResponse.data.access_token
  };
}

async function requestToken(
  fetcher: typeof fetch,
  provider: OAuthProvider,
  tokenUrl: string,
  body: URLSearchParams
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetcher(tokenUrl, {
      body,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": OAUTH_TOKEN_USER_AGENT
      },
      method: "POST"
    });
  } catch {
    throw new OAuthTokenExchangeError(provider);
  }

  if (!response.ok) {
    throw new OAuthTokenExchangeError(provider);
  }

  try {
    return await response.json();
  } catch {
    throw new OAuthTokenExchangeError(provider);
  }
}
