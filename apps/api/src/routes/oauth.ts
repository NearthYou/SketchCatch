import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { fetchOAuthProfile, OAuthProfileFetchError } from "../auth/oauth-profile.js";
import {
  getOAuthProviderStaticConfig,
  requireOAuthProviderConfig
} from "../auth/oauth-providers.js";
import {
  clearOAuthStateCookie,
  createOAuthState,
  readOAuthStateCookie,
  setOAuthStateCookie
} from "../auth/oauth-state.js";
import { exchangeOAuthCodeForAccessToken, OAuthTokenExchangeError } from "../auth/oauth-token.js";
import { findOrCreateOAuthUser, OAuthUserConnectionError } from "../auth/oauth-users.js";
import { createAuthSession } from "../auth/session.js";
import { type DatabaseClient, getDatabaseClient } from "../db/client.js";

const oauthStartParamsSchema = z.object({
  provider: z.enum(["naver", "kakao", "github"])
});

const oauthCallbackQuerySchema = z
  .object({
    code: z.string().trim().min(1).optional(),
    error: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional()
  })
  .passthrough();

const OAUTH_PROVIDER_ERROR = "provider_error";
const OAUTH_INVALID_CALLBACK = "invalid_callback";
const OAUTH_STATE_MISMATCH = "state_mismatch";
const OAUTH_SESSION_FAILED = "session_failed";

type OAuthRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export async function registerOAuthRoutes(
  app: FastifyInstance,
  options: OAuthRouteOptions = {}
): Promise<void> {
  const getOAuthDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;

  app.get("/auth/oauth/:provider/start", async (request, reply) => {
    const { provider } = oauthStartParamsSchema.parse(request.params);
    const providerConfig = getOAuthProviderStaticConfig(provider);
    const runtimeConfig = requireOAuthProviderConfig(provider);
    const state = createOAuthState();
    const redirectUri = `${runtimeConfig.redirectBaseUrl}/api/auth/oauth/${provider}/callback`;
    const authorizationUrl = new URL(providerConfig.authorizationUrl);

    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", runtimeConfig.clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);

    if (providerConfig.scopes.length > 0) {
      authorizationUrl.searchParams.set("scope", providerConfig.scopes.join(" "));
    }

    setOAuthStateCookie(reply, {
      provider,
      state
    });

    return reply.redirect(authorizationUrl.toString());
  });

  app.get("/auth/oauth/:provider/callback", async (request, reply) => {
    const { provider } = oauthStartParamsSchema.parse(request.params);
    const query = oauthCallbackQuerySchema.parse(request.query);

    if (!query.state) {
      return redirectToLoginWithOAuthError(reply, OAUTH_INVALID_CALLBACK);
    }

    const storedState = readOAuthStateCookie(request);

    if (!storedState || storedState.provider !== provider || storedState.state !== query.state) {
      return redirectToLoginWithOAuthError(reply, OAUTH_STATE_MISMATCH);
    }

    if (query.error) {
      return redirectToLoginWithOAuthError(reply, OAUTH_PROVIDER_ERROR);
    }

    if (!query.code) {
      return redirectToLoginWithOAuthError(reply, OAUTH_INVALID_CALLBACK);
    }

    try {
      const { accessToken } = await exchangeOAuthCodeForAccessToken({
        code: query.code,
        provider,
        state: query.state
      });
      const profile = await fetchOAuthProfile({
        accessToken,
        provider
      });
      const { db } = getOAuthDatabaseClient();
      const user = await findOrCreateOAuthUser(db, profile);

      await createAuthSession(db, user.id, request, reply);
      clearOAuthStateCookie(reply);

      return reply.redirect("/mypage");
    } catch (error) {
      return redirectToLoginWithOAuthError(reply, getOAuthCallbackError(error));
    }
  });
}

function redirectToLoginWithOAuthError(reply: FastifyReply, oauthError: string): FastifyReply {
  clearOAuthStateCookie(reply);

  return reply.redirect(`/login?${new URLSearchParams({ oauthError }).toString()}`);
}

function getOAuthCallbackError(error: unknown): string {
  if (error instanceof OAuthTokenExchangeError) {
    return error.oauthError;
  }

  if (error instanceof OAuthProfileFetchError) {
    return error.oauthError;
  }

  if (error instanceof OAuthUserConnectionError) {
    return error.oauthError;
  }

  return OAUTH_SESSION_FAILED;
}
