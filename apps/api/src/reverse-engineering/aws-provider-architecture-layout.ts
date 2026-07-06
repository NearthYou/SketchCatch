import type {
  ArchitectureJson,
  DiscoveredResource,
  ResourceEdge,
  ResourceNode
} from "@sketchcatch/types";

const BOARD_LAYOUT = {
  resourceGapX: 260,
  resourceGapY: 130,
  subnetGapX: 330,
  subnetGapY: 300,
  vpcGapX: 1120,
  vpcStartX: 120,
  vpcStartY: 120
} as const;

type ArchitectureNodeLayout = Pick<ResourceNode, "label" | "positionX" | "positionY">;
type LayoutAnchor = Readonly<{ x: number; y: number }>;
type LayoutVpcChildrenInput = {
  readonly layoutByResourceId: Map<string, ArchitectureNodeLayout>;
  readonly resources: readonly DiscoveredResource[];
  readonly resourcesById: ReadonlyMap<string, DiscoveredResource>;
  readonly vpc: DiscoveredResource;
  readonly vpcAnchor: LayoutAnchor;
};
type LayoutSubnetChildrenInput = LayoutVpcChildrenInput & {
  readonly subnet: DiscoveredResource;
  readonly subnetAnchor: LayoutAnchor;
};

// 지원하지 않는 UNKNOWN은 보드 중앙에 뿌리지 않고 확인 필요 목록에만 남깁니다.
export function createReverseEngineeringArchitectureJson(
  discoveredResources: readonly DiscoveredResource[]
): ArchitectureJson {
  const boardResources = discoveredResources.filter(isBoardResource);
  const boardResourceIds = new Set(boardResources.map((resource) => resource.id));
  const layoutByResourceId = createArchitectureLayout(boardResources);

  return {
    nodes: boardResources.map((resource, index) =>
      toResourceNode(resource, index, layoutByResourceId.get(resource.id))
    ),
    edges: boardResources.flatMap((resource) => toResourceEdges(resource, boardResourceIds))
  };
}

// AWS inventory를 사람이 읽는 Architecture Map 좌표와 이름으로 바꿉니다.
function createArchitectureLayout(resources: readonly DiscoveredResource[]): ReadonlyMap<string, ArchitectureNodeLayout> {
  const layoutByResourceId = new Map<string, ArchitectureNodeLayout>();
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const vpcs = resources.filter((resource) => resource.resourceType === "VPC");
  const independentResources: DiscoveredResource[] = [];

  for (const [vpcIndex, vpc] of vpcs.entries()) {
    const vpcAnchor = getVpcAnchor(vpcIndex);
    layoutByResourceId.set(vpc.id, {
      label: createResourceLabel(vpc),
      positionX: vpcAnchor.x,
      positionY: vpcAnchor.y
    });
    layoutVpcChildren({ layoutByResourceId, resources, resourcesById, vpc, vpcAnchor });
  }

  for (const resource of resources) {
    if (layoutByResourceId.has(resource.id)) {
      continue;
    }

    independentResources.push(resource);
  }

  for (const [index, resource] of independentResources.entries()) {
    layoutByResourceId.set(resource.id, {
      label: createResourceLabel(resource),
      positionX: BOARD_LAYOUT.vpcStartX + vpcs.length * BOARD_LAYOUT.vpcGapX + index * BOARD_LAYOUT.resourceGapX,
      positionY: BOARD_LAYOUT.vpcStartY
    });
  }

  return layoutByResourceId;
}

// VPC 안쪽에는 네트워크 구성요소, Subnet, 그 안의 서버/DB를 층으로 나눠 배치합니다.
function layoutVpcChildren(input: LayoutVpcChildrenInput): void {
  const vpcChildResources = input.resources.filter((resource) =>
    isVpcChildResource(resource, input.vpc, input.resourcesById)
  );
  const subnets = vpcChildResources.filter((resource) => resource.resourceType === "SUBNET");

  for (const [index, subnet] of subnets.entries()) {
    const subnetAnchor = getSubnetAnchor(input.vpcAnchor, index);
    input.layoutByResourceId.set(subnet.id, {
      label: createResourceLabel(subnet),
      positionX: subnetAnchor.x,
      positionY: subnetAnchor.y
    });
    layoutSubnetChildren({ ...input, subnet, subnetAnchor });
  }

  const networkResources = vpcChildResources.filter(
    (resource) => isVpcNetworkResource(resource) && !input.layoutByResourceId.has(resource.id)
  );

  for (const [index, resource] of networkResources.entries()) {
    input.layoutByResourceId.set(resource.id, {
      label: createResourceLabel(resource),
      positionX: input.vpcAnchor.x + 130 + index * BOARD_LAYOUT.resourceGapX,
      positionY: input.vpcAnchor.y + 120
    });
  }
}

