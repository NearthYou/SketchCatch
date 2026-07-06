import type {
  CheckFinding,
  DeploymentPlanSummary,
  DeploymentPlanWarning
} from "@sketchcatch/types";
import {
  createPreDeploymentCheckWarning,
  createTerraformPlanWarnings,
  deduplicateDeploymentPlanWarnings
} from "./deployment-warning-factory.js";

export type DeploymentSafetyGateOperation = "apply" | "destroy";

export type EvaluateDeploymentSafetyGateInput = {
  operation: DeploymentSafetyGateOperation;
  planSummary: DeploymentPlanSummary;
  findings?: readonly CheckFinding[];
  unsupportedResourceTypes?: readonly string[];
  warnings?: readonly DeploymentPlanWarning[];
};

export function evaluateDeploymentSafetyGate(
  input: EvaluateDeploymentSafetyGateInput
): DeploymentPlanSummary {
  const warnings = deduplicateDeploymentPlanWarnings([
    ...input.planSummary.warnings,
    ...(input.findings ?? []).map(createPreDeploymentCheckWarning),
    ...createTerraformPlanWarnings({
      operation: input.operation,
      summary: input.planSummary,
      unsupportedResourceTypes: input.unsupportedResourceTypes ?? []
    }),
    ...(input.warnings ?? [])
  ]);

  return {
    ...input.planSummary,
    blocked: false,
    warnings
  };
}
