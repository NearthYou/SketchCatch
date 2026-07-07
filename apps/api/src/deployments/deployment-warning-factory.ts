import type {
  CheckFinding,
  DeploymentPlanSummary,
  DeploymentPlanWarning,
  DeploymentPlanWarningCode
} from "@sketchcatch/types";
import type { DeploymentSafetyGateOperation } from "./deployment-safety-gate.js";

export function createPreDeploymentCheckWarning(finding: CheckFinding): DeploymentPlanWarning {
  const warning: DeploymentPlanWarning = {
    id: createStableWarningId("pre_deployment_check", finding.id),
    level: finding.severity,
    category: finding.category,
    source: "pre_deployment_check",
    code: toPreDeploymentWarningCode(finding),
    message: `${finding.title}: ${finding.recommendation}`,
    relatedFindingId: finding.id,
    requiresAcknowledgement: finding.severity !== "high",
    blocksApproval: finding.severity === "high"
  };

  if (finding.resourceId) {
    warning.relatedResourceId = finding.resourceId;
  }

  if (finding.sourceLocation) {
    warning.sourceLocation = finding.sourceLocation;
  }

  return warning;
}

export function createUnsupportedResourceWarning(
  operation: DeploymentSafetyGateOperation,
  resourceType: string
): DeploymentPlanWarning {
  return {
    id: createStableWarningId("terraform_plan", "UNSUPPORTED_RESOURCE", operation, resourceType),
    level: "high",
    category: "configuration",
    source: "terraform_plan",
    code: "UNSUPPORTED_RESOURCE",
    message: `MVP live ${operation} does not support Terraform resource type ${resourceType}`,
    requiresAcknowledgement: false,
    blocksApproval: true
  };
}

export function createTerraformPlanWarnings(input: {
  operation: DeploymentSafetyGateOperation;
  summary: DeploymentPlanSummary;
  unsupportedResourceTypes?: readonly string[];
}): DeploymentPlanWarning[] {
  return [
    ...(input.unsupportedResourceTypes ?? []).map((resourceType) =>
      createUnsupportedResourceWarning(input.operation, resourceType)
    ),
    ...createDestructiveChangeWarnings(input.operation, input.summary)
  ];
}

export function createDestructiveChangeWarnings(
  operation: DeploymentSafetyGateOperation,
  summary: DeploymentPlanSummary
): DeploymentPlanWarning[] {
  if (operation !== "apply" || (summary.deleteCount === 0 && summary.replaceCount === 0)) {
    return [];
  }

  return [
    {
      id: createStableWarningId("terraform_plan", "DESTRUCTIVE_CHANGE", operation),
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

export function createUnknownTerraformActionWarning(
  resourceAddress: unknown,
  actionsDescription: string
): DeploymentPlanWarning {
  const normalizedResourceAddress =
    typeof resourceAddress === "string" && resourceAddress.trim().length > 0
      ? resourceAddress
      : "unknown";
  const message =
    normalizedResourceAddress !== "unknown"
      ? `Unsupported Terraform plan action for ${normalizedResourceAddress}: ${actionsDescription}`
      : `Unsupported Terraform plan action: ${actionsDescription}`;

  return {
    id: createStableWarningId(
      "terraform_plan",
      "UNKNOWN_TERRAFORM_ACTION",
      normalizedResourceAddress
    ),
    level: "medium",
    category: "configuration",
    source: "terraform_plan",
    code: "UNKNOWN_TERRAFORM_ACTION",
    message,
    requiresAcknowledgement: true,
    blocksApproval: false
  };
}

export function createDestroyNoOpWarning(): DeploymentPlanWarning {
  return {
    id: createStableWarningId("terraform_plan", "UNKNOWN_TERRAFORM_ACTION", "destroy", "no-op"),
    level: "medium",
    category: "configuration",
    source: "terraform_plan",
    code: "UNKNOWN_TERRAFORM_ACTION",
    message: "Terraform destroy plan has no resources to delete",
    requiresAcknowledgement: true,
    blocksApproval: false
  };
}

export function deduplicateDeploymentPlanWarnings(
  warnings: readonly DeploymentPlanWarning[]
): DeploymentPlanWarning[] {
  const deduplicated = new Map<string, DeploymentPlanWarning>();

  for (const warning of warnings) {
    deduplicated.set(warning.id, warning);
  }

  return [...deduplicated.values()];
}

function toPreDeploymentWarningCode(finding: CheckFinding): DeploymentPlanWarningCode {
  const normalizedId = finding.id.toLowerCase();
  const normalizedTitle = finding.title.toLowerCase();
  const normalizedDescription = finding.description.toLowerCase();
  const normalizedRecommendation = finding.recommendation.toLowerCase();
  const normalizedText = [
    normalizedId,
    normalizedTitle,
    normalizedDescription,
    normalizedRecommendation,
    finding.sourceLocation?.resourceAddress?.toLowerCase() ?? ""
  ].join(" ");

  if (finding.category === "permission" || normalizedText.includes("iam")) {
    return "IAM_WILDCARD";
  }

  if (normalizedText.includes("rds") || normalizedText.includes("database")) {
    return "PUBLIC_RDS";
  }

  if (normalizedText.includes("s3") || normalizedText.includes("bucket")) {
    return "PUBLIC_S3";
  }

  if (
    normalizedText.includes("ssh") ||
    normalizedText.includes("rdp") ||
    normalizedText.includes("0.0.0.0/0") ||
    normalizedText.includes("::/0") ||
    normalizedText.includes("security group") ||
    normalizedText.includes("security_group")
  ) {
    return "PUBLIC_SSH";
  }

  if (normalizedId.startsWith("trivy:")) {
    return "TRIVY_MISCONFIGURATION";
  }

  return "PUBLIC_SSH";
}

function createStableWarningId(...parts: readonly string[]): string {
  return parts
    .map((part) => part.trim().replace(/\s+/g, "_"))
    .filter((part) => part.length > 0)
    .join(":");
}
