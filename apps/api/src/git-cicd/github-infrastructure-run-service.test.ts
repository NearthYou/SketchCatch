import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubReleaseIdentity } from "./github-oidc-release-identity.js";
import {
  completeGitHubInfrastructureRun,
  createGitHubInfrastructureRun,
  heartbeatGitHubInfrastructureRun,
  type GitHubInfrastructureRunRecord,
  type GitHubInfrastructureRunRepository
} from "./github-infrastructure-run-service.js";
import {
  ProjectExecutionLeaseError,
  type ProjectExecutionLeaseRecord,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";

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
const request = {
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

test("infra run acquires the shared gitops lease and starts as running", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository();

  const result = await createGitHubInfrastructureRun(
    { projectId, request, identity },
    repository,
    leases,
    { generateId: () => runId, now: () => now }
  );

  assert.equal(result.created, true);
  assert.equal(result.run.executionKind, "infra");
  assert.equal(result.run.changeScope, "infra");
  assert.equal(result.run.status, "running");
  assert.equal(leases.current?.holderId, runId);
});

test("same workflow run and attempt is idempotent", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository();
  const first = await createGitHubInfrastructureRun(
    { projectId, request, identity },
    repository,
    leases,
    { generateId: () => runId, now: () => now }
  );
  const duplicate = await createGitHubInfrastructureRun(
    { projectId, request, identity },
    repository,
    leases,
    { generateId: () => "33333333-3333-4333-8333-333333333333", now: () => now }
  );

  assert.equal(duplicate.created, false);
  assert.equal(duplicate.run.id, first.run.id);
  assert.equal(repository.records.size, 1);
});

test("an active app or direct lease records a failed blocked infra run", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository(activeLease("direct-run", "direct"));

  await assert.rejects(
    createGitHubInfrastructureRun(
      { projectId, request, identity },
      repository,
      leases,
      { generateId: () => runId, now: () => now }
    ),
    (error: unknown) =>
      error instanceof ProjectExecutionLeaseError &&
      error.code === "PROJECT_RELEASE_IN_PROGRESS"
  );

  const saved = repository.records.get(runId);
  assert.equal(saved?.status, "failed");
  assert.equal(
    saved?.statusMessage,
    "현재 이 프로젝트에서 다른 배포가 진행 중입니다. 완료 후 다시 실행해 주세요."
  );
});

test("plan failure releases the lease without accepting a repository message", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository();
  await createGitHubInfrastructureRun(
    { projectId, request, identity },
    repository,
    leases,
    { generateId: () => runId, now: () => now }
  );

  const completed = await completeGitHubInfrastructureRun(
    {
      runId,
      identity,
      request: {
        conclusion: "failed",
        stage: "infra_plan"
      }
    },
    repository,
    leases,
    { now: () => new Date("2026-07-16T00:01:00.000Z") }
  );

  assert.equal(
    completed.run.statusMessage,
    "인프라 Plan 생성에 실패했습니다. Terraform Apply는 실행되지 않았습니다."
  );
  assert.equal(completed.run.status, "failed");
  assert.equal(leases.current?.status, "released");
});

test("configuration and apply failures use the fixed deployment messages", async () => {
  for (const [stage, expected] of [
    [
      "configuration",
      "인프라 배포 준비에 실패했습니다. GitHub Actions 설정과 AWS 연결을 확인해 주세요."
    ],
    [
      "infra_apply",
      "인프라 적용 중 실패했습니다. 일부 리소스가 변경되었을 수 있으므로 실행 로그를 확인해 주세요."
    ]
  ] as const) {
    const repository = createMemoryRunRepository();
    const leases = createMemoryLeaseRepository();
    await createGitHubInfrastructureRun(
      { projectId, request, identity },
      repository,
      leases,
      { generateId: () => runId, now: () => now }
    );

    const completed = await completeGitHubInfrastructureRun(
      {
        runId,
        identity,
        request: { conclusion: "failed", stage }
      },
      repository,
      leases,
      { now: () => new Date("2026-07-16T00:01:00.000Z") }
    );

    assert.equal(completed.run.statusMessage, expected);
  }
});

test("a run cannot report success before the infrastructure apply stage", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository();
  await createGitHubInfrastructureRun(
    { projectId, request, identity },
    repository,
    leases,
    { generateId: () => runId, now: () => now }
  );

  await assert.rejects(
    completeGitHubInfrastructureRun(
      {
        runId,
        identity,
        request: { conclusion: "succeeded", stage: "infra_plan" }
      },
      repository,
      leases,
      { now: () => new Date("2026-07-16T00:01:00.000Z") }
    ),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "인프라 Apply 완료 단계에서만 성공으로 종료할 수 있습니다."
  );
  assert.equal(repository.records.get(runId)?.status, "running");
});

test("a stale run cannot heartbeat or overwrite a newer execution", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository();
  await createGitHubInfrastructureRun(
    { projectId, request, identity },
    repository,
    leases,
    { generateId: () => runId, now: () => now }
  );
  leases.current = activeLease("newer-run", "gitops", 2);

  await assert.rejects(
    heartbeatGitHubInfrastructureRun(
      {
        runId,
        identity
      },
      repository,
      leases,
      { now: () => new Date("2026-07-16T00:01:00.000Z") }
    ),
    (error: unknown) =>
      error instanceof ProjectExecutionLeaseError && error.code === "LEASE_FENCE_REJECTED"
  );
  assert.equal(repository.records.get(runId)?.statusMessage, "인프라 실행을 시작했습니다.");
});

