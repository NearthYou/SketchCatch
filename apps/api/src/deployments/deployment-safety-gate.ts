import type {
  CheckFinding,
  DeploymentBlockedBy,
  DeploymentPlanSummary,
  DeploymentPlanWarning,
  DeploymentSafetyGateResult
} from "@sketchcatch/types";
import {
  createDestructiveChangeWarnings,
  createPreDeploymentCheckWarning,
  createUnsupportedResourceWarning,
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
    ...(input.unsupportedResourceTypes ?? []).map((resourceType) =>
      createUnsupportedResourceWarning(input.operation, resourceType)
    ),
    ...createDestructiveChangeWarnings(input.operation, input.planSummary),
    ...(input.warnings ?? [])
  ]);

  const summary: DeploymentPlanSummary = {
    ...input.planSummary,
    blocked: true,
    warnings
  };

  const blockingWarnings = warnings.filter((warning) => warning.blocksApproval);

  return {
    summary,
    block: {
      isBlocked: true,
      blockedBy: resolveBlockedBy(blockingWarnings),
      blockedReason: createBlockedReason(input.operation, blockingWarnings)
    },
    requiredAcknowledgementWarningIds: warnings
      .filter((warning) => warning.requiresAcknowledgement && !warning.blocksApproval)
      .map((warning) => warning.id)
  };
}

function resolveBlockedBy(blockingWarnings: readonly DeploymentPlanWarning[]): DeploymentBlockedBy {
  if (blockingWarnings.some((warning) => warning.source === "cost_risk")) {
    return "cost_analysis";
  }

  if (blockingWarnings.length > 0) {
    return "risk_analysis";
  }

  return "missing_approval";
}

function createBlockedReason(
  operation: DeploymentSafetyGateOperation,
  blockingWarnings: readonly DeploymentPlanWarning[]
): string {
  if (blockingWarnings.length === 0) {
    return `Terraform ${operation} plan requires user approval before ${operation}`;
  }

  const blockingCodes = [...new Set(blockingWarnings.map((warning) => warning.code))].join(", ");
  return `Deployment Safety Gate blocked ${operation} because of ${blockingCodes}`;
}
