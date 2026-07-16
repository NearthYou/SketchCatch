import assert from "node:assert/strict";
import test from "node:test";
import type { DirectApplicationReleaseGateway } from "../deployments/direct-application-release-service.js";
import type {
  ProjectExecutionLeaseRecord,
  ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import {
  createGitHubReleaseRunExecutor,
  type GitHubReleaseExecutionRepository
} from "./github-release-run-executor.js";

const runId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

test("GitHub executor reuses the server preflight gateway and completes the trusted release", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  const gateway = createGateway(events);
  const executor = createGitHubReleaseRunExecutor({
    repository,
    gateway,
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });

  await executor.executeNow(runId);

  assert.deepEqual(events, [
    "claim",
    "prepare",
    "save-candidate",
    "deploy",
    "complete",
    "cleanup:success"
  ]);
});

test("GitHub executor propagates cancellation to a running preflight", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gateway = createGateway(events, async (_context, signal) => {
    events.push("prepare");
    started();
    await new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    throw new Error("unreachable");
  });
  const executor = createGitHubReleaseRunExecutor({ repository, gateway });

  const execution = executor.executeNow(runId);
  await startedPromise;
  await executor.cancel(runId);
  await execution;

  assert.deepEqual(events, ["claim", "prepare", "cancelled"]);
});

test("GitHub executor reconciles a durable running release after process restart", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "running",
    cancellationRequestedAt: new Date("2026-07-15T00:01:00.000Z")
  }];
  const executor = createGitHubReleaseRunExecutor({
    repository,
    recoveryController: {
      async recover(input) {
        events.push(`recover:${input.cancellationRequested}`);
        return {
          kind: "failure",
          cancelled: true,
          errorSummary: "recovered cancellation"
        };
      }
    }
  });

  await executor.recoverInterruptedRuns();

  assert.deepEqual(events, ["recover:true", "cancelled"]);
});

test("GitHub recovery writes its terminal result with the exact recovery fence", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  let terminalFence: { holderId: string; fencingVersion: number } | undefined;
  repository.complete = async (input) => {
    terminalFence = input.fence;
    events.push("complete");
  };
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "running",
    cancellationRequestedAt: null
  }];
  const recoveryHolderId = `recovery:${runId}:worker`;
  const executor = createGitHubReleaseRunExecutor({
    repository,
    executionLeaseRepository: createExecutionLeaseRepository(events, recoveryHolderId),
    recoveryController: {
      async recover() {
        events.push("recover");
        return { kind: "completion", result: createReleaseCompletion() };
      }
    }
  });

  await executor.recoverInterruptedRuns();

  assert.deepEqual(terminalFence, { projectId, holderId: recoveryHolderId, fencingVersion: 1 });
  assert.deepEqual(events, ["recover", "complete", "lease:released"]);
});

test("a stale GitHub recovery worker cannot save a terminal result", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "running",
    cancellationRequestedAt: null
  }];
  const executor = createGitHubReleaseRunExecutor({
    repository,
    executionLeaseRepository: createExecutionLeaseRepository(events, "newer-run"),
    recoveryController: {
      async recover() {
        events.push("recover");
        return { kind: "completion", result: createReleaseCompletion() };
      }
    }
  });

  await executor.recoverInterruptedRuns();

  assert.deepEqual(events, ["recover"]);
});

test("GitHub executor cancels a queued interrupted run without starting its build", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "queued",
    cancellationRequestedAt: new Date("2026-07-15T00:01:00.000Z")
  }];
  const executor = createGitHubReleaseRunExecutor({
    repository,
    gateway: createGateway(events),
    executionLeaseRepository: createExecutionLeaseRepository(events),
    now: () => new Date("2026-07-15T00:02:00.000Z")
  });

  await executor.recoverInterruptedRuns();

  assert.deepEqual(events, ["cancelled", "lease:released"]);
});

test("GitHub executor recovers a persisted running cancellation when no local worker exists", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "running",
    cancellationRequestedAt: new Date("2026-07-15T00:01:00.000Z")
  }];
  const executor = createGitHubReleaseRunExecutor({
    repository,
    recoveryController: {
      async recover(input) {
        events.push(`recover:${input.cancellationRequested}`);
        return {
          kind: "failure",
          cancelled: true,
          errorSummary: "recovered cancellation"
        };
      }
    }
  });

  await executor.cancel(runId);

  assert.deepEqual(events, ["recover:true", "cancelled"]);
});

