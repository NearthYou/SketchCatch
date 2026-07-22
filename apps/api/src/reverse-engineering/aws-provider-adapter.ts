import { createHash } from "node:crypto";
import type {
  ArchitectureJson,
  CheckFinding,
  CloudProvider,
  DiscoveredResource,
  DiscoveredResourceRelationship,
  ResourceType,
  ReverseEngineeringResourceSelection,
  ReverseEngineeringAnalysisExclusion,
  ReverseEngineeringImportSuggestion,
  ReverseEngineeringScanError,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import { createReverseEngineeringArchitectureJson } from "./aws-provider-architecture-layout.js";
import { createReverseEngineeringFindings } from "./aws-reverse-engineering-findings.js";
import { createAwsResourceDisplayNameMap } from "./aws-resource-display-name.js";
import {
  createReverseEngineeringPublicCoverage,
  sanitizeReverseEngineeringScanErrors
} from "./reverse-engineering-public-errors.js";
import {
  createReverseEngineeringTerraformProjection,
  createStableTerraformResourceName,
  getReverseEngineeringTerraformResourceType
} from "./reverse-engineering-terraform-projection.js";
import {
  isCloudWatchMetricAlarmRequiringMapping,
  isEventBridgeRuleRequiringMapping,
  isEventBridgeTargetRequiringMapping,
  isKmsConnectedCloudWatchLogGroup,
  isSecurityGroupRequiringMapping
} from "./reverse-engineering-management-policy.js";
import { getReverseEngineeringTerraformCompleteness } from "./reverse-engineering-terraform-completeness.js";

export type AwsProviderScanInput = {
  provider: CloudProvider;
  region: string;
  resourceTypes: ReverseEngineeringResourceSelection[];
};

export type AwsDiscoveredRelationshipType = "contains" | "depends_on" | "attached_to";

export type AwsDiscoveredRelationship = {
  type: AwsDiscoveredRelationshipType;
  targetProviderResourceId: string;
};

export type AwsDiscoveredResourceRecord = {
  providerResourceType: string;
  providerResourceId: string;
  displayName: string;
  region: string;
  config: Record<string, unknown>;
  relationships: AwsDiscoveredRelationship[];
};

export type AwsProviderDiscoveryResult = {
  records: AwsDiscoveredResourceRecord[];
  scanErrors: ReverseEngineeringScanError[];
};

export type AwsProviderScanGateway = {
  discoverResources(
    input: AwsProviderScanInput
  ): Promise<AwsDiscoveredResourceRecord[] | AwsProviderDiscoveryResult>;
};

export type AwsProviderAdapter = {
  scan(input: AwsProviderScanInput): Promise<ReverseEngineeringScanResult>;
};

export type AwsProviderAdapterOptions = {
  resultVisibility?: "public" | "private";
};

const awsResourceTypeMap: ReadonlyMap<string, ResourceType> = new Map([
  ["AWS::EC2::VPC", "VPC"],
  ["AWS::EC2::Subnet", "SUBNET"],
  ["AWS::EC2::InternetGateway", "INTERNET_GATEWAY"],
  ["AWS::EC2::RouteTable", "ROUTE_TABLE"],
  ["AWS::EC2::RouteTableAssociation", "ROUTE_TABLE_ASSOCIATION"],
  ["AWS::EC2::SecurityGroup", "SECURITY_GROUP"],
  ["AWS::EC2::Instance", "EC2"],
  ["AWS::EC2::Image", "AMI"],
  ["AWS::RDS::DBInstance", "RDS"],
  ["AWS::S3::Bucket", "S3"],
  ["AWS::Lambda::Function", "LAMBDA"],
  ["AWS::Lambda::Permission", "LAMBDA_PERMISSION"],
  ["AWS::IAM::Role", "IAM_ROLE"],
  ["AWS::IAM::Policy", "IAM_POLICY"],
  ["AWS::IAM::InstanceProfile", "IAM_INSTANCE_PROFILE"],
  ["AWS::KMS::Key", "KMS_KEY"],
  ["AWS::Logs::LogGroup", "CLOUDWATCH_LOG_GROUP"],
  ["AWS::CloudWatch::Alarm", "CLOUDWATCH_METRIC_ALARM"],
  ["AWS::ApiGateway::RestApi", "API_GATEWAY_REST_API"],
  ["AWS::Events::Rule", "EVENTBRIDGE_RULE"],
  ["AWS::Events::Target", "EVENTBRIDGE_TARGET"],
  ["AWS::ElasticLoadBalancingV2::LoadBalancer", "LOAD_BALANCER"],
  ["AWS::CloudFront::Distribution", "CLOUDFRONT"],
  ["AWS::ECS::Cluster", "ECS_CLUSTER"],
  ["AWS::ECS::Service", "ECS_SERVICE"],
  ["AWS::ECS::TaskDefinition", "ECS_TASK_DEFINITION"]
]);

const REVERSE_ENGINEERING_PROMOTED_RESOURCE_TYPES = new Set<ResourceType>([
  "API_GATEWAY_REST_API",
  "CLOUDWATCH_METRIC_ALARM",
  "CLOUDWATCH_LOG_GROUP",
  "ROUTE_TABLE_ASSOCIATION",
  "EVENTBRIDGE_RULE",
  "EVENTBRIDGE_TARGET",
  "LOAD_BALANCER",
  "CLOUDFRONT",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "ECS_TASK_DEFINITION"
]);
const REVERSE_ENGINEERING_AUTOMATED_RESOURCE_TYPES = new Set<ResourceType>([
  "API_GATEWAY_REST_API",
  "CLOUDWATCH_METRIC_ALARM",
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "SECURITY_GROUP",
  "EC2",
  "RDS",
  "S3",
  "CLOUDWATCH_LOG_GROUP",
  "EVENTBRIDGE_RULE",
  "EVENTBRIDGE_TARGET",
  "LOAD_BALANCER",
  "CLOUDFRONT",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "ECS_TASK_DEFINITION"
]);
const REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS = [
  "providerResourceId",
  "providerResourceType",
  "region",
  "accountId"
];
const REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS = ["displayName", "description"];
const OPAQUE_PUBLIC_ID_RESOURCE_TYPES = new Set([
  "AWS::Lambda::Function",
  "AWS::Lambda::Permission",
  "AWS::IAM::Role",
  "AWS::IAM::Policy",
  "AWS::IAM::InstanceProfile"
]);
const IAM_OWNERSHIP_RESOURCE_TYPES = new Set([
  "AWS::IAM::Role",
  "AWS::IAM::Policy",
  "AWS::IAM::InstanceProfile"
]);
const IAM_CLOUD_FORMATION_OWNERSHIP_TAG_KEYS = new Set([
  "aws:cloudformation:stack-id",
  "aws:cloudformation:stack-name",
  "aws:cloudformation:logical-id"
]);
const PUBLIC_CONFIG_KEYS_BY_RESOURCE_TYPE = new Map<string, ReadonlySet<string>>([
  [
    "AWS::EC2::RouteTableAssociation",
    new Set(["routeTableAssociationId", "subnetId", "routeTableId", "main"])
  ],
  [
    "AWS::ApiGateway::RestApi",
    new Set([
      "apiKeySource",
      "binaryMediaTypes",
      "description",
      "disableExecuteApiEndpoint",
      "endpointConfiguration",
      "id",
      "minimumCompressionSize",
      "name",
      "tags"
    ])
  ],
  [
    "AWS::CloudWatch::Alarm",
    new Set([
      "actionsEnabled",
      "alarmDescription",
      "alarmName",
      "comparisonOperator",
      "datapointsToAlarm",
      "dimensions",
      "evaluateLowSampleCountPercentiles",
      "evaluationPeriods",
      "extendedStatistic",
      "metricName",
      "namespace",
      "period",
      "statistic",
      "threshold",
      "thresholdMetricId",
      "treatMissingData",
      "unit"
    ])
  ],
  [
    "AWS::ElasticLoadBalancingV2::LoadBalancer",
    new Set([
      "availabilityZones",
      "dnsName",
      "ipAddressType",
      "loadBalancerType",
      "name",
      "scheme",
      "securityGroupIds",
      "subnetIds",
      "subnetMapping",
      "type",
      "vpcId"
    ])
  ],
  [
    "AWS::CloudFront::Distribution",
    new Set([
      "comment",
      "defaultCacheBehavior",
      "enabled",
      "id",
      "origin",
      "restrictions",
      "viewerCertificate"
    ])
  ],
  ["AWS::ECS::Cluster", new Set(["capacityProviders", "configuration", "name", "status"])],
  [
    "AWS::ECS::Service",
    new Set([
      "capacityProviderStrategy",
      "clusterName",
      "desiredCount",
      "launchType",
      "loadBalancers",
      "name",
      "networkConfiguration"
    ])
  ],
  [
    "AWS::ECS::TaskDefinition",
    new Set([
      "containerDefinitions",
      "cpu",
      "family",
      "memory",
      "networkMode",
      "requiresCompatibilities",
      "requiresManualEnvironmentInput",
      "revision"
    ])
  ],
  [
    "AWS::Lambda::Function",
    new Set([
      "architectures",
      "codeSize",
      "ephemeralStorageSize",
      "functionName",
      "handler",
      "lastModified",
      "lastUpdateStatus",
      "memorySize",
      "packageType",
      "runtime",
      "securityGroupIds",
      "state",
      "subnetIds",
      "timeout",
      "tracingMode",
      "version",
      "vpcId"
    ])
  ],
  [
    "AWS::Lambda::Permission",
    new Set(["effect", "functionName", "hasCondition", "permissionIndex"])
  ],
  [
    "AWS::IAM::Role",
    new Set([
      "createdAt",
      "description",
      "hasPermissionsBoundary",
      "hasTrustPolicy",
      "lastUsedAt",
      "lastUsedRegion",
      "maxSessionDuration",
      "path",
      "roleName",
      "scanRegion"
    ])
  ],
  [
    "AWS::IAM::Policy",
    new Set([
      "attachmentCount",
      "createdAt",
      "description",
      "isAttachable",
      "path",
      "permissionsBoundaryUsageCount",
      "policyName",
      "scanRegion",
      "updatedAt"
    ])
  ],
  [
    "AWS::IAM::InstanceProfile",
    new Set(["createdAt", "instanceProfileName", "path", "roleNames", "scanRegion"])
  ],
  [
    "AWS::Logs::LogGroup",
    new Set(["logGroupClass", "logGroupName", "retentionInDays"])
  ],
  [
    "AWS::Events::Rule",
    new Set([
      "name",
      "description",
      "eventBusName",
      "eventPattern",
      "scheduleExpression",
      "state",
      "tags",
      "tagsReadComplete",
      "hasRoleArn",
      "managedBy"
    ])
  ],
  [
    "AWS::Events::Target",
    new Set([
      "targetId",
      "ruleName",
      "eventBusName",
      "hasRoleArn",
      "hasInput",
      "hasInputPath",
      "hasInputTransformer",
      "hasDeadLetterConfig",
      "hasRetryPolicy",
      "hasAdvancedParameters",
      "targetReferenceReady",
      "ruleReferenceReady",
      "targetTerraformResourceType",
      "targetTerraformAttribute",
      "ruleTerraformReference",
      "targetTerraformReference",
      "rule",
      "arn"
    ])
  ]
]);
const OMIT_PUBLIC_VALUE = Symbol("omit-public-value");

// gg: 공개 기본값은 유지하고, 서버 영속 경계에서만 AWS 원본을 보존합니다.
export function createAwsProviderAdapter(
  gateway: AwsProviderScanGateway,
  options: AwsProviderAdapterOptions = {}
): AwsProviderAdapter {
  return {
    async scan(input) {
      const discoveryResult = normalizeDiscoveryResult(await gateway.discoverResources(input));
      const scanErrors = sanitizeReverseEngineeringScanErrors(discoveryResult.scanErrors);
      const { coverage } = createReverseEngineeringPublicCoverage(scanErrors);
      const records = discoveryResult.records;
      const idMap = createResourceIdMap(records);
      const displayNameMap = createAwsResourceDisplayNameMap(records);
      const baseDiscoveredResources = records.map((record) =>
        toDiscoveredResource(
          record,
          idMap,
          createAwsPublicDisplayName(
            record,
            displayNameMap.get(record.providerResourceId) ?? record.displayName
          ),
          options.resultVisibility ?? "public"
        )
      );
      const discoveredResources = baseDiscoveredResources.map((resource) =>
        resource.resourceType === "ROUTE_TABLE_ASSOCIATION" &&
        createReverseEngineeringTerraformProjection(resource, baseDiscoveredResources)
          .management !== "managed"
          ? {
              ...resource,
              analysisExcluded: true,
              importSuggestionStatus: "manual_review" as const
            }
          : resource
      );
      const architectureJson = createReverseEngineeringArchitectureJson(discoveredResources);
      const scan = createEmptyScan(input);

      return {
        scan,
        discoveredResources,
        reverseEngineeringDraft: createReverseEngineeringDraft(scan, architectureJson),
        architectureJson,
        findings: [
          ...createReverseEngineeringFindings(discoveredResources),
          ...createTerraformCreationValidationFindings(discoveredResources)
        ],
        analysisExclusions: createAnalysisExclusions(discoveredResources),
        importSuggestions: createImportSuggestions(discoveredResources),
        scanErrors,
        coverage
      };
    }
  };
}

// Scan 결과를 바로 최종 보드로 저장하지 않고, 사용자가 확인할 후보 설계로 분리합니다.
function createReverseEngineeringDraft(
  scan: ReverseEngineeringScanResult["scan"],
  architectureJson: ArchitectureJson
): ReverseEngineeringScanResult["reverseEngineeringDraft"] {
  return {
    id: `draft-${scan.id}`,
    scanId: scan.id,
    architectureJson,
    protectedValueKeys: [...REVERSE_ENGINEERING_PROTECTED_VALUE_KEYS],
    editableValueKeys: [...REVERSE_ENGINEERING_EDITABLE_VALUE_KEYS],
    createdAt: scan.createdAt
  };
}

// 예전 gateway 배열 응답과 새 부분 실패 응답을 같은 모양으로 맞춥니다.
function normalizeDiscoveryResult(
  discoveryResult: AwsDiscoveredResourceRecord[] | AwsProviderDiscoveryResult
): AwsProviderDiscoveryResult {
  return Array.isArray(discoveryResult)
    ? { records: discoveryResult, scanErrors: [] }
    : discoveryResult;
}

function createEmptyScan(input: AwsProviderScanInput): ReverseEngineeringScanResult["scan"] {
  const now = new Date(0).toISOString();

  return {
    id: "scan-not-persisted",
    projectId: "project-not-persisted",
    awsConnectionId: "aws-connection-not-persisted",
    provider: input.provider,
    region: input.region,
    resourceTypes: input.resourceTypes,
    status: "completed",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: now,
    cancelRequestedAt: null,
    deletedAt: null,
    errorSummary: null
  };
}

function createResourceIdMap(records: AwsDiscoveredResourceRecord[]): ReadonlyMap<string, string> {
  return new Map(records.map((record) => [record.providerResourceId, createNodeId(record)]));
}

/** 확인된 Rule과 대상 node를 실제 Terraform 참조식으로 바꿔 Target 값에만 넣습니다. */
function createEventBridgeTargetTerraformReferenceConfig(
  record: AwsDiscoveredResourceRecord,
  storedConfig: Record<string, unknown>,
  idMap: ReadonlyMap<string, string>
): Record<string, unknown> {
  const ruleProviderResourceId = getNonEmptyString(record.config["ruleProviderResourceId"]);
  const targetProviderResourceId = getNonEmptyString(
    record.config["targetProviderResourceId"]
  );
  const ruleResourceId = ruleProviderResourceId
    ? idMap.get(ruleProviderResourceId)
    : undefined;
  const targetResourceId = targetProviderResourceId
    ? idMap.get(targetProviderResourceId)
    : undefined;
  const targetTerraformResourceType = getNonEmptyString(
    storedConfig["targetTerraformResourceType"]
  );
  const targetTerraformAttribute = getNonEmptyString(
    storedConfig["targetTerraformAttribute"]
  );

  if (
    storedConfig["targetReferenceReady"] !== true ||
    storedConfig["ruleReferenceReady"] !== true ||
    !ruleResourceId ||
    !targetResourceId ||
    !targetTerraformResourceType ||
    targetTerraformAttribute !== "arn"
  ) {
    return { ...storedConfig, targetReferenceReady: false };
  }

  return {
    ...storedConfig,
    ruleTerraformReference: `aws_cloudwatch_event_rule.${createStableTerraformResourceName(ruleResourceId)}.name`,
    targetTerraformReference: `${targetTerraformResourceType}.${createStableTerraformResourceName(targetResourceId)}.arn`
  };
}

// gg: 공개 결과는 비밀 config를 제거하고 서버 전용 결과만 안전 판정에 필요한 원본을 남깁니다.
function toDiscoveredResource(
  record: AwsDiscoveredResourceRecord,
  idMap: ReadonlyMap<string, string>,
  displayName: string,
  resultVisibility: "public" | "private"
): DiscoveredResource {
  const resourceType = resolveAwsResourceType(record);
  const storedConfig = createAwsStoredResourceConfig(record, resultVisibility);
  const config =
    resourceType === "EVENTBRIDGE_TARGET"
      ? createEventBridgeTargetTerraformReferenceConfig(record, storedConfig, idMap)
      : storedConfig;
  const baseResource: DiscoveredResource = {
    id: createNodeId(record),
    provider: "aws",
    providerResourceType: record.providerResourceType,
    providerResourceId:
      resultVisibility === "private"
        ? record.providerResourceId
        : createAwsPublicProviderResourceId(record),
    region: record.region,
    displayName,
    resourceType,
    config,
    relationships: record.relationships.flatMap((relationship) =>
      toDiscoveredRelationship(relationship, idMap)
    )
  };

  if (isKmsConnectedCloudWatchLogGroup(baseResource)) {
    return {
      ...baseResource,
      analysisExcluded: true,
      importSuggestionStatus: "manual_review"
    };
  }

  if (isCloudWatchMetricAlarmRequiringMapping(baseResource)) {
    return {
      ...baseResource,
      analysisExcluded: true,
      importSuggestionStatus: "manual_review"
    };
  }

  if (isSecurityGroupRequiringMapping(baseResource)) {
    return {
      ...baseResource,
      analysisExcluded: true,
      importSuggestionStatus: "manual_review"
    };
  }

  if (
    isEventBridgeRuleRequiringMapping(baseResource) ||
    isEventBridgeTargetRequiringMapping(baseResource)
  ) {
    return {
      ...baseResource,
      analysisExcluded: true,
      importSuggestionStatus: "manual_review"
    };
  }

  if (REVERSE_ENGINEERING_AUTOMATED_RESOURCE_TYPES.has(resourceType)) {
    return baseResource;
  }

  return {
    ...baseResource,
    analysisExcluded: true,
    importSuggestionStatus: "unsupported_resource_type"
  };
}

function resolveAwsResourceType(record: AwsDiscoveredResourceRecord): ResourceType {
  const resourceType = awsResourceTypeMap.get(record.providerResourceType) ?? "UNKNOWN";

  return resourceType === "LOAD_BALANCER" && !hasNormalizedApplicationLoadBalancerType(record)
    ? "UNKNOWN"
    : resourceType;
}

// Resource Explorer/Tagging inventory only proves an ELBv2 identifier exists.
// Promote it only after the dedicated reader has normalized an application type.
function hasNormalizedApplicationLoadBalancerType(record: AwsDiscoveredResourceRecord): boolean {
  if (isNetworkLoadBalancerArn(record.providerResourceId)) {
    return false;
  }

  const { config } = record;
  const loadBalancerTypes = [config["loadBalancerType"], config["type"]].filter(
    (value): value is string => typeof value === "string"
  );

  return (
    loadBalancerTypes.length > 0 && loadBalancerTypes.every((value) => value === "application")
  );
}

function isNetworkLoadBalancerArn(providerResourceId: string): boolean {
  return /^arn:[^:]+:elasticloadbalancing:[^:]+:[^:]+:loadbalancer\/net\//.test(providerResourceId);
}

// AWS의 attached_to 같은 관계 이름을 내부 관계 이름으로 줄여서 보드와 분석기가 같이 쓰게 합니다.
function toDiscoveredRelationship(
  relationship: AwsDiscoveredRelationship,
  idMap: ReadonlyMap<string, string>
): DiscoveredResourceRelationship[] {
  const targetResourceId = idMap.get(relationship.targetProviderResourceId);

  if (!targetResourceId) {
    return [];
  }

  return [
    {
      type: relationship.type === "attached_to" ? "connects_to" : relationship.type,
      targetResourceId,
      label: relationship.type
    }
  ];
}

// gg: 원본을 완전히 복원할 수 없는 Resource는 AI 분석 대상에서도 명시적으로 제외합니다.
function createAnalysisExclusions(
  discoveredResources: DiscoveredResource[]
): ReverseEngineeringAnalysisExclusion[] {
  return discoveredResources
    .filter((resource) => resource.analysisExcluded === true)
    .map((resource) => ({
      id: `analysis-exclusion-${resource.id}`,
      resourceId: resource.id,
      reason:
        resource.resourceType === "ROUTE_TABLE_ASSOCIATION"
          ? "missing_required_data"
          : "unsupported_resource_type",
      message: isKmsConnectedCloudWatchLogGroup(resource)
        ? "KMS Key로 암호화된 로그 저장소는 현재 안전하게 수정할 수 없어 보드에만 표시됩니다."
        : isCloudWatchMetricAlarmRequiringMapping(resource)
          ? "알림 동작 대상 또는 계산식 지표 연결이 남아 있어 보드에만 표시됩니다."
          : isSecurityGroupRequiringMapping(resource)
            ? "접근 규칙의 대상과 범위를 모두 확인하지 못해 보드에만 표시됩니다."
            : isEventBridgeRuleRequiringMapping(resource)
              ? "AWS가 관리하거나 별도 실행 Role을 쓰는 EventBridge Rule은 자동으로 수정할 수 없어 보드에만 표시됩니다."
              : isEventBridgeTargetRequiringMapping(resource)
                ? "EventBridge Target의 전달 설정이나 대상 연결을 안전하게 다시 만들 수 없어 보드에만 표시됩니다."
                : resource.resourceType === "ROUTE_TABLE_ASSOCIATION"
                  ? "같은 스캔의 Subnet과 Route Table을 안전하게 연결할 수 없어 보드에만 표시됩니다."
          : "아직 정식 지원하지 않는 Resource라 분석에서 제외됐습니다."
    }));
}

// gg: 안전하게 다시 만들 수 없는 Resource는 자동 import 대신 사용자 확인으로 돌립니다.
function createImportSuggestions(
  discoveredResources: DiscoveredResource[]
): ReverseEngineeringImportSuggestion[] {
  return discoveredResources.map((resource) => {
    if (isKmsConnectedCloudWatchLogGroup(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason:
          "KMS Key로 암호화된 로그 저장소는 현재 안전하게 수정할 수 없어 보드에만 표시됩니다.",
        handoffReady: false
      };
    }

    if (isCloudWatchMetricAlarmRequiringMapping(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason:
          "알림 동작 대상 또는 계산식 지표를 보드 리소스와 먼저 연결해야 안전하게 수정할 수 있습니다.",
        handoffReady: false
      };
    }

    if (isSecurityGroupRequiringMapping(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason: "접근 규칙의 대상과 범위를 모두 확인한 뒤 안전하게 수정할 수 있습니다.",
        handoffReady: false
      };
    }

    if (isEventBridgeRuleRequiringMapping(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason:
          "AWS가 관리하거나 별도 실행 Role을 쓰는 EventBridge Rule은 자동으로 수정하지 않습니다.",
        handoffReady: false
      };
    }

    if (isEventBridgeTargetRequiringMapping(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason:
          "EventBridge Target의 전달 설정과 대상 연결을 확인한 뒤 안전하게 수정할 수 있습니다.",
        handoffReady: false
      };
    }

    const terraformResourceType = getReverseEngineeringTerraformResourceType(resource.resourceType);

    if (!terraformResourceType) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "unsupported_resource_type",
        reason: "아직 정식 ResourceType으로 매핑되지 않았습니다.",
        handoffReady: false
      };
    }

    const { importId, missingCreationFields: missingTerraformFields } =
      getReverseEngineeringTerraformCompleteness(resource);

    if (missingTerraformFields.length > 0) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason: importId
          ? `Terraform 생성과 배포에 필요한 ${missingTerraformFields.join(", ")} 값이 없습니다.`
          : `${createMissingImportIdReason(resource.resourceType)} 새 Terraform 생성에는 ${missingTerraformFields.join(", ")} 값이 필요합니다.`,
        handoffReady: false
      };
    }

    if (!importId) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason: createMissingImportIdReason(resource.resourceType),
        handoffReady: false
      };
    }

    if (
      resource.resourceType === "ROUTE_TABLE_ASSOCIATION" &&
      createReverseEngineeringTerraformProjection(resource, discoveredResources).management !==
        "managed"
    ) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason:
          "같은 스캔의 관리 가능한 Subnet과 Route Table을 먼저 확인해야 안전하게 가져올 수 있습니다.",
        handoffReady: false
      };
    }

    const terraformResourceName = createStableTerraformResourceName(resource.id);
    const terraformAddress = `${terraformResourceType}.${terraformResourceName}`;
    const terraformBlockDraft = `resource "${terraformResourceType}" "${terraformResourceName}" {}`;

    return {
      id: `import-${resource.id}`,
      resourceId: resource.id,
      status: "ready",
      terraformAddress,
      importCommand: `terraform import ${terraformAddress} ${importId}`,
      terraformBlockDraft,
      handoffReady: true
    };
  });
}

