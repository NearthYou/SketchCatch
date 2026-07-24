import assert from "node:assert/strict";
import test from "node:test";
import type { CreateGitCicdReleaseRunRequest } from "@sketchcatch/types";
import type { GitHubReleaseIdentity } from "./github-oidc-release-identity.js";
import { ProjectExecutionLeaseError } from "../releases/project-execution-lease-service.js";
import {
  cancelGitHubReleaseRun,
  createGitHubReleaseRun,
  getGitHubReleaseRun,
  GitHubReleaseRunError,
  type GitHubReleaseRunExecutor,
  type GitHubReleaseRunRecord,
  type GitHubReleaseRunRepository
} from "./github-release-run-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const commitSha = "a".repeat(40);
const workflow =
  "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml@refs/heads/main";
const request: CreateGitCicdReleaseRunRequest = {
  repository: "jh-9999/audience-live-check",
  repositoryId: "123456789",
  commitSha,
  ref: "refs/heads/main",
  workflow,
  workflowRunId: "987654321",
  workflowRunAttempt: 1,
  workflowRunUrl:
    "https://github.com/jh-9999/audience-live-check/actions/runs/987654321"
};
const identity: GitHubReleaseIdentity = {
  subject: "repo:jh-9999/audience-live-check:environment:sketchcatch-production",
  repository: request.repository,
  repositoryId: request.repositoryId,
  commitSha,
  ref: request.ref,
  workflowRef: workflow,
  workflowRunId: request.workflowRunId,
  workflowRunAttempt: 1,
  environment: "sketchcatch-production"
};

test("GitHub release request is persisted once and enqueued once", async () => {
  const repository = createMemoryRepository();
  const enqueued: string[] = [];
  const executor = createExecutor(enqueued);
  const input = {
    projectId,
    requestKey: `123456789:${commitSha}:987654321:1`,
    request,
    identity
  };

  const first = await createGitHubReleaseRun(input, repository, executor, {
    generateId: () => "22222222-2222-4222-8222-222222222222",
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });
  const duplicate = await createGitHubReleaseRun(input, repository, executor);

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.run.id, first.run.id);
  assert.deepEqual(enqueued, [first.run.id]);
});

test("GitHub release accepts the immutable subject used by newly created repositories", async () => {
  const repository = createMemoryRepository();
  const immutableIdentity = {
    ...identity,
    subject:
      "repo:jh-9999@172338385/audience-live-check@123456789:environment:sketchcatch-production"
  };

  const result = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654321:1`,
      request,
      identity: immutableIdentity
    },
    repository,
    createExecutor([]),
    { generateId: () => "22222222-2222-4222-8222-222222222222" }
  );

  assert.equal(result.created, true);
});

test("an idempotency key can only replay the exact stored workflow identity", async () => {
  const repository = createMemoryRepository();
  const executor = createExecutor([]);
  const requestKey = `123456789:${commitSha}:987654321:1`;
  await createGitHubReleaseRun(
    { projectId, requestKey, request, identity },
    repository,
    executor,
    { generateId: () => "22222222-2222-4222-8222-222222222222" }
  );

  await assert.rejects(
    createGitHubReleaseRun(
      {
        projectId,
        requestKey,
        request: { ...request, workflowRunAttempt: 2 },
        identity: { ...identity, workflowRunAttempt: 2 }
      },
      repository,
      executor
    ),
    /OIDC 신원과 일치하지 않습니다/u
  );
});

test("GitHub release rejects an arbitrary caller-selected idempotency key", async () => {
  await assert.rejects(
    createGitHubReleaseRun(
      { projectId, requestKey: "attacker-selected-key", request, identity },
      createMemoryRepository(),
      createExecutor([])
    ),
    (error: unknown) =>
      error instanceof GitHubReleaseRunError &&
      error.errorCode === "GITHUB_RELEASE_REQUEST_INVALID"
  );
});

test("GitHub OIDC access to an existing run requires its full stored workflow identity", async () => {
  const repository = createMemoryRepository();
  const executor = createExecutor([]);
  const created = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654321:1`,
      request,
      identity
    },
    repository,
    executor,
    { generateId: () => "22222222-2222-4222-8222-222222222222" }
  );

  await assert.rejects(
    getGitHubReleaseRun(
      {
        runId: created.run.id,
        identity: { ...identity, workflowRunAttempt: 2 }
      },
      repository
    ),
    /찾을 수 없습니다/u
  );
  await assert.rejects(
    cancelGitHubReleaseRun(
      {
        runId: created.run.id,
        identity: { ...identity, subject: `${identity.subject}:other` }
      },
      repository,
      executor
    ),
    /찾을 수 없습니다/u
  );
});

