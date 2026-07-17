import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubAppState } from "./github-app-state.js";
import type { GitHubAppClient, GitHubAppInstallation } from "./github-app-client.js";
import {
  completeGitHubInstallationUserAuthorization,
  createGitHubInstallationUserAuthorization,
  listGitHubAccountInstallations,
  listGitHubInstallationRepositories,
  SourceRepositoryConflictError,
  SourceRepositoryStateError,
  type GitHubInstallationConnectionRecord,
  type SourceRepositoryRepository
} from "./source-repository-service.js";

const stateSecret = "github-app-state-secret-for-tests";
const installation: GitHubAppInstallation = {
  installationId: "installation-101",
  accountId: "github-account-501",
  accountLogin: "octocat",
  accountType: "User",
  repositorySelection: "selected",
  htmlUrl: "https://github.com/settings/installations/101"
};

test("account callback connects a GitHub installation without a GitHub OAuth login", async () => {
  const userId = "password-login-user";
  const { state } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret
  });
  let connectedInstallationId: string | null = null;
  const repository = createRepository({
    async findActiveGitHubInstallationConnection() {
      return createConnection(userId, installation.installationId);
    },
    async connectGitHubInstallation(input: {
      userId: string;
      installation: GitHubAppInstallation;
    }) {
      connectedInstallationId = input.installation.installationId;
      return { userId: input.userId };
    }
  });

  const result = await listGitHubInstallationRepositories(
    {
      installationId: installation.installationId,
      state,
      stateSecret,
      accessContext: { kind: "user", userId }
    },
    repository,
    createGitHubAppClient([installation])
  );

  assert.deepEqual(result, { scope: "account" });
  assert.equal(connectedInstallationId, installation.installationId);
});

test("GitHub App user authorization connects an installation without changing login identity", async () => {
  const userId = "naver-login-user";
  const { state: setupState } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret
  });
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
  const config = {
    clientId: "github-app-client-id",
    clientSecret: "github-app-client-secret",
    callbackUrl:
      "https://sketchcatch.test/api/source-repositories/github/user-authorization/callback"
  };
  const authorization = await createGitHubInstallationUserAuthorization(
    {
      installationId: installation.installationId,
      setupState,
      accessContext: { kind: "user", userId },
      stateSecret,
      config
    },
    repository
  );
  const authorizationState = new URL(authorization.authorizationUrl).searchParams.get("state");
  assert.ok(authorizationState);

  const result = await completeGitHubInstallationUserAuthorization(
    {
      code: "provider-code",
      authorizationState,
      cookie: authorization.cookie,
      accessContext: { kind: "user", userId },
      stateSecret,
      config,
      fetcher: createUserAuthorizationFetch([installation])
    },
    repository
  );

  assert.deepEqual(result, {
    installationId: installation.installationId,
    setupState
  });
  assert.equal(connectedUserId, userId);
});

test("spoofed setup installation ids fail provider user-access verification", async () => {
  const userId = "password-login-user";
  const { state: setupState } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret
  });
  let connectionAttempted = false;
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [];
    },
    async connectGitHubInstallation() {
      connectionAttempted = true;
      return createConnection(userId, "spoofed-installation");
    }
  });
  const config = {
    clientId: "github-app-client-id",
    clientSecret: "github-app-client-secret",
    callbackUrl:
      "https://sketchcatch.test/api/source-repositories/github/user-authorization/callback"
  };
  const authorization = await createGitHubInstallationUserAuthorization(
    {
      installationId: "spoofed-installation",
      setupState,
      accessContext: { kind: "user", userId },
      stateSecret,
      config
    },
    repository
  );
  const authorizationState = new URL(authorization.authorizationUrl).searchParams.get("state");
  assert.ok(authorizationState);

  await assert.rejects(
    completeGitHubInstallationUserAuthorization(
      {
        code: "provider-code",
        authorizationState,
        cookie: authorization.cookie,
        accessContext: { kind: "user", userId },
        stateSecret,
        config,
        fetcher: createUserAuthorizationFetch([installation])
      },
      repository
    ),
    (error) =>
      error instanceof SourceRepositoryConflictError &&
      error.message === "GIT_APP_INSTALLATION_FORBIDDEN"
  );
  assert.equal(connectionAttempted, false);
});