// gg: 자동 import를 만들 수 없는 이유를 Resource별로 짧고 정확하게 설명합니다.
function createMissingImportIdReason(resourceType: ResourceType): string {
  return resourceType === "ROUTE_TABLE_ASSOCIATION"
    ? "Terraform import에 필요한 subnet ID와 route table ID가 없습니다."
    : resourceType === "EVENTBRIDGE_RULE"
    ? "Terraform import에 필요한 EventBridge bus name과 rule name이 없습니다."
    : resourceType === "EVENTBRIDGE_TARGET"
      ? "Terraform import에 필요한 EventBridge bus, rule, target ID가 없습니다."
      : resourceType === "CLOUDWATCH_LOG_GROUP"
    ? "Terraform import에 필요한 CloudWatch log group name이 없습니다."
    : resourceType === "CLOUDFRONT"
    ? "Terraform import에 필요한 CloudFront distribution ID가 없습니다."
    : resourceType === "LOAD_BALANCER"
      ? "보안상 ALB의 원본 AWS 식별자를 공개하지 않아 자동 import를 만들 수 없습니다."
      : resourceType === "ECS_CLUSTER"
        ? "보안상 ECS Cluster의 원본 AWS 식별자를 공개하지 않아 자동 import를 만들 수 없습니다."
        : resourceType === "ECS_SERVICE"
          ? "Terraform import에 필요한 ECS cluster name과 service name이 없습니다."
          : resourceType === "ECS_TASK_DEFINITION"
            ? "보안상 ECS Task Definition의 원본 AWS 식별자를 공개하지 않아 자동 import를 만들 수 없습니다."
            : "Terraform import에 필요한 provider Resource ID가 없습니다.";
}

