import type {
  ArchitectureJson,
  CloudProvider,
  DiscoveredResource,
  DiscoveredResourceRelationship,
  ResourceEdge,
  ResourceNode,
  ResourceType,
  ReverseEngineeringAnalysisExclusion,
  ReverseEngineeringImportSuggestion,
  ReverseEngineeringScanError,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";
import { createReverseEngineeringFindings } from "./aws-reverse-engineering-findings.js";

export type AwsProviderScanInput = {
  provider: CloudProvider;
  region: string;
  resourceTypes: ResourceType[];
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
  ["AWS::S3::Bucket", "S3"]
]);

const terraformResourceTypeMap: ReadonlyMap<ResourceType, string> = new Map([
  ["VPC", "aws_vpc"],
  ["SUBNET", "aws_subnet"],
  ["INTERNET_GATEWAY", "aws_internet_gateway"],
  ["ROUTE_TABLE", "aws_route_table"],
  ["SECURITY_GROUP", "aws_security_group"],
  ["EC2", "aws_instance"],
  ["RDS", "aws_db_instance"],
  ["S3", "aws_s3_bucket"]
]);

// Provider Adapter의 공개 진입점입니다. AWS 원본 목록을 보드 설계도와 분석 재료로 바꿉니다.
export function createAwsProviderAdapter(gateway: AwsProviderScanGateway): AwsProviderAdapter {
  return {
    async scan(input) {
      const discoveryResult = normalizeDiscoveryResult(await gateway.discoverResources(input));
      const records = discoveryResult.records;
      const idMap = createResourceIdMap(records);
      const discoveredResources = records.map((record) => toDiscoveredResource(record, idMap));
      const architectureJson = toArchitectureJson(discoveredResources);

      return {
        scan: createEmptyScan(input),
        discoveredResources,
        architectureJson,
        findings: createReverseEngineeringFindings(discoveredResources),
        analysisExclusions: createAnalysisExclusions(discoveredResources),
        importSuggestions: createImportSuggestions(discoveredResources),
        scanErrors: discoveryResult.scanErrors
      };
    }
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
  idMap: ReadonlyMap<string, string>
): DiscoveredResource {
  const resourceType = awsResourceTypeMap.get(record.providerResourceType) ?? "UNKNOWN";
  const baseResource: DiscoveredResource = {
    id: createNodeId(record),
    provider: "aws",
    providerResourceType: record.providerResourceType,
    providerResourceId: record.providerResourceId,
    region: record.region,
    displayName: record.displayName,
    resourceType,
    config: record.config,
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

function toArchitectureJson(discoveredResources: DiscoveredResource[]): ArchitectureJson {
  return {
    nodes: discoveredResources.map(toResourceNode),
    edges: discoveredResources.flatMap(toResourceEdges)
  };
}

function toResourceNode(resource: DiscoveredResource, index: number): ResourceNode {
  return {
    id: resource.id,
    type: resource.resourceType,
    label: resource.displayName,
    positionX: 120 + (index % 3) * 280,
    positionY: 120 + Math.floor(index / 3) * 180,
    config: {
      ...resource.config,
      providerResourceType: resource.providerResourceType,
      providerResourceId: resource.providerResourceId,
      analysisExcluded: resource.analysisExcluded ?? false
    }
  };
}

function toResourceEdges(resource: DiscoveredResource): ResourceEdge[] {
  return (resource.relationships ?? []).map((relationship) => ({
    id: `edge-${resource.id}-${relationship.targetResourceId}-${relationship.label ?? relationship.type}`,
    sourceId: relationship.targetResourceId,
    targetId: resource.id,
    label: relationship.label ?? relationship.type
  }));
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

    return {
      id: `import-${resource.id}`,
      resourceId: resource.id,
      status: "ready",
      terraformAddress,
      importCommand: `terraform import ${terraformAddress} ${resource.providerResourceId}`,
      terraformBlockDraft: `resource "${terraformResourceType}" "${terraformResourceName}" {}`,
      handoffReady: true
    };
  });
}

function createNodeId(record: AwsDiscoveredResourceRecord): string {
  return `resource-${sanitizeIdPart(record.providerResourceId)}`;
}

function createTerraformResourceName(providerResourceId: string): string {
  return sanitizeIdPart(providerResourceId).replaceAll("-", "_");
}

// AWS ARN처럼 긴 ID를 보드 node id에 넣을 수 있는 안전한 문자열로 정리합니다.
function sanitizeIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
