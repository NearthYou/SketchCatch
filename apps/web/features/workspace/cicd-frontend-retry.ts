import type { GitCicdPipelineRun } from "@sketchcatch/types";
import {
  normalizeLiveObservationOutputUrl,
  type LiveObservationSelection
} from "./live-observation";

const frontendFailureStages = new Set([
  "frontend_upload",
  "frontend_activation",
  "cloudfront_invalidation",
  "public_health"
]);

export function canRetryGitCicdFrontend(run: GitCicdPipelineRun | null): boolean {
  return Boolean(
    run?.status === "failed" &&
      run.release?.status === "partially_failed" &&
      run.release.failureStage &&
      frontendFailureStages.has(run.release.failureStage)
  );
}

export function canOpenGitCicdLiveObservation(run: GitCicdPipelineRun | null): boolean {
  return getGitCicdLiveObservationSelection(run) !== null;
}

export function getGitCicdLiveObservationSelection(
  run: GitCicdPipelineRun | null
): LiveObservationSelection | null {
  if (
    !run?.infrastructureDeploymentId ||
    !run.release?.outputUrl ||
    !["succeeded", "partially_failed", "partially_cancelled"].includes(run.release.status)
  ) {
    return null;
  }
  const outputUrl = normalizeLiveObservationOutputUrl(run.release.outputUrl);
  return outputUrl
    ? {
        runId: run.id,
        deploymentId: run.infrastructureDeploymentId,
        outputUrl
      }
    : null;
}
