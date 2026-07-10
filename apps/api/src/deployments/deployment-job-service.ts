import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DeploymentFailureStage, DeploymentStatus } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { deploymentJobs, touchUpdatedAt } from "../db/schema.js";
import { maskDeploymentMessage } from "./log-masking.js";
import type { ProjectAccessContext } from "./deployment-service.js";

export type DeploymentJobRecord = typeof deploymentJobs.$inferSelect;
export type DeploymentJobOperation = DeploymentJobRecord["operation"];
export type DeploymentJobStatus = DeploymentJobRecord["status"];

export type CreateDeploymentJobInput = {
  deploymentId: string;
  operation: DeploymentJobOperation;
  accessContext: ProjectAccessContext;
  startedFromStatus: DeploymentStatus;
  startedFromFailureStage?: DeploymentFailureStage | null;
};

export type DeploymentJobStateTransitionInput = {
  jobId: string;
};

export type MarkDeploymentJobRunningInput = DeploymentJobStateTransitionInput & {
  ecsTaskArn?: string | null;
};

export type FinishDeploymentJobInput = DeploymentJobStateTransitionInput & {
  errorSummary?: string | null;
};

export type DeploymentJobRepository = {
  createDeploymentJob(
    input: CreateDeploymentJobInput & {
      id: string;
    }
  ): Promise<DeploymentJobRecord>;
  findActiveDeploymentJob(deploymentId: string): Promise<DeploymentJobRecord | undefined>;
  listActiveDeploymentJobs(): Promise<DeploymentJobRecord[]>;
  findDeploymentJobById(jobId: string): Promise<DeploymentJobRecord | undefined>;
  markDeploymentJobDispatching(jobId: string): Promise<DeploymentJobRecord | undefined>;
  markDeploymentJobRunning(
    jobId: string,
    input: {
      ecsTaskArn?: string | null;
    }
  ): Promise<DeploymentJobRecord | undefined>;
  recordDeploymentJobTaskArn(
    jobId: string,
    input: {
      ecsTaskArn: string;
    }
  ): Promise<DeploymentJobRecord | undefined>;
  completeDeploymentJob(jobId: string): Promise<DeploymentJobRecord | undefined>;
  failDeploymentJob(
    jobId: string,
    input: {
      errorSummary: string;
    }
  ): Promise<DeploymentJobRecord | undefined>;
  cancelDeploymentJob(
    jobId: string,
    input: {
      errorSummary?: string | null;
    }
  ): Promise<DeploymentJobRecord | undefined>;
};

export class DeploymentJobConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentJobConflictError";
  }
}

export class DeploymentJobNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentJobNotFoundError";
  }
}

const activeDeploymentJobStatuses = ["QUEUED", "DISPATCHING", "RUNNING"] as const;

export async function createDeploymentJob(
  input: CreateDeploymentJobInput,
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  const activeJob = await repository.findActiveDeploymentJob(input.deploymentId);

  if (activeJob) {
    throw new DeploymentJobConflictError("Deployment already has an active execution job");
  }

  try {
    return await repository.createDeploymentJob({
      ...input,
      id: randomUUID()
    });
  } catch (error) {
    if (isDeploymentJobActiveUniqueViolation(error)) {
      throw new DeploymentJobConflictError("Deployment already has an active execution job");
    }

    throw error;
  }
}

export async function markDeploymentJobDispatching(
  input: DeploymentJobStateTransitionInput,
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  return requireUpdatedJob(
    repository.markDeploymentJobDispatching(input.jobId),
    "Deployment job could not be marked dispatching"
  );
}

export async function markDeploymentJobRunning(
  input: MarkDeploymentJobRunningInput,
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  return requireUpdatedJob(
    repository.markDeploymentJobRunning(input.jobId, { ecsTaskArn: input.ecsTaskArn ?? null }),
    "Deployment job could not be marked running"
  );
}

export async function recordDeploymentJobTaskArn(
  input: {
    jobId: string;
    ecsTaskArn: string;
  },
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  return requireUpdatedJob(
    repository.recordDeploymentJobTaskArn(input.jobId, { ecsTaskArn: input.ecsTaskArn }),
    "Deployment job task ARN could not be recorded"
  );
}

export async function completeDeploymentJob(
  input: DeploymentJobStateTransitionInput,
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  return requireUpdatedJob(
    repository.completeDeploymentJob(input.jobId),
    "Deployment job could not be completed"
  );
}

export async function failDeploymentJob(
  input: FinishDeploymentJobInput & {
    errorSummary: string;
  },
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  return requireUpdatedJob(
    repository.failDeploymentJob(input.jobId, {
      errorSummary: maskDeploymentMessage(input.errorSummary)
    }),
    "Deployment job could not be failed"
  );
}

