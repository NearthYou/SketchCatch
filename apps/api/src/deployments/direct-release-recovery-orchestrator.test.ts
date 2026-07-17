import assert from "node:assert/strict";
import test from "node:test";

import {
  createEcsInterruptedDirectReleaseRecoveryDispatcher,
  recoverInterruptedDirectReleaseBatch,
  type InterruptedDirectReleaseRecoveryStore
} from "./direct-release-recovery-orchestrator.js";
import type { InterruptedDirectApplicationReleaseData } from "./direct-release-recovery.js";
import type {
  ProjectExecutionLeaseRecord,
  ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";

const descriptor = {
  deploymentId: "deployment-1",
  userId: "user-1",
  deploymentStatus: "RUNNING" as const,
  activeStage: "application_release" as const,
  failureStage: "application_release" as const
};
const data = {
  context: { deployment: { id: "deployment-1", projectId: "project-1" } }
} as InterruptedDirectApplicationReleaseData;

test("startup recovery defers while Direct preflight CodeBuild is still active", async () => {
  let recoveryCalls = 0;
  const result = await recoverInterruptedDirectReleaseBatch(
    { excludeDeploymentIds: [] },
    createDependencies({
      lease: createLease({ activeCodeBuildId: "build-1" }),
      inspectCodeBuild: async () => "active",
      recoverRelease: async () => {
        recoveryCalls += 1;
      }
    })
  );

  assert.deepEqual(result, {
    recoveredDeploymentIds: [],
    retryDeploymentIds: ["deployment-1"]
  });
  assert.equal(recoveryCalls, 0);
});

test("startup recovery takes over only after CodeBuild termination is verified", async () => {
  let verification: { codeBuildTerminalConfirmed: boolean; workerTerminalConfirmed: boolean } | undefined;
  const result = await recoverInterruptedDirectReleaseBatch(
    { excludeDeploymentIds: [] },
    createDependencies({
      lease: createLease({ activeCodeBuildId: "build-1" }),
      inspectCodeBuild: async () => "terminal",
      recoverRelease: async (_data, input) => {
        verification = input;
      }
    })
  );

  assert.deepEqual(result, {
    recoveredDeploymentIds: ["deployment-1"],
    retryDeploymentIds: []
  });
  assert.deepEqual(verification, {
    codeBuildTerminalConfirmed: true,
    workerTerminalConfirmed: true
  });
});

test("startup recovery excludes deployments whose worker is still active", async () => {
  let loadCalls = 0;
  const dependencies = createDependencies({
    recoverRelease: async () => undefined
  });
  dependencies.store = {
    async listInterrupted() {
      return [descriptor];
    },
    async load() {
      loadCalls += 1;
      return data;
    }
  };

  const result = await recoverInterruptedDirectReleaseBatch(
    { excludeDeploymentIds: ["deployment-1"] },
    dependencies
  );

  assert.deepEqual(result, { recoveredDeploymentIds: [], retryDeploymentIds: [] });
  assert.equal(loadCalls, 0);
});

test("startup recovery does not take the lease from a running destroy", async () => {
  let loadCalls = 0;
  let recoveryCalls = 0;
  const dependencies = createDependencies({
    recoverRelease: async () => {
      recoveryCalls += 1;
    }
  });
  dependencies.store = {
    async listInterrupted() {
      return [{ ...descriptor, activeStage: "destroy" }];
    },
    async load() {
      loadCalls += 1;
      return data;
    }
  };

  const result = await recoverInterruptedDirectReleaseBatch(
    { excludeDeploymentIds: [] },
    dependencies
  );

  assert.deepEqual(result, { recoveredDeploymentIds: [], retryDeploymentIds: [] });
  assert.equal(loadCalls, 0);
  assert.equal(recoveryCalls, 0);
});

test("ECS startup recovery dispatches a trusted recovery worker instead of mutating AWS", async () => {
  const calls: string[] = [];
  const jobs = createJobRepository(calls);
  const recover = createEcsInterruptedDirectReleaseRecoveryDispatcher({
    store: {
      async listInterrupted() {
        return [descriptor];
      }
    },
    jobs,
    dispatcher: {
      async dispatch({ job }) {
        calls.push(`dispatch:${job.operation}`);
        return { taskArn: "arn:aws:ecs:ap-northeast-2:123456789012:task/recovery" };
      },
      async inspect() {
        throw new Error("not used");
      },
      async stop() {
        throw new Error("not used");
      }
    }
  });

  const result = await recover({ excludeDeploymentIds: [] });

  assert.deepEqual(result, {
    recoveredDeploymentIds: [],
    protectedDeploymentIds: ["deployment-1"],
    retryDeploymentIds: []
  });
  assert.deepEqual(calls, [
    "create:recover_application_release",
    "dispatching",
    "dispatch:recover_application_release",
    "record-task:arn:aws:ecs:ap-northeast-2:123456789012:task/recovery",
    "running:arn:aws:ecs:ap-northeast-2:123456789012:task/recovery"
  ]);
});

function createDependencies(overrides: {
  lease?: ProjectExecutionLeaseRecord;
  inspectCodeBuild?: () => Promise<"active" | "terminal" | "unknown">;
  recoverRelease: (
    data: InterruptedDirectApplicationReleaseData,
    input: { codeBuildTerminalConfirmed: boolean; workerTerminalConfirmed: boolean }
  ) => Promise<void>;
}) {
  const store: InterruptedDirectReleaseRecoveryStore = {
    async listInterrupted() {
      return [descriptor];
    },
    async load() {
      return data;
    }
  };
  return {
    store,
    leaseRepository: {
      async find() {
        return overrides.lease;
      }
    } as Pick<ProjectExecutionLeaseRepository, "find">,
    inspectCodeBuild: overrides.inspectCodeBuild ?? (async () => "terminal" as const),
    recoverRelease: overrides.recoverRelease
  };
}

function createLease(
  overrides: Partial<ProjectExecutionLeaseRecord> = {}
): ProjectExecutionLeaseRecord {
  const timestamp = new Date("2026-07-16T02:00:00.000Z");
  return {
    projectId: "project-1",
    holderId: "deployment-1",
    source: "direct",
    fencingVersion: 1,
    status: "active",
    activeCodeBuildId: null,
    activeWorkerTaskArn: null,
    heartbeatAt: timestamp,
    expiresAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function createJobRepository(calls: string[]) {
  const timestamp = new Date("2026-07-16T02:00:00.000Z");
  let job: import("./deployment-job-service.js").DeploymentJobRecord | undefined;
  return {
    async createDeploymentJob(input: Parameters<import("./deployment-job-service.js").DeploymentJobRepository["createDeploymentJob"]>[0]) {
      calls.push(`create:${input.operation}`);
      job = {
        id: input.id,
        deploymentId: input.deploymentId,
        operation: input.operation,
        status: "QUEUED",
        requestedByUserId: input.accessContext.userId,
        accessContext: input.accessContext,
        startedFromStatus: input.startedFromStatus,
        startedFromFailureStage: input.startedFromFailureStage ?? null,
        ecsTaskArn: null,
        errorSummary: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      return job;
    },
    async findActiveDeploymentJob() {
      return undefined;
    },
    async listActiveDeploymentJobs() {
      return job ? [job] : [];
    },
    async findDeploymentJobById() {
      return job;
    },
    async markDeploymentJobDispatching() {
      calls.push("dispatching");
      if (!job) return undefined;
      job = { ...job, status: "DISPATCHING" };
      return job;
    },
    async markDeploymentJobRunning(_jobId: string, input: { ecsTaskArn?: string | null }) {
      calls.push(`running:${input.ecsTaskArn}`);
      if (!job) return undefined;
      job = { ...job, status: "RUNNING", ecsTaskArn: input.ecsTaskArn ?? null };
      return job;
    },
    async recordDeploymentJobTaskArn(_jobId: string, input: { ecsTaskArn: string }) {
      calls.push(`record-task:${input.ecsTaskArn}`);
      if (job) job = { ...job, ecsTaskArn: input.ecsTaskArn };
      return job;
    },
    async completeDeploymentJob() {
      return job;
    },
    async failDeploymentJob() {
      return job;
    },
    async cancelDeploymentJob() {
      return job;
    }
  } satisfies import("./deployment-job-service.js").DeploymentJobRepository;
}