function createTerraformCreationValidationFindings(
  discoveredResources: DiscoveredResource[]
): CheckFinding[] {
  return discoveredResources.flatMap((resource) => {
    if (!REVERSE_ENGINEERING_PROMOTED_RESOURCE_TYPES.has(resource.resourceType)) {
      return [];
    }

    const { missingCreationFields: missingFields } =
      getReverseEngineeringTerraformCompleteness(resource);
    if (missingFields.length === 0) {
      return [];
    }

    return [
      {
        id: `reverse-terraform-missing-data-${resource.id}`,
        category: "configuration" as const,
        severity: "medium" as const,
        resourceId: resource.id,
        title: "새 Terraform 생성에 필요한 정보가 부족합니다",
        description: `AWS 조회 결과에 ${missingFields.join(", ")} 값이 없습니다.`,
        recommendation:
          "기존 Resource import 제안을 검토하거나 누락 값을 직접 채운 뒤 Terraform 생성과 배포를 진행하세요."
      }
    ];
  });
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createNodeId(record: AwsDiscoveredResourceRecord): string {
  return `resource-${sanitizeIdPart(createAwsPublicProviderResourceId(record))}`;
}

// gg: raw SDK snapshot은 공개 config에서 공통 제거하고 민감한 Resource는 명시 allowlist만 통과시킵니다.
export function createAwsPublicResourceConfig(
  record: Pick<AwsDiscoveredResourceRecord, "providerResourceType" | "config">
): Record<string, unknown> {
  const allowedKeys = PUBLIC_CONFIG_KEYS_BY_RESOURCE_TYPE.get(record.providerResourceType);

  const publicConfig = Object.fromEntries(
    Object.entries(record.config).flatMap(([key, value]) => {
      if (
        key === "providerParameters" ||
        value === undefined ||
        (allowedKeys !== undefined && !allowedKeys.has(key))
      ) {
        return [];
      }

      const publicValue = sanitizePublicConfigValue(value);
      return publicValue === OMIT_PUBLIC_VALUE ? [] : [[key, publicValue]];
    })
  );

  if (record.providerResourceType === "AWS::ECS::TaskDefinition") {
    return sanitizePublicEcsTaskDefinitionConfig(publicConfig, record.config);
  }

  if (record.providerResourceType === "AWS::Logs::LogGroup") {
    return sanitizePublicCloudWatchLogGroupConfig(publicConfig, record.config);
  }

  if (record.providerResourceType === "AWS::CloudWatch::Alarm") {
    return sanitizePublicCloudWatchMetricAlarmConfig(publicConfig, record.config);
  }

  if (IAM_OWNERSHIP_RESOURCE_TYPES.has(record.providerResourceType)) {
    return sanitizePublicIamOwnershipConfig(publicConfig, record.config);
  }

  return publicConfig;
}

// IAM의 관리 경계 판정에 필요한 시스템 태그만 남기고 사용자 태그와 ARN은 공개하지 않습니다.
function sanitizePublicIamOwnershipConfig(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const ownershipTags = Array.isArray(sourceConfig["tags"])
    ? sourceConfig["tags"].flatMap((tag) => {
        if (!isRecord(tag)) {
          return [];
        }

        const key = tag["key"] ?? tag["Key"];
        const value = tag["value"] ?? tag["Value"];
        if (typeof key !== "string" || typeof value !== "string" || value.length === 0) {
          return [];
        }

        if (key === "ManagedBy" && value === "SketchCatch") {
          return [{ key, value }];
        }

        if (!IAM_CLOUD_FORMATION_OWNERSHIP_TAG_KEYS.has(key)) {
          return [];
        }

        return [{ key, value: containsAwsArn(value) ? "present" : value }];
      })
    : [];

  return ownershipTags.length > 0 ? { ...publicConfig, tags: ownershipTags } : publicConfig;
}

// gg: 서버 전용 결과도 allowlist를 지키되 KMS 로그를 관리 대상에서 막을 판정 근거는 보존합니다.
function createAwsStoredResourceConfig(
  record: Pick<AwsDiscoveredResourceRecord, "providerResourceType" | "config">,
  resultVisibility: "public" | "private"
): Record<string, unknown> {
  const publicConfig = createAwsPublicResourceConfig(record);
  if (
    resultVisibility !== "private" ||
    record.providerResourceType !== "AWS::Logs::LogGroup"
  ) {
    return publicConfig;
  }

  const kmsKeyId = getNonEmptyString(record.config["kmsKeyId"]);
  return kmsKeyId ? { ...publicConfig, kmsKeyId } : publicConfig;
}

// gg: 공개 결과에는 KMS ARN 대신 암호화 연결 여부만 남겨 안전한 관리 경계를 전달합니다.
function sanitizePublicCloudWatchLogGroupConfig(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const hasKmsKey =
    sourceConfig["hasKmsKey"] === true || getNonEmptyString(sourceConfig["kmsKeyId"]) !== null;

  return hasKmsKey ? { ...publicConfig, hasKmsKey: true } : publicConfig;
}

// gg: Action ARN과 metric query 원문은 숨기고 안전한 관리 경계 marker만 보드에 전달합니다.
function sanitizePublicCloudWatchMetricAlarmConfig(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const hasActionTargets =
    sourceConfig["hasActionTargets"] === true ||
    ["alarmActions", "insufficientDataActions", "okActions"].some(
      (key) => Array.isArray(sourceConfig[key]) && sourceConfig[key].length > 0
    );
  const hasMetricQueries =
    sourceConfig["hasMetricQueries"] === true ||
    (Array.isArray(sourceConfig["metrics"]) && sourceConfig["metrics"].length > 0) ||
    getNonEmptyString(sourceConfig["thresholdMetricId"]) !== null;

  if (!hasActionTargets && !hasMetricQueries) {
    return publicConfig;
  }

  const alarmName = getNonEmptyString(publicConfig["alarmName"]);
  return {
    ...(alarmName ? { alarmName } : {}),
    ...(hasActionTargets ? { hasActionTargets: true } : {}),
    ...(hasMetricQueries ? { hasMetricQueries: true } : {})
  };
}

function sanitizePublicEcsTaskDefinitionConfig(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const sourceContainers = Array.isArray(sourceConfig["containerDefinitions"])
    ? sourceConfig["containerDefinitions"]
    : [];
  const requiresManualEnvironmentInput = sourceContainers.some(
    (container) =>
      isRecord(container) &&
      ((Array.isArray(container["environment"]) && container["environment"].length > 0) ||
        (Array.isArray(container["secrets"]) && container["secrets"].length > 0))
  );

  return {
    ...publicConfig,
    ...(Object.prototype.hasOwnProperty.call(publicConfig, "containerDefinitions")
      ? {
          containerDefinitions: sanitizePublicEcsContainerDefinitions(
            publicConfig["containerDefinitions"]
          )
        }
      : {}),
    ...(requiresManualEnvironmentInput ? { requiresManualEnvironmentInput: true } : {})
  };
}

function sanitizePublicEcsContainerDefinitions(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((container) => {
    if (!isRecord(container)) {
      return [];
    }

    const publicContainer = pickPublicObjectKeys(container, [
      "cpu",
      "essential",
      "image",
      "memory",
      "memoryReservation",
      "name",
      "readonlyRootFilesystem",
      "user",
      "workingDirectory"
    ]);
    const portMappings = Array.isArray(container["portMappings"])
      ? container["portMappings"].flatMap((portMapping) =>
          isRecord(portMapping)
            ? [
                pickPublicObjectKeys(portMapping, [
                  "appProtocol",
                  "containerPort",
                  "hostPort",
                  "name",
                  "protocol"
                ])
              ]
            : []
        )
      : [];
    const secretNames = Array.isArray(container["secrets"])
      ? container["secrets"].flatMap((secret) =>
          isRecord(secret) && getNonEmptyString(secret["name"])
            ? [{ name: getNonEmptyString(secret["name"]) }]
            : []
        )
      : [];

    return [
      {
        ...publicContainer,
        ...(portMappings.length > 0 ? { portMappings } : {}),
        ...(secretNames.length > 0 ? { secrets: secretNames } : {})
      }
    ];
  });
}

function pickPublicObjectKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  return Object.fromEntries(
    keys.flatMap((key) => (value[key] === undefined ? [] : [[key, value[key]]]))
  );
}

