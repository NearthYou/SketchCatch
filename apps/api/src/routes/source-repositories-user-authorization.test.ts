import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import type { DatabaseClient } from "../db/client.js";
import type { GitHubAppClient, GitHubAppInstallation } from "../source-repositories/github-app-client.js";
import { createGitHubAppState } from "../source-repositories/github-app-state.js";
import { createGitHubAppUserAuthorization } from "../source-repositories/github-app-user-authorization.js";
import type {
  GitHubInstallationConnectionRecord,
  SourceRepositoryRepository
} from "../source-repositories/source-repository-service.js";
import { registerSourceRepositoryRoutes } from "./source-repositories.js";

const stateSecret = "github-app-route-state-secret-for-tests";
const userId = "naver-login-user";
const installation: GitHubAppInstallation = {
  installationId: "installation-101",
  accountId: "github-account-501",
  accountLogin: "octocat",
  accountType: "User",
  repositorySelection: "selected",
  htmlUrl: "https://github.com/settings/installations/101"
};

test("GitHub user authorization callback completes without a bearer token", async () => {
  const { state: setupState } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret
  });
  const userAuthorizationConfig = {
    clientId: "github-app-client-id",
    clientSecret: "github-app-client-secret",
    callbackUrl:
      "https://sketchcatch.test/api/source-repositories/github/user-authorization/callback"
  };
  const authorization = await createGitHubAppUserAuthorization({
    userId,
    installationId: installation.installationId,
    setupState,
    stateSecret,
    config: userAuthorizationConfig
  });
  const authorizationState = new URL(authorization.authorizationUrl).searchParams.get("state");
  assert.ok(authorizationState);

  let connectedUserId: string | null = null;
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [];
    },
    async connectGitHubInstallation(input: {
      userId: string;
      installation: GitHubAppInstallation;
    }) {
      connectedUserId = input.userId;
      return createConnection(input.userId, input.installation.installationId);
    }
  });
  const app = Fastify();
  await app.register(registerSourceRepositoryRoutes, {
    getDatabaseClient: () => ({ db: {} }) as DatabaseClient,
    createSourceRepositoryRepository: () => repository,
    githubAppClient: {} as GitHubAppClient,
    githubAppSlug: "sketchcatch-test",
    githubAppStateSecret: stateSecret,
    githubAppCallbackUrl: "https://sketchcatch.test/integrations/github/callback",
    githubAppUserAuthorizationConfig: userAuthorizationConfig,
    githubAppUserAuthorizationFetch: createUserAuthorizationFetch([installation])
  });

  const response = await app.inject({
    method: "GET",
    url: `/source-repositories/github/user-authorization/callback?code=provider-code&state=${encodeURIComponent(authorizationState)}`,
    headers: {
      cookie: createAuthorizationCookie(authorization.cookie)
    }
  });

  assert.equal(response.statusCode, 302);
  assert.equal(connectedUserId, userId);
  const location = new URL(response.headers.location ?? "");
  assert.equal(location.searchParams.get("installation_id"), installation.installationId);
  assert.equal(location.searchParams.get("state"), setupState);
  assert.equal(location.searchParams.get("authorization"), "verified");
  await app.close();
});

function createAuthorizationCookie(value: { nonce: string; codeVerifier: string }): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", stateSecret)
    .update(payload)
    .digest("base64url");
  return `sketchcatch_github_app_authorization=${encodeURIComponent(`${payload}.${signature}`)}`;
}

function createUserAuthorizationFetch(
  installations: GitHubAppInstallation[]
): typeof fetch {
  return (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json({ access_token: "ghu_test_token" });
    }
    if (url.startsWith("https://api.github.com/user/installations")) {
      return Response.json({
        installations: installations.map((candidate) => ({
          id: candidate.installationId,
          account: {
            id: candidate.accountId,
            login: candidate.accountLogin,
            type: candidate.accountType
          },
          repository_selection: candidate.repositorySelection,
          html_url: candidate.htmlUrl
        }))
      });
    }
    throw new Error(`Unexpected GitHub URL: ${url}`);
  }) as typeof fetch;
}

function createRepository(
  overrides: Partial<SourceRepositoryRepository>
): SourceRepositoryRepository {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected repository call");
  };
  return {
    connectGitHubInstallation: unexpected,
    listActiveGitHubInstallationConnections: unexpected,
    findActiveGitHubInstallationConnection: unexpected,
    markGitHubInstallationDisconnected: unexpected,
    findAccessibleProject: unexpected,
    listProjectSourceRepositories: unexpected,
    findProjectSourceRepository: unexpected,
    createActiveGitHubSourceRepository: unexpected,
    saveProjectSourceRepositoryAnalysis: unexpected,
    ...overrides
  } as SourceRepositoryRepository;
}

function createConnection(
  connectionUserId: string,
  installationId: string
): GitHubInstallationConnectionRecord {
  const now = new Date("2026-07-15T00:00:00.000Z");
  return {
    id: "connection-1",
    userId: connectionUserId,
    githubInstallationId: installationId,
    accountId: installation.accountId,
    accountLogin: installation.accountLogin,
    accountType: installation.accountType,
    repositorySelection: installation.repositorySelection,
    htmlUrl: installation.htmlUrl,
    status: "active",
    connectedAt: now,
    lastVerifiedAt: now,
    disconnectedAt: null,
    createdAt: now,
    updatedAt: now
  };
}
