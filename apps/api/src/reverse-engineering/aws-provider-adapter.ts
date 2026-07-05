import type {
  ArchitectureJson,
  CloudProvider,
  DiscoveredResource,
  DiscoveredResourceRelationship,
  ResourceEdge,
  ResourceNode,
  ResourceType,
  ReverseEngineeringAnalysisExclusion,
  ReverseEngineeringScanError,
  ReverseEngineeringScanResult
} from "@sketchcatch/types";

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

export type AwsProviderScanGateway = {
  discoverResources(input: AwsProviderScanInput): Promise<AwsDiscoveredResourceRecord[]>;
};

export type AwsProviderAdapter = {
  scan(input: AwsProviderScanInput): Promise<ReverseEngineeringScanResult>;
};

const awsResourceTypeMap: ReadonlyMap<string, ResourceType> = new Map([
  ["AWS::EC2::VPC", "VPC"],
  ["AWS::EC2::Subnet", "SUBNET"],
  ["AWS::EC2::SecurityGroup", "SECURITY_GROUP"],
  ["AWS::EC2::Instance", "EC2"],
  ["AWS::RDS::DBInstance", "RDS"],
  ["AWS::S3::Bucket", "S3"]
]);

// Provider Adapter의 공개 진입점입니다. AWS 원본 목록을 보드 설계도와 분석 재료로 바꿉니다.
export function createAwsProviderAdapter(gateway: AwsProviderScanGateway): AwsProviderAdapter {
  return {
    async scan(input) {
      const records = await gateway.discoverResources(input);
      const idMap = createResourceIdMap(records);
      const discoveredResources = records.map((record) => toDiscoveredResource(record, idMap));
      const architectureJson = toArchitectureJson(discoveredResources);

      return {
        scan: createEmptyScan(input),
        discoveredResources,
        architectureJson,
        findings: [],
        analysisExclusions: createAnalysisExclusions(discoveredResources),
        importSuggestions: [],
        scanErrors: [] satisfies ReverseEngineeringScanError[]
      };
    }
  };
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

function createNodeId(record: AwsDiscoveredResourceRecord): string {
  return `resource-${sanitizeIdPart(record.providerResourceId)}`;
}

// AWS ARN처럼 긴 ID를 보드 node id에 넣을 수 있는 안전한 문자열로 정리합니다.
function sanitizeIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