test("GitHub App authorization rejects a second active account", async () => {
  const userId = "password-login-user";
  const { state: setupState } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret
  });
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [createConnection(userId, "installation-existing")];
    }
  });

  await assert.rejects(
    createGitHubInstallationUserAuthorization(
      {
        installationId: installation.installationId,
        setupState,
        accessContext: { kind: "user", userId },
        stateSecret,
        config: {
          clientId: "github-app-client-id",
          callbackUrl:
            "https://sketchcatch.test/api/source-repositories/github/user-authorization/callback"
        }
      },
      repository
    ),
    (error) =>
      error instanceof SourceRepositoryConflictError &&
      error.message === "MULTIPLE_GITHUB_INSTALLATIONS_UNSUPPORTED"
  );
});

test("GitHub App authorization rechecks the single-account invariant at completion", async () => {
  const userId = "password-login-user";
  const { state: setupState } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret
  });
  let listCalls = 0;
  let connectionAttempted = false;
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      listCalls += 1;
      return listCalls === 1
        ? []
        : [createConnection(userId, "installation-concurrently-connected")];
    },
    async connectGitHubInstallation() {
      connectionAttempted = true;
      return createConnection(userId, installation.installationId);
    }
  });
  const config = {
    clientId: "github-app-client-id",
    clientSecret: "github-app-client-secret",
    callbackUrl:
      "https://sketchcatch.test/api/source-repositories/github/user-authorization/callback"
  };
  const authorization = await createGitHubInstallationUserAuthorization(
    {
      installationId: installation.installationId,
      setupState,
      accessContext: { kind: "user", userId },
      stateSecret,
      config
    },
    repository
  );
  const authorizationState = new URL(authorization.authorizationUrl).searchParams.get("state");
  assert.ok(authorizationState);

  await assert.rejects(
    completeGitHubInstallationUserAuthorization(
      {
        code: "provider-code",
        authorizationState,
        cookie: authorization.cookie,
        accessContext: { kind: "user", userId },
        stateSecret,
        config,
        fetcher: createUserAuthorizationFetch([installation])
      },
      repository
    ),
    (error) =>
      error instanceof SourceRepositoryConflictError &&
      error.message === "MULTIPLE_GITHUB_INSTALLATIONS_UNSUPPORTED"
  );
  assert.equal(connectionAttempted, false);
});

test("account callback rejects an installation already connected to another user", async () => {
  const userId = "naver-login-user";
  const { state } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret
  });
  const repository = createRepository({
    async findActiveGitHubInstallationConnection() {
      return undefined;
    }
  });

  await assert.rejects(
    listGitHubInstallationRepositories(
      {
        installationId: installation.installationId,
        state,
        stateSecret,
        accessContext: { kind: "user", userId }
      },
      repository,
      createGitHubAppClient([installation])
    ),
    (error) =>
      error instanceof SourceRepositoryConflictError &&
      error.message === "GIT_APP_INSTALLATION_FORBIDDEN"
  );
});

test("project callback connects the installation and returns its repositories", async () => {
  const userId = "naver-login-user";
  const projectId = "project-1";
  const { state } = await createGitHubAppState({
    scope: "project",
    userId,
    projectId,
    secret: stateSecret
  });
  const repository = createRepository({
    async findAccessibleProject() {
      return { id: projectId, userId };
    },
    async findActiveGitHubInstallationConnection() {
      return createConnection(userId, installation.installationId);
    },
    async connectGitHubInstallation() {
      return createConnection(userId, installation.installationId);
    }
  });

  const result = await listGitHubInstallationRepositories(
    {
      installationId: installation.installationId,
      state,
      stateSecret,
      accessContext: { kind: "user", userId }
    },
    repository,
    createGitHubAppClient([installation], 1)
  );

  assert.equal(result.scope, "project");
  assert.equal(result.scope === "project" ? result.projectId : null, projectId);
  assert.equal(result.scope === "project" ? result.repositories.length : 0, 1);
});

test("expired callback state cannot create an installation connection", async () => {
  const userId = "password-login-user";
  const { state } = await createGitHubAppState({
    scope: "account",
    userId,
    secret: stateSecret,
    now: () => new Date("2025-01-01T00:00:00.000Z")
  });
  let connectionAttempted = false;
  const repository = createRepository({
    async connectGitHubInstallation() {
      connectionAttempted = true;
      return createConnection(userId, installation.installationId);
    }
  });

  await assert.rejects(
    listGitHubInstallationRepositories(
      {
        installationId: installation.installationId,
        state,
        stateSecret,
        accessContext: { kind: "user", userId }
      },
      repository,
      createGitHubAppClient([installation])
    ),
    (error) => error instanceof SourceRepositoryStateError
  );
  assert.equal(connectionAttempted, false);
});