test("GitHub release request reserves the project lease before persisting the run", async () => {
  const repository = createMemoryRepository();
  const enqueued: string[] = [];
  const reserved: string[] = [];
  const runId = "22222222-2222-4222-8222-222222222222";

  const result = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654321:1`,
      request,
      identity
    },
    repository,
    createExecutor(enqueued),
    {
      generateId: () => runId,
      reserveExecution: async (input) => {
        assert.deepEqual(input, { projectId, runId });
        reserved.push(input.runId);
      }
    }
  );

  assert.deepEqual(reserved, [runId]);
  assert.equal(repository.records.has(runId), true);
  assert.deepEqual(enqueued, [runId]);
  assert.equal(result.created, true);
});

test("a monitoring row ID is reused before reserving the App release lease", async () => {
  const repository = createMemoryRepository();
  const monitoringRunId = "99999999-9999-4999-8999-999999999999";
  repository.workflowRecordIds.set(
    `${request.workflowRunId}:${request.workflowRunAttempt}`,
    monitoringRunId
  );
  const reserved: string[] = [];

  const result = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654321:1`,
      request,
      identity
    },
    repository,
    createExecutor([]),
    {
      generateId: () => "22222222-2222-4222-8222-222222222222",
      reserveExecution: async ({ runId }) => {
        reserved.push(runId);
      }
    }
  );

  assert.equal(result.run.id, monitoringRunId);
  assert.deepEqual(reserved, [monitoringRunId]);
});

