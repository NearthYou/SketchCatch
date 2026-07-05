import type {
  CheckFinding,
  DeploymentPlanSummary,
  DeploymentPlanWarning,
  DeploymentSafetyGateResult
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
): DeploymentSafetyGateResult {
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

  const summary: DeploymentPlanSummary = {
    ...input.planSummary,
    blocked: false,
    warnings
  };

  return {
    summary,
    block: {
      isBlocked: false,
      blockedBy: null,
      blockedReason: null
    },
    requiredAcknowledgementWarningIds: warnings
      .filter((warning) => warning.requiresAcknowledgement && !warning.blocksApproval)
      .map((warning) => warning.id)
  };
}