export async function cancelDeploymentJob(
  input: FinishDeploymentJobInput,
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  return requireUpdatedJob(
    repository.cancelDeploymentJob(input.jobId, {
      errorSummary: input.errorSummary ? maskDeploymentMessage(input.errorSummary) : null
    }),
    "Deployment job could not be cancelled"
  );
}

export function createPostgresDeploymentJobRepository(db: Database): DeploymentJobRepository {
  return {
    async createDeploymentJob(input) {
      const [job] = await db
        .insert(deploymentJobs)
        .values({
          id: input.id,
          deploymentId: input.deploymentId,
          operation: input.operation,
          requestedByUserId: input.accessContext.userId,
          accessContext: input.accessContext,
          startedFromStatus: input.startedFromStatus,
          startedFromFailureStage: input.startedFromFailureStage ?? null
        })
        .returning();

      if (!job) {
        throw new Error("Deployment job insert returned no row");
      }

      return job;
    },

    async findActiveDeploymentJob(deploymentId) {
      const [job] = await db
        .select()
        .from(deploymentJobs)
        .where(
          and(
            eq(deploymentJobs.deploymentId, deploymentId),
            inArray(deploymentJobs.status, activeDeploymentJobStatuses)
          )
        )
        .limit(1);

      return job;
    },

    async listActiveDeploymentJobs() {
      return db
        .select()
        .from(deploymentJobs)
        .where(inArray(deploymentJobs.status, activeDeploymentJobStatuses));
    },

    async findDeploymentJobById(jobId) {
      const [job] = await db.select().from(deploymentJobs).where(eq(deploymentJobs.id, jobId));
      return job;
    },

    async markDeploymentJobDispatching(jobId) {
      const [job] = await db
        .update(deploymentJobs)
        .set({
          status: "DISPATCHING",
          ...touchUpdatedAt
        })
        .where(and(eq(deploymentJobs.id, jobId), eq(deploymentJobs.status, "QUEUED")))
        .returning();

      return job;
    },

    async markDeploymentJobRunning(jobId, input) {
      const [job] = await db
        .update(deploymentJobs)
        .set({
          status: "RUNNING",
          ecsTaskArn: input.ecsTaskArn ?? null,
          startedAt: sql`coalesce(${deploymentJobs.startedAt}, now())`,
          ...touchUpdatedAt
        })
        .where(
          and(
            eq(deploymentJobs.id, jobId),
            inArray(deploymentJobs.status, ["QUEUED", "DISPATCHING"])
          )
        )
        .returning();

      return job;
    },

    async recordDeploymentJobTaskArn(jobId, input) {
      const [job] = await db
        .update(deploymentJobs)
        .set({
          ecsTaskArn: input.ecsTaskArn,
          ...touchUpdatedAt
        })
        .where(
          and(
            eq(deploymentJobs.id, jobId),
            inArray(deploymentJobs.status, activeDeploymentJobStatuses)
          )
        )
        .returning();

      return job;
    },

    async completeDeploymentJob(jobId) {
      const [job] = await db
        .update(deploymentJobs)
        .set({
          status: "SUCCEEDED",
          completedAt: sql`now()`,
          ...touchUpdatedAt
        })
        .where(
          and(
            eq(deploymentJobs.id, jobId),
            inArray(deploymentJobs.status, activeDeploymentJobStatuses)
          )
        )
        .returning();

      return job;
    },

    async failDeploymentJob(jobId, input) {
      const [job] = await db
        .update(deploymentJobs)
        .set({
          status: "FAILED",
          errorSummary: input.errorSummary,
          failedAt: sql`now()`,
          ...touchUpdatedAt
        })
        .where(
          and(
            eq(deploymentJobs.id, jobId),
            inArray(deploymentJobs.status, activeDeploymentJobStatuses)
          )
        )
        .returning();

      return job;
    },

    async cancelDeploymentJob(jobId, input) {
      const [job] = await db
        .update(deploymentJobs)
        .set({
          status: "CANCELLED",
          errorSummary: input.errorSummary ?? null,
          cancelledAt: sql`now()`,
          ...touchUpdatedAt
        })
        .where(
          and(
            eq(deploymentJobs.id, jobId),
            inArray(deploymentJobs.status, activeDeploymentJobStatuses)
          )
        )
        .returning();

      return job;
    }
  };
}

async function requireUpdatedJob(
  jobPromise: Promise<DeploymentJobRecord | undefined>,
  message: string
): Promise<DeploymentJobRecord> {
  const job = await jobPromise;

  if (!job) {
    throw new DeploymentJobConflictError(message);
  }

  return job;
}

function isDeploymentJobActiveUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") {
      return false;
    }

    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };

    if (
      candidate.code === "23505" &&
      candidate.constraint === "deployment_jobs_deployment_active_unique"
    ) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}