test("every new workflow run creates a distinct release even for the same commit", async () => {
  const repository = createMemoryRepository();
  const enqueued: string[] = [];
  const executor = createExecutor(enqueued);
  const first = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654321:1`,
      request,
      identity
    },
    repository,
    executor,
    { generateId: () => "22222222-2222-4222-8222-222222222222" }
  );
  repository.records.get(first.run.id)!.pipelineStatus = "failed";
  const retryRequest = {
    ...request,
    workflowRunId: "987654322",
    workflowRunAttempt: 1,
    workflowRunUrl:
      "https://github.com/jh-9999/audience-live-check/actions/runs/987654322"
  };
  const retryIdentity = {
    ...identity,
    workflowRunId: retryRequest.workflowRunId,
    workflowRunAttempt: retryRequest.workflowRunAttempt
  };

  const retry = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654322:1`,
      request: retryRequest,
      identity: retryIdentity
    },
    repository,
    executor,
    { generateId: () => "33333333-3333-4333-8333-333333333333" }
  );

  assert.equal(retry.created, true);
  assert.notEqual(retry.run.id, first.run.id);
  assert.deepEqual(enqueued, [first.run.id, retry.run.id]);

  repository.records.get(retry.run.id)!.pipelineStatus = "succeeded";
  const nextRunAfterSuccess = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654323:1`,
      request: {
        ...retryRequest,
        workflowRunId: "987654323",
        workflowRunUrl:
          "https://github.com/jh-9999/audience-live-check/actions/runs/987654323"
      },
      identity: {
        ...retryIdentity,
        workflowRunId: "987654323"
      }
    },
    repository,
    executor
  );
  assert.equal(nextRunAfterSuccess.created, true);
  assert.notEqual(nextRunAfterSuccess.run.id, retry.run.id);
  assert.deepEqual(enqueued, [first.run.id, retry.run.id, nextRunAfterSuccess.run.id]);
});

test("GitHub release request is rejected before persistence when another release holds the lease", async () => {
  const repository = createMemoryRepository();
  const enqueued: string[] = [];

  await assert.rejects(
    createGitHubReleaseRun(
      {
        projectId,
        requestKey: `123456789:${commitSha}:987654321:1`,
        request,
        identity
      },
      repository,
      createExecutor(enqueued),
      {
        generateId: () => "22222222-2222-4222-8222-222222222222",
        reserveExecution: async () => {
          throw new ProjectExecutionLeaseError(
            "PROJECT_RELEASE_IN_PROGRESS",
            "managed deployment is already running for this project",
            "direct"
          );
        }
      }
    ),
    (error) =>
      error instanceof ProjectExecutionLeaseError &&
      error.code === "PROJECT_RELEASE_IN_PROGRESS" &&
      error.activeSource === "direct"
  );

  assert.equal(repository.records.size, 0);
  assert.deepEqual(enqueued, []);
});

test("GitHub release request rejects a repository or commit not signed by OIDC", async () => {
  const repository = createMemoryRepository();
  await assert.rejects(
    () => createGitHubReleaseRun(
      {
        projectId,
        requestKey: `123456789:${commitSha}:987654321:1`,
        request,
        identity: { ...identity, repository: "whiskend/audience-live-check" }
      },
      repository,
      createExecutor([])
    ),
    (error: unknown) =>
      error instanceof Error &&
      "errorCode" in error &&
      error.errorCode === "GITHUB_RELEASE_REQUEST_INVALID"
  );
});

test("GitHub release request requires the exact App workflow file and branch ref", async () => {
  for (const invalidWorkflow of [
    "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml@refs/heads/release",
    "jh-9999/audience-live-check/.github/workflows/SketchCatch-App.yml@refs/heads/main",
    "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml.backup@refs/heads/main"
  ]) {
    await assert.rejects(
      createGitHubReleaseRun(
        {
          projectId,
          requestKey: `123456789:${commitSha}:987654321:1`,
          request: { ...request, workflow: invalidWorkflow },
          identity: { ...identity, workflowRef: invalidWorkflow }
        },
        createMemoryRepository(),
        createExecutor([])
      ),
      (error: unknown) =>
        error instanceof GitHubReleaseRunError &&
        error.errorCode === "GITHUB_RELEASE_REQUEST_INVALID"
    );
  }
});

test("GitHub release status exposes partial failure and cancellation requests", async () => {
  const repository = createMemoryRepository();
  const executor = createExecutor([]);
  const created = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654321:1`,
      request,
      identity
    },
    repository,
    executor,
    { generateId: () => "33333333-3333-4333-8333-333333333333" }
  );
  const stored = repository.records.get(created.run.id)!;
  stored.releaseId = "44444444-4444-4444-8444-444444444444";
  stored.releaseStatus = "partially_failed";
  stored.failureStage = "cloudfront_invalidation";
  stored.pipelineStatus = "failed";

  const partial = await getGitHubReleaseRun({ runId: created.run.id, identity }, repository);
  assert.equal(partial.status, "partially_failed");
  await assert.rejects(
    () => cancelGitHubReleaseRun({ runId: created.run.id, identity }, repository, executor),
    /이미 종료된/
  );

  stored.releaseStatus = null;
  stored.pipelineStatus = "running";
  const cancelling = await cancelGitHubReleaseRun(
    { runId: created.run.id, identity },
    repository,
    executor,
    { now: () => new Date("2026-07-15T01:00:00.000Z") }
  );
  assert.equal(cancelling.cancellationRequestedAt, "2026-07-15T01:00:00.000Z");
  assert.deepEqual(executor.cancelled, [created.run.id]);
});

