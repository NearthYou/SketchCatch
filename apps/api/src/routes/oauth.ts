import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createOAuthState, setOAuthStateCookie } from "../auth/oauth-state.js";
import {
  getOAuthProviderStaticConfig,
  requireOAuthProviderConfig
} from "../auth/oauth-providers.js";

const oauthStartParamsSchema = z.object({
  provider: z.literal("naver")
});

export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
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
}