test("GitHub frontend retry reserves the release lease and dispatches the trusted retry worker", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.prepareFrontendRetry = async () => {
    events.push("retry:prepared");
    return { runId, projectId, releaseId: "release-1" };
  };
  repository.failFrontendRetry = async () => {
    events.push("retry:failed");
  };
  const executor = createGitHubReleaseRunExecutor({
    repository,
    gateway: createGateway(events),
    executionLeaseRepository: createExecutionLeaseRepository(events),
    dispatchToWorker: true,
    workerDispatcher: {
      async dispatch(input) {
        events.push(`worker:${input.mode}`);
        return { taskArn: "arn:aws:ecs:ap-northeast-2:123456789012:task/retry" };
      },
      async inspect() {
        return "STOPPED";
      },
      async inspectRun() {
        return { state: "MISSING", taskArn: null };
      },
      async stopAndConfirm() {}
    },
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });

  assert.ok(executor.retryFrontend);
  await executor.retryFrontend(runId);

  assert.deepEqual(events, ["retry:prepared", "worker:retry_frontend"]);
});

test("GitHub recovery resumes a queued frontend retry without rebuilding the API", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "queued",
    cancellationRequestedAt: null,
    releaseId: "release-1",
    releaseStatus: "partially_failed"
  }];
  repository.failFrontendRetry = async () => {
    events.push("retry:failed");
  };
  const executor = createGitHubReleaseRunExecutor({
    repository,
    gateway: createGateway(events),
    executionLeaseRepository: createExecutionLeaseRepository(events, "release-1"),
    dispatchToWorker: true,
    workerDispatcher: {
      async dispatch(input) {
        events.push(`worker:${input.mode}`);
        return { taskArn: "arn:aws:ecs:ap-northeast-2:123456789012:task/retry" };
      },
      async inspect() {
        return "STOPPED";
      },
      async stopAndConfirm() {}
    },
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });

  await executor.recoverInterruptedRuns();

  assert.deepEqual(events, ["worker:retry_frontend"]);
});

test("GitHub recovery confirms CodeBuild terminal before issuing a new fence", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "running",
    cancellationRequestedAt: new Date("2026-07-15T00:01:00.000Z")
  }];
  const executionLeaseRepository = createRecoverableLeaseRepository(events);
  const executor = createGitHubReleaseRunExecutor({
    repository,
    gateway: createGateway(events),
    executionLeaseRepository,
    interruptedCodeBuildController: {
      async stopAndConfirm(input) {
        assert.equal(input.buildId, "demo-build:1");
        events.push("codebuild:terminal");
      }
    },
    dispatchToWorker: true,
    workerDispatcher: {
      async dispatch(input) {
        events.push(`worker:${input.mode}`);
        return { taskArn: "arn:aws:ecs:ap-northeast-2:123456789012:task/recovery" };
      },
      async inspect() {
        return "STOPPED";
      },
      async inspectRun() {
        return { state: "MISSING", taskArn: null };
      },
      async stopAndConfirm() {}
    },
    now: () => new Date("2026-07-15T00:02:00.000Z")
  });

  await executor.recoverInterruptedRuns();

  assert.deepEqual(events, [
    "codebuild:terminal",
    "codebuild:cleared",
    "lease:recovered",
    "worker:recover",
    "worker:recorded"
  ]);
});

test("GitHub recovery discovers and stops an unrecorded worker before issuing a new fence", async () => {
  const events: string[] = [];
  const repository = createRepository(events);
  repository.listInterrupted = async () => [{
    runId,
    projectId,
    pipelineStatus: "running",
    cancellationRequestedAt: new Date("2026-07-15T00:01:00.000Z")
  }];
  const executionLeaseRepository = createRecoverableLeaseRepository(events);
  await executionLeaseRepository.setExecutionCoordinates({
    projectId,
    holderId: runId,
    fencingVersion: 1,
    activeCodeBuildId: null,
    now: new Date("2026-07-15T00:01:00.000Z")
  });
  events.length = 0;
  const executor = createGitHubReleaseRunExecutor({
    repository,
    gateway: createGateway(events),
    executionLeaseRepository,
    dispatchToWorker: true,
    workerDispatcher: {
      async dispatch(input) {
        events.push(`worker:${input.mode}`);
        return { taskArn: "arn:aws:ecs:region:account:task/recovery" };
      },
      async inspect() {
        return "STOPPED";
      },
      async inspectRun() {
        events.push("worker:discovered");
        return { state: "ACTIVE", taskArn: "arn:aws:ecs:region:account:task/interrupted" };
      },
      async stopAndConfirm(input) {
        events.push(`worker:stopped:${input.taskArn.endsWith("/interrupted")}`);
      }
    },
    now: () => new Date("2026-07-15T00:02:00.000Z")
  });

  await executor.recoverInterruptedRuns();

  assert.deepEqual(events, [
    "worker:discovered",
    "worker:stopped:true",
    "lease:recovered",
    "worker:recover",
    "worker:recorded"
  ]);
});

