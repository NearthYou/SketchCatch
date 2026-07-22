import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";

export type ReverseEngineeringManagementDecision =
  | "managed"
  | "reference"
  | "aws_managed"
  | "sketchcatch_managed"
  | "needs_mapping";

const AUTOMATED_MANAGED_RESOURCE_TYPES = new Set<ResourceType>([
  "API_GATEWAY_REST_API",
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "S3",
  "CLOUDWATCH_LOG_GROUP",
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

const SKETCHCATCH_CONTROL_NAME_PATTERNS = [
  /^SketchCatchTerraformExecutionRole(?:-[a-f0-9]{8})?$/iu,
  /^SketchCatchReverseEngineeringReadRole(?:-[a-f0-9]{8})?$/iu,
  /^SketchCatchCodeBuild-[a-f0-9]{8}$/iu,
  /^SketchCatchCodeBuildBoundary(?:-[a-f0-9]{8})?$/iu,
  /^SketchCatchImport(?:Cfn|Read|Control|Cleanup|PolicyLifecycle)-[a-f0-9]{16}$/iu
] as const;
const SKETCHCATCH_IMPORT_STACK_NAME_PATTERN =
  /^sketchcatch-import-[a-f0-9]{16}-(?:policy|manager)$/iu;

/** AWS 리소스의 소유권 근거와 지원 범위를 바탕으로 안전한 관리 경계를 결정한다. */
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

  if (isKmsConnectedCloudWatchLogGroup(resource)) {
    return "needs_mapping";
  }

  return AUTOMATED_MANAGED_RESOURCE_TYPES.has(resource.resourceType)
    ? "managed"
    : "needs_mapping";
}

/** KMS 연결을 안전하게 재주입할 수 없는 Log Group인지 공개 marker와 서버 원본으로 확인한다. */
export function isKmsConnectedCloudWatchLogGroup(
  resource: Pick<DiscoveredResource, "resourceType" | "config">
): boolean {
  return (
    resource.resourceType === "CLOUDWATCH_LOG_GROUP" &&
    (resource.config["hasKmsKey"] === true || hasNonEmptyString(resource.config["kmsKeyId"]))
  );
}

/** 명시적 ownership 또는 실제 생성 규칙과 정확히 일치하는 SketchCatch 제어 리소스만 찾는다. */
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

  return getSafeResourceNames(resource).some((name) =>
    SKETCHCATCH_CONTROL_NAME_PATTERNS.some((pattern) => pattern.test(name))
  );
}

/** AWS가 직접 수명 주기를 관리하는 Role과 Key인지 판정한다. */
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

/** CloudFormation이 소유한다는 필드 또는 시스템 태그가 있는지 확인한다. */
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

/** 대소문자와 공백까지 정확한 SketchCatch ownership만 신뢰한다. */
function hasExactSketchCatchOwnership(config: Record<string, unknown>): boolean {
  return (
    config["managedBy"] === "SketchCatch" ||
    getResourceTags(config).some(
      (tag) => tag.key === "ManagedBy" && tag.value === "SketchCatch"
    )
  );
}

/** AWS SDK reader별 태그 키 표기 차이를 안전한 공통 구조로 정규화한다. */
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

/** 소유권 판정에 사용할 수 있는 명시적 이름 필드만 모은다. */
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

/** 판정 근거로 사용할 수 있는 비어 있지 않은 문자열인지 확인한다. */
function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** 배열이 아닌 JSON object인지 좁힌다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
