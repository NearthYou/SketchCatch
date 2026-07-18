import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import type { GitHubAppClient } from "../source-repositories/github-app-client.js";
import type {
  GitHubInstallationConnectionRecord,
  SourceRepositoryRepository
} from "../source-repositories/source-repository-service.js";
import { registerSourceRepositoryRoutes } from "./source-repositories.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const userId = "11111111-1111-4111-8111-111111111111";

test("GitHub installation availability is explicit when the server has no GitHub App configuration", async () => {
  const previousEnvironment = {
    appId: process.env.GIT_APP_ID,
    appSlug: process.env.GIT_APP_SLUG,
    callbackUrl: process.env.GIT_APP_CALLBACK_URL,
    privateKey: process.env.GIT_APP_PRIVATE_KEY_BASE64
  };
  delete process.env.GIT_APP_ID;
  delete process.env.GIT_APP_SLUG;
  delete process.env.GIT_APP_CALLBACK_URL;
  delete process.env.GIT_APP_PRIVATE_KEY_BASE64;

  const app = Fastify();
  await app.register(registerSourceRepositoryRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createSourceRepositoryRepository: () => createRepository()
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/source-repositories/github/installations",
      headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      availability: {
        connectionSetup: "not_configured",
        installationRead: "not_configured"
      },
      installations: []
    });
  } finally {
    await app.close();
    restoreEnvironmentValue("GIT_APP_ID", previousEnvironment.appId);
    restoreEnvironmentValue("GIT_APP_SLUG", previousEnvironment.appSlug);
    restoreEnvironmentValue("GIT_APP_CALLBACK_URL", previousEnvironment.callbackUrl);
    restoreEnvironmentValue("GIT_APP_PRIVATE_KEY_BASE64", previousEnvironment.privateKey);
  }
});

test("GitHub installation read stays available without install-url route configuration", async () => {
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [createInstallationConnection()];
    },
    async connectGitHubInstallation() {
      return createInstallationConnection();
    }
  });
  const app = Fastify();
  await app.register(registerSourceRepositoryRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createSourceRepositoryRepository: () => repository,
    githubAppClient: {
      async listInstallations() {
        return [githubInstallation];
      },
      async listInstallationRepositories() {
        return [];
      }
    } as unknown as GitHubAppClient
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/source-repositories/github/installations",
      headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      availability: {
        connectionSetup: "not_configured",
        installationRead: "ready"
      },
      installations: [
        {
          installationId: githubInstallation.installationId,
          accountLogin: githubInstallation.accountLogin,
          accountType: githubInstallation.accountType,
          repositorySelection: githubInstallation.repositorySelection,
          repositoryCount: 0,
          htmlUrl: githubInstallation.htmlUrl
        }
      ]
    });
  } finally {
    await app.close();
  }
});

test("GitHub installation listing preserves existing connections when only user authorization is unavailable", async () => {
  const previousClientId = process.env.GIT_APP_CLIENT_ID;
  const previousClientSecret = process.env.GIT_APP_CLIENT_SECRET;
  delete process.env.GIT_APP_CLIENT_ID;
  delete process.env.GIT_APP_CLIENT_SECRET;

  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [createInstallationConnection()];
    },
    async connectGitHubInstallation() {
      return createInstallationConnection();
    }
  });
  const app = Fastify();
  await app.register(registerSourceRepositoryRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createSourceRepositoryRepository: () => repository,
    githubAppClient: {
      async listInstallations() {
        return [githubInstallation];
      },
      async listInstallationRepositories() {
        return [
          {
            githubRepositoryId: "repository-1",
            owner: "sketchcatch",
            name: "app",
            fullName: "sketchcatch/app",
            defaultBranch: "main",
            repositoryUrl: "https://github.com/sketchcatch/app",
            visibility: "private",
            archived: false
          }
        ];
      }
    } as unknown as GitHubAppClient,
    githubAppSlug: "sketchcatch-test",
    githubAppStateSecret: "github-app-route-state-secret-for-tests",
    githubAppCallbackUrl: "https://sketchcatch.test/integrations/github/callback"
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/source-repositories/github/installations",
      headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      availability: {
        connectionSetup: "not_configured",
        installationRead: "ready"
      },
      installations: [
        {
          installationId: githubInstallation.installationId,
          accountLogin: githubInstallation.accountLogin,
          accountType: githubInstallation.accountType,
          repositorySelection: githubInstallation.repositorySelection,
          repositoryCount: 1,
          htmlUrl: githubInstallation.htmlUrl
        }
      ]
    });
  } finally {
    await app.close();
    restoreEnvironmentValue("GIT_APP_CLIENT_ID", previousClientId);
    restoreEnvironmentValue("GIT_APP_CLIENT_SECRET", previousClientSecret);
  }
});

