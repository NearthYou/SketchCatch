import { z } from "zod";
import type {
  DeploymentFailureStage,
  DeploymentStatus
} from "@sketchcatch/types";
import {
  runDeploymentApply,
  type RunDeploymentApplyInput,
  type RunDeploymentApplyResult
} from "./deployment-apply-service.js";
import {
  runDeploymentDestroyPlan,
  type RunDeploymentDestroyPlanInput,
  type RunDeploymentDestroyPlanResult
} from "./deployment-destroy-plan-service.js";
import {
  runDeploymentDestroy,
  type RunDeploymentDestroyInput,
  type RunDeploymentDestroyResult
} from "./deployment-destroy-service.js";
import {
  runDeploymentInit,
  type RunDeploymentInitInput,
  type RunDeploymentInitResult
} from "./deployment-init-service.js";
import {
  cancelDeploymentJob,
  completeDeploymentJob,
  DeploymentJobConflictError,
  DeploymentJobNotFoundError,
  failDeploymentJob,
  type DeploymentJobOperation,
  type DeploymentJobRecord,
  type DeploymentJobRepository
} from "./deployment-job-service.js";
import {
  runDeploymentPlan,
  type RunDeploymentPlanInput,
  type RunDeploymentPlanResult
} from "./deployment-plan-service.js";
import type {
  DeploymentRecord,
  DeploymentRepository,
  ProjectAccessContext
} from "./deployment-service.js";
import { maskDeploymentMessage } from "./log-masking.js";

const workerAccessContextSchema = z
  .object({
    kind: z.literal("user"),
    userId: z.uuid()
  })
  .strict();

export type DeploymentWorkerOperationInput = {
  operation: DeploymentJobOperation;
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus: DeploymentStatus;
  startedFromFailureStage: DeploymentFailureStage | null;
};

export type DeploymentWorkerOperationResult = {
  status: DeploymentStatus;
  errorSummary: string | null;
};

export type RunDeploymentWorkerOperation = (
  input: DeploymentWorkerOperationInput
) => Promise<DeploymentWorkerOperationResult>;

type DeploymentWorkerServices = {
  init(
    input: RunDeploymentInitInput,
    repository: DeploymentRepository
  ): Promise<RunDeploymentInitResult>;
  plan(
    input: RunDeploymentPlanInput,
    repository: DeploymentRepository
  ): Promise<RunDeploymentPlanResult>;
  apply(
    input: RunDeploymentApplyInput,
    repository: DeploymentRepository
  ): Promise<RunDeploymentApplyResult>;
  destroyPlan(
    input: RunDeploymentDestroyPlanInput,
    repository: DeploymentRepository
  ): Promise<RunDeploymentDestroyPlanResult>;
  destroy(
    input: RunDeploymentDestroyInput,
    repository: DeploymentRepository
  ): Promise<RunDeploymentDestroyResult>;
};

const defaultDeploymentWorkerServices: DeploymentWorkerServices = {
  init: runDeploymentInit,
  plan: runDeploymentPlan,
  apply: runDeploymentApply,
  destroyPlan: runDeploymentDestroyPlan,
  destroy: runDeploymentDestroy
};

export function requireDeploymentWorkerJobId(env: NodeJS.ProcessEnv): string {
  const value = env.SKETCHCATCH_DEPLOYMENT_JOB_ID?.trim();

  if (!value) {
    throw new Error("SKETCHCATCH_DEPLOYMENT_JOB_ID is required");
  }

  const result = z.uuid().safeParse(value);

  if (!result.success) {
    throw new Error("SKETCHCATCH_DEPLOYMENT_JOB_ID must be a UUID");
  }

  return result.data;
}