test("an expired lease is recovered only after GitHub confirms the previous workflow ended", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository();
  const oldIdentity = { ...identity, workflowRunId: "987654320" };
  const oldRequest = {
    ...request,
    workflowRunId: oldIdentity.workflowRunId,
    workflowRunUrl:
      "https://github.com/jh-9999/audience-live-check/actions/runs/987654320"
  };
  const old = await createGitHubInfrastructureRun(
    { projectId, request: oldRequest, identity: oldIdentity },
    repository,
    leases,
    {
      generateId: () => "11111111-2222-4333-8444-555555555555",
      now: () => new Date("2026-07-15T23:55:00.000Z"),
      leaseTtlMs: 60_000
    }
  );
  const recovered = await createGitHubInfrastructureRun(
    { projectId, request, identity },
    repository,
    leases,
    {
      generateId: () => runId,
      now: () => now,
      githubActionsClient: {
        async getWorkflowRun() {
          return {
            id: 987654320,
            runAttempt: 1,
            event: "workflow_dispatch",
            updatedAt: "2026-07-15T23:58:00.000Z",
            createdAt: "2026-07-15T23:55:00.000Z",
            commitSha,
            commitMessage: "infra",
            branch: "main",
            workflowName: "SketchCatch Infra",
            workflowPath: ".github/workflows/sketchcatch-infra.yml",
            runUrl: oldRequest.workflowRunUrl,
            status: "completed",
            conclusion: "failure",
            startedAt: "2026-07-15T23:55:00.000Z",
            finishedAt: "2026-07-15T23:58:00.000Z"
          };
        }
      }
    }
  );

  assert.equal(repository.records.get(old.run.id)?.status, "failed");
  assert.equal(recovered.run.id, runId);
  assert.equal(leases.current?.holderId, runId);
  assert.equal(leases.current?.fencingVersion, 2);
});

test("a failed lease recovery CAS does not mark the previous run terminal", async () => {
  const repository = createMemoryRunRepository();
  const leases = createMemoryLeaseRepository();
  const oldIdentity = { ...identity, workflowRunId: "987654320" };
  const oldRequest = {
    ...request,
    workflowRunId: oldIdentity.workflowRunId,
    workflowRunUrl:
      "https://github.com/jh-9999/audience-live-check/actions/runs/987654320"
  };
  const old = await createGitHubInfrastructureRun(
    { projectId, request: oldRequest, identity: oldIdentity },
    repository,
    leases,
    {
      generateId: () => "11111111-2222-4333-8444-555555555555",
      now: () => new Date("2026-07-15T23:55:00.000Z"),
      leaseTtlMs: 60_000
    }
  );
  leases.recoverExpired = async () => {
    leases.current = activeLease("concurrent-run", "gitops", 2);
    return undefined;
  };

  await assert.rejects(
    createGitHubInfrastructureRun(
      { projectId, request, identity },
      repository,
      leases,
      {
        generateId: () => runId,
        now: () => now,
        githubActionsClient: {
          async getWorkflowRun() {
            return {
              id: 987654320,
              runAttempt: 1,
              event: "workflow_dispatch",
              updatedAt: "2026-07-15T23:58:00.000Z",
              createdAt: "2026-07-15T23:55:00.000Z",
              commitSha,
              commitMessage: "infra",
              branch: "main",
              workflowName: "SketchCatch Infra",
              workflowPath: ".github/workflows/sketchcatch-infra.yml",
              runUrl: oldRequest.workflowRunUrl,
              status: "completed",
              conclusion: "failure",
              startedAt: "2026-07-15T23:55:00.000Z",
              finishedAt: "2026-07-15T23:58:00.000Z"
            };
          }
        }
      }
    ),
    (error: unknown) =>
      error instanceof ProjectExecutionLeaseError && error.code === "LEASE_RECOVERY_REQUIRED"
  );

  assert.equal(repository.records.get(old.run.id)?.status, "running");
});

function createMemoryRunRepository(): GitHubInfrastructureRunRepository & {
  records: Map<string, GitHubInfrastructureRunRecord>;
} {
  const records = new Map<string, GitHubInfrastructureRunRecord>();
  return {
    records,
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
      const record = records.get(input.runId);
      if (!record) return undefined;
      const saved = { ...record, ...input };
      records.set(saved.id, saved);
      return saved;
    },
    async markRecoveredTerminal(input) {
      const record = records.get(input.runId);
      if (!record) return;
      records.set(record.id, {
        ...record,
        status: input.status,
        statusMessage: input.statusMessage,
        finishedAt: input.finishedAt,
        lastRefreshedAt: input.finishedAt
      });
    }
  };
}

function createMemoryLeaseRepository(
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
      repository.current = activeLease(
        input.holderId,
        input.source,
        (repository.current?.fencingVersion ?? 0) + 1,
        input.now,
        input.expiresAt
      );
      return repository.current;
    },
    async find() {
      return repository.current;
    },
    async recoverExpired(input) {
      if (
        repository.current?.holderId !== input.expectedHolderId ||
        repository.current.fencingVersion !== input.expectedFencingVersion ||
        repository.current.expiresAt > input.now
      ) return undefined;
      repository.current = activeLease(
        input.holderId,
        input.source,
        input.expectedFencingVersion + 1,
        input.now,
        input.expiresAt
      );
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
        repository.current?.holderId !== input.holderId ||
        repository.current.fencingVersion !== input.fencingVersion ||
        repository.current.status !== "active"
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
  heartbeatAt = now,
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
    heartbeatAt,
    expiresAt,
    createdAt: now,
    updatedAt: heartbeatAt
  };
}
