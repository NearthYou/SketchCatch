import { test } from "node:test";
import assert from "node:assert/strict";
import type { DeploymentJobRecord } from "./deployment-job-service.js";
import {
  reconcileDeploymentStartup,
  type DeploymentStartupJobStore,
  type InterruptedDeploymentRecoveryStore
} from "./deployment-startup-reconciliation.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";
const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "55555555-5555-4555-8555-555555555555";
const taskArn =
  "arn:aws:ecs:ap-northeast-2:555980271919:task/sketchcatch-production-cluster/task-id";
const now = new Date("2026-07-10T00:10:00.000Z");

test("reconcileDeploymentStartup preserves deployments whose ECS worker task is active", async () => {
  const jobs = new FakeStartupJobStore([createJob()]);
  const deployments = new FakeInterruptedDeploymentStore();

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "ecs",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => ({ state: "ACTIVE", lastStatus: "RUNNING" })
  );

  assert.deepEqual(deployments.excludedDeploymentIds, [deploymentId]);
  assert.equal(jobs.failedJobs.length, 0);
  assert.deepEqual(result, {
    activeDeploymentCount: 1,
    deferredInspectionCount: 0,
    failedJobCount: 0,
    recoveryRetryCount: 0,
    recoveredDeploymentCount: 0
  });
});

test("reconcileDeploymentStartup fails stopped ECS jobs and recovers their deployment", async () => {
  const jobs = new FakeStartupJobStore([createJob()]);
  const deployments = new FakeInterruptedDeploymentStore([deploymentId]);

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "ecs",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => ({ state: "STOPPED", lastStatus: "STOPPED" })
  );

  assert.deepEqual(deployments.excludedDeploymentIds, []);
  assert.equal(jobs.failedJobs.length, 1);
  assert.match(jobs.failedJobs[0]?.errorSummary ?? "", /ECS worker task is STOPPED/);
  assert.deepEqual(result, {
    activeDeploymentCount: 0,
    deferredInspectionCount: 0,
    failedJobCount: 1,
    recoveryRetryCount: 0,
    recoveredDeploymentCount: 1
  });
});

test("reconcileDeploymentStartup preserves ECS jobs when task inspection is unavailable", async () => {
  const jobs = new FakeStartupJobStore([createJob()]);
  const deployments = new FakeInterruptedDeploymentStore();
  const inspectionError = new Error("ECS DescribeTasks unavailable");
  const warnings: Array<{ context: unknown; message: string | undefined }> = [];

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "ecs",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => {
      throw inspectionError;
    },
    {
      warn: (context, message) => {
        warnings.push({ context, message });
      }
    }
  );

  assert.deepEqual(deployments.excludedDeploymentIds, [deploymentId]);
  assert.equal(jobs.failedJobs.length, 0);
  assert.equal(result.activeDeploymentCount, 0);
  assert.equal(result.deferredInspectionCount, 1);
  assert.equal(result.recoveryRetryCount, 1);
  assert.deepEqual(warnings, [
    {
      context: {
        errorName: "Error",
        errorSummary: "ECS DescribeTasks unavailable",
        jobId,
        ecsTaskArn: taskArn
      },
      message: "Failed to inspect ECS worker task during startup reconciliation"
    }
  ]);
});

test("reconcileDeploymentStartup defers a recently missing ECS task during eventual consistency", async () => {
  const jobs = new FakeStartupJobStore([
    createJob({ updatedAt: new Date("2026-07-10T00:09:00.000Z") })
  ]);
  const deployments = new FakeInterruptedDeploymentStore();

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "ecs",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => ({ state: "MISSING", lastStatus: null })
  );

  assert.equal(jobs.failedJobs.length, 0);
  assert.deepEqual(deployments.excludedDeploymentIds, [deploymentId]);
  assert.equal(result.activeDeploymentCount, 0);
  assert.equal(result.deferredInspectionCount, 1);
  assert.equal(result.recoveryRetryCount, 1);
});

test("reconcileDeploymentStartup fails stale dispatch jobs without task ARNs", async () => {
  const jobs = new FakeStartupJobStore([
    createJob({
      status: "DISPATCHING",
      ecsTaskArn: null,
      updatedAt: new Date("2026-07-10T00:00:00.000Z")
    })
  ]);
  const deployments = new FakeInterruptedDeploymentStore([deploymentId]);

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "ecs",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => {
      throw new Error("Task inspection should not run without an ARN");
    }
  );

  assert.equal(jobs.failedJobs.length, 1);
  assert.match(jobs.failedJobs[0]?.errorSummary ?? "", /did not start within 300 seconds/);
  assert.deepEqual(deployments.excludedDeploymentIds, []);
  assert.equal(result.failedJobCount, 1);
  assert.equal(result.recoveredDeploymentCount, 1);
});

