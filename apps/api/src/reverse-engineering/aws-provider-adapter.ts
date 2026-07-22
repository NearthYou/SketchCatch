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
  isApiGatewayRestApiRequiringMapping,
  isCloudWatchLogGroupRequiringMapping,
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
  serverOnly?: {
    readonly providerResourceId?: string;
    readonly terraformImportId?: string;
    readonly config?: Readonly<Record<string, unknown>>;
  };
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
  ["AWS::EC2::EIP", "ELASTIC_IP"],
  ["AWS::EC2::NatGateway", "NAT_GATEWAY"],
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
  ["AWS::ElasticLoadBalancingV2::TargetGroup", "LOAD_BALANCER_TARGET_GROUP"],
  ["AWS::ElasticLoadBalancingV2::Listener", "LOAD_BALANCER_LISTENER"],
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
  "ELASTIC_IP",
  "NAT_GATEWAY",
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
const REVERSE_ENGINEERING_AUTOMATED_RESOURCE_TYPES = new Set<ResourceType>([
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
const SAME_SCAN_TERRAFORM_REFERENCE_RESOURCE_TYPES = new Set<ResourceType>([
  "ROUTE_TABLE_ASSOCIATION",
  "ELASTIC_IP",
  "NAT_GATEWAY",
  "LOAD_BALANCER_TARGET_GROUP",
  "LOAD_BALANCER_LISTENER"
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
const ELASTIC_LOAD_BALANCING_RESOURCE_TYPES = new Set([
  "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "AWS::ElasticLoadBalancingV2::TargetGroup",
  "AWS::ElasticLoadBalancingV2::Listener"
]);
const IAM_CLOUD_FORMATION_OWNERSHIP_TAG_KEYS = new Set([
  "aws:cloudformation:stack-id",
  "aws:cloudformation:stack-name",
  "aws:cloudformation:logical-id"
]);
const PUBLIC_CONFIG_KEYS_BY_RESOURCE_TYPE = new Map<string, ReadonlySet<string>>([
  [
    "AWS::EC2::EIP",
    new Set(["allocationId", "associationTargetType", "domain", "publicIp", "tags"])
  ],
  [
    "AWS::EC2::NatGateway",
    new Set([
      "addressStatusesReady",
      "allocationIds",
      "connectivityType",
      "natGatewayId",
      "primaryAllocationId",
      "state",
      "subnetId",
      "tags",
      "vpcId"
    ])
  ],
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
      "hasResourcePolicy",
      "id",
      "minimumCompressionSize",
      "name",
      "tags",
      "tagsReadComplete"
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
      "hasUnprojectableDimensions",
      "metricName",
      "namespace",
      "period",
      "statistic",
      "tags",
      "tagsReadComplete",
      "threshold",
      "thresholdMetricId",
      "treatMissingData",
      "unit"
    ])
  ],
  [
    "AWS::ElasticLoadBalancingV2::LoadBalancer",
    new Set([
      "attributes",
      "attributesProjectionComplete",
      "attributesReadComplete",
      "availabilityZones",
      "dnsName",
      "ipAddressType",
      "loadBalancerType",
      "name",
      "reverseEngineeringDetailsVersion",
      "reverseEngineeringIncompleteDetails",
      "scheme",
      "securityGroupIds",
      "subnetIds",
      "subnetMapping",
      "tags",
      "tagsReadComplete",
      "type",
      "vpcId"
    ])
  ],
  [
    "AWS::ElasticLoadBalancingV2::TargetGroup",
    new Set([
      "attributes",
      "attributesProjectionComplete",
      "attributesReadComplete",
      "deregistrationDelay",
      "healthCheck",
      "ipAddressType",
      "name",
      "port",
      "protocol",
      "protocolVersion",
      "reverseEngineeringDetailsVersion",
      "reverseEngineeringIncompleteDetails",
      "tags",
      "tagsReadComplete",
      "targetGroupName",
      "targetType",
      "vpcId"
    ])
  ],
  [
    "AWS::ElasticLoadBalancingV2::Listener",
    new Set([
      "attributes",
      "attributesProjectionComplete",
      "attributesReadComplete",
      "defaultAction",
      "hasAdvancedDefaultAction",
      "port",
      "protocol",
      "reverseEngineeringDetailsVersion",
      "reverseEngineeringIncompleteDetails",
      "simpleForwardAction",
      "tags",
      "tagsReadComplete"
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
    new Set(["logGroupClass", "logGroupName", "retentionInDays", "tags", "tagsReadComplete"])
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
      const records = filterMultiplexedReaderRecordsForOutput(input, discoveryResult.records);
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
        SAME_SCAN_TERRAFORM_REFERENCE_RESOURCE_TYPES.has(resource.resourceType) &&
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

// Association reader가 함께 반환한 record는 직접 선택했거나 ALL일 때만 최종 결과로 승격합니다.
function filterMultiplexedReaderRecordsForOutput(
  input: AwsProviderScanInput,
  records: readonly AwsDiscoveredResourceRecord[]
): AwsDiscoveredResourceRecord[] {
  if (input.resourceTypes.includes("ALL")) {
    return [...records];
  }

  const selectedResourceTypes = new Set(input.resourceTypes);
  const listenerDependencyIds = new Set(
    records
      .filter((record) => record.providerResourceType === "AWS::ElasticLoadBalancingV2::Listener")
      .flatMap((record) =>
        record.relationships.map((relationship) => relationship.targetProviderResourceId)
      )
  );
  const selectedTargetGroups = records.filter(
    (record) =>
      record.providerResourceType === "AWS::ElasticLoadBalancingV2::TargetGroup" &&
      (selectedResourceTypes.has("LOAD_BALANCER_TARGET_GROUP") ||
        listenerDependencyIds.has(record.providerResourceId))
  );
  const selectedTargetGroupIds = new Set(
    selectedTargetGroups.map((record) => record.providerResourceId)
  );
  const targetGroupDependencyIds = new Set(
    selectedTargetGroups.flatMap((record) =>
      record.relationships.map((relationship) => relationship.targetProviderResourceId)
    )
  );
  const selectedLoadBalancerIds = new Set(
    records
      .filter(
        (record) =>
          record.providerResourceType === "AWS::ElasticLoadBalancingV2::LoadBalancer" &&
          (selectedResourceTypes.has("LOAD_BALANCER") ||
            listenerDependencyIds.has(record.providerResourceId) ||
            targetGroupDependencyIds.has(record.providerResourceId))
      )
      .map((record) => record.providerResourceId)
  );
  const elasticLoadBalancingVpcIds = new Set(
    records
      .filter(
        (record) =>
          selectedTargetGroupIds.has(record.providerResourceId) ||
          selectedLoadBalancerIds.has(record.providerResourceId)
      )
      .map((record) => getNonEmptyString(record.config["vpcId"]))
      .filter((value): value is string => value !== null)
  );
  const natDependencyIds = new Set(
    records
      .filter((record) => record.providerResourceType === "AWS::EC2::NatGateway")
      .flatMap((record) => [
        getNonEmptyString(record.config["subnetId"]),
        ...getStringValues(record.config["allocationIds"]),
        ...record.relationships.map((relationship) => relationship.targetProviderResourceId)
      ])
      .filter((value): value is string => value !== null)
  );

  return records.filter((record) => {
    if (
      record.providerResourceType === "AWS::ElasticLoadBalancingV2::LoadBalancer" &&
      !selectedResourceTypes.has("LOAD_BALANCER") &&
      !selectedLoadBalancerIds.has(record.providerResourceId)
    ) {
      return false;
    }

    if (
      record.providerResourceType === "AWS::ElasticLoadBalancingV2::TargetGroup" &&
      !selectedResourceTypes.has("LOAD_BALANCER_TARGET_GROUP") &&
      !listenerDependencyIds.has(record.providerResourceId)
    ) {
      return false;
    }

    if (
      record.providerResourceType === "AWS::EC2::VPC" &&
      !selectedResourceTypes.has("VPC") &&
      (selectedResourceTypes.has("LOAD_BALANCER_TARGET_GROUP") ||
        selectedResourceTypes.has("LOAD_BALANCER_LISTENER"))
    ) {
      return elasticLoadBalancingVpcIds.has(record.providerResourceId);
    }

    if (
      record.providerResourceType === "AWS::EC2::RouteTableAssociation" &&
      !selectedResourceTypes.has("ROUTE_TABLE_ASSOCIATION")
    ) {
      return false;
    }

    if (
      selectedResourceTypes.has("NAT_GATEWAY") &&
      record.providerResourceType === "AWS::EC2::Subnet" &&
      !selectedResourceTypes.has("SUBNET")
    ) {
      return natDependencyIds.has(record.providerResourceId);
    }

    if (
      selectedResourceTypes.has("NAT_GATEWAY") &&
      record.providerResourceType === "AWS::EC2::EIP" &&
      !selectedResourceTypes.has("ELASTIC_IP")
    ) {
      return natDependencyIds.has(record.providerResourceId);
    }

    return true;
  });
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
  const targetProviderResourceId = getNonEmptyString(record.config["targetProviderResourceId"]);
  const ruleResourceId = ruleProviderResourceId ? idMap.get(ruleProviderResourceId) : undefined;
  const targetResourceId = targetProviderResourceId
    ? idMap.get(targetProviderResourceId)
    : undefined;
  const targetTerraformResourceType = getNonEmptyString(
    storedConfig["targetTerraformResourceType"]
  );
  const targetTerraformAttribute = getNonEmptyString(storedConfig["targetTerraformAttribute"]);

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
        ? (record.serverOnly?.providerResourceId ?? record.providerResourceId)
        : createAwsPublicProviderResourceId(record),
    region: record.region,
    displayName,
    resourceType,
    config,
    relationships: record.relationships.flatMap((relationship) =>
      toDiscoveredRelationship(relationship, idMap)
    )
  };

  if (isApiGatewayRestApiRequiringMapping(baseResource)) {
    return {
      ...baseResource,
      analysisExcluded: true,
      importSuggestionStatus: "manual_review"
    };
  }

  if (isCloudWatchLogGroupRequiringMapping(baseResource)) {
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

/** 자동 관리에서 제외한 실제 근거를 사용자가 이해할 수 있는 보드 안내로 바꾼다. */
function createCloudWatchLogGroupMappingReason(
  resource: Pick<DiscoveredResource, "config">
): string {
  if (
    isKmsConnectedCloudWatchLogGroup({
      resourceType: "CLOUDWATCH_LOG_GROUP",
      config: resource.config
    })
  ) {
    return "KMS Key로 암호화된 로그 저장소는 현재 안전하게 수정할 수 없어 보드에만 표시됩니다.";
  }

  if (resource.config["logGroupClass"] !== "STANDARD") {
    return "STANDARD가 아닌 로그 저장 class는 현재 안전하게 다시 만들 수 없어 보드에만 표시됩니다.";
  }

  return "로그 저장소의 태그를 모두 확인하지 못해 보드에만 표시됩니다.";
}

/** Alarm을 보드에만 남긴 안전 근거를 노출 가능한 사용자 안내로 좁힌다. */
function createCloudWatchMetricAlarmMappingReason(
  resource: Pick<DiscoveredResource, "config">
): string {
  if (resource.config["tagsReadComplete"] !== true || !Array.isArray(resource.config["tags"])) {
    return "알림 태그를 모두 확인하지 못해 보드에만 표시됩니다.";
  }

  if (resource.config["hasUnprojectableDimensions"] === true) {
    return "알림 dimension 값을 안전하게 보존할 수 없어 보드에만 표시됩니다.";
  }

  return "알림 동작 대상 또는 계산식 지표 연결이 남아 있어 보드에만 표시됩니다.";
}

/** gg: REST API 자동 관리를 막은 policy 또는 tag 근거를 사용자에게 구분해 설명합니다. */
function createApiGatewayRestApiMappingReason(
  resource: Pick<DiscoveredResource, "config">
): string {
  if (resource.config["hasResourcePolicy"] === true) {
    return "Resource policy가 있는 API는 현재 안전하게 다시 만들 수 없어 보드에만 표시됩니다.";
  }

  if (resource.config["hasResourcePolicy"] !== false) {
    return "Resource policy가 없다는 사실을 확인하지 못해 API를 보드에만 표시합니다.";
  }

  return "API 태그를 모두 확인하지 못해 보드에만 표시됩니다.";
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
      reason: SAME_SCAN_TERRAFORM_REFERENCE_RESOURCE_TYPES.has(resource.resourceType)
        ? "missing_required_data"
        : "unsupported_resource_type",
      message: isApiGatewayRestApiRequiringMapping(resource)
        ? createApiGatewayRestApiMappingReason(resource)
        : isCloudWatchLogGroupRequiringMapping(resource)
          ? createCloudWatchLogGroupMappingReason(resource)
          : isCloudWatchMetricAlarmRequiringMapping(resource)
            ? createCloudWatchMetricAlarmMappingReason(resource)
            : isSecurityGroupRequiringMapping(resource)
              ? "접근 규칙의 대상과 범위를 모두 확인하지 못해 보드에만 표시됩니다."
              : isEventBridgeRuleRequiringMapping(resource)
                ? "AWS가 관리하거나 별도 실행 Role을 쓰는 EventBridge Rule은 자동으로 수정할 수 없어 보드에만 표시됩니다."
                : isEventBridgeTargetRequiringMapping(resource)
                  ? "EventBridge Target의 전달 설정이나 대상 연결을 안전하게 다시 만들 수 없어 보드에만 표시됩니다."
                  : resource.resourceType === "ROUTE_TABLE_ASSOCIATION"
                    ? "같은 스캔의 Subnet과 Route Table을 안전하게 연결할 수 없어 보드에만 표시됩니다."
                    : resource.resourceType === "ELASTIC_IP"
                      ? "EIP 연결 대상을 안전하게 확인할 수 없어 보드에만 표시됩니다."
                      : resource.resourceType === "NAT_GATEWAY"
                        ? "같은 스캔의 Subnet과 EIP를 안전하게 연결할 수 없어 보드에만 표시됩니다."
                        : resource.resourceType === "LOAD_BALANCER_TARGET_GROUP"
                          ? "같은 스캔의 관리 가능한 VPC와 정확히 하나의 ALB 연결을 확인할 수 없어 보드에만 표시됩니다."
                          : resource.resourceType === "LOAD_BALANCER_LISTENER"
                            ? "같은 스캔의 관리 가능한 ALB와 Target Group 연결을 확인할 수 없어 보드에만 표시됩니다."
                            : "아직 정식 지원하지 않는 Resource라 분석에서 제외됐습니다."
    }));
}

// gg: 안전하게 다시 만들 수 없는 Resource는 자동 import 대신 사용자 확인으로 돌립니다.
function createImportSuggestions(
  discoveredResources: DiscoveredResource[]
): ReverseEngineeringImportSuggestion[] {
  return discoveredResources.map((resource) => {
    if (isApiGatewayRestApiRequiringMapping(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason: createApiGatewayRestApiMappingReason(resource),
        handoffReady: false
      };
    }

    if (isCloudWatchLogGroupRequiringMapping(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason: createCloudWatchLogGroupMappingReason(resource),
        handoffReady: false
      };
    }

    if (isCloudWatchMetricAlarmRequiringMapping(resource)) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason: createCloudWatchMetricAlarmMappingReason(resource),
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
      SAME_SCAN_TERRAFORM_REFERENCE_RESOURCE_TYPES.has(resource.resourceType) &&
      createReverseEngineeringTerraformProjection(resource, discoveredResources).management !==
        "managed"
    ) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        reason: createSameScanReferenceReason(resource.resourceType),
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
  return resourceType === "ELASTIC_IP"
    ? "Terraform import에 필요한 EIP allocation ID가 없습니다."
    : resourceType === "NAT_GATEWAY"
      ? "Terraform import에 필요한 NAT Gateway ID가 없습니다."
      : resourceType === "ROUTE_TABLE_ASSOCIATION"
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

/** 같은 Scan의 의존성이 모자라면 임의로 추측하지 않고 함께 확인할 Resource를 안내한다. */
function createSameScanReferenceReason(resourceType: ResourceType): string {
  return resourceType === "ELASTIC_IP"
    ? "같은 스캔에서 EIP의 NAT 연결을 확인해야 안전하게 가져올 수 있습니다."
    : resourceType === "NAT_GATEWAY"
      ? "같은 스캔의 관리 가능한 Subnet과 모든 EIP를 먼저 확인해야 안전하게 가져올 수 있습니다."
      : resourceType === "LOAD_BALANCER_TARGET_GROUP"
        ? "같은 스캔의 관리 가능한 VPC와 정확히 하나의 ALB 연결을 먼저 확인해야 안전하게 가져올 수 있습니다."
        : resourceType === "LOAD_BALANCER_LISTENER"
          ? "같은 스캔의 관리 가능한 ALB와 Target Group 연결을 먼저 확인해야 안전하게 가져올 수 있습니다."
          : "같은 스캔의 관리 가능한 Subnet과 Route Table을 먼저 확인해야 안전하게 가져올 수 있습니다.";
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

function getStringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
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

  if (record.providerResourceType === "AWS::ApiGateway::RestApi") {
    return sanitizePublicApiGatewayRestApiConfig(publicConfig, record.config);
  }

  if (record.providerResourceType === "AWS::Logs::LogGroup") {
    return sanitizePublicCloudWatchLogGroupConfig(publicConfig, record.config);
  }

  if (record.providerResourceType === "AWS::CloudWatch::Alarm") {
    return sanitizePublicCloudWatchMetricAlarmConfig(publicConfig, record.config);
  }

  if (ELASTIC_LOAD_BALANCING_RESOURCE_TYPES.has(record.providerResourceType)) {
    return sanitizePublicListTagEvidence(publicConfig, record.config);
  }

  if (IAM_OWNERSHIP_RESOURCE_TYPES.has(record.providerResourceType)) {
    return sanitizePublicIamOwnershipConfig(publicConfig, record.config);
  }

  return publicConfig;
}

// gg: API policy와 tag 원문을 공개할 수 있을 때만 자동 관리에 필요한 완료 marker를 남깁니다.
function sanitizePublicApiGatewayRestApiConfig(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const configWithTagEvidence = sanitizePublicApiGatewayTagEvidence(publicConfig, sourceConfig);
  const { hasResourcePolicy: _publicPolicyMarker, ...configWithoutPolicyMarker } =
    configWithTagEvidence;
  const hasResourcePolicy =
    sourceConfig["hasResourcePolicy"] === true ||
    getNonEmptyString(sourceConfig["policy"]) !== null;

  if (hasResourcePolicy) {
    return { ...configWithoutPolicyMarker, hasResourcePolicy: true };
  }

  return sourceConfig["hasResourcePolicy"] === false
    ? { ...configWithoutPolicyMarker, hasResourcePolicy: false }
    : configWithoutPolicyMarker;
}

/** gg: API Gateway tag map 전체가 공개 안전한 문자열일 때만 완료 evidence로 인정합니다. */
function sanitizePublicApiGatewayTagEvidence(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const {
    tags: _publicTags,
    tagsReadComplete: _publicComplete,
    ...configWithoutTags
  } = publicConfig;
  const sourceTags = sourceConfig["tags"];
  if (sourceConfig["tagsReadComplete"] !== true || !isRecord(sourceTags)) {
    return { ...configWithoutTags, tagsReadComplete: false };
  }

  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourceTags)) {
    if (
      key.trim().length === 0 ||
      containsAwsArn(key) ||
      typeof value !== "string" ||
      containsAwsArn(value)
    ) {
      return { ...configWithoutTags, tagsReadComplete: false };
    }
    tags[key] = value;
  }

  return { ...configWithoutTags, tags, tagsReadComplete: true };
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

// gg: 상세 reader의 AWS 원본은 private scan에만 합쳐 정책·환경값·import ID가 공개 응답으로 새지 않게 합니다.
function createAwsStoredResourceConfig(
  record: Pick<AwsDiscoveredResourceRecord, "providerResourceType" | "config" | "serverOnly">,
  resultVisibility: "public" | "private"
): Record<string, unknown> {
  const publicConfig = createAwsPublicResourceConfig(record);
  if (resultVisibility !== "private") {
    return publicConfig;
  }

  const kmsKeyId =
    record.providerResourceType === "AWS::Logs::LogGroup"
      ? getNonEmptyString(record.config["kmsKeyId"])
      : null;
  const privateConfig = {
    ...publicConfig,
    ...(kmsKeyId ? { kmsKeyId } : {}),
    ...(record.serverOnly?.config ?? {}),
    ...(record.serverOnly?.terraformImportId
      ? { terraformImportId: record.serverOnly.terraformImportId }
      : {})
  };

  return privateConfig;
}

// gg: 공개 결과에는 KMS ARN 대신 암호화 연결 여부만 남겨 안전한 관리 경계를 전달합니다.
function sanitizePublicCloudWatchLogGroupConfig(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const configWithTagEvidence = sanitizePublicListTagEvidence(publicConfig, sourceConfig);
  const hasKmsKey =
    sourceConfig["hasKmsKey"] === true || getNonEmptyString(sourceConfig["kmsKeyId"]) !== null;

  return hasKmsKey ? { ...configWithTagEvidence, hasKmsKey: true } : configWithTagEvidence;
}

// gg: Action ARN과 metric query 원문은 숨기고 안전한 관리 경계 marker만 보드에 전달합니다.
function sanitizePublicCloudWatchMetricAlarmConfig(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const configWithTagEvidence = sanitizePublicListTagEvidence(publicConfig, sourceConfig);
  const hasActionTargets =
    sourceConfig["hasActionTargets"] === true ||
    ["alarmActions", "insufficientDataActions", "okActions"].some(
      (key) => Array.isArray(sourceConfig[key]) && sourceConfig[key].length > 0
    );
  const hasMetricQueries =
    sourceConfig["hasMetricQueries"] === true ||
    (Array.isArray(sourceConfig["metrics"]) && sourceConfig["metrics"].length > 0) ||
    getNonEmptyString(sourceConfig["thresholdMetricId"]) !== null;
  const hasUnprojectableDimensions =
    Array.isArray(sourceConfig["dimensions"]) &&
    sourceConfig["dimensions"].some((dimension) => {
      if (!isRecord(dimension)) {
        return true;
      }

      const name = dimension["Name"] ?? dimension["name"];
      const value = dimension["Value"] ?? dimension["value"];
      return (
        typeof name !== "string" ||
        name.trim().length === 0 ||
        containsAwsArn(name) ||
        typeof value !== "string" ||
        containsAwsArn(value)
      );
    });

  if (!hasActionTargets && !hasMetricQueries && !hasUnprojectableDimensions) {
    return configWithTagEvidence;
  }

  const alarmName = getNonEmptyString(configWithTagEvidence["alarmName"]);
  return {
    ...(alarmName ? { alarmName } : {}),
    ...(Array.isArray(configWithTagEvidence["tags"])
      ? { tags: configWithTagEvidence["tags"] }
      : {}),
    tagsReadComplete: configWithTagEvidence["tagsReadComplete"] === true,
    ...(hasActionTargets ? { hasActionTargets: true } : {}),
    ...(hasMetricQueries ? { hasMetricQueries: true } : {}),
    ...(hasUnprojectableDimensions ? { hasUnprojectableDimensions: true } : {})
  };
}

/** gg: list 형태 태그는 전부 공개 안전한 문자열일 때만 완료 evidence로 인정합니다. */
function sanitizePublicListTagEvidence(
  publicConfig: Record<string, unknown>,
  sourceConfig: Record<string, unknown>
): Record<string, unknown> {
  const {
    tags: _publicTags,
    tagsReadComplete: _publicComplete,
    ...configWithoutTags
  } = publicConfig;
  const sourceTags = sourceConfig["tags"];
  if (sourceConfig["tagsReadComplete"] !== true || !Array.isArray(sourceTags)) {
    return { ...configWithoutTags, tagsReadComplete: false };
  }

  const tags: Array<{ key: string; value: string }> = [];
  for (const candidate of sourceTags) {
    if (!isRecord(candidate)) {
      return { ...configWithoutTags, tagsReadComplete: false };
    }
    const key = candidate["key"] ?? candidate["Key"];
    const value = candidate["value"] ?? candidate["Value"];
    if (
      typeof key !== "string" ||
      key.trim().length === 0 ||
      containsAwsArn(key) ||
      typeof value !== "string" ||
      containsAwsArn(value)
    ) {
      return { ...configWithoutTags, tagsReadComplete: false };
    }
    tags.push({ key, value });
  }

  return { ...configWithoutTags, tags, tagsReadComplete: true };
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
