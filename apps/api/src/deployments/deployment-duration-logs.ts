import { performance } from "node:perf_hooks";
import type { DeploymentStage } from "@sketchcatch/types";
import {
  appendDeploymentLogs,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";
import type { TerraformRunResult } from "./terraform-runner.js";

export type DeploymentDurationResult<T> = {
  result: T;
  durationMs: number;
};

export async function measureDeploymentDuration<T>(
  operation: () => Promise<T>
): Promise<DeploymentDurationResult<T>> {
  const startedAt = performance.now();
  const result = await operation();

  return {
    result,
    durationMs: performance.now() - startedAt
  };
}

export async function appendDeploymentDurationLog(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: DeploymentStage;
  label: string;
  durationMs: number;
  repository: DeploymentRepository;
}): Promise<number> {
  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: [
        {
          sequence: input.sequence,
          stage: input.stage,
          level: "INFO",
          message: `[duration] ${input.label} completed in ${formatDuration(input.durationMs)}`,
          relatedResourceId: null
        }
      ]
    },
    input.repository
  );

  return input.sequence + 1;
}

export async function runLoggedDeploymentOperation<T>(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: DeploymentStage;
  label: string;
  repository: DeploymentRepository;
  operation: () => Promise<T>;
}): Promise<DeploymentDurationResult<T> & { sequence: number }> {
  const { result, durationMs } = await measureDeploymentDuration(input.operation);
  const sequence = await appendDeploymentDurationLog({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    stage: input.stage,
    label: input.label,
    durationMs,
    repository: input.repository
  });

  return {
    result,
    durationMs,
    sequence
  };
}

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

  return appendDeploymentDurationLog({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    stage: input.stage,
    label: input.label,
    durationMs: input.result.durationMs,
    repository: input.repository
  });
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)}s`;
}
