import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";

export type ReverseEngineeringManagementDecision =
  | "managed"
  | "reference"
  | "aws_managed"
  | "sketchcatch_managed"
  | "needs_mapping";

const AUTOMATED_MANAGED_RESOURCE_TYPES = new Set<ResourceType>([
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "S3",
  "LOAD_BALANCER",
  "CLOUDFRONT",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "ECS_TASK_DEFINITION"
]);

const CLOUD_FORMATION_OWNERSHIP_KEYS = [
  "cloudFormationStackId",
  "cloudFormationStackName",
  "cloudFormationLogicalId",
  "cloudFormationStackArn"
] as const;

const CLOUD_FORMATION_OWNERSHIP_TAG_KEYS = new Set([
  "aws:cloudformation:stack-id",
  "aws:cloudformation:stack-name",
  "aws:cloudformation:logical-id"
]);

const SKETCHCATCH_CONTROL_NAME_PATTERN =
  /^SketchCatch(?:Import|Terraform|ReverseEngineering|CodeBuild)/u;
const SKETCHCATCH_IMPORT_STACK_NAME_PATTERN =
  /^sketchcatch-import-[a-f0-9]{16}-(?:policy|manager)$/iu;

export function classifyReverseEngineeringManagement(
  resource: Pick<
    DiscoveredResource,
    "providerResourceType" | "displayName" | "resourceType" | "config"
  >
): ReverseEngineeringManagementDecision {
  if (isSketchCatchControlResource(resource)) {
    return "sketchcatch_managed";
  }

  if (isAwsManagedResource(resource)) {
    return "aws_managed";
  }

  if (hasCloudFormationOwnershipEvidence(resource.config)) {
    return "reference";
  }

  if (resource.resourceType === "AMI") {
    return "reference";
  }

  return AUTOMATED_MANAGED_RESOURCE_TYPES.has(resource.resourceType)
    ? "managed"
    : "needs_mapping";
}

function isSketchCatchControlResource(
  resource: Pick<DiscoveredResource, "providerResourceType" | "displayName" | "config">
): boolean {
  if (hasExactSketchCatchOwnership(resource.config)) {
    return true;
  }

  if (resource.providerResourceType === "AWS::CloudFormation::Stack") {
    return getSafeResourceNames(resource).some((name) =>
      SKETCHCATCH_IMPORT_STACK_NAME_PATTERN.test(name)
    );
  }

  if (
    resource.providerResourceType !== "AWS::IAM::Role" &&
    resource.providerResourceType !== "AWS::IAM::Policy"
  ) {
    return false;
  }

  return getSafeResourceNames(resource).some((name) => SKETCHCATCH_CONTROL_NAME_PATTERN.test(name));
}

function isAwsManagedResource(
  resource: Pick<DiscoveredResource, "providerResourceType" | "displayName" | "config">
): boolean {
  if (resource.providerResourceType === "AWS::KMS::Key") {
    return resource.config["keyManager"] === "AWS";
  }

  if (resource.providerResourceType !== "AWS::IAM::Role") {
    return false;
  }

  return getSafeResourceNames(resource).some(
    (name) => name.startsWith("AWSServiceRoleFor") || name.startsWith("AWSReservedSSO")
  );
}

function hasCloudFormationOwnershipEvidence(config: Record<string, unknown>): boolean {
  if (
    CLOUD_FORMATION_OWNERSHIP_KEYS.some((key) => hasNonEmptyString(config[key]))
  ) {
    return true;
  }

  if (
    getResourceTags(config).some(
      (tag) => CLOUD_FORMATION_OWNERSHIP_TAG_KEYS.has(tag.key) && tag.value.length > 0
    )
  ) {
    return true;
  }

  return [config["managedBy"], config["ownership"]].some(
    (value) => typeof value === "string" && value.toLowerCase() === "cloudformation"
  );
}

function hasExactSketchCatchOwnership(config: Record<string, unknown>): boolean {
  return (
    config["managedBy"] === "SketchCatch" ||
    getResourceTags(config).some(
      (tag) => tag.key === "ManagedBy" && tag.value === "SketchCatch"
    )
  );
}

function getResourceTags(config: Record<string, unknown>): Array<{ key: string; value: string }> {
  const tags = config["tags"];
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.flatMap((tag) => {
    if (!isRecord(tag)) {
      return [];
    }

    const key = typeof tag["key"] === "string" ? tag["key"] : tag["Key"];
    const value = typeof tag["value"] === "string" ? tag["value"] : tag["Value"];

    return typeof key === "string" && typeof value === "string" ? [{ key, value }] : [];
  });
}

function getSafeResourceNames(
  resource: Pick<DiscoveredResource, "displayName" | "config">
): string[] {
  return [
    resource.displayName,
    resource.config["roleName"],
    resource.config["policyName"],
    resource.config["stackName"],
    resource.config["name"]
  ].filter((value): value is string => hasNonEmptyString(value));
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