test("GitHub release status waits for pipeline finalization before exposing a terminal release", async () => {
  const repository = createMemoryRepository();
  const created = await createGitHubReleaseRun(
    {
      projectId,
      requestKey: `123456789:${commitSha}:987654321:1`,
      request,
      identity
    },
    repository,
    createExecutor([]),
    { generateId: () => "33333333-3333-4333-8333-333333333333" }
  );
  const stored = repository.records.get(created.run.id)!;
  stored.pipelineStatus = "running";
  stored.releaseStatus = "succeeded";

  const beforePipelineCommit = await getGitHubReleaseRun(
    { runId: created.run.id, identity },
    repository
  );
  assert.equal(beforePipelineCommit.status, "running");

  stored.pipelineStatus = "succeeded";
  const completed = await getGitHubReleaseRun(
    { runId: created.run.id, identity },
    repository
  );
  assert.equal(completed.status, "succeeded");
});

function createMemoryRepository(): GitHubReleaseRunRepository & {
  records: Map<string, GitHubReleaseRunRecord>;
  workflowRecordIds: Map<string, string>;
} {
  const records = new Map<string, GitHubReleaseRunRecord>();
  const requestKeys = new Map<string, string>();
  const workflowRecordIds = new Map<string, string>();
  return {
    records,
    workflowRecordIds,
    async findProjectContext(id) {
      return id === projectId
        ? {
            projectId,
            sourceRepositoryId: "repository-1",
            repositoryOwner: "jh-9999",
            repositoryName: "audience-live-check",
            githubRepositoryId: "123456789",
            defaultBranch: "main",
            monitorBranch: "main",
            monitoringEnabled: true,
            buildEnvironmentReady: true,
            environmentName: "sketchcatch-production",
            runtimeTargetKind: "ecs_fargate"
          }
        : undefined;
    },
    async findByRequestKey(key) {
      const id = requestKeys.get(key);
      return id ? records.get(id) : undefined;
    },
    async findWorkflowRunRecordId(input) {
      return workflowRecordIds.get(`${input.workflowRunId}:${input.workflowRunAttempt}`);
    },
    async findById(id) {
      return records.get(id);
    },
    async findByIdForOwner(input) {
      return input.userId === "owner-user" ? records.get(input.runId) : undefined;
    },
    async create(input) {
      const record: GitHubReleaseRunRecord = {
        id: input.id,
        projectId: input.projectId,
        infrastructureDeploymentId: "deployment-1",
        sourceRepositoryId: input.sourceRepositoryId,
        commitSha: input.request.commitSha,
        branch: input.branch,
        repositoryId: input.request.repositoryId,
        workflowRef: input.request.workflow,
        workflowRunId: input.request.workflowRunId,
        workflowRunAttempt: input.request.workflowRunAttempt,
        workflowRunUrl: input.request.workflowRunUrl,
        oidcSubject: input.identity.subject,
        environmentName: input.identity.environment,
        pipelineStatus: "queued",
        statusMessage: null,
        releaseId: null,
        releaseStatus: null,
        outputUrl: null,
        failureStage: null,
        cancellationRequestedAt: null,
        createdAt: input.now,
        finishedAt: null
      };
      records.set(record.id, record);
      requestKeys.set(input.requestKey, record.id);
      workflowRecordIds.set(
        `${input.request.workflowRunId}:${input.request.workflowRunAttempt}`,
        record.id
      );
      return record;
    },
    async requestCancellation(input) {
      const record = records.get(input.runId);
      if (!record) return undefined;
      record.cancellationRequestedAt = input.requestedAt;
      return record;
    }
  };
}

function createExecutor(enqueued: string[]): GitHubReleaseRunExecutor & { cancelled: string[] } {
  const cancelled: string[] = [];
  return {
    cancelled,
    enqueue(runId) {
      enqueued.push(runId);
    },
    async cancel(runId) {
      cancelled.push(runId);
    }
  };
}