// Subnet 안쪽에는 Security Group 경계와 실제 실행 리소스를 같이 읽히게 배치합니다.
function layoutSubnetChildren(input: LayoutSubnetChildrenInput): void {
  const allSubnetResources = input.resources.filter((resource) =>
    isSubnetChildResource(resource, input.subnet, input.resourcesById)
  );
  const protectedResources = allSubnetResources.filter((resource) => !input.layoutByResourceId.has(resource.id));
  const securityGroups = input.resources.filter(
    (resource) => protectsSubnetResource(resource, allSubnetResources) && !input.layoutByResourceId.has(resource.id)
  );

  for (const [index, securityGroup] of securityGroups.entries()) {
    input.layoutByResourceId.set(securityGroup.id, {
      label: createResourceLabel(securityGroup),
      positionX: input.subnetAnchor.x + 70 + index * BOARD_LAYOUT.resourceGapX,
      positionY: input.subnetAnchor.y + 95
    });
  }

  for (const [index, resource] of protectedResources.entries()) {
    input.layoutByResourceId.set(resource.id, {
      label: createResourceLabel(resource),
      positionX: input.subnetAnchor.x + 150 + (index % 2) * BOARD_LAYOUT.resourceGapX,
      positionY: input.subnetAnchor.y + 190 + Math.floor(index / 2) * BOARD_LAYOUT.resourceGapY
    });
  }
}

// ResourceNode는 읽기 좋은 label과 계산된 좌표를 포함한 보드 후보입니다.
function toResourceNode(
  resource: DiscoveredResource,
  index: number,
  layout: ArchitectureNodeLayout | undefined
): ResourceNode {
  return {
    id: resource.id,
    type: resource.resourceType,
    label: layout?.label ?? createResourceLabel(resource),
    positionX: layout?.positionX ?? 120 + (index % 3) * 280,
    positionY: layout?.positionY ?? 120 + Math.floor(index / 3) * 180,
    config: {
      ...resource.config,
      providerResourceType: resource.providerResourceType,
      providerResourceId: resource.providerResourceId,
      analysisExcluded: resource.analysisExcluded ?? false
    }
  };
}

// 보드에 없는 UNKNOWN 리소스로 향하는 끊어진 선은 만들지 않습니다.
function toResourceEdges(resource: DiscoveredResource, boardResourceIds: ReadonlySet<string>): ResourceEdge[] {
  return (resource.relationships ?? [])
    .filter((relationship) => boardResourceIds.has(relationship.targetResourceId))
    .map((relationship) => ({
      id: `edge-${resource.id}-${relationship.targetResourceId}-${relationship.label ?? relationship.type}`,
      sourceId: relationship.targetResourceId,
      targetId: resource.id,
      label: relationship.label ?? relationship.type
    }));
}

// UNKNOWN은 발견 결과에는 남기지만, 자동 설계도 노드로는 올리지 않습니다.
function isBoardResource(resource: DiscoveredResource): boolean {
  return resource.resourceType !== "UNKNOWN";
}

// VPC 바로 아래에 보여줄 네트워크 구성요소를 고릅니다.
function isVpcNetworkResource(resource: DiscoveredResource): boolean {
  return (
    resource.resourceType === "INTERNET_GATEWAY" ||
    resource.resourceType === "ROUTE_TABLE" ||
    resource.resourceType === "ROUTE_TABLE_ASSOCIATION" ||
    resource.resourceType === "SECURITY_GROUP"
  );
}

// VPC ID를 직접 들고 있거나 VPC와 관계선이 있으면 그 VPC의 자식으로 봅니다.
function isVpcChildResource(
  resource: DiscoveredResource,
  vpc: DiscoveredResource,
  resourcesById: ReadonlyMap<string, DiscoveredResource>
): boolean {
  if (resource.id === vpc.id) {
    return false;
  }

  if (referencesResource(resource, vpc)) {
    return true;
  }

  const parentResource = findContainingResource(resource, resourcesById);
  return parentResource ? referencesResource(parentResource, vpc) : false;
}

