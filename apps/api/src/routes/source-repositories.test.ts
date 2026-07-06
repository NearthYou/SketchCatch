import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import { projects, users } from "../db/schema.js";
import type { GitHubAppClient } from "../source-repositories/github-app-client.js";
import {
  type CreateActiveGitHubSourceRepositoryInput,
  type SourceRepositoryRecord,
  type SourceRepositoryRepository
} from "../source-repositories/source-repository-service.js";
import type { ProjectAccessContext } from "../git-cicd/git-cicd-handoff-service.js";
import { registerSourceRepositoryRoutes } from "./source-repositories.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const stateSecret = "route-github-app-state-secret-for-tests";
const fixedNow = new Date("2026-07-05T00:00:00.000Z");

type UserRecord = typeof users.$inferSelect;
type ProjectRecord = typeof projects.$inferSelect;

test("source repository routes issue a GitHub install URL with an API-signed state", async (t) => {
  const repository = new FakeSourceRepositoryRepository();
  const app = await buildSourceRepositoryRouteApp({ repository });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github/install-url`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 201);
  const body = response.json();
  const installUrl = new URL(body.installUrl);

  assert.equal(installUrl.origin, "https://github.com");
  assert.equal(installUrl.pathname, "/apps/sketchcatch-test/installations/select_target");
  assert.ok(installUrl.searchParams.get("state"));
  assert.equal(repository.findAccessibleProjectCalls.length, 1);
});

test("source repository routes exchange callback state for repositories without persisting the installation list", async (t) => {
  const repository = new FakeSourceRepositoryRepository();
  const githubAppClient = createFakeGitHubAppClient([
    createRepositoryCandidate({ githubRepositoryId: "repo-1", name: "api" }),
    createRepositoryCandidate({ githubRepositoryId: "repo-2", name: "web" })
  ]);
  const app = await buildSourceRepositoryRouteApp({ repository, githubAppClient });
  t.after(() => app.close());

  const state = await createInstallState(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/source-repositories/github/installation-repositories",
    headers: await authHeaders(),
    payload: {
      installationId: "12345",
      state
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().repositories.map((repo: GitHubRepositoryCandidate) => repo.fullName),
    ["owner/api", "owner/web"]
  );
  assert.equal(repository.rows.length, 0);
});

test("source repository routes store one selected active GitHub repo and soft deactivate the previous one", async (t) => {
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({
      id: "old-source-repository",
      githubRepositoryId: "old-repo",
      name: "old",
      status: "active"
    })
  ]);
  const githubAppClient = createFakeGitHubAppClient([
    createRepositoryCandidate({ githubRepositoryId: "repo-2", name: "web" })
  ]);
  const app = await buildSourceRepositoryRouteApp({ repository, githubAppClient });
  t.after(() => app.close());

  const state = await createInstallState(app);
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github`,
    headers: await authHeaders(),
    payload: {
      installationId: "12345",
      githubRepositoryId: "repo-2",
      state
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().repository.githubRepositoryId, "repo-2");
  assert.equal(repository.rows.length, 2);
  assert.equal(repository.rows[0]?.status, "inactive");
  assert.ok(repository.rows[0]?.disconnectedAt);
  assert.equal(repository.rows[1]?.status, "active");
});

test("source repository routes reject archived repository selections and client-supplied repository identity", async (t) => {
  const repository = new FakeSourceRepositoryRepository();
  const githubAppClient = createFakeGitHubAppClient([
    createRepositoryCandidate({
      githubRepositoryId: "archived-repo",
      name: "archived",
      archived: true
    })
  ]);
  const app = await buildSourceRepositoryRouteApp({ repository, githubAppClient });
  t.after(() => app.close());

  const state = await createInstallState(app);
  const archivedResponse = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github`,
    headers: await authHeaders(),
    payload: {
      installationId: "12345",
      githubRepositoryId: "archived-repo",
      state
    }
  });

  assert.equal(archivedResponse.statusCode, 409);

  const identityResponse = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github`,
    headers: await authHeaders(),
    payload: {
      installationId: "12345",
      githubRepositoryId: "archived-repo",
      state,
      owner: "attacker",
      name: "repo",
      provider: "github"
    }
  });

  assert.equal(identityResponse.statusCode, 400);
});

async function buildSourceRepositoryRouteApp(input: {
  repository: FakeSourceRepositoryRepository;
  githubAppClient?: GitHubAppClient;
}) {
  const app = Fastify({ logger: false });
  const fakeAuthDb = new SourceRepositoryRouteFakeAuthDb([createUserRecord()]);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "bad_request",
        message: error.message
      });
      return;
    }

    throw error;
  });

  await app.register(registerSourceRepositoryRoutes, {
    prefix: "/api",
    getDatabaseClient: () => fakeAuthDb.client,
    createSourceRepositoryRepository: () => input.repository,
    githubAppClient: input.githubAppClient ?? createFakeGitHubAppClient([]),
    githubAppSlug: "sketchcatch-test",
    githubAppStateSecret: stateSecret
  });

  return app;
}

