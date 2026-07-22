import type {
  DeploymentFailureStage,
  DeploymentLog,
  DeploymentPlanSummary,
  DeploymentProgressSnapshot,
  DeploymentStage,
  DeploymentStatus
} from "@sketchcatch/types";

type ProgressDeployment = {
  readonly id: string;
  readonly activeStage: DeploymentStage | null;
  readonly failureStage: DeploymentFailureStage | null;
  readonly planSummary: DeploymentPlanSummary | null;
  readonly startedAt: string | null;
  readonly status: DeploymentStatus;
  readonly updatedAt: string;
};

type ProgressLog = Pick<DeploymentLog, "createdAt" | "message" | "stage">;

const RESOURCE_COMPLETION_PATTERN =
  /^\s*(\S+):\s+(?:Creation|Modifications|Destruction) complete\b/i;

export function createDeploymentProgressSnapshot(input: {
  readonly deployment: ProgressDeployment;
  readonly logs: readonly ProgressLog[];
}): DeploymentProgressSnapshot {
  const { deployment } = input;
  const base = {
    deploymentId: deployment.id,
    status: deployment.status,
    activeStage: deployment.activeStage,
    failureStage: deployment.failureStage,
    updatedAt: deployment.updatedAt
  };

  if (deployment.status === "SUCCESS" || deployment.status === "DESTROYED") {
    return {
      ...base,
      measurement: { kind: "complete", percent: 100 }
    };
  }

  if (
    deployment.status !== "RUNNING" ||
    (deployment.activeStage !== "apply" && deployment.activeStage !== "destroy") ||
    !deployment.planSummary ||
    !deployment.startedAt
  ) {
    return {
      ...base,
      measurement: { kind: "indeterminate" }
    };
  }

  const totalUnits =
    deployment.planSummary.createCount +
    deployment.planSummary.updateCount +
    deployment.planSummary.deleteCount +
    deployment.planSummary.replaceCount;

  if (totalUnits <= 0) {
    return {
      ...base,
      measurement: { kind: "indeterminate" }
    };
  }

  const completedAddresses = new Set<string>();
  const startedAtMs = Date.parse(deployment.startedAt);

  for (const log of input.logs) {
    if (log.stage !== deployment.activeStage) continue;
    if (!Number.isFinite(startedAtMs) || Date.parse(log.createdAt) < startedAtMs) continue;
    const match = RESOURCE_COMPLETION_PATTERN.exec(log.message);

    if (match?.[1]) completedAddresses.add(match[1]);
  }

  const completedUnits = Math.min(totalUnits, completedAddresses.size);
  const percent = Math.min(99, Math.floor((completedUnits / totalUnits) * 100));

  return {
    ...base,
    measurement: {
      kind: "resource_count",
      completedUnits,
      totalUnits,
      percent
    }
  };
}