test("GitHub installation availability is ready when read and connection setup are configured", async () => {
  const repository = createRepository({
    async listActiveGitHubInstallationConnections() {
      return [createInstallationConnection()];
    },
    async connectGitHubInstallation() {
      return createInstallationConnection();
    }
  });
  const app = Fastify();
  await app.register(registerSourceRepositoryRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createSourceRepositoryRepository: () => repository,
    githubAppClient: {
      async listInstallations() {
        return [githubInstallation];
      },
      async listInstallationRepositories() {
        return [];
      }
    } as unknown as GitHubAppClient,
    githubAppSlug: "sketchcatch-test",
    githubAppStateSecret: "github-app-route-state-secret-for-tests",
    githubAppCallbackUrl: "https://sketchcatch.test/integrations/github/callback",
    githubAppUserAuthorizationConfig: {
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
      callbackUrl: "https://sketchcatch.test/api/source-repositories/github/user-authorization/callback"
    }
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/source-repositories/github/installations",
      headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      availability: {
        connectionSetup: "ready",
        installationRead: "ready"
      },
      installations: [
        {
          installationId: githubInstallation.installationId,
          accountLogin: githubInstallation.accountLogin,
          accountType: githubInstallation.accountType,
          repositorySelection: githubInstallation.repositorySelection,
          repositoryCount: 0,
          htmlUrl: githubInstallation.htmlUrl
        }
      ]
    });
  } finally {
    await app.close();
  }
});

test("account GitHub installation cannot start while user authorization is unavailable", async () => {
  const previousClientId = process.env.GIT_APP_CLIENT_ID;
  const previousClientSecret = process.env.GIT_APP_CLIENT_SECRET;
  delete process.env.GIT_APP_CLIENT_ID;
  delete process.env.GIT_APP_CLIENT_SECRET;

  const app = Fastify();
  await app.register(registerSourceRepositoryRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createSourceRepositoryRepository: () => createRepository(),
    githubAppClient: createGitHubAppClient(),
    githubAppSlug: "sketchcatch-test",
    githubAppStateSecret: "github-app-route-state-secret-for-tests",
    githubAppCallbackUrl: "https://sketchcatch.test/integrations/github/callback"
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/source-repositories/github/install-url",
      headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: "conflict",
      message: "GIT_APP_CLIENT_ID is required"
    });
  } finally {
    await app.close();
    restoreEnvironmentValue("GIT_APP_CLIENT_ID", previousClientId);
    restoreEnvironmentValue("GIT_APP_CLIENT_SECRET", previousClientSecret);
  }
});

test("project GitHub installation cannot start while user authorization is unavailable", async () => {
  const previousClientId = process.env.GIT_APP_CLIENT_ID;
  const previousClientSecret = process.env.GIT_APP_CLIENT_SECRET;
  delete process.env.GIT_APP_CLIENT_ID;
  delete process.env.GIT_APP_CLIENT_SECRET;

  const app = Fastify();
  await app.register(registerSourceRepositoryRoutes, {
    getDatabaseClient: () => createAuthDatabaseClient(),
    createSourceRepositoryRepository: () => createRepository(),
    githubAppClient: createGitHubAppClient(),
    githubAppSlug: "sketchcatch-test",
    githubAppStateSecret: "github-app-route-state-secret-for-tests",
    githubAppCallbackUrl: "https://sketchcatch.test/integrations/github/callback"
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/projects/22222222-2222-4222-8222-222222222222/source-repositories/github/install-url",
      headers: { authorization: `Bearer ${await createAccessToken(userId)}` },
      payload: {
        repositoryUrl: "https://github.com/sketchcatch/app",
        resumeKey: "resume-key"
      }
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: "conflict",
      message: "GIT_APP_CLIENT_ID is required"
    });
  } finally {
    await app.close();
    restoreEnvironmentValue("GIT_APP_CLIENT_ID", previousClientId);
    restoreEnvironmentValue("GIT_APP_CLIENT_SECRET", previousClientSecret);
  }
});

const githubInstallation = {
  installationId: "installation-1",
  accountId: "account-1",
  accountLogin: "sketchcatch",
  accountType: "Organization",
  repositorySelection: "selected" as const,
  htmlUrl: "https://github.com/settings/installations/installation-1"
};

function createGitHubAppClient(): GitHubAppClient {
  return {
    async listInstallations() {
      return [];
    },
    async listInstallationRepositories() {
      return [];
    }
  } as unknown as GitHubAppClient;
}

function createInstallationConnection(): GitHubInstallationConnectionRecord {
  const now = new Date("2026-07-18T00:00:00.000Z");
  return {
    id: "connection-1",
    userId,
    githubInstallationId: githubInstallation.installationId,
    accountId: githubInstallation.accountId,
    accountLogin: githubInstallation.accountLogin,
    accountType: githubInstallation.accountType,
    repositorySelection: githubInstallation.repositorySelection,
    htmlUrl: githubInstallation.htmlUrl,
    status: "active",
    connectedAt: now,
    lastVerifiedAt: now,
    disconnectedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function createAuthDatabaseClient(): DatabaseClient {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: async () => [{ id: userId, deletedAt: null }]
        })
      })
    } as unknown as DatabaseClient["db"],
    pool: {} as DatabaseClient["pool"]
  };
}

function createRepository(
  overrides: Partial<SourceRepositoryRepository> = {}
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

function restoreEnvironmentValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
