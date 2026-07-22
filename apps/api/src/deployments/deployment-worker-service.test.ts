import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  CreateDeploymentJobInput,
  DeploymentJobRecord,
  DeploymentJobRepository
} from "./deployment-job-service.js";
import {
  requireDeploymentWorkerJobId,
  runDeploymentWorkerJob,
  type DeploymentWorkerOperationInput,
  type RunDeploymentWorkerOperation
} from "./deployment-worker-service.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";
const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "55555555-5555-4555-8555-555555555555";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

test("requireDeploymentWorkerJobId rejects a missing worker job id", () => {
  assert.throws(
    () => requireDeploymentWorkerJobId({}),
    /SKETCHCATCH_DEPLOYMENT_JOB_ID is required/
  );
});

test("runDeploymentWorkerJob executes a running job with validated access context", async () => {
  const repository = new FakeDeploymentJobRepository();
  const calls: DeploymentWorkerOperationInput[] = [];
  repository.add(createJob());
  const runOperation: RunDeploymentWorkerOperation = async (input) => {
    calls.push(input);
    return { status: "PENDING", errorSummary: null };
  };

  const finalJob = await runDeploymentWorkerJob({ jobId }, repository, runOperation);

  assert.deepEqual(calls, [
    {
      operation: "apply",
      deploymentId,
      workerTaskArn:
        "arn:aws:ecs:ap-northeast-2:555980271919:task/sketchcatch-production-cluster/task-id",
      accessContext: { kind: "user", userId },
      startedFromStatus: "PENDING",
      startedFromFailureStage: null
    }
  ]);
  assert.equal(finalJob.status, "SUCCEEDED");
  assert.equal(finalJob.completedAt, fixedNow);
});

test("runDeploymentWorkerJob forwards its cancellation signal to the operation", async () => {
  const repository = new FakeDeploymentJobRepository();
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  repository.add(createJob());

  await runDeploymentWorkerJob(
    { jobId, abortSignal: controller.signal },
    repository,
    async (input) => {
      receivedSignal = input.abortSignal;
      return { status: "PENDING", errorSummary: null };
    }
  );

  assert.equal(receivedSignal, controller.signal);
});

test("runDeploymentWorkerJob rejects a job that is not running", async () => {
  const repository = new FakeDeploymentJobRepository();
  let operationCalls = 0;
  repository.add(createJob({ status: "QUEUED" }));

  await assert.rejects(
    runDeploymentWorkerJob({ jobId }, repository, async () => {
      operationCalls += 1;
      return { status: "PENDING", errorSummary: null };
    }),
    /must be RUNNING/
  );

  assert.equal(operationCalls, 0);
  assert.equal(repository.get(jobId)?.status, "QUEUED");
});

test("runDeploymentWorkerJob waits for a locally spawned job to finish dispatching", async () => {
  const repository = new FakeDeploymentJobRepository();
  const calls: DeploymentWorkerOperationInput[] = [];
  let reads = 0;
  repository.add(createJob({ status: "DISPATCHING", ecsTaskArn: null }));
  const findDeploymentJobById = repository.findDeploymentJobById.bind(repository);
  repository.findDeploymentJobById = async (candidateJobId) => {
    reads += 1;
    if (reads === 2) {
      await repository.markDeploymentJobRunning(candidateJobId, {
        ecsTaskArn: "local-process:4321"
      });
    }
    return findDeploymentJobById(candidateJobId);
  };

  const finalJob = await runDeploymentWorkerJob(
    { jobId },
    repository,
    async (input) => {
      calls.push(input);
      return { status: "PENDING", errorSummary: null };
    },
    { wait: async () => undefined, dispatchWaitAttempts: 2 }
  );

  assert.equal(reads, 2);
  assert.equal(calls[0]?.workerTaskArn, "local-process:4321");
  assert.equal(finalJob.status, "SUCCEEDED");
});

test("runDeploymentWorkerJob rejects an access context that does not match the requester", async () => {
  const repository = new FakeDeploymentJobRepository();
  repository.add(
    createJob({
      accessContext: {
        kind: "user",
        userId: "66666666-6666-4666-8666-666666666666"
      }
    })
  );

  await assert.rejects(
    runDeploymentWorkerJob({ jobId }, repository, async () => ({
      status: "PENDING",
      errorSummary: null
    })),
    /access context does not match the requesting user/
  );

  assert.equal(repository.get(jobId)?.status, "FAILED");
});

test("runDeploymentWorkerJob records a masked failure when the service throws", async () => {
  const repository = new FakeDeploymentJobRepository();
  repository.add(createJob());

  await assert.rejects(
    runDeploymentWorkerJob({ jobId }, repository, async () => {
      throw new Error("password=do-not-store-this");
    }),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.doesNotMatch((error as Error).message, /do-not-store-this/);
      return true;
    }
  );

  const failedJob = repository.get(jobId);
  assert.equal(failedJob?.status, "FAILED");
  assert.equal(failedJob?.failedAt, fixedNow);
  assert.match(failedJob?.errorSummary ?? "", /REDACTED/);
  assert.doesNotMatch(failedJob?.errorSummary ?? "", /do-not-store-this/);
});

