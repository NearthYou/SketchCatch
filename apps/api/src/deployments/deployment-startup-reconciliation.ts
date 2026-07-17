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

export type DeploymentStartupReconciliationLogger = {
  warn: (messageOrObject: unknown, message?: string) => void;
};

export type DeploymentStartupReconciliationResult = {
  activeDeploymentCount: number;
  deferredInspectionCount: number;
  failedJobCount: number;
  recoveryRetryCount: number;
  recoveredDeploymentCount: number;
};

export type InterruptedApplicationReleaseRecovery = (input: {
  excludeDeploymentIds: readonly string[];
  onlyDeploymentIds?: readonly string[];
  stopActiveCodeBuild?: boolean;
}) => Promise<{
  recoveredDeploymentIds: string[];
  protectedDeploymentIds?: string[];
  retryDeploymentIds: string[];
}>;

export async function reconcileDeploymentStartup(
  input: {
    workerMode: DeploymentWorkerMode;
    now: Date;
    dispatchGracePeriodMs: number;
  },
  jobs: DeploymentStartupJobStore,
  deployments: InterruptedDeploymentRecoveryStore,
  inspectTask: InspectDeploymentWorkerTask,
  logger?: DeploymentStartupReconciliationLogger,
  recoverApplicationReleases?: InterruptedApplicationReleaseRecovery
): Promise<DeploymentStartupReconciliationResult> {
  if (input.workerMode === "in_process") {
    const applicationRecovery = recoverApplicationReleases
      ? await recoverApplicationReleases({ excludeDeploymentIds: [] })
      : { recoveredDeploymentIds: [], retryDeploymentIds: [] };
    const protectedIds = [
      ...applicationRecovery.recoveredDeploymentIds,
      ...(applicationRecovery.protectedDeploymentIds ?? []),
      ...applicationRecovery.retryDeploymentIds
    ];
    const recoveredDeployments = await deployments.recoverInterruptedDeployments(
      protectedIds.length > 0 ? { excludeDeploymentIds: protectedIds } : undefined
    );

    return createResult({
      deferredInspectionCount: applicationRecovery.retryDeploymentIds.length,
      recoveryRetryCount: applicationRecovery.retryDeploymentIds.length,
      recoveredDeploymentCount:
        applicationRecovery.recoveredDeploymentIds.length + recoveredDeployments.length
    });
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
    }

    let inspection: InspectDeploymentWorkerResult;

    try {
      inspection = await inspectTask(job);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const errorSummary = maskDeploymentMessage(
        error instanceof Error ? error.message : "Unknown ECS task inspection error"
      );
      logger?.warn(
        { errorName, errorSummary, jobId: job.id, ecsTaskArn: job.ecsTaskArn },
        "Failed to inspect ECS worker task during startup reconciliation"
      );
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
        job.ecsTaskArn
          ? `ECS worker task is ${inspection.state}; lastStatus=${inspection.lastStatus ?? "unknown"}`
          : createMissingTaskSummary(job, input.dispatchGracePeriodMs)
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

  const applicationRecovery = recoverApplicationReleases
    ? await recoverApplicationReleases({
        excludeDeploymentIds: [...protectedDeploymentIds]
      })
    : { recoveredDeploymentIds: [], retryDeploymentIds: [] };
  for (const deploymentId of [
    ...applicationRecovery.recoveredDeploymentIds,
    ...(applicationRecovery.protectedDeploymentIds ?? []),
    ...applicationRecovery.retryDeploymentIds
  ]) {
    protectedDeploymentIds.add(deploymentId);
  }
  deferredInspectionCount += applicationRecovery.retryDeploymentIds.length;
  recoveryRetryCount += applicationRecovery.retryDeploymentIds.length;

  const recoveredDeployments = await deployments.recoverInterruptedDeployments({
    excludeDeploymentIds: [...protectedDeploymentIds]
  });

  return {
    activeDeploymentCount,
    deferredInspectionCount,
    failedJobCount,
    recoveryRetryCount,
    recoveredDeploymentCount:
      applicationRecovery.recoveredDeploymentIds.length + recoveredDeployments.length
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
