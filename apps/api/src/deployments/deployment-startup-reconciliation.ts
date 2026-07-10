import type { DeploymentWorkerMode } from "../config/env.js";
import type { DeploymentJobRecord, DeploymentJobRepository } from "./deployment-job-service.js";
import type { InspectDeploymentWorkerResult } from "./deployment-worker-dispatcher.js";
import type { DeploymentRecord, RecoverInterruptedDeploymentsInput } from "./deployment-service.js";
import { maskDeploymentMessage } from "./log-masking.js";

export type DeploymentStartupJobStore = Pick<
  DeploymentJobRepository,
  "listActiveDeploymentJobs" | "failDeploymentJob"
>;

export type InterruptedDeploymentRecoveryStore = {
  recoverInterruptedDeployments(
    input?: RecoverInterruptedDeploymentsInput
  ): Promise<DeploymentRecord[] | unknown[]>;
};

export type InspectDeploymentWorkerTask = (
  job: DeploymentJobRecord
) => Promise<InspectDeploymentWorkerResult>;

export type DeploymentStartupReconciliationResult = {
  activeDeploymentCount: number;
  deferredInspectionCount: number;
  failedJobCount: number;
  recoveryRetryCount: number;
  recoveredDeploymentCount: number;
};

export async function reconcileDeploymentStartup(
  input: {
    workerMode: DeploymentWorkerMode;
    now: Date;
    dispatchGracePeriodMs: number;
  },
  jobs: DeploymentStartupJobStore,
  deployments: InterruptedDeploymentRecoveryStore,
  inspectTask: InspectDeploymentWorkerTask
): Promise<DeploymentStartupReconciliationResult> {
  if (input.workerMode === "in_process") {
    const recoveredDeployments = await deployments.recoverInterruptedDeployments();

    return createResult({ recoveredDeploymentCount: recoveredDeployments.length });
  }

  const activeJobs = await jobs.listActiveDeploymentJobs();
  const protectedDeploymentIds = new Set<string>();
  let activeDeploymentCount = 0;
  let deferredInspectionCount = 0;
  let failedJobCount = 0;
  let recoveryRetryCount = 0;

  for (const job of activeJobs) {
    if (!job.ecsTaskArn) {
      if (shouldPreserveDispatchingJob(job, input)) {
        protectedDeploymentIds.add(job.deploymentId);
        recoveryRetryCount += 1;
        continue;
      }

      const failedJob = await jobs.failDeploymentJob(job.id, {
        errorSummary: createMissingTaskSummary(job, input.dispatchGracePeriodMs)
      });
      if (failedJob) {
        failedJobCount += 1;
      } else {
        protectedDeploymentIds.add(job.deploymentId);
        deferredInspectionCount += 1;
        recoveryRetryCount += 1;
      }
      continue;
    }

    let inspection: InspectDeploymentWorkerResult;

    try {
      inspection = await inspectTask(job);
    } catch {
      protectedDeploymentIds.add(job.deploymentId);
      deferredInspectionCount += 1;
      recoveryRetryCount += 1;
      continue;
    }

    if (inspection.state === "ACTIVE") {
      protectedDeploymentIds.add(job.deploymentId);
      activeDeploymentCount += 1;
      continue;
    }

    if (inspection.state === "MISSING" && isWithinGracePeriod(job, input)) {
      protectedDeploymentIds.add(job.deploymentId);
      deferredInspectionCount += 1;
      recoveryRetryCount += 1;
      continue;
    }

    const failedJob = await jobs.failDeploymentJob(job.id, {
      errorSummary: maskDeploymentMessage(
        `ECS worker task is ${inspection.state}; lastStatus=${inspection.lastStatus ?? "unknown"}`
      )
    });
    if (failedJob) {
      failedJobCount += 1;
    } else {
      protectedDeploymentIds.add(job.deploymentId);
      deferredInspectionCount += 1;
      recoveryRetryCount += 1;
    }
  }

  const recoveredDeployments = await deployments.recoverInterruptedDeployments({
    excludeDeploymentIds: [...protectedDeploymentIds]
  });

  return {
    activeDeploymentCount,
    deferredInspectionCount,
    failedJobCount,
    recoveryRetryCount,
    recoveredDeploymentCount: recoveredDeployments.length
  };
}

function shouldPreserveDispatchingJob(
  job: DeploymentJobRecord,
  input: { now: Date; dispatchGracePeriodMs: number }
): boolean {
  if (job.status === "RUNNING") {
    return false;
  }

  return isWithinGracePeriod(job, input);
}

function isWithinGracePeriod(
  job: DeploymentJobRecord,
  input: { now: Date; dispatchGracePeriodMs: number }
): boolean {
  return input.now.getTime() - job.updatedAt.getTime() <= input.dispatchGracePeriodMs;
}

function createMissingTaskSummary(job: DeploymentJobRecord, dispatchGracePeriodMs: number): string {
  if (job.status === "RUNNING") {
    return "ECS worker job is RUNNING without a task ARN";
  }

  return `ECS worker task did not start within ${Math.floor(dispatchGracePeriodMs / 1000)} seconds`;
}

function createResult(
  overrides: Partial<DeploymentStartupReconciliationResult> = {}
): DeploymentStartupReconciliationResult {
  return {
    activeDeploymentCount: 0,
    deferredInspectionCount: 0,
    failedJobCount: 0,
    recoveryRetryCount: 0,
    recoveredDeploymentCount: 0,
    ...overrides
  };
}
