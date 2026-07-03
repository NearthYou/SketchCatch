import type {
  CheckFinding,
  DeploymentBlockedBy,
  DeploymentPlanSummary,
  DeploymentPlanWarning,
  DeploymentPlanWarningCode,
  DeploymentSafetyGateResult
} from "@sketchcatch/types";

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
  const warnings = deduplicateWarnings([
    ...input.planSummary.warnings,
    ...(input.findings ?? []).map(createWarningFromFinding),
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

function createWarningFromFinding(finding: CheckFinding): DeploymentPlanWarning {
  const warning: DeploymentPlanWarning = {
    id: `finding:${finding.id}`,
    level: finding.severity,
    category: finding.category,
    source: "pre_deployment_check",
    code: toWarningCode(finding),
    message: `${finding.title}: ${finding.recommendation}`,
    relatedFindingId: finding.id,
    requiresAcknowledgement: finding.severity !== "high",
    blocksApproval: finding.severity === "high"
  };

  if (finding.resourceId) {
    warning.relatedResourceId = finding.resourceId;
  }

  return warning;
}

function createUnsupportedResourceWarning(
  operation: DeploymentSafetyGateOperation,
  resourceType: string
): DeploymentPlanWarning {
  return {
    id: `terraform_plan:UNSUPPORTED_RESOURCE:${operation}:${resourceType}`,
    level: "high",
    category: "configuration",
    source: "terraform_plan",
    code: "UNSUPPORTED_RESOURCE",
    message: `MVP live ${operation} does not support Terraform resource type ${resourceType}`,
    requiresAcknowledgement: false,
    blocksApproval: true
  };
}

function createDestructiveChangeWarnings(
  operation: DeploymentSafetyGateOperation,
  summary: DeploymentPlanSummary
): DeploymentPlanWarning[] {
  if (operation !== "apply" || (summary.deleteCount === 0 && summary.replaceCount === 0)) {
    return [];
  }

  return [
    {
      id: `terraform_plan:DESTRUCTIVE_CHANGE:${operation}`,
      level: "high",
      category: "configuration",
      source: "terraform_plan",
      code: "DESTRUCTIVE_CHANGE",
      message: "Terraform apply plan includes delete or replace changes",
      requiresAcknowledgement: false,
      blocksApproval: true
    }
  ];
}

function toWarningCode(finding: CheckFinding): DeploymentPlanWarningCode {
  const normalizedId = finding.id.toLowerCase();
  const normalizedTitle = finding.title.toLowerCase();

  if (finding.category === "permission" || normalizedId.includes("iam") || normalizedTitle.includes("iam")) {
    return "IAM_WILDCARD";
  }

  if (normalizedId.includes("rds") || normalizedTitle.includes("rds")) {
    return "PUBLIC_RDS";
  }

  if (normalizedId.includes("s3") || normalizedTitle.includes("s3")) {
    return "PUBLIC_S3";
  }

  return "PUBLIC_SSH";
}

function deduplicateWarnings(warnings: readonly DeploymentPlanWarning[]): DeploymentPlanWarning[] {
  const deduplicated = new Map<string, DeploymentPlanWarning>();

  for (const warning of warnings) {
    deduplicated.set(warning.id, warning);
  }

  return [...deduplicated.values()];
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