test("account settings lists only persisted installation connections", async () => {
  const userId = "kakao-login-user";
  const connection = createConnection(userId, installation.installationId);
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [connection];
    },
    async connectGitHubInstallation() {
      return connection;
    }
  });
  const client = createGitHubAppClient([installation], 2);

  const result = await listGitHubAccountInstallations(
    { accessContext: { kind: "user", userId } },
    repository,
    client
  );

  assert.deepEqual(result, {
    installations: [
      {
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositorySelection: installation.repositorySelection,
        repositoryCount: 2,
        htmlUrl: installation.htmlUrl
      }
    ]
  });
});

test("missing GitHub App installations are disconnected and omitted", async () => {
  const userId = "password-login-user";
  const connection = createConnection(userId, installation.installationId);
  let disconnectedInstallationId: string | null = null;
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [connection];
    },
    async markGitHubInstallationDisconnected(_userId: string, installationId: string) {
      disconnectedInstallationId = installationId;
    }
  });

  const result = await listGitHubAccountInstallations(
    { accessContext: { kind: "user", userId } },
    repository,
    createGitHubAppClient([])
  );

  assert.deepEqual(result, { installations: [] });
  assert.equal(disconnectedInstallationId, installation.installationId);
});

test("repository access failures disconnect and omit the installation", async () => {
  const userId = "github-login-user";
  const connection = createConnection(userId, installation.installationId);
  let disconnectedInstallationId: string | null = null;
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [connection];
    },
    async connectGitHubInstallation() {
      return connection;
    },
    async markGitHubInstallationDisconnected(_userId: string, installationId: string) {
      disconnectedInstallationId = installationId;
    }
  });
  const client = createGitHubAppClient([installation]);
  client.listInstallationRepositories = async () => {
    const error = new Error("GitHub installation access forbidden") as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    throw error;
  };

  const result = await listGitHubAccountInstallations(
    { accessContext: { kind: "user", userId } },
    repository,
    client
  );

  assert.deepEqual(result, { installations: [] });
  assert.equal(disconnectedInstallationId, installation.installationId);
});

function createRepository(
  overrides: Record<string, unknown>
): SourceRepositoryRepository {
  return {
    async connectGitHubInstallation() {
      throw new Error("Unexpected connectGitHubInstallation call");
    },
    async listActiveGitHubInstallationConnections() {
      throw new Error("Unexpected listActiveGitHubInstallationConnections call");
    },
    async findActiveGitHubInstallationConnection() {
      throw new Error("Unexpected findActiveGitHubInstallationConnection call");
    },
    async markGitHubInstallationDisconnected() {
      throw new Error("Unexpected markGitHubInstallationDisconnected call");
    },
    async findAccessibleProject() {
      throw new Error("Unexpected findAccessibleProject call");
    },
    async listProjectSourceRepositories() {
      throw new Error("Unexpected listProjectSourceRepositories call");
    },
    async findProjectSourceRepository() {
      throw new Error("Unexpected findProjectSourceRepository call");
    },
    async createActiveGitHubSourceRepository() {
      throw new Error("Unexpected createActiveGitHubSourceRepository call");
    },
    async saveProjectSourceRepositoryAnalysis() {
      throw new Error("Unexpected saveProjectSourceRepositoryAnalysis call");
    },
    ...overrides
  } as SourceRepositoryRepository;
}

function createGitHubAppClient(
  installations: GitHubAppInstallation[],
  repositoryCount = 0
): GitHubAppClient {
  return {
    async listInstallations() {
      return installations;
    },
    async listInstallationRepositories() {
      return Array.from({ length: repositoryCount }, (_, index) => ({
        githubRepositoryId: `repository-${index + 1}`,
        owner: installation.accountLogin,
        name: `repository-${index + 1}`,
        fullName: `${installation.accountLogin}/repository-${index + 1}`,
        defaultBranch: "main",
        repositoryUrl: `https://github.com/${installation.accountLogin}/repository-${index + 1}`,
        visibility: "private" as const,
        archived: false
      }));
    }
  } as unknown as GitHubAppClient;
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

function createConnection(
  userId: string,
  installationId: string
): GitHubInstallationConnectionRecord {
  const now = new Date("2026-07-15T00:00:00.000Z");
  return {
    id: "connection-1",
    userId,
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
