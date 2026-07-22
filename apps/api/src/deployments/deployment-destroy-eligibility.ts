import type { DeploymentStatus } from "@sketchcatch/types";

export function isDeploymentDestroySourceStatus(status: DeploymentStatus): boolean {
  return status === "SUCCESS" || status === "FAILED";
}
