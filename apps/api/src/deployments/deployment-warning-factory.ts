import type {
  CheckFinding,
  DeploymentLiveProfile,
  DeploymentPlanSummary,
  DeploymentPlanWarning,
  DeploymentPlanWarningCode
} from "@sketchcatch/types";
import type { DeploymentSafetyGateOperation } from "./deployment-safety-gate.js";

type CreatePreDeploymentCheckWarningOptions = {
  liveProfile?: DeploymentLiveProfile | undefined;
};

const demoProfileAcknowledgementResources = new Set([
  "aws_autoscaling_group.api",
  "aws_autoscaling_policy.scale_out",
  "aws_cloudwatch_metric_alarm.scale_out",
  "aws_instance.api",
  "aws_internet_gateway.demo",
  "aws_launch_template.api",
  "aws_lb.demo",
  "aws_lb_listener.http",
  "aws_lb_target_group.api",
  "aws_route_table.public",
  "aws_route_table_association.public_a",
  "aws_route_table_association.public_c",
  "aws_s3_bucket.site",
  "aws_s3_bucket_policy.site",
  "aws_s3_bucket_public_access_block.site",
  "aws_s3_bucket_website_configuration.site",
  "aws_s3_object.index",
  "aws_s3_object.logo",
  "aws_security_group.alb",
  "aws_security_group.api",
  "aws_subnet.public_a",
  "aws_subnet.public_c",
  "aws_vpc.demo"
]);

export function createPreDeploymentCheckWarning(
  finding: CheckFinding,
  options: CreatePreDeploymentCheckWarningOptions = {}
): DeploymentPlanWarning {
  const shouldDowngradeDemoFinding = isDemoProfileAcknowledgementFinding(
    finding,
    options.liveProfile
  );
  const blocksApproval = finding.severity === "high" && !shouldDowngradeDemoFinding;

  const warning: DeploymentPlanWarning = {
    id: createStableWarningId("pre_deployment_check", finding.id),
    level: finding.severity,
    category: finding.category,
    source: "pre_deployment_check",
    code: toPreDeploymentWarningCode(finding),
    message: `${finding.title}: ${finding.recommendation}`,
    relatedFindingId: finding.id,
    requiresAcknowledgement: !blocksApproval,
    blocksApproval
  };

  if (finding.resourceId) {
    warning.relatedResourceId = finding.resourceId;
  }

  if (finding.sourceLocation) {
    warning.sourceLocation = finding.sourceLocation;
  }

  return warning;
}

function isDemoProfileAcknowledgementFinding(
  finding: CheckFinding,
  liveProfile: DeploymentLiveProfile | undefined
): boolean {
  if (liveProfile !== "demo_web_service" && liveProfile !== "demo_web_service_with_rds") {
    return false;
  }

  if (finding.severity !== "high") {
    return false;
  }

  const normalizedId = finding.id.toLowerCase();
  const normalizedResource = (
    finding.sourceLocation?.resourceAddress ??
    finding.resourceId ??
    ""
  ).toLowerCase();

  return (
    normalizedId.startsWith("trivy:") &&
    demoProfileAcknowledgementResources.has(normalizedResource)
  );
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
