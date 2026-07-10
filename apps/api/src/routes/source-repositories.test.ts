import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import { projects, users } from "../db/schema.js";
import type {
  GitHubAppClient,
  GitHubRepositoryEvidenceReader
} from "../source-repositories/github-app-client.js";
import {
  GitHubRepositoryIdentityMismatchError,
  GitHubRepositoryTreeTruncatedError
} from "../source-repositories/github-app-client.js";
import {
  type CreateActiveGitHubSourceRepositoryInput,
  type SourceRepositoryRecord,
  type SourceRepositoryRepository
} from "../source-repositories/source-repository-service.js";
import type { ProjectAccessContext } from "../git-cicd/git-cicd-handoff-service.js";
import type { RateLimiter } from "../rate-limit/in-memory-rate-limiter.js";
import { registerSourceRepositoryRoutes } from "./source-repositories.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sourceRepositoryId = "33333333-3333-4333-8333-333333333333";
const stateSecret = "route-github-app-state-secret-for-tests";
const fixedNow = new Date("2026-07-05T00:00:00.000Z");

type UserRecord = typeof users.$inferSelect;
type ProjectRecord = typeof projects.$inferSelect;

test("source repository routes analyze an active repository without storing the result", async (t) => {
  // Given
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({ id: sourceRepositoryId })
  ]);
  const readCalls: Array<{
    installationId: string;
    expectedRepositoryId: string;
    owner: string;
    name: string;
  }> = [];
  const githubRepositoryEvidenceReader: GitHubRepositoryEvidenceReader = {
    // active repository 분석이 GitHub 읽기 경계에 넘기는 값을 기록한다.
    async readRepositoryEvidence(input) {
      readCalls.push(input);
      return {
        revision: "analysis-revision",
        treePaths: ["apps/web/package.json", "apps/web/vite.config.ts", "package.json"],
        files: [
          {
            path: "package.json",
            content: JSON.stringify({ private: true, workspaces: ["apps/*"] })
          },
          {
            path: "apps/web/package.json",
            content: JSON.stringify({ dependencies: { react: "19.0.0", vite: "7.0.0" } })
          },
          { path: "apps/web/vite.config.ts", content: "export default {}" }
        ]
      };
    }
  };
  const app = await buildSourceRepositoryRouteApp({
    repository,
    githubRepositoryEvidenceReader
  });
  t.after(() => app.close());

  // When
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/analyze`,
    headers: await authHeaders()
  });

  // Then
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().sourceRepositoryId, sourceRepositoryId);
  assert.equal(response.json().repositoryRevision, "analysis-revision");
  assert.equal(response.json().aiHandoff.templateId, "static-web-hosting");
  assert.deepEqual(readCalls, [
    {
      installationId: "12345",
      expectedRepositoryId: "repo-1",
      owner: "owner",
      name: "repo"
    }
  ]);
  assert.equal(repository.rows.length, 1);
});

test("source repository routes return Template Selection Failure as a successful analysis", async (t) => {
  // Given
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({ id: sourceRepositoryId })
  ]);
  const githubRepositoryEvidenceReader: GitHubRepositoryEvidenceReader = {
    // 지원 Template이 없는 backend snapshot을 반환한다.
    async readRepositoryEvidence() {
      return {
        revision: "unsupported-revision",
        treePaths: ["package.json", "src/server.ts"],
        files: [
          {
            path: "package.json",
            content: JSON.stringify({ dependencies: { fastify: "5.0.0" } })
          }
        ]
      };
    }
  };
  const app = await buildSourceRepositoryRouteApp({
    repository,
    githubRepositoryEvidenceReader
  });
  t.after(() => app.close());

  // When
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/analyze`,
    headers: await authHeaders()
  });

  // Then
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().aiHandoff.status, "template_selection_failed");
  assert.equal(response.json().aiHandoff.templateId, null);
});

test("source repository routes reject inactive repositories before reading GitHub", async (t) => {
  // Given
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({ id: sourceRepositoryId, status: "inactive" })
  ]);
  let readCount = 0;
  const githubRepositoryEvidenceReader: GitHubRepositoryEvidenceReader = {
    // 호출 여부를 관찰할 수 있는 빈 snapshot reader다.
    async readRepositoryEvidence() {
      readCount += 1;
      return { revision: "unused", treePaths: [], files: [] };
    }
  };
  const app = await buildSourceRepositoryRouteApp({
    repository,
    githubRepositoryEvidenceReader
  });
  t.after(() => app.close());

  // When
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/analyze`,
    headers: await authHeaders()
  });

  // Then
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "conflict");
  assert.equal(readCount, 0);
});

test("source repository routes rate limit repeated analysis before reading GitHub", async (t) => {
  // Given
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({ id: sourceRepositoryId })
  ]);
  let readCount = 0;
  const githubRepositoryEvidenceReader: GitHubRepositoryEvidenceReader = {
    // rate limit 뒤 GitHub 읽기가 실행되지 않는지 계수한다.
    async readRepositoryEvidence() {
      readCount += 1;
      return { revision: "unused", treePaths: [], files: [] };
    }
  };
  const sourceRepositoryAnalysisRateLimiter: RateLimiter = {
    // QA 요청을 고정된 재시도 시간으로 차단한다.
    consume() {
      return { allowed: false, retryAfterSeconds: 42 };
    }
  };
  const app = await buildSourceRepositoryRouteApp({
    repository,
    githubRepositoryEvidenceReader,
    sourceRepositoryAnalysisRateLimiter
  });
  t.after(() => app.close());

  // When
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/analyze`,
    headers: await authHeaders()
  });

  // Then
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["retry-after"], "42");
  assert.equal(response.json().error, "too_many_requests");
  assert.equal(readCount, 0);
});