// gg: raw ARN은 내부 관계 결합에만 쓰고 공개 결과에는 안정적인 불투명 ID만 남깁니다.
export function createAwsPublicProviderResourceId(
  record: Pick<AwsDiscoveredResourceRecord, "providerResourceType" | "providerResourceId">
): string {
  if (/^aws-ref-[a-f0-9]{24}$/u.test(record.providerResourceId)) {
    return record.providerResourceId;
  }

  if (
    !OPAQUE_PUBLIC_ID_RESOURCE_TYPES.has(record.providerResourceType) &&
    !containsAwsArn(record.providerResourceId)
  ) {
    return record.providerResourceId;
  }

  return createOpaquePublicId(record.providerResourceType, record.providerResourceId);
}

function createOpaquePublicId(providerResourceType: string, providerResourceId: string): string {
  return `aws-ref-${createHash("sha256")
    .update(`${providerResourceType}\0${providerResourceId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export function createAwsPublicDisplayName(
  record: Pick<AwsDiscoveredResourceRecord, "providerResourceType" | "providerResourceId">,
  displayName: string
): string {
  if (!containsAwsArn(displayName)) {
    return displayName;
  }

  const resourceLabel = record.providerResourceType.split("::").at(-1) || "AWS Resource";
  return `${resourceLabel} · ${createAwsPublicProviderResourceId(record).slice(-7)}`;
}

function sanitizePublicConfigValue(value: unknown): unknown | typeof OMIT_PUBLIC_VALUE {
  if (typeof value === "string") {
    return containsAwsArn(value) ? OMIT_PUBLIC_VALUE : value;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const publicItem = sanitizePublicConfigValue(item);
      return publicItem === OMIT_PUBLIC_VALUE ? [] : [publicItem];
    });
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nestedValue]) => {
        if (containsAwsArn(key)) {
          return [];
        }

        const publicValue = sanitizePublicConfigValue(nestedValue);
        return publicValue === OMIT_PUBLIC_VALUE ? [] : [[key, publicValue]];
      })
    );
  }

  return value === undefined ? OMIT_PUBLIC_VALUE : value;
}

export function containsAwsArn(value: string): boolean {
  return /(?:^|[^a-z0-9])arn:aws(?:-[a-z0-9-]+)?:/iu.test(value);
}

// AWS ARN처럼 긴 ID를 보드 node id에 넣을 수 있는 안전한 문자열로 정리합니다.
function sanitizeIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
