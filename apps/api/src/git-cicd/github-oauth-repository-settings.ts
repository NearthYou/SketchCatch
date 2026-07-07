import { randomUUID } from "node:crypto";
import type {
  GitCicdGitHubOAuthStartResponse,
  GitCicdRepositorySettingsApplyResponse
} from "@sketchcatch/types";
import { getOAuthProviderStaticConfig, requireOAuthProviderConfig } from "../auth/oauth-providers.js";
import { exchangeOAuthCodeForAccessToken } from "../auth/oauth-token.js";
import type { RuntimeCache, RuntimeCacheJsonValue } from "../runtime-cache/index.js";
import {
  applyGitCicdRepositorySettings,
  createGitHubOAuthRepositorySettingsApplier,
  GitCicdRepositorySettingsPermissionError,
  type GitCicdRepositorySettingsApplier
} from "./git-cicd-repository-settings-service.js";
import {
  getGitCicdHandoff,
  type GitCicdHandoffRepository,
  type ProjectAccessContext
} from "./git-cicd-handoff-service.js";

const namespace = "git-cicd-github-oauth";
const callbackPath = "/api/git-cicd-handoffs/github-oauth/callback";
const grantTtlMs = 10 * 60 * 1000;
const scopes = ["repo", "workflow"];

type GitHubOAuthStateValue = {
  type: "state";
  handoffId: string;
  userId: string;
};

type GitHubOAuthTokenValue = {
  type: "token";
  accessToken: string;
};

export type CreateGitHubRepositorySettingsOAuthStartInput = {
  handoffId: string;
  accessContext: ProjectAccessContext;
  now?: () => Date;
  createState?: () => string;
};

export type CompleteGitHubRepositorySettingsOAuthCallbackInput = {
  code: string;
  state: string;
  runtimeCache: RuntimeCache;
  fetcher?: typeof fetch;
};

export type ApplyGitHubOAuthRepositorySettingsInput = {
  handoffId: string;
  accessContext: ProjectAccessContext;
  runtimeCache: RuntimeCache;
  createApplier?: (accessToken: string) => GitCicdRepositorySettingsApplier;
};

export async function createGitHubRepositorySettingsOAuthStart(
  input: CreateGitHubRepositorySettingsOAuthStartInput,
  repository: GitCicdHandoffRepository,
  runtimeCache: RuntimeCache
): Promise<GitCicdGitHubOAuthStartResponse> {
  const handoff = await getGitCicdHandoff(
    {
      handoffId: input.handoffId,
      accessContext: input.accessContext
    },
    repository
  );

  if (handoff.repositoryProvider !== "github") {
    throw new GitCicdRepositorySettingsPermissionError(
      "GitHub OAuth can be used only for GitHub handoffs"
    );
  }

  const state = input.createState?.() ?? randomUUID();
  const now = input.now?.() ?? new Date();
  const expiresAt = new Date(now.getTime() + grantTtlMs);

  await runtimeCache.set(
    createStateKey(state),
    {
      type: "state",
      handoffId: input.handoffId,
      userId: input.accessContext.userId
    } satisfies GitHubOAuthStateValue,
    { ttlMs: grantTtlMs }
  );

  const providerConfig = getOAuthProviderStaticConfig("github");
  const runtimeConfig = requireOAuthProviderConfig("github");
  const authorizationUrl = new URL(providerConfig.authorizationUrl);

  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", runtimeConfig.clientId);
  authorizationUrl.searchParams.set("redirect_uri", `${runtimeConfig.redirectBaseUrl}${callbackPath}`);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("scope", scopes.join(" "));

  return {
    authorizationUrl: authorizationUrl.toString(),
    expiresAt: expiresAt.toISOString()
  };
}

export async function completeGitHubRepositorySettingsOAuthCallback(
  input: CompleteGitHubRepositorySettingsOAuthCallbackInput
): Promise<string> {
  const stateValue = await input.runtimeCache.get(createStateKey(input.state));
  const state = readStateValue(stateValue);

  if (!state) {
    throw new GitCicdRepositorySettingsPermissionError("GitHub OAuth state is missing or expired");
  }

  await input.runtimeCache.delete(createStateKey(input.state));

  const { accessToken } = await exchangeOAuthCodeForAccessToken({
    provider: "github",
    code: input.code,
    state: input.state,
    redirectPath: callbackPath,
    ...(input.fetcher ? { fetcher: input.fetcher } : {})
  });

  await input.runtimeCache.set(
    createTokenKey(state.handoffId, state.userId),
    {
      type: "token",
      accessToken
    } satisfies GitHubOAuthTokenValue,
    { ttlMs: grantTtlMs }
  );

  return state.handoffId;
}

export async function applyGitHubOAuthRepositorySettings(
  input: ApplyGitHubOAuthRepositorySettingsInput,
  repository: GitCicdHandoffRepository
): Promise<GitCicdRepositorySettingsApplyResponse> {
  const tokenValue = await input.runtimeCache.get(
    createTokenKey(input.handoffId, input.accessContext.userId)
  );
  const token = readTokenValue(tokenValue);

  if (!token) {
    throw new GitCicdRepositorySettingsPermissionError(
      "GitHub OAuth approval is required before repository settings can be applied"
    );
  }

  try {
    return await applyGitCicdRepositorySettings(
      {
        handoffId: input.handoffId,
        accessContext: input.accessContext
      },
      repository,
      input.createApplier?.(token.accessToken) ??
        createGitHubOAuthRepositorySettingsApplier(token.accessToken)
    );
  } finally {
    await input.runtimeCache.delete(createTokenKey(input.handoffId, input.accessContext.userId));
  }
}

function createStateKey(state: string) {
  return {
    namespace,
    key: `state:${state}`
  };
}

function createTokenKey(handoffId: string, userId: string) {
  return {
    namespace,
    key: `token:${handoffId}:${userId}`
  };
}

function readStateValue(value: RuntimeCacheJsonValue | null): GitHubOAuthStateValue | null {
  if (!isObject(value)) {
    return null;
  }

  return value.type === "state" &&
    typeof value.handoffId === "string" &&
    typeof value.userId === "string"
    ? {
        type: "state",
        handoffId: value.handoffId,
        userId: value.userId
      }
    : null;
}

function readTokenValue(value: RuntimeCacheJsonValue | null): GitHubOAuthTokenValue | null {
  if (!isObject(value)) {
    return null;
  }

  return value.type === "token" && typeof value.accessToken === "string"
    ? {
        type: "token",
        accessToken: value.accessToken
      }
    : null;
}

function isObject(value: RuntimeCacheJsonValue | null): value is { [key: string]: RuntimeCacheJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