test("source repository routes map incomplete GitHub trees to conflict", async (t) => {
  // Given
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({ id: sourceRepositoryId })
  ]);
  const githubRepositoryEvidenceReader: GitHubRepositoryEvidenceReader = {
    // GitHub가 일부 tree만 반환한 정적 분석 실패를 재현한다.
    async readRepositoryEvidence() {
      throw new GitHubRepositoryTreeTruncatedError();
    }
  };
  const app = await buildSourceRepositoryRouteApp({
    repository,
    githubRepositoryEvidenceReader
  });
  t.after(() => app.close());

  // When
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/analyze`,
    headers: await authHeaders()
  });

  // Then
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "conflict");
  assert.equal(response.json().message, "GIT_APP_REPOSITORY_TREE_TRUNCATED");
});

test("source repository routes reject a reused GitHub repository path", async (t) => {
  // Given
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({ id: sourceRepositoryId })
  ]);
  const githubRepositoryEvidenceReader: GitHubRepositoryEvidenceReader = {
    // 연결된 repository ID와 현재 경로의 ID가 다른 보안 경계를 재현한다.
    async readRepositoryEvidence() {
      throw new GitHubRepositoryIdentityMismatchError();
    }
  };
  const app = await buildSourceRepositoryRouteApp({
    repository,
    githubRepositoryEvidenceReader
  });
  t.after(() => app.close());

  // When
  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/${sourceRepositoryId}/analyze`,
    headers: await authHeaders()
  });

  // Then
  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "conflict");
  assert.equal(response.json().message, "GIT_APP_REPOSITORY_IDENTITY_MISMATCH");
});

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

test("source repository routes issue a callback URL for an existing active GitHub installation", async (t) => {
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({
      githubInstallationId: "active-installation"
    })
  ]);
  const app = await buildSourceRepositoryRouteApp({ repository });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github/existing-installation-callback-url`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 201);
  const callbackUrl = new URL(response.json().callbackUrl);

  assert.equal(callbackUrl.origin, "https://sketchcatch.example");
  assert.equal(callbackUrl.pathname, "/integrations/github/callback");
  assert.equal(callbackUrl.searchParams.get("installation_id"), "active-installation");
  assert.ok(callbackUrl.searchParams.get("state"));
  assert.equal(repository.rows.length, 1);
});

test("source repository routes issue a callback URL for a selected known GitHub installation", async (t) => {
  const knownSourceRepositoryId = "33333333-3333-4333-8333-333333333333";
  const repository = new FakeSourceRepositoryRepository([
    createSourceRepositoryRecord({
      id: knownSourceRepositoryId,
      status: "inactive",
      githubInstallationId: "known-installation"
    })
  ]);
  const app = await buildSourceRepositoryRouteApp({ repository });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github/${knownSourceRepositoryId}/existing-installation-callback-url`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 201);
  const callbackUrl = new URL(response.json().callbackUrl);

  assert.equal(callbackUrl.pathname, "/integrations/github/callback");
  assert.equal(callbackUrl.searchParams.get("installation_id"), "known-installation");
  assert.ok(callbackUrl.searchParams.get("state"));
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

test("source repository routes list GitHub App installed repositories before SketchCatch connection", async (t) => {
  const repository = new FakeSourceRepositoryRepository();
  const githubAppClient = createFakeGitHubAppClient([
    createRepositoryCandidate({
      githubRepositoryId: "repo-2",
      name: "sketchcatch-iac-handoff-test"
    })
  ]);
  const app = await buildSourceRepositoryRouteApp({ repository, githubAppClient });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/source-repositories/github/installed-repositories`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();

  assert.equal(body.projectId, projectId);
  assert.ok(body.state);
  assert.equal(body.repositories[0]?.fullName, "owner/sketchcatch-iac-handoff-test");
  assert.equal(body.repositories[0]?.installationId, "12345");
  assert.equal(body.repositories[0]?.connectedSourceRepositoryId, null);
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

// route 테스트에 GitHub 읽기 경계를 주입해 실제 외부 호출 없이 HTTP 계약을 확인한다.
async function buildSourceRepositoryRouteApp(input: {
  repository: FakeSourceRepositoryRepository;
  githubAppClient?: GitHubAppClient;
  githubRepositoryEvidenceReader?: GitHubRepositoryEvidenceReader;
  sourceRepositoryAnalysisRateLimiter?: RateLimiter;
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
    githubRepositoryEvidenceReader: input.githubRepositoryEvidenceReader,
    sourceRepositoryAnalysisRateLimiter: input.sourceRepositoryAnalysisRateLimiter,
    githubAppSlug: "sketchcatch-test",
    githubAppStateSecret: stateSecret,
    githubAppCallbackUrl: "https://sketchcatch.example/integrations/github/callback"
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

  async findProjectSourceRepository(candidateProjectId: string, sourceRepositoryId: string) {
    return this.rows.find(
      (row) => row.projectId === candidateProjectId && row.id === sourceRepositoryId
    );
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
    async listInstallations() {
      return [
        {
          installationId: "12345",
          accountLogin: "owner",
          accountType: "Organization",
          repositorySelection: "selected",
          htmlUrl: "https://github.com/settings/installations/12345"
        }
      ];
    },
    async listInstallationRepositories() {
      return repositories;
    },
    async createPullRequest() {
      throw new Error("not used");
    },
    async applyRepositorySettings() {
      throw new Error("not used");
    },
    async getLatestWorkflowRunForHeadSha() {
      throw new Error("not used");
    },
    async getPipelineStatusForPullRequest() {
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
