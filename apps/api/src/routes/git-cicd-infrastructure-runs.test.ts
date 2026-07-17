import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { GitHubReleaseIdentity } from "../git-cicd/github-oidc-release-identity.js";
import type {
  GitHubInfrastructureRunRecord,
  GitHubInfrastructureRunRepository
} from "../git-cicd/github-infrastructure-run-service.js";
import type {
  ProjectExecutionLeaseRecord,
  ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import { registerGitHubInfrastructureRunRoutes } from "./git-cicd-infrastructure-runs.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const commitSha = "a".repeat(40);
const now = new Date("2026-07-16T00:00:00.000Z");
const identity: GitHubReleaseIdentity = {
  subject: "repo:jh-9999/audience-live-check:environment:sketchcatch-production",
  repository: "jh-9999/audience-live-check",
  repositoryId: "123456789",
  commitSha,
  ref: "refs/heads/main",
  workflowRef:
    "jh-9999/audience-live-check/.github/workflows/sketchcatch-infra.yml@refs/heads/main",
  workflowRunId: "987654321",
  workflowRunAttempt: 1,
  environment: "sketchcatch-production"
};
const createBody = {
  repository: identity.repository,
  repositoryId: identity.repositoryId,
  commitSha,
  ref: identity.ref,
  workflow: identity.workflowRef,
  workflowRunId: identity.workflowRunId,
  workflowRunAttempt: identity.workflowRunAttempt,
  workflowRunUrl:
    "https://github.com/jh-9999/audience-live-check/actions/runs/987654321"
};

test("infra routes create idempotently, heartbeat, and complete with fixed messages", async () => {
  const repository = createRepository();
  const leases = createLeases();
  const app = Fastify();
  await app.register(registerGitHubInfrastructureRunRoutes, {
    prefix: "/api",
    repository,
    executionLeaseRepository: leases,
    verifyIdentity: async () => identity,
    generateId: () => runId,
    now: () => now
  });

  const first = await app.inject({
    method: "POST",
    url: `/api/git-cicd/projects/${projectId}/infrastructure-runs`,
    headers: { authorization: "Bearer signed-token" },
    payload: createBody
  });
  const duplicate = await app.inject({
    method: "POST",
    url: `/api/git-cicd/projects/${projectId}/infrastructure-runs`,
    headers: { authorization: "Bearer signed-token" },
    payload: createBody
  });
  const heartbeat = await app.inject({
    method: "POST",
    url: `/api/git-cicd/infrastructure-runs/${runId}/heartbeat`,
    headers: { authorization: "Bearer signed-token" },
    payload: {}
  });
  const complete = await app.inject({
    method: "POST",
    url: `/api/git-cicd/infrastructure-runs/${runId}/complete`,
    headers: { authorization: "Bearer signed-token" },
    payload: { conclusion: "failed", stage: "infra_plan" }
  });

  assert.equal(first.statusCode, 202);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(heartbeat.statusCode, 200);
  assert.equal(complete.statusCode, 200);
  assert.equal(
    complete.json().run.statusMessage,
    "인프라 Plan 생성에 실패했습니다. Terraform Apply는 실행되지 않았습니다."
  );
  assert.equal(complete.json().run.status, "failed");
  await app.close();
});

test("infra complete rejects repository-controlled messages and invalid stages", async () => {
  const app = Fastify();
  await app.register(registerGitHubInfrastructureRunRoutes, {
    prefix: "/api",
    repository: createRepository(),
    executionLeaseRepository: createLeases(),
    verifyIdentity: async () => identity
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd/infrastructure-runs/${runId}/complete`,
    headers: { authorization: "Bearer signed-token" },
    payload: {
      conclusion: "failed",
      stage: "terraform_plan",
      message: "print my repository-controlled text"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "GITHUB_INFRASTRUCTURE_RUN_INVALID");
  await app.close();
});

test("infra routes reject requests without a bearer GitHub identity", async () => {
  const app = Fastify();
  await app.register(registerGitHubInfrastructureRunRoutes, {
    prefix: "/api",
    repository: createRepository(),
    executionLeaseRepository: createLeases(),
    verifyIdentity: async () => identity
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd/projects/${projectId}/infrastructure-runs`,
    payload: createBody
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "GITHUB_OIDC_INVALID");
  await app.close();
});

test("infra routes fail fast with a fixed conflict message", async () => {
  const app = Fastify();
  await app.register(registerGitHubInfrastructureRunRoutes, {
    prefix: "/api",
    repository: createRepository(),
    executionLeaseRepository: createLeases(activeLease("direct-run", "direct")),
    verifyIdentity: async () => identity,
    generateId: () => runId,
    now: () => now
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd/projects/${projectId}/infrastructure-runs`,
    headers: { authorization: "Bearer signed-token" },
    payload: createBody
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "PROJECT_RELEASE_IN_PROGRESS");
  assert.equal(
    response.json().message,
    "현재 이 프로젝트에서 다른 배포가 진행 중입니다. 완료 후 다시 실행해 주세요."
  );
  await app.close();
});

function createRepository(): GitHubInfrastructureRunRepository {
  const records = new Map<string, GitHubInfrastructureRunRecord>();
  return {
    async findExecutionTarget(input) {
      return input.projectId === projectId && input.repositoryId === identity.repositoryId
        ? {
            projectId,
            sourceRepositoryId: "repository-1",
            installationId: "installation-1",
            repositoryOwner: "jh-9999",
            repositoryName: "audience-live-check",
            githubRepositoryId: identity.repositoryId,
            defaultBranch: "main",
            monitorBranch: "main",
            environmentName: identity.environment,
            infrastructureDeploymentId: "deployment-1"
          }
        : undefined;
    },
    async findByWorkflowRun(input) {
      return [...records.values()].find(
        (record) =>
          record.sourceRepositoryId === input.sourceRepositoryId &&
          record.workflowRunId === input.workflowRunId &&
          record.workflowRunAttempt === input.workflowRunAttempt
      );
    },
    async findById(id) {
      return records.get(id);
    },
    async findRecoveryCandidate(id) {
      return records.get(id);
    },
    async create(record) {
      records.set(record.id, record);
      return record;
    },
    async updateStatus(input) {
      const current = records.get(input.runId);
      if (!current) return undefined;
      const saved = { ...current, ...input };
      records.set(saved.id, saved);
      return saved;
    },
    async markRecoveredTerminal(input) {
      const current = records.get(input.runId);
      if (!current) return;
      records.set(current.id, {
        ...current,
        status: input.status,
        statusMessage: input.statusMessage,
        finishedAt: input.finishedAt,
        lastRefreshedAt: input.finishedAt
      });
    }
  };
}

function createLeases(
  initial?: ProjectExecutionLeaseRecord
): ProjectExecutionLeaseRepository & { current: ProjectExecutionLeaseRecord | undefined } {
  const repository: ProjectExecutionLeaseRepository & {
    current: ProjectExecutionLeaseRecord | undefined;
  } = {
    current: initial,
    async acquire(input) {
      if (repository.current?.status === "active") {
        return repository.current.holderId === input.holderId
          ? repository.current
          : undefined;
      }
      repository.current = activeLease(input.holderId, input.source, 1, input.expiresAt);
      return repository.current;
    },
    async find() {
      return repository.current;
    },
    async heartbeat(input) {
      if (
        repository.current?.status !== "active" ||
        repository.current.holderId !== input.holderId ||
        repository.current.fencingVersion !== input.fencingVersion ||
        repository.current.expiresAt <= input.now
      ) return undefined;
      repository.current = {
        ...repository.current,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      };
      return repository.current;
    },
    async setExecutionCoordinates() {
      return repository.current;
    },
    async release(input) {
      if (
        repository.current?.status !== "active" ||
        repository.current.holderId !== input.holderId ||
        repository.current.fencingVersion !== input.fencingVersion
      ) return false;
      repository.current = {
        ...repository.current,
        status: "released",
        heartbeatAt: input.now,
        expiresAt: input.now,
        updatedAt: input.now
      };
      return true;
    }
  };
  return repository;
}

function activeLease(
  holderId: string,
  source: "direct" | "gitops",
  fencingVersion = 1,
  expiresAt = new Date("2026-07-16T00:02:00.000Z")
): ProjectExecutionLeaseRecord {
  return {
    projectId,
    holderId,
    source,
    fencingVersion,
    status: "active",
    activeCodeBuildId: null,
    activeWorkerTaskArn: null,
    heartbeatAt: now,
    expiresAt,
    createdAt: now,
    updatedAt: now
  };
}
