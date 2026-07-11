import { requireOAuthProviderConfig } from "./oauth-providers.js";
import { requireAuthTokenSecret } from "../config/env.js";

export function validateProductionAuthConfig(): void {
  requireAuthTokenSecret();
  requireOAuthProviderConfig("naver");
  requireOAuthProviderConfig("kakao");
  requireOAuthProviderConfig("github");
}