test("reconcileDeploymentStartup preserves recent queued jobs during the dispatch grace period", async () => {
  const jobs = new FakeStartupJobStore([
    createJob({
      status: "QUEUED",
      ecsTaskArn: null,
      updatedAt: new Date("2026-07-10T00:09:00.000Z")
    })
  ]);
  const deployments = new FakeInterruptedDeploymentStore();

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "ecs",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => {
      throw new Error("Task inspection should not run without an ARN");
    }
  );

  assert.equal(jobs.failedJobs.length, 0);
  assert.deepEqual(deployments.excludedDeploymentIds, [deploymentId]);
  assert.equal(result.activeDeploymentCount, 0);
  assert.equal(result.recoveryRetryCount, 1);
});

test("reconcileDeploymentStartup protects deployments when a stale-job failure loses a race", async () => {
  const jobs = new FakeStartupJobStore(
    [
      createJob({
        status: "DISPATCHING",
        ecsTaskArn: null,
        updatedAt: new Date("2026-07-10T00:00:00.000Z")
      })
    ],
    false
  );
  const deployments = new FakeInterruptedDeploymentStore();

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "ecs",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => {
      throw new Error("Task inspection should not run without an ARN");
    }
  );

  assert.deepEqual(deployments.excludedDeploymentIds, [deploymentId]);
  assert.equal(result.failedJobCount, 0);
  assert.equal(result.activeDeploymentCount, 0);
  assert.equal(result.deferredInspectionCount, 1);
  assert.equal(result.recoveryRetryCount, 1);
});

test("reconcileDeploymentStartup keeps the existing in-process recovery behavior", async () => {
  const jobs = new FakeStartupJobStore([createJob()]);
  const deployments = new FakeInterruptedDeploymentStore([deploymentId]);

  const result = await reconcileDeploymentStartup(
    {
      workerMode: "in_process",
      now,
      dispatchGracePeriodMs: 5 * 60_000
    },
    jobs,
    deployments,
    async () => {
      throw new Error("Task inspection should not run in in-process mode");
    }
  );

  assert.deepEqual(deployments.excludedDeploymentIds, []);
  assert.equal(jobs.listCalls, 0);
  assert.equal(result.recoveredDeploymentCount, 1);
});

class FakeStartupJobStore implements DeploymentStartupJobStore {
  readonly failedJobs: Array<{ jobId: string; errorSummary: string }> = [];
  listCalls = 0;

  constructor(
    private readonly jobs: DeploymentJobRecord[],
    private readonly failTransitionSucceeds = true
  ) {}

  async listActiveDeploymentJobs(): Promise<DeploymentJobRecord[]> {
    this.listCalls += 1;
    return this.jobs;
  }

  async failDeploymentJob(
    candidateJobId: string,
    input: { errorSummary: string }
  ): Promise<DeploymentJobRecord | undefined> {
    const job = this.jobs.find((candidate) => candidate.id === candidateJobId);

    if (!job || !this.failTransitionSucceeds) {
      return undefined;
    }

    this.failedJobs.push({ jobId: candidateJobId, errorSummary: input.errorSummary });
    return {
      ...job,
      status: "FAILED",
      errorSummary: input.errorSummary,
      failedAt: now,
      updatedAt: now
    };
  }
}

class FakeInterruptedDeploymentStore implements InterruptedDeploymentRecoveryStore {
  excludedDeploymentIds: string[] = [];

  constructor(private readonly recoveredDeploymentIds: string[] = []) {}

  async recoverInterruptedDeployments(input?: {
    excludeDeploymentIds?: readonly string[];
  }): Promise<unknown[]> {
    this.excludedDeploymentIds = [...(input?.excludeDeploymentIds ?? [])];
    return this.recoveredDeploymentIds.map((id) => ({ id }));
  }
}

function createJob(overrides: Partial<DeploymentJobRecord> = {}): DeploymentJobRecord {
  const createdAt = new Date("2026-07-10T00:00:00.000Z");

  return {
    id: jobId,
    deploymentId,
    operation: "apply",
    status: "RUNNING",
    requestedByUserId: userId,
    accessContext: { kind: "user", userId },
    startedFromStatus: "PENDING",
    startedFromFailureStage: null,
    ecsTaskArn: taskArn,
    errorSummary: null,
    startedAt: createdAt,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}