// Subnet 안에 들어갈 실행 리소스를 고릅니다.
function isSubnetChildResource(
  resource: DiscoveredResource,
  subnet: DiscoveredResource,
  resourcesById: ReadonlyMap<string, DiscoveredResource>
): boolean {
  if (resource.id === subnet.id || resource.resourceType === "SECURITY_GROUP") {
    return false;
  }

  if (referencesResource(resource, subnet)) {
    return true;
  }

  return findContainingResource(resource, resourcesById)?.id === subnet.id;
}

// Security Group은 그 그룹을 쓰는 서버/DB가 있는 Subnet 근처에 배치합니다.
function protectsSubnetResource(
  securityGroup: DiscoveredResource,
  subnetResources: readonly DiscoveredResource[]
): boolean {
  return (
    securityGroup.resourceType === "SECURITY_GROUP" &&
    subnetResources.some((resource) => referencesResource(resource, securityGroup))
  );
}

// contains 관계를 따라가서 상위 박스 후보를 찾습니다.
function findContainingResource(
  resource: DiscoveredResource,
  resourcesById: ReadonlyMap<string, DiscoveredResource>
): DiscoveredResource | undefined {
  const parentResourceId = resource.relationships?.find((relationship) => relationship.type === "contains")
    ?.targetResourceId;

  return parentResourceId ? resourcesById.get(parentResourceId) : undefined;
}

// 관계선과 config 값 둘 다 확인해서 원본 AWS ID와 내부 node ID를 함께 맞춥니다.
function referencesResource(resource: DiscoveredResource, target: DiscoveredResource): boolean {
  return (
    resource.relationships?.some((relationship) => relationship.targetResourceId === target.id) === true ||
    Object.values(resource.config).some((value) => referencesResourceIdValue(value, target))
  );
}

// config 값은 문자열, 배열, nested object로 올 수 있어서 안쪽까지 확인합니다.
function referencesResourceIdValue(value: unknown, target: DiscoveredResource): boolean {
  if (typeof value === "string") {
    return value === target.id || value === target.providerResourceId;
  }

  if (Array.isArray(value)) {
    return value.some((item) => referencesResourceIdValue(item, target));
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) => referencesResourceIdValue(item, target));
  }

  return false;
}

// AWS SDK 응답 객체처럼 key-value 형태인 값만 재귀 탐색합니다.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// VPC별 시작 위치를 고정해서 여러 VPC가 겹치지 않게 합니다.
function getVpcAnchor(index: number): LayoutAnchor {
  return { x: BOARD_LAYOUT.vpcStartX + index * BOARD_LAYOUT.vpcGapX, y: BOARD_LAYOUT.vpcStartY };
}

// Subnet은 VPC 안에서 격자로 배치해서 같은 Subnet처럼 보이지 않게 합니다.
function getSubnetAnchor(vpcAnchor: LayoutAnchor, index: number): LayoutAnchor {
  return { x: vpcAnchor.x + 90 + (index % 2) * BOARD_LAYOUT.subnetGapX, y: vpcAnchor.y + 310 + Math.floor(index / 2) * BOARD_LAYOUT.subnetGapY };
}

// 보드 라벨은 원본 ID만 보여주지 않고 역할, AZ, CIDR을 같이 보여줍니다.
function createResourceLabel(resource: DiscoveredResource): string {
  if (resource.resourceType === "SUBNET") {
    return createSubnetLabel(resource);
  }

  return resource.displayName;
}

// Subnet은 public/private, AZ, CIDR이 보여야 여러 개가 있어도 구분됩니다.
function createSubnetLabel(resource: DiscoveredResource): string {
  const publicIpOnLaunch = getBooleanConfig(resource, "mapPublicIpOnLaunch");
  const accessLabel = publicIpOnLaunch === undefined ? "Subnet" : publicIpOnLaunch ? "Public Subnet" : "Private Subnet";

  return [accessLabel, getStringConfig(resource, "availabilityZone"), getStringConfig(resource, "cidrBlock")]
    .filter((item): item is string => item !== undefined)
    .join(" · ");
}

// AWS config에서 문자열로 온 값을 라벨 재료로 꺼냅니다.
function getStringConfig(resource: DiscoveredResource, key: string): string | undefined {
  const value = resource.config[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

// AWS config에서 boolean으로 온 값을 Subnet 성격 판단에 사용합니다.
function getBooleanConfig(resource: DiscoveredResource, key: string): boolean | undefined {
  const value = resource.config[key];

  return typeof value === "boolean" ? value : undefined;
}
