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

const awsResourceTypeMap: ReadonlyMap<string, ResourceType> = new Map([
  ["AWS::EC2::VPC", "VPC"],
  ["AWS::EC2::Subnet", "SUBNET"],
  ["AWS::EC2::InternetGateway", "INTERNET_GATEWAY"],
  ["AWS::EC2::RouteTable", "ROUTE_TABLE"],
  ["AWS::EC2::SecurityGroup", "SECURITY_GROUP"],
  ["AWS::EC2::Instance", "EC2"],
  ["AWS::RDS::DBInstance", "RDS"],
  ["AWS::S3::Bucket", "S3"],
  ["AWS::ElasticLoadBalancingV2::LoadBalancer", "LOAD_BALANCER"],
  ["AWS::CloudFront::Distribution", "CLOUDFRONT"],
  ["AWS::ECS::Cluster", "ECS_CLUSTER"],
  ["AWS::ECS::Service", "ECS_SERVICE"],
  ["AWS::ECS::TaskDefinition", "ECS_TASK_DEFINITION"]
]);

const terraformResourceTypeMap: ReadonlyMap<ResourceType, string> = new Map([
  ["VPC", "aws_vpc"],
  ["SUBNET", "aws_subnet"],
  ["INTERNET_GATEWAY", "aws_internet_gateway"],
  ["ROUTE_TABLE", "aws_route_table"],
  ["SECURITY_GROUP", "aws_security_group"],
  ["EC2", "aws_instance"],
  ["RDS", "aws_db_instance"],
  ["S3", "aws_s3_bucket"],
  ["LOAD_BALANCER", "aws_lb"],
  ["CLOUDFRONT", "aws_cloudfront_distribution"],
  ["ECS_CLUSTER", "aws_ecs_cluster"],
  ["ECS_SERVICE", "aws_ecs_service"],
  ["ECS_TASK_DEFINITION", "aws_ecs_task_definition"]
]);
const REVERSE_ENGINEERING_PROMOTED_RESOURCE_TYPES = new Set<ResourceType>([
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
const PUBLIC_CONFIG_KEYS_BY_RESOURCE_TYPE = new Map<string, ReadonlySet<string>>([
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
  [
    "AWS::ECS::Cluster",
    new Set(["capacityProviders", "configuration", "name", "status"])
  ],
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
  ]
]);
const OMIT_PUBLIC_VALUE = Symbol("omit-public-value");

// Provider Adapter의 공개 진입점입니다. AWS 원본 목록을 보드 설계도와 분석 재료로 바꿉니다.
export function createAwsProviderAdapter(gateway: AwsProviderScanGateway): AwsProviderAdapter {
  return {
    async scan(input) {
      const discoveryResult = normalizeDiscoveryResult(await gateway.discoverResources(input));
      const scanErrors = sanitizeReverseEngineeringScanErrors(discoveryResult.scanErrors);
      const { coverage } = createReverseEngineeringPublicCoverage(scanErrors);
      const records = discoveryResult.records;
      const idMap = createResourceIdMap(records);
      const displayNameMap = createAwsResourceDisplayNameMap(records);
      const discoveredResources = records.map((record) =>
        toDiscoveredResource(
          record,
          idMap,
          createAwsPublicDisplayName(
            record,
            displayNameMap.get(record.providerResourceId) ?? record.displayName
          )
        )
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

function toDiscoveredResource(
  record: AwsDiscoveredResourceRecord,
  idMap: ReadonlyMap<string, string>,
  displayName: string
): DiscoveredResource {
  const resourceType = resolveAwsResourceType(record);
  const config = createAwsPublicResourceConfig(record);
  const baseResource: DiscoveredResource = {
    id: createNodeId(record),
    provider: "aws",
    providerResourceType: record.providerResourceType,
    providerResourceId: createAwsPublicProviderResourceId(record),
    region: record.region,
    displayName,
    resourceType,
    config,
    relationships: record.relationships.flatMap((relationship) =>
      toDiscoveredRelationship(relationship, idMap)
    )
  };

  if (resourceType !== "UNKNOWN") {
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

  return loadBalancerTypes.length > 0 && loadBalancerTypes.every((value) => value === "application");
}

function isNetworkLoadBalancerArn(providerResourceId: string): boolean {
  return /^arn:[^:]+:elasticloadbalancing:[^:]+:[^:]+:loadbalancer\/net\//.test(
    providerResourceId
  );
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

function createAnalysisExclusions(
  discoveredResources: DiscoveredResource[]
): ReverseEngineeringAnalysisExclusion[] {
  return discoveredResources
    .filter((resource) => resource.resourceType === "UNKNOWN")
    .map((resource) => ({
      id: `analysis-exclusion-${resource.id}`,
      resourceId: resource.id,
      reason: "unsupported_resource_type",
      message: "아직 정식 지원하지 않는 Resource라 분석에서 제외됐습니다."
    }));
}

function createImportSuggestions(
  discoveredResources: DiscoveredResource[]
): ReverseEngineeringImportSuggestion[] {
  return discoveredResources.map((resource) => {
    const terraformResourceType = terraformResourceTypeMap.get(resource.resourceType);

    if (!terraformResourceType) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "unsupported_resource_type",
        reason: "아직 정식 ResourceType으로 매핑되지 않았습니다.",
        handoffReady: false
      };
    }

    const terraformResourceName = createTerraformResourceName(resource.providerResourceId);
    const terraformAddress = `${terraformResourceType}.${terraformResourceName}`;
    const terraformBlockDraft = `resource "${terraformResourceType}" "${terraformResourceName}" {}`;
    const importId = getStableTerraformImportId(resource);
    const missingTerraformFields = getMissingTerraformCreationFields(
      resource.resourceType,
      resource.config
    );

    if (!importId) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        terraformAddress,
        terraformBlockDraft,
        reason:
          missingTerraformFields.length > 0
            ? `${createMissingImportIdReason(resource.resourceType)} 새 Terraform 생성에는 ${missingTerraformFields.join(", ")} 값이 필요합니다.`
            : createMissingImportIdReason(resource.resourceType),
        handoffReady: false
      };
    }

    if (missingTerraformFields.length > 0) {
      return {
        id: `import-${resource.id}`,
        resourceId: resource.id,
        status: "manual_review",
        terraformAddress,
        importCommand: `terraform import ${terraformAddress} ${importId}`,
        reason: `Terraform 생성과 배포에 필요한 ${missingTerraformFields.join(", ")} 값이 없습니다.`,
        handoffReady: false
      };
    }

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

function getStableTerraformImportId(resource: DiscoveredResource): string | null {
  if (resource.resourceType === "CLOUDFRONT") {
    return getNonEmptyString(resource.config["id"]);
  }

  if (resource.resourceType === "LOAD_BALANCER") {
    const providerResourceId = resource.providerResourceId.trim();

    return isApplicationLoadBalancerArn(providerResourceId) ? providerResourceId : null;
  }

  if (resource.resourceType === "ECS_CLUSTER") {
    const providerResourceId = resource.providerResourceId.trim();

    return isEcsClusterArn(providerResourceId) ? providerResourceId : null;
  }

  if (resource.resourceType === "ECS_SERVICE") {
    return getEcsServiceImportId(resource);
  }

  if (resource.resourceType === "ECS_TASK_DEFINITION") {
    const providerResourceId = resource.providerResourceId.trim();

    return isEcsTaskDefinitionArn(providerResourceId) ? providerResourceId : null;
  }

  if (/^aws-ref-[a-f0-9]{24}$/u.test(resource.providerResourceId)) {
    return null;
  }

  return getNonEmptyString(resource.providerResourceId);
}

function createMissingImportIdReason(resourceType: ResourceType): string {
  return resourceType === "CLOUDFRONT"
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

function isApplicationLoadBalancerArn(value: string): boolean {
  return /^arn:[^:]+:elasticloadbalancing:[^:]+:[^:]+:loadbalancer\/app\/.+/.test(value);
}

function isEcsClusterArn(value: string): boolean {
  return /^arn:[^:]+:ecs:[^:]+:\d{12}:cluster\/[A-Za-z0-9_-]+$/.test(value);
}

function isEcsTaskDefinitionArn(value: string): boolean {
  return /^arn:[^:]+:ecs:[^:]+:\d{12}:task-definition\/[A-Za-z0-9_-]+:\d+$/.test(value);
}

function getEcsServiceImportId(resource: DiscoveredResource): string | null {
  const serviceArnMatch = /^arn:[^:]+:ecs:[^:]+:\d{12}:service\/([^/]+)(?:\/([^/]+))?$/.exec(
    resource.providerResourceId.trim()
  );
  const clusterArnMatch = /^arn:[^:]+:ecs:[^:]+:\d{12}:cluster\/([^/]+)$/.exec(
    getNonEmptyString(resource.config["clusterArn"]) ?? ""
  );
  const clusterName =
    getValidEcsName(resource.config["clusterName"]) ??
    getValidEcsName(clusterArnMatch?.[1]) ??
    getValidEcsName(serviceArnMatch?.[2] ? serviceArnMatch[1] : undefined);
  const serviceName =
    getValidEcsName(resource.config["name"]) ??
    getValidEcsName(serviceArnMatch?.[2] ?? serviceArnMatch?.[1]);

  return clusterName && serviceName ? `${clusterName}/${serviceName}` : null;
}

function getValidEcsName(value: unknown): string | null {
  const name = getNonEmptyString(value);

  return name && /^[A-Za-z0-9_-]+$/.test(name) ? name : null;
}

function createTerraformCreationValidationFindings(
  discoveredResources: DiscoveredResource[]
): CheckFinding[] {
  return discoveredResources.flatMap((resource) => {
    if (!REVERSE_ENGINEERING_PROMOTED_RESOURCE_TYPES.has(resource.resourceType)) {
      return [];
    }

    const missingFields = getMissingTerraformCreationFields(
      resource.resourceType,
      resource.config
    );
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

function getMissingTerraformCreationFields(
  resourceType: ResourceType,
  config: Record<string, unknown>
): string[] {
  if (resourceType === "LOAD_BALANCER") {
    return [
      ...(getNonEmptyString(config["name"]) ? [] : ["name"]),
      ...(
        getNonEmptyString(config["loadBalancerType"]) ?? getNonEmptyString(config["type"])
          ? []
          : ["type"]
      ),
      ...(getNonEmptyString(config["scheme"]) ? [] : ["scheme"]),
      ...(hasLoadBalancerSubnetPlacement(config) ? [] : ["subnetIds/subnetMapping"]),
      ...(hasSupportedLoadBalancerIpAddressType(config["ipAddressType"])
        ? []
        : ["ipAddressType"])
    ];
  }

  if (resourceType === "CLOUDFRONT") {
    const hasVpcOrigin = hasCloudFrontVpcOrigin(config["origin"]);

    return [
      ...(typeof config["enabled"] === "boolean" ? [] : ["enabled"]),
      ...(hasCloudFrontOrigin(config["origin"])
        ? []
        : [hasVpcOrigin ? "origin.vpcOriginConfig" : "origin"]),
      ...(hasCloudFrontDefaultCacheBehavior(config["defaultCacheBehavior"])
        ? []
        : ["defaultCacheBehavior"]),
      ...(hasGeoRestriction(config["restrictions"]) ? [] : ["restrictions"]),
      ...(hasCloudFrontViewerCertificate(config["viewerCertificate"])
        ? []
        : ["viewerCertificate"])
    ];
  }

  if (resourceType === "ECS_CLUSTER") {
    return getValidEcsName(config["name"]) ? [] : ["name"];
  }

  if (resourceType === "ECS_SERVICE") {
    return [
      ...(getValidEcsName(config["name"]) ? [] : ["name"]),
      ...(getNonEmptyString(config["clusterArn"]) ? [] : ["clusterArn"]),
      ...(getNonEmptyString(config["taskDefinitionArn"]) ? [] : ["taskDefinitionArn"]),
      ...(isNonNegativeNumber(config["desiredCount"]) ? [] : ["desiredCount"]),
      ...(
        getNonEmptyString(config["launchType"]) ||
        hasEcsCapacityProviderStrategy(config["capacityProviderStrategy"])
          ? []
          : ["launchType/capacityProviderStrategy"]
      ),
      ...(hasEcsNetworkConfiguration(config["networkConfiguration"])
        ? []
        : ["networkConfiguration"]),
      ...getMissingEcsServiceLoadBalancerFields(config["loadBalancers"])
    ];
  }

  if (resourceType === "ECS_TASK_DEFINITION") {
    return [
      ...(getValidEcsName(config["family"]) ? [] : ["family"]),
      ...(hasEcsContainerDefinitions(config["containerDefinitions"])
        ? []
        : ["containerDefinitions"]),
      ...(getNonEmptyString(config["networkMode"]) ? [] : ["networkMode"]),
      ...(getStringArray(config["requiresCompatibilities"]).length > 0
        ? []
        : ["requiresCompatibilities"]),
      ...(getNonEmptyString(config["cpu"]) ? [] : ["cpu"]),
      ...(getNonEmptyString(config["memory"]) ? [] : ["memory"]),
      ...(config["requiresManualEnvironmentInput"] === true
        ? ["containerDefinitions.environment"]
        : [])
    ];
  }

  return [];
}

function hasEcsCapacityProviderStrategy(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => isRecord(item) && getValidEcsName(item["capacityProvider"]) !== null
    )
  );
}

function hasEcsNetworkConfiguration(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["awsvpcConfiguration"])) {
    return false;
  }

  return (
    getStringArray(value["awsvpcConfiguration"]["subnets"]).length > 0 &&
    getStringArray(value["awsvpcConfiguration"]["securityGroups"]).length > 0
  );
}

function getMissingEcsServiceLoadBalancerFields(value: unknown): string[] {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return [];
  }

  if (!Array.isArray(value) || !value.every(isRecord)) {
    return ["loadBalancers"];
  }

  const missingFields = new Set<string>();
  for (const loadBalancer of value) {
    const targetGroupArn = getNonEmptyString(loadBalancer["targetGroupArn"]);
    const loadBalancerName = getNonEmptyString(loadBalancer["loadBalancerName"]);

    if ((targetGroupArn === null) === (loadBalancerName === null)) {
      missingFields.add("loadBalancers.targetGroupArn/loadBalancerName");
    }
    if (getNonEmptyString(loadBalancer["containerName"]) === null) {
      missingFields.add("loadBalancers.containerName");
    }
    if (!isEcsContainerPort(loadBalancer["containerPort"])) {
      missingFields.add("loadBalancers.containerPort");
    }
  }

  return [...missingFields];
}

function isEcsContainerPort(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

function hasEcsContainerDefinitions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (container) =>
        isRecord(container) &&
        getValidEcsName(container["name"]) !== null &&
        getNonEmptyString(container["image"]) !== null
    )
  );
}

function isNonNegativeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasCloudFrontOrigin(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (origin) =>
        isRecord(origin) &&
        !hasCloudFrontVpcOriginConfig(origin) &&
        getNonEmptyString(origin["originId"]) !== null &&
        getNonEmptyString(origin["domainName"]) !== null
    )
  );
}

