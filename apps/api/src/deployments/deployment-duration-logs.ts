import type { DeploymentStage } from "@sketchcatch/types";
import {
  appendDeploymentLogs,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";
import type { TerraformRunResult } from "./terraform-runner.js";

export async function appendTerraformDurationLog(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: DeploymentStage;
  label: string;
  result: TerraformRunResult;
  repository: DeploymentRepository;
}): Promise<number> {
  if (typeof input.result.durationMs !== "number") {
    return input.sequence;
  }

  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: [
        {
          sequence: input.sequence,
          stage: input.stage,
          level: "INFO",
          message: `[duration] ${input.label} completed in ${formatDuration(input.result.durationMs)}`,
          relatedResourceId: null
        }
      ]
    },
    input.repository
  );

  return input.sequence + 1;
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)}s`;
}