async function createInstallState(app: Awaited<ReturnType<typeof buildSourceRepositoryRouteApp>>) {
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github/install-url`,
    headers: await authHeaders()
  });
  const state = new URL(response.json().installUrl).searchParams.get("state");

  assert.ok(state);

  return state;
}

async function authHeaders(activeUserId = userId): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(activeUserId)}`
  };
}

class FakeSourceRepositoryRepository implements SourceRepositoryRepository {
  readonly findAccessibleProjectCalls: Array<{
    projectId: string;
    accessContext: ProjectAccessContext;
  }> = [];

  constructor(readonly rows: SourceRepositoryRecord[] = []) {}

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.findAccessibleProjectCalls.push({
      projectId: candidateProjectId,
      accessContext
    });

    if (candidateProjectId !== projectId || accessContext.userId !== userId) {
      return undefined;
    }

    return createProjectRecord();
  }

  async listProjectSourceRepositories(candidateProjectId: string) {
    return this.rows.filter((row) => row.projectId === candidateProjectId);
  }

  async createActiveGitHubSourceRepository(input: CreateActiveGitHubSourceRepositoryInput) {
    const now = new Date();

    for (const row of this.rows) {
      if (row.projectId === input.projectId && row.provider === "github" && row.status === "active") {
        row.status = "inactive";
        row.disconnectedAt = now;
        row.updatedAt = now;
      }
    }

    const row = createSourceRepositoryRecord({
      id: input.id,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      githubInstallationId: input.githubInstallationId,
      githubRepositoryId: input.repository.githubRepositoryId,
      owner: input.repository.owner,
      name: input.repository.name,
      defaultBranch: input.repository.defaultBranch,
      repositoryUrl: input.repository.repositoryUrl,
      visibility: input.repository.visibility,
      archived: input.repository.archived,
      status: "active"
    });

    this.rows.push(row);

    return row;
  }
}

class SourceRepositoryRouteFakeAuthDb {
  client: DatabaseClient;

  constructor(private readonly userRows: UserRecord[]) {
    this.client = {
      db: this.createDb() as DatabaseClient["db"],
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => new SelectQuery(() => (table === users ? this.userRows : []))
      })
    };
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}

function createFakeGitHubAppClient(repositories: GitHubRepositoryCandidate[]): GitHubAppClient {
  return {
    async listInstallationRepositories() {
      return repositories;
    },
    async createPullRequest() {
      throw new Error("not used");
    },
    async getLatestWorkflowRunForHeadSha() {
      throw new Error("not used");
    }
  };
}

function createRepositoryCandidate(
  overrides: Partial<GitHubRepositoryCandidate> = {}
): GitHubRepositoryCandidate {
  const owner = overrides.owner ?? "owner";
  const name = overrides.name ?? "repo";

  return {
    githubRepositoryId: overrides.githubRepositoryId ?? "repo-1",
    owner,
    name,
    fullName: overrides.fullName ?? `${owner}/${name}`,
    defaultBranch: overrides.defaultBranch ?? "main",
    repositoryUrl: overrides.repositoryUrl ?? `https://github.com/${owner}/${name}`,
    visibility: overrides.visibility ?? "private",
    archived: overrides.archived ?? false
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: userId,
    username: "source-repo-user",
    email: "source-repo@example.com",
    nickname: "Source Repo User",
    passwordHash: "unused",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
    ...overrides
  };
}

function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: projectId,
    userId,
    name: "Source Repo Project",
    description: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createSourceRepositoryRecord(
  overrides: Partial<SourceRepositoryRecord> = {}
): SourceRepositoryRecord {
  return {
    id: overrides.id ?? "source-repository-id",
    projectId: overrides.projectId ?? projectId,
    createdByUserId: overrides.createdByUserId ?? userId,
    provider: overrides.provider ?? "github",
    status: overrides.status ?? "active",
    githubInstallationId: overrides.githubInstallationId ?? "12345",
    githubRepositoryId: overrides.githubRepositoryId ?? "repo-1",
    owner: overrides.owner ?? "owner",
    name: overrides.name ?? "repo",
    defaultBranch: overrides.defaultBranch ?? "main",
    repositoryUrl: overrides.repositoryUrl ?? "https://github.com/owner/repo",
    visibility: overrides.visibility ?? "private",
    archived: overrides.archived ?? false,
    disconnectedAt: overrides.disconnectedAt ?? null,
    createdAt: overrides.createdAt ?? fixedNow,
    updatedAt: overrides.updatedAt ?? fixedNow
  };
}