function createRepository(events: string[]): GitHubReleaseExecutionRepository {
  return {
    async claim(id) {
      events.push("claim");
      if (id !== runId) return undefined;
      return {
        runId,
        projectId,
        commitSha: "a".repeat(40),
        sourceRepository: {
          provider: "github",
          installationId: "installation-1",
          owner: "jh-9999",
          name: "audience-live-check"
        },
        buildEnvironment: {
          id: "build-1",
          awsConnectionId: "connection-1",
          awsCodeConnectionId: "code-connection-1",
          codeConnectionArn: "arn:aws:codeconnections:ap-northeast-2:123456789012:connection/connection-1",
          codeBuildProjectName: "audience-live-check-build",
          codeBuildServiceRoleArn: "arn:aws:iam::123456789012:role/SketchCatchCodeBuild-project1",
          permissionsBoundaryArn: "arn:aws:iam::123456789012:policy/SketchCatchCodeBuildBoundary-connection1",
          sourceRepositoryUrl: "https://github.com/jh-9999/audience-live-check.git",
          runtimeFingerprint: "b".repeat(64),
          status: "ready"
        },
        target: {
          runtimeTargetKind: "ecs_fargate",
          confirmedBuildConfig: {
            sourceRoot: ".",
            evidence: [],
            installPreset: "pnpm_frozen_lockfile",
            buildPreset: "docker_build",
            artifactOutputPath: "apps/web/dist",
            runtimeEntrypoint: null,
            healthCheckPath: "/health",
            dockerfilePath: "apps/api/Dockerfile",
            packageManifestPath: "apps/web/package.json",
            samTemplatePath: null,
            appSpecPath: null,
            staticOutputPath: null,
            exactSemVerTag: null,
            manifestVersion: null,
            confirmedCommitSha: "a".repeat(40),
            confirmedAt: "2026-07-15T00:00:00.000Z",
            ecsWeb: {
              api: {
                sourceRoot: ".",
                dockerfilePath: "apps/api/Dockerfile",
                containerPort: 8080,
                healthCheckPath: "/health"
              },
              frontend: {
                sourceRoot: "apps/web",
                packageManifestPath: "apps/web/package.json",
                lockfilePath: "pnpm-lock.yaml",
                packageManager: "pnpm",
                packageManagerVersion: "10.11.1",
                installPreset: "pnpm_frozen_lockfile",
                buildPreset: "pnpm_build",
                outputPath: "apps/web/dist"
              }
            }
          },
          runtimeConfig: {
            runtimeTargetKind: "ecs_fargate",
            codeBuildProjectName: "audience-live-check-build",
            ecrRepositoryName: "audience-live-check-api",
            clusterName: "audience-live-check-cluster",
            serviceName: "audience-live-check-service",
            containerName: "api",
            outputUrl: "https://d111111abcdef8.cloudfront.net"
          }
        },
        connection: {
          accountId: "123456789012",
          roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
          externalId: "external-id",
          region: "ap-northeast-2"
        }
      };
    },
    async createPendingRelease() {
      events.push("save-candidate");
    },
    async complete() {
      events.push("complete");
    },
    async fail(input) {
      events.push(input.cancelled ? "cancelled" : "failed");
    }
  };
}