export async function runDeploymentWorkerJob(
  input: { jobId: string },
  jobRepository: DeploymentJobRepository,
  runOperation: RunDeploymentWorkerOperation
): Promise<DeploymentJobRecord> {
  const job = await jobRepository.findDeploymentJobById(input.jobId);

  if (!job) {
    throw new DeploymentJobNotFoundError("Deployment worker job not found");
  }

  if (job.status !== "RUNNING") {
    throw new DeploymentJobConflictError("Deployment worker job must be RUNNING");
  }

  let operationInput: DeploymentWorkerOperationInput;

  try {
    operationInput = createOperationInput(job);
  } catch (error) {
    return failRunningJob(job, error, jobRepository);
  }

  let operationResult: DeploymentWorkerOperationResult;

  try {
    operationResult = await runOperation(operationInput);
  } catch (error) {
    return failRunningJob(job, error, jobRepository);
  }

  return recordOperationResult(job, operationResult, jobRepository);
}

export function createDeploymentWorkerOperationRunner(
  deploymentRepository: DeploymentRepository,
  services: DeploymentWorkerServices = defaultDeploymentWorkerServices
): RunDeploymentWorkerOperation {
  return async (input) => {
    const commonInput = {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      startedFromStatus: input.startedFromStatus
    };

    let result: { deployment: DeploymentRecord };

    switch (input.operation) {
      case "init":
        result = await services.init(commonInput, deploymentRepository);
        break;
      case "plan":
        result = await services.plan(commonInput, deploymentRepository);
        break;
      case "apply":
        result = await services.apply(commonInput, deploymentRepository);
        break;
      case "destroy_plan":
        result = await services.destroyPlan(
          {
            ...commonInput,
            startedFromFailureStage: input.startedFromFailureStage
          },
          deploymentRepository
        );
        break;
      case "destroy":
        result = await services.destroy(
          {
            ...commonInput,
            startedFromFailureStage: input.startedFromFailureStage
          },
          deploymentRepository
        );
        break;
    }

    return {
      status: result.deployment.status,
      errorSummary: result.deployment.errorSummary
    };
  };
}

function createOperationInput(job: DeploymentJobRecord): DeploymentWorkerOperationInput {
  const accessContextResult = workerAccessContextSchema.safeParse(job.accessContext);

  if (!accessContextResult.success) {
    throw new DeploymentJobConflictError("Deployment worker access context is invalid");
  }

  if (accessContextResult.data.userId !== job.requestedByUserId) {
    throw new DeploymentJobConflictError(
      "Deployment worker access context does not match the requesting user"
    );
  }

  return {
    operation: job.operation,
    deploymentId: job.deploymentId,
    accessContext: accessContextResult.data,
    startedFromStatus: job.startedFromStatus,
    startedFromFailureStage: job.startedFromFailureStage
  };
}

async function recordOperationResult(
  job: DeploymentJobRecord,
  result: DeploymentWorkerOperationResult,
  repository: DeploymentJobRepository
): Promise<DeploymentJobRecord> {
  if (result.status === "CANCELLED") {
    return cancelDeploymentJob(
      {
        jobId: job.id,
        errorSummary: result.errorSummary
      },
      repository
    );
  }

  if (result.status === "FAILED") {
    const errorSummary = result.errorSummary ?? `Deployment worker operation ${job.operation} failed`;
    await failDeploymentJob({ jobId: job.id, errorSummary }, repository);
    throw new Error(`Deployment worker operation ${job.operation} failed`);
  }

  if (result.status === "RUNNING") {
    const errorSummary = `Deployment worker operation ${job.operation} returned non-terminal status RUNNING`;
    await failDeploymentJob({ jobId: job.id, errorSummary }, repository);
    throw new Error(errorSummary);
  }

  return completeDeploymentJob({ jobId: job.id }, repository);
}

async function failRunningJob(
  job: DeploymentJobRecord,
  error: unknown,
  repository: DeploymentJobRepository
): Promise<never> {
  const detail = maskDeploymentMessage(
    error instanceof Error ? error.message : "Unknown deployment worker failure"
  );
  const errorSummary = `Deployment worker operation ${job.operation} failed: ${detail}`;

  await failDeploymentJob({ jobId: job.id, errorSummary }, repository);
  throw new Error(errorSummary);
}
