import type { Deployment } from "@sketchcatch/types";

type DeploymentTiming = Pick<
  Deployment,
  "cancelledAt" | "completedAt" | "failedAt" | "startedAt" | "status" | "updatedAt"
>;

export function getDeploymentDurationMs(
  deployment: DeploymentTiming,
  nowMs = Date.now()
): number | null {
  if (!deployment.startedAt) {
    return null;
  }

  const startedMs = Date.parse(deployment.startedAt);
  const finishedAt =
    deployment.completedAt ??
    deployment.failedAt ??
    deployment.cancelledAt ??
    (deployment.status === "RUNNING" ? new Date(nowMs).toISOString() : deployment.updatedAt);
  const finishedMs = Date.parse(finishedAt);

  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) {
    return null;
  }

  return finishedMs - startedMs;
}

export function formatDeploymentDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "측정 불가";
  }

  const totalSeconds = Math.floor(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}분 ${seconds.toString().padStart(2, "0")}초`;
}

export function getDeploymentDurationLabel(
  deployment: DeploymentTiming,
  nowMs = Date.now()
): string {
  const durationMs = getDeploymentDurationMs(deployment, nowMs);

  return durationMs === null ? "측정 불가" : formatDeploymentDuration(durationMs);
}