function createExecutionLeaseRepository(
  events: string[],
  initialHolderId = runId
): ProjectExecutionLeaseRepository {
  const timestamp = new Date("2026-07-15T00:00:00.000Z");
  let record: ProjectExecutionLeaseRecord | undefined = {
    projectId,
    holderId: initialHolderId,
    source: "gitops",
    fencingVersion: 1,
    status: "active",
    activeCodeBuildId: null,
    activeWorkerTaskArn: null,
    heartbeatAt: timestamp,
    expiresAt: new Date("2026-07-15T00:05:00.000Z"),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return {
    async acquire(input) {
      record = record
        ? {
            ...record,
            holderId: input.holderId,
            source: input.source,
            status: "active",
            heartbeatAt: input.now,
            expiresAt: input.expiresAt,
            updatedAt: input.now
          }
        : undefined;
      return record;
    },
    async find() {
      return record;
    },
    async heartbeat() {
      return record;
    },
    async setExecutionCoordinates() {
      return record;
    },
    async release(input) {
      if (
        !record ||
        record.status !== "active" ||
        record.holderId !== input.holderId ||
        record.fencingVersion !== input.fencingVersion
      ) return false;
      record = { ...record, status: "released", expiresAt: input.now, updatedAt: input.now };
      events.push("lease:released");
      return true;
    }
  };
}

function createRecoverableLeaseRepository(events: string[]): ProjectExecutionLeaseRepository {
  const timestamp = new Date("2026-07-15T00:00:00.000Z");
  let record: ProjectExecutionLeaseRecord = {
    projectId,
    holderId: runId,
    source: "gitops",
    fencingVersion: 1,
    status: "active",
    activeCodeBuildId: "demo-build:1",
    activeWorkerTaskArn: null,
    heartbeatAt: timestamp,
    expiresAt: new Date("2026-07-15T00:01:00.000Z"),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return {
    async acquire() {
      return record;
    },
    async find() {
      return record;
    },
    async heartbeat() {
      return record;
    },
    async setExecutionCoordinates(input) {
      record = {
        ...record,
        ...(input.activeCodeBuildId !== undefined
          ? { activeCodeBuildId: input.activeCodeBuildId }
          : {}),
        ...(input.activeWorkerTaskArn !== undefined
          ? { activeWorkerTaskArn: input.activeWorkerTaskArn }
          : {}),
        updatedAt: input.now
      };
      events.push(
        input.activeCodeBuildId === null ? "codebuild:cleared" : "worker:recorded"
      );
      return record;
    },
    async recoverVerifiedTerminal(input) {
      if (
        record.holderId !== input.expectedHolderId ||
        record.fencingVersion !== input.expectedFencingVersion ||
        record.activeCodeBuildId !== input.expectedActiveCodeBuildId
      ) return undefined;
      record = {
        ...record,
        holderId: input.holderId,
        source: input.source,
        fencingVersion: record.fencingVersion + 1,
        activeCodeBuildId: null,
        activeWorkerTaskArn: null,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      };
      events.push("lease:recovered");
      return record;
    },
    async release() {
      return true;
    }
  };
}

function createGateway(
  events: string[],
  prepareArtifact?: DirectApplicationReleaseGateway["prepareArtifact"]
): DirectApplicationReleaseGateway {
  return {
    prepareArtifact: prepareArtifact ?? (async () => {
      events.push("prepare");
      return {
        commitSha: "a".repeat(40),
        digest: "b".repeat(64),
        reference: "deployments/run/release-candidates/candidate/manifest.json",
        buildRevisionId: "build:1",
        metadata: { releaseCandidateId: "candidate-1" }
      };
    }),
    async deployArtifact() {
      events.push("deploy");
      return {
        providerRevision: {
          provider: "aws",
          resourceType: "ecs_task_definition",
          revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:2",
          artifactReference: "manifest.json",
          metadata: {}
        },
        outputUrl: "https://d111111abcdef8.cloudfront.net",
        healthEvidence: { state: "healthy" },
        rollbackEvidence: null,
        status: "succeeded"
      };
    },
    async rollbackArtifact() {
      throw new Error("not used");
    },
    async cleanupArtifact(input) {
      events.push(`cleanup:${input.mode}`);
    }
  };
}

function createReleaseCompletion() {
  return {
    providerRevision: {
      provider: "aws" as const,
      resourceType: "ecs_task_definition",
      revisionId: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/demo:2",
      artifactReference: "manifest.json",
      metadata: {}
    },
    outputUrl: "https://d111111abcdef8.cloudfront.net",
    healthEvidence: { state: "healthy" },
    rollbackEvidence: null,
    frontendEvidence: null,
    failureStage: null,
    status: "succeeded" as const
  };
}