function hasCloudFrontVpcOrigin(value: unknown): boolean {
  return Array.isArray(value) && value.some(
    (origin) => isRecord(origin) && hasCloudFrontVpcOriginConfig(origin)
  );
}

function hasCloudFrontVpcOriginConfig(origin: Record<string, unknown>): boolean {
  return isRecord(origin["vpcOriginConfig"]) || isRecord(origin["VpcOriginConfig"]);
}

function hasLoadBalancerSubnetPlacement(config: Record<string, unknown>): boolean {
  if (getStringArray(config["subnetIds"]).length > 0) {
    return true;
  }

  return (
    Array.isArray(config["subnetMapping"]) &&
    config["subnetMapping"].length > 0 &&
    config["subnetMapping"].every(
      (mapping) => isRecord(mapping) && getNonEmptyString(mapping["subnetId"]) !== null
    )
  );
}

function hasSupportedLoadBalancerIpAddressType(value: unknown): boolean {
  return (
    value === "ipv4" ||
    value === "dualstack" ||
    value === "dualstack-without-public-ipv4"
  );
}

function hasCloudFrontDefaultCacheBehavior(value: unknown): boolean {
  return (
    isRecord(value) &&
    getNonEmptyString(value["targetOriginId"]) !== null &&
    getNonEmptyString(value["viewerProtocolPolicy"]) !== null &&
    getStringArray(value["allowedMethods"]).length > 0 &&
    getStringArray(value["cachedMethods"]).length > 0 &&
    (isRecord(value["forwardedValues"]) || getNonEmptyString(value["cachePolicyId"]) !== null)
  );
}

function hasGeoRestriction(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value["geoRestriction"]) &&
    getNonEmptyString(value["geoRestriction"]["restrictionType"]) !== null
  );
}

function hasCloudFrontViewerCertificate(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof value["cloudfrontDefaultCertificate"] === "boolean" ||
      getNonEmptyString(value["acmCertificateArn"]) !== null ||
      getNonEmptyString(value["iamCertificateId"]) !== null)
  );
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
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

  return record.providerResourceType === "AWS::ECS::TaskDefinition"
    ? sanitizePublicEcsTaskDefinitionConfig(publicConfig, record.config)
    : publicConfig;
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
    keys.flatMap((key) =>
      value[key] === undefined ? [] : [[key, value[key]]]
    )
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

function createTerraformResourceName(providerResourceId: string): string {
  const sanitizedName = sanitizeIdPart(providerResourceId).replaceAll("-", "_");

  return /^[a-z_]/.test(sanitizedName) ? sanitizedName : `res_${sanitizedName}`;
}

// AWS ARN처럼 긴 ID를 보드 node id에 넣을 수 있는 안전한 문자열로 정리합니다.
function sanitizeIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
