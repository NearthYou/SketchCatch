import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancelDeploymentJob,
  completeDeploymentJob,
  createDeploymentJob,
  DeploymentJobConflictError,
  failDeploymentJob,
  markDeploymentJobDispatching,
  markDeploymentJobRunning,
  recordDeploymentJobTaskArn,
  type CreateDeploymentJobInput,
  type DeploymentJobRecord,
  type DeploymentJobRepository
} from "./deployment-job-service.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

class FakeDeploymentJobRepository implements DeploymentJobRepository {
  readonly jobs = new Map<string, DeploymentJobRecord>();
  uniqueViolationOnCreate = false;

  async createDeploymentJob(
    input: CreateDeploymentJobInput & {
      id: string;
    }
  ) {
    if (this.uniqueViolationOnCreate) {
      const error = new Error("duplicate key value violates unique constraint");
      Object.assign(error, {
        code: "23505",
        constraint: "deployment_jobs_deployment_active_unique"
      });
      throw error;
    }

    const job: DeploymentJobRecord = {
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
      createdAt: fixedNow,
      updatedAt: fixedNow
    };
    this.jobs.set(job.id, job);
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

  async findDeploymentJobById(jobId: string) {
    return this.jobs.get(jobId);
  }

  async markDeploymentJobDispatching(jobId: string) {
    return this.updateActiveJob(jobId, ["QUEUED"], {
      status: "DISPATCHING",
      updatedAt: fixedNow
    });
  }

  async markDeploymentJobRunning(
    jobId: string,
    input: {
      ecsTaskArn?: string | null;
    }
  ) {
    return this.updateActiveJob(jobId, ["QUEUED", "DISPATCHING"], {
      status: "RUNNING",
      ecsTaskArn: input.ecsTaskArn ?? null,
      startedAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  async recordDeploymentJobTaskArn(
    jobId: string,
    input: {
      ecsTaskArn: string;
    }
  ) {
    return this.updateActiveJob(jobId, ["QUEUED", "DISPATCHING", "RUNNING"], {
      ecsTaskArn: input.ecsTaskArn,
      updatedAt: fixedNow
    });
  }

  async completeDeploymentJob(jobId: string) {
    return this.updateActiveJob(jobId, ["QUEUED", "DISPATCHING", "RUNNING"], {
      status: "SUCCEEDED",
      completedAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  async failDeploymentJob(
    jobId: string,
    input: {
      errorSummary: string;
    }
  ) {
    return this.updateActiveJob(jobId, ["QUEUED", "DISPATCHING", "RUNNING"], {
      status: "FAILED",
      errorSummary: input.errorSummary,
      failedAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  async cancelDeploymentJob(
    jobId: string,
    input: {
      errorSummary?: string | null;
    }
  ) {
    return this.updateActiveJob(jobId, ["QUEUED", "DISPATCHING", "RUNNING"], {
      status: "CANCELLED",
      errorSummary: input.errorSummary ?? null,
      cancelledAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  private updateActiveJob(
    jobId: string,
    allowedStatuses: DeploymentJobRecord["status"][],
    patch: Partial<DeploymentJobRecord>
  ) {
    const job = this.jobs.get(jobId);

    if (!job || !allowedStatuses.includes(job.status)) {
      return undefined;
    }

    const updatedJob = { ...job, ...patch };
    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }
}

function createJobInput(
  overrides: Partial<CreateDeploymentJobInput> = {}
): CreateDeploymentJobInput {
  return {
    deploymentId,
    operation: "apply",
    accessContext: {
      kind: "user",
      userId
    },
    startedFromStatus: "PENDING",
    startedFromFailureStage: null,
    ...overrides
  };
}

test("createDeploymentJob records requester, source deployment state, and queued status", async () => {
  const repository = new FakeDeploymentJobRepository();

  const job = await createDeploymentJob(
    createJobInput({
      operation: "destroy",
      startedFromStatus: "FAILED",
      startedFromFailureStage: "apply"
    }),
    repository
  );

  assert.equal(job.deploymentId, deploymentId);
  assert.equal(job.operation, "destroy");
  assert.equal(job.status, "QUEUED");
  assert.equal(job.requestedByUserId, userId);
  assert.deepEqual(job.accessContext, { kind: "user", userId });
  assert.equal(job.startedFromStatus, "FAILED");
  assert.equal(job.startedFromFailureStage, "apply");
  assert.equal(job.ecsTaskArn, null);
  assert.equal(job.errorSummary, null);
});

test("createDeploymentJob rejects a duplicate active job for the same deployment", async () => {
  const repository = new FakeDeploymentJobRepository();
  await createDeploymentJob(createJobInput(), repository);

  await assert.rejects(
    () => createDeploymentJob(createJobInput({ operation: "plan" }), repository),
    DeploymentJobConflictError
  );
});

test("createDeploymentJob maps database active-job unique violations to conflict errors", async () => {
  const repository = new FakeDeploymentJobRepository();
  repository.uniqueViolationOnCreate = true;

  await assert.rejects(() => createDeploymentJob(createJobInput(), repository), {
    name: "DeploymentJobConflictError",
    message: "Deployment already has an active execution job"
  });
});

test("deployment job state transitions record dispatch, running task, and success timestamps", async () => {
  const repository = new FakeDeploymentJobRepository();
  const job = await createDeploymentJob(createJobInput(), repository);

  const dispatchingJob = await markDeploymentJobDispatching({ jobId: job.id }, repository);
  assert.equal(dispatchingJob.status, "DISPATCHING");

  const taskArn = "arn:aws:ecs:ap-northeast-2:555980271919:task/cluster/task-id";
  const runningJob = await markDeploymentJobRunning(
    {
      jobId: job.id,
      ecsTaskArn: taskArn
    },
    repository
  );
  assert.equal(runningJob.status, "RUNNING");
  assert.equal(runningJob.ecsTaskArn, taskArn);
  assert.equal(runningJob.startedAt?.toISOString(), fixedNow.toISOString());

  const completedJob = await completeDeploymentJob({ jobId: job.id }, repository);
  assert.equal(completedJob.status, "SUCCEEDED");
  assert.equal(completedJob.completedAt?.toISOString(), fixedNow.toISOString());
});

test("recordDeploymentJobTaskArn can attach a task ARN before running state", async () => {
  const repository = new FakeDeploymentJobRepository();
  const job = await createDeploymentJob(createJobInput(), repository);

  const taskArn = "arn:aws:ecs:ap-northeast-2:555980271919:task/cluster/task-id";
  const updatedJob = await recordDeploymentJobTaskArn(
    { jobId: job.id, ecsTaskArn: taskArn },
    repository
  );

  assert.equal(updatedJob.status, "QUEUED");
  assert.equal(updatedJob.ecsTaskArn, taskArn);
});

test("failDeploymentJob records a masked error summary and terminal timestamp", async () => {
  const repository = new FakeDeploymentJobRepository();
  const job = await createDeploymentJob(createJobInput(), repository);

  const failedJob = await failDeploymentJob(
    {
      jobId: job.id,
      errorSummary:
        "Terraform failed with DATABASE_URL=postgres://user:pass@example.internal/db and auth_token_secret=super-secret"
    },
    repository
  );

  assert.equal(failedJob.status, "FAILED");
  assert.equal(failedJob.failedAt?.toISOString(), fixedNow.toISOString());
  assert.match(failedJob.errorSummary ?? "", /\[REDACTED\]/);
  assert.doesNotMatch(failedJob.errorSummary ?? "", /super-secret|pass@example/);
});

test("cancelDeploymentJob records optional masked cancellation summary", async () => {
  const repository = new FakeDeploymentJobRepository();
  const job = await createDeploymentJob(createJobInput(), repository);

  const cancelledJob = await cancelDeploymentJob(
    {
      jobId: job.id,
      errorSummary: "cancelled while token=secret-value was present"
    },
    repository
  );

  assert.equal(cancelledJob.status, "CANCELLED");
  assert.equal(cancelledJob.cancelledAt?.toISOString(), fixedNow.toISOString());
  assert.equal(cancelledJob.errorSummary, "cancelled while [REDACTED] was present");
});
