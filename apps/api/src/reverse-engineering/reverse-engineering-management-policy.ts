import type { DiscoveredResource, ResourceType } from "@sketchcatch/types";
import { getReverseEngineeringTerraformCompleteness } from "./reverse-engineering-terraform-completeness.js";

export type ReverseEngineeringManagementDecision =
  | "managed"
  | "reference"
  | "aws_managed"
  | "sketchcatch_managed"
  | "needs_mapping";

const AUTOMATED_MANAGED_RESOURCE_TYPES = new Set<ResourceType>([
  "API_GATEWAY_REST_API",
  "CLOUDWATCH_METRIC_ALARM",
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "ELASTIC_IP",
  "NAT_GATEWAY",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "S3",
  "CLOUDWATCH_LOG_GROUP",
  "EVENTBRIDGE_RULE",
  "EVENTBRIDGE_TARGET",
  "LOAD_BALANCER",
  "LOAD_BALANCER_TARGET_GROUP",
  "LOAD_BALANCER_LISTENER",
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
    "providerResourceId" | "providerResourceType" | "displayName" | "resourceType" | "config"
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

  if (isCloudWatchMetricAlarmRequiringMapping(resource)) {
    return "needs_mapping";
  }

  if (isSecurityGroupRequiringMapping(resource)) {
    return "needs_mapping";
  }

  if (
    isEventBridgeRuleRequiringMapping(resource) ||
    isEventBridgeTargetRequiringMapping(resource)
  ) {
    return "needs_mapping";
  }

  if (AUTOMATED_MANAGED_RESOURCE_TYPES.has(resource.resourceType)) {
    const completeness = getReverseEngineeringTerraformCompleteness(resource);
    if (completeness.missingCreationFields.length > 0 || !completeness.importId) {
      return "needs_mapping";
    }
  }

  return AUTOMATED_MANAGED_RESOURCE_TYPES.has(resource.resourceType)
    ? "managed"
    : "needs_mapping";
}

/** Security Group 규칙의 protocol, source, port 완전성을 확인하지 못하면 자동 관리를 막습니다. */
export function isSecurityGroupRequiringMapping(
  resource: Pick<DiscoveredResource, "resourceType" | "config">
): boolean {
  if (resource.resourceType !== "SECURITY_GROUP") {
    return false;
  }

  if (
    resource.config["securityGroupRulesComplete"] !== true ||
    !Array.isArray(resource.config["ingress"]) ||
    !Array.isArray(resource.config["egress"])
  ) {
    return true;
  }

  return ![...resource.config["ingress"], ...resource.config["egress"]].every(
    isCompleteSecurityGroupRule
  );
}

/** Security Group rule 하나가 재생성 가능한 source와 port 짝을 가졌는지 확인합니다. */
function isCompleteSecurityGroupRule(value: unknown): boolean {
  if (!isRecord(value) || !hasNonEmptyString(value["ipProtocol"])) {
    return false;
  }

  const hasFromPort = value["fromPort"] !== undefined;
  const hasToPort = value["toPort"] !== undefined;
  if (
    hasFromPort !== hasToPort ||
    (hasFromPort &&
      (!Number.isInteger(value["fromPort"]) || !Number.isInteger(value["toPort"])))
  ) {
    return false;
  }

  const sourceKeys = [
    "cidrBlocks",
    "ipv6CidrBlocks",
    "prefixListIds",
    "securityGroups"
  ] as const;
  let sourceCount = 0;
  for (const key of sourceKeys) {
    const source = value[key];
    if (source === undefined) {
      continue;
    }
    if (!Array.isArray(source) || source.length === 0 || !source.every(hasNonEmptyString)) {
      return false;
    }
    sourceCount += source.length;
  }

  return sourceCount > 0;
}

/** Action ARN 또는 metric math 연결을 안전하게 재구성하지 못하는 Alarm인지 확인합니다. */
export function isCloudWatchMetricAlarmRequiringMapping(
  resource: Pick<DiscoveredResource, "resourceType" | "config">
): boolean {
  if (resource.resourceType !== "CLOUDWATCH_METRIC_ALARM") {
    return false;
  }

  return (
    resource.config["hasActionTargets"] === true ||
    resource.config["hasMetricQueries"] === true ||
    ["alarmActions", "insufficientDataActions", "okActions"].some(
      (key) => Array.isArray(resource.config[key]) && resource.config[key].length > 0
    ) ||
    (Array.isArray(resource.config["metrics"]) && resource.config["metrics"].length > 0) ||
    (typeof resource.config["thresholdMetricId"] === "string" &&
      resource.config["thresholdMetricId"].trim().length > 0)
  );
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

/** AWS 관리 Rule 또는 별도 실행 Role이 필요한 Rule은 자동 Terraform 관리에서 제외합니다. */
export function isEventBridgeRuleRequiringMapping(
  resource: Pick<DiscoveredResource, "resourceType" | "config">
): boolean {
  if (resource.resourceType !== "EVENTBRIDGE_RULE") {
    return false;
  }

  return (
    resource.config["tagsReadComplete"] !== true ||
    resource.config["hasRoleArn"] === true ||
    hasNonEmptyString(resource.config["managedBy"])
  );
}

/** Rule과 대상 리소스를 안전한 Terraform 참조로 만들 수 없는 Target은 수동 검토로 닫습니다. */
export function isEventBridgeTargetRequiringMapping(
  resource: Pick<DiscoveredResource, "resourceType" | "config">
): boolean {
  if (resource.resourceType !== "EVENTBRIDGE_TARGET") {
    return false;
  }

  const riskyMarkers = [
    "hasRoleArn",
    "hasInput",
    "hasInputPath",
    "hasInputTransformer",
    "hasDeadLetterConfig",
    "hasRetryPolicy",
    "hasAdvancedParameters"
  ] as const;
  const hasInternalReferences =
    isTerraformAttributeReference(
      resource.config["ruleTerraformReference"],
      "aws_cloudwatch_event_rule",
      "name"
    ) &&
    isTerraformArnReference(resource.config["targetTerraformReference"]);
  const hasProjectedReferences =
    isTerraformAttributeReference(
      resource.config["rule"],
      "aws_cloudwatch_event_rule",
      "name"
    ) && isTerraformArnReference(resource.config["arn"]);

  return (
    riskyMarkers.some((key) => resource.config[key] === true) ||
    (!hasInternalReferences && !hasProjectedReferences)
  );
}

/** 서버가 만든 `type.name.attribute` Terraform 참조 형식만 관리 근거로 인정합니다. */
function isTerraformAttributeReference(
  value: unknown,
  resourceType: string,
  attribute: string
): boolean {
  return (
    typeof value === "string" &&
    new RegExp(`^${resourceType}\\.[a-z_][a-z0-9_]*\\.${attribute}$`, "u").test(value)
  );
}

function isTerraformArnReference(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^aws_[a-z0-9_]+\.[a-z_][a-z0-9_]*\.arn$/u.test(value)
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