test("runDeploymentWorkerJob records a failed deployment result as a failed job", async () => {
  const repository = new FakeDeploymentJobRepository();
  repository.add(createJob({ operation: "plan" }));

  await assert.rejects(
    runDeploymentWorkerJob({ jobId }, repository, async () => ({
      status: "FAILED",
      errorSummary: "database_url=postgres://user:secret@example/db"
    })),
    /Deployment worker operation plan failed/
  );

  const failedJob = repository.get(jobId);
  assert.equal(failedJob?.status, "FAILED");
  assert.match(failedJob?.errorSummary ?? "", /REDACTED/);
  assert.doesNotMatch(failedJob?.errorSummary ?? "", /postgres/);
});

test("runDeploymentWorkerJob records a cancelled deployment result", async () => {
  const repository = new FakeDeploymentJobRepository();
  repository.add(createJob({ operation: "destroy_plan" }));

  const finalJob = await runDeploymentWorkerJob({ jobId }, repository, async () => ({
    status: "CANCELLED",
    errorSummary: "Terraform destroy plan was cancelled"
  }));

  assert.equal(finalJob.status, "CANCELLED");
  assert.equal(finalJob.cancelledAt, fixedNow);
  assert.equal(finalJob.errorSummary, "Terraform destroy plan was cancelled");
});

class FakeDeploymentJobRepository implements DeploymentJobRepository {
  private readonly jobs = new Map<string, DeploymentJobRecord>();

  add(job: DeploymentJobRecord): void {
    this.jobs.set(job.id, job);
  }

  get(candidateJobId: string): DeploymentJobRecord | undefined {
    return this.jobs.get(candidateJobId);
  }

  async createDeploymentJob(
    input: CreateDeploymentJobInput & {
      id: string;
    }
  ): Promise<DeploymentJobRecord> {
    const job = createJob({
      ...input,
      requestedByUserId: input.accessContext.userId,
      status: "QUEUED"
    });
    this.add(job);
    return job;
  }

  async findActiveDeploymentJob(candidateDeploymentId: string) {
    return [...this.jobs.values()].find(
      (job) =>
        job.deploymentId === candidateDeploymentId &&
        ["QUEUED", "DISPATCHING", "RUNNING"].includes(job.status)
    );
  }

  async listActiveDeploymentJobs() {
    return [...this.jobs.values()].filter((job) =>
      ["QUEUED", "DISPATCHING", "RUNNING"].includes(job.status)
    );
  }

  async findDeploymentJobById(candidateJobId: string) {
    return this.jobs.get(candidateJobId);
  }

  async markDeploymentJobDispatching(candidateJobId: string) {
    return this.update(candidateJobId, { status: "DISPATCHING" });
  }

  async markDeploymentJobRunning(candidateJobId: string, input: { ecsTaskArn?: string | null }) {
    return this.update(candidateJobId, {
      status: "RUNNING",
      ...(input.ecsTaskArn !== undefined ? { ecsTaskArn: input.ecsTaskArn } : {}),
      startedAt: fixedNow
    });
  }

  async recordDeploymentJobTaskArn(candidateJobId: string, input: { ecsTaskArn: string }) {
    return this.update(candidateJobId, { ecsTaskArn: input.ecsTaskArn });
  }

  async completeDeploymentJob(candidateJobId: string) {
    return this.update(candidateJobId, {
      status: "SUCCEEDED",
      completedAt: fixedNow
    });
  }

  async failDeploymentJob(candidateJobId: string, input: { errorSummary: string }) {
    return this.update(candidateJobId, {
      status: "FAILED",
      errorSummary: input.errorSummary,
      failedAt: fixedNow
    });
  }

  async cancelDeploymentJob(candidateJobId: string, input: { errorSummary?: string | null }) {
    return this.update(candidateJobId, {
      status: "CANCELLED",
      errorSummary: input.errorSummary ?? null,
      cancelledAt: fixedNow
    });
  }

  private update(candidateJobId: string, patch: Partial<DeploymentJobRecord>) {
    const job = this.jobs.get(candidateJobId);

    if (!job) {
      return undefined;
    }

    const updatedJob = { ...job, ...patch, updatedAt: fixedNow };
    this.jobs.set(candidateJobId, updatedJob);
    return updatedJob;
  }
}

function createJob(overrides: Partial<DeploymentJobRecord> = {}): DeploymentJobRecord {
  return {
    id: jobId,
    deploymentId,
    operation: "apply",
    status: "RUNNING",
    requestedByUserId: userId,
    accessContext: { kind: "user", userId },
    startedFromStatus: "PENDING",
    startedFromFailureStage: null,
    ecsTaskArn:
      "arn:aws:ecs:ap-northeast-2:555980271919:task/sketchcatch-production-cluster/task-id",
    errorSummary: null,
    startedAt: fixedNow,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}
