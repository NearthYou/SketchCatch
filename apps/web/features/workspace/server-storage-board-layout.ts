import type { DiagramNode, ResourceDragPayload, ResourceItem } from "@sketchcatch/types";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import { resourceCatalog } from "../resource-settings/catalog";

const AREA_NODE_IDS = {
  availabilityZone: "server-storage-az",
  availabilityZonePrefix: "server-storage-az-",
  region: "server-storage-region"
} as const;
const REQUIRED_RESOURCE_IDS = [
  "ami",
  "ec2-instance",
  "internet-gateway",
  "route-table",
  "route-table-association",
  "s3-bucket",
  "security-group",
  "subnet",
  "vpc"
] as const;
const PARENT_BY_NODE_ID: Readonly<Record<string, string>> = {
  ami: AREA_NODE_IDS.region,
  "ec2-instance": "subnet",
  "internet-gateway": "vpc",
  "route-table": "vpc",
  "route-table-association": "vpc",
  "s3-bucket": AREA_NODE_IDS.region,
  subnet: AREA_NODE_IDS.availabilityZone,
  vpc: AREA_NODE_IDS.region
};
const CLOUD_CONTAINER_RESOURCE_TYPES = new Set(["aws_vpc", "aws_subnet", "aws_instance"]);
const REGION_PARENT_RESOURCE_TYPES = new Set(["aws_ami", "aws_s3_bucket"]);
const AZ_PARENT_RESOURCE_TYPES = new Set(["aws_subnet"]);
const RESOURCE_ITEMS_BY_TYPE = createResourceItemsByType(resourceCatalog);

// EC2 런타임 Draft에 Region/AZ 보조 영역을 더해 보드 포함관계를 읽기 좋게 만듭니다.
export function addServerStorageAreaNodes(nodes: readonly DiagramNode[]): DiagramNode[] {
  if (!isCloudRuntimeDraftNodeSet(nodes)) {
    return [...nodes];
  }

  const vpcAreaNodeId = findFirstNodeIdByResourceType(nodes, "aws_vpc");

  if (!vpcAreaNodeId) {
    return [...nodes];
  }

  const availabilityZones = createAvailabilityZoneAreas(nodes, vpcAreaNodeId);
  const areaNodeIds = new Set(availabilityZones.map(({ node }) => node.id));
  const nodeIds = new Set([...nodes.map((node) => node.id), AREA_NODE_IDS.region, ...areaNodeIds]);
  const availabilityZoneParentBySubnetId = new Map(
    availabilityZones.flatMap(({ node, subnetIds }) =>
      subnetIds.map((subnetId) => [subnetId, node.id] as const)
    )
  );

  return [
    createAreaNode({
      id: AREA_NODE_IDS.region,
      label: "Region",
      parameterValues: { awsRegion: "ap-northeast-2" },
      position: { x: 40, y: 70 },
      size: { width: 1160, height: 1080 },
      type: "aws_region",
      zIndex: 0
    }),
    ...availabilityZones.map(({ node }) => node),
    ...nodes.map((node) =>
      applyParentMetadata(node, nodeIds, availabilityZoneParentBySubnetId)
    )
  ];
}

// VPC/Subnet/EC2가 함께 있는 Draft에만 적용해 다른 Architecture Draft 좌표를 침범하지 않습니다.
function isCloudRuntimeDraftNodeSet(nodes: readonly DiagramNode[]): boolean {
  if (
    nodes.some(
      (node) =>
        node.id === AREA_NODE_IDS.region ||
        node.id === AREA_NODE_IDS.availabilityZone ||
        node.id.startsWith(AREA_NODE_IDS.availabilityZonePrefix)
    )
  ) {
    return false;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));

  return (
    REQUIRED_RESOURCE_IDS.every((nodeId) => nodeIds.has(nodeId)) ||
    [...CLOUD_CONTAINER_RESOURCE_TYPES].every((resourceType) =>
      nodes.some((node) => getNodeResourceType(node) === resourceType)
    )
  );
}

type AvailabilityZoneArea = {
  readonly node: DiagramNode;
  readonly subnetIds: readonly string[];
};

function createAvailabilityZoneAreas(
  nodes: readonly DiagramNode[],
  vpcAreaNodeId: string
): AvailabilityZoneArea[] {
  const subnetNodes = nodes.filter((node) => getNodeResourceType(node) === "aws_subnet");
  const subnetNodesByZone = new Map<string, DiagramNode[]>();

  for (const subnetNode of subnetNodes) {
    const availabilityZone = getNodeAvailabilityZone(subnetNode) ?? "ap-northeast-2a";
    subnetNodesByZone.set(availabilityZone, [
      ...(subnetNodesByZone.get(availabilityZone) ?? []),
      subnetNode
    ]);
  }

  if (subnetNodesByZone.size === 0) {
    subnetNodesByZone.set("ap-northeast-2a", []);
  }

  const entries = [...subnetNodesByZone.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return entries.map(([availabilityZone, zoneSubnetNodes], index) => {
    const useLegacyId = entries.length === 1;
    const id = useLegacyId
      ? AREA_NODE_IDS.availabilityZone
      : `${AREA_NODE_IDS.availabilityZonePrefix}${toStableIdSegment(availabilityZone)}`;
    const minX = Math.min(...zoneSubnetNodes.map((node) => node.position.x), 155 + index * 580);
    const minY = Math.min(...zoneSubnetNodes.map((node) => node.position.y), 430);

    return {
      node: createAreaNode({
        id,
        label: `Availability Zone ${availabilityZone}`,
        metadata: { parentAreaNodeId: vpcAreaNodeId },
        parameterValues: { awsAvailabilityZone: availabilityZone },
        position: { x: Math.max(100, minX - 36), y: Math.max(360, minY - 36) },
        size: { width: 520, height: 700 },
        type: "aws_availability_zone",
        zIndex: 2
      }),
      subnetIds: zoneSubnetNodes.map((node) => node.id)
    };
  });
}

function getNodeAvailabilityZone(node: DiagramNode): string | undefined {
  const availabilityZone =
    node.parameters?.values["availabilityZone"] ??
    node.parameters?.values["awsAvailabilityZone"];

  return typeof availabilityZone === "string" && availabilityZone.trim().length > 0
    ? availabilityZone.trim()
    : undefined;
}

function toStableIdSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function findFirstNodeIdByResourceType(
  nodes: readonly DiagramNode[],
  resourceType: string
): string | undefined {
  return nodes.find((node) => getNodeResourceType(node) === resourceType)?.id;
}

type AreaNodeInput = {
  readonly id: string;
  readonly label: string;
  readonly metadata?: DiagramNode["metadata"] | undefined;
  readonly parameterValues?: Record<string, unknown> | undefined;
  readonly position: DiagramNode["position"];
  readonly size: DiagramNode["size"];
  readonly type: string;
  readonly zIndex: number;
};

// 수동으로 놓은 area node와 같은 catalog 스타일/기본 parameters를 재사용합니다.
function createAreaNode(input: AreaNodeInput): DiagramNode {
  const resourceItem = RESOURCE_ITEMS_BY_TYPE.get(input.type);

  if (!resourceItem) {
    return {
      id: input.id,
      kind: "design",
      label: input.label,
      locked: false,
      metadata: input.metadata,
      position: input.position,
      size: input.size,
      type: input.type,
      zIndex: input.zIndex
    };
  }

  const payload: ResourceDragPayload = {
    item: resourceItem,
    source: "resource-settings-panel"
  };
  const baseNode = createDiagramNodeFromPayload(payload, input.position, input.zIndex);

  return {
    ...baseNode,
    id: input.id,
    label: input.label,
    metadata: input.metadata,
    parameters: baseNode.parameters
      ? {
          ...baseNode.parameters,
          resourceName: createAreaResourceName(input.type, input.parameterValues),
          values: {
            ...baseNode.parameters.values,
            ...(input.parameterValues ?? {})
          }
        }
      : undefined,
    size: input.size
  };
}

function createAreaResourceName(
  resourceType: string,
  parameterValues: Record<string, unknown> | undefined
): string {
  if (resourceType === "aws_availability_zone") {
    const availabilityZone = parameterValues?.["awsAvailabilityZone"];

    if (typeof availabilityZone === "string" && availabilityZone.trim().length > 0) {
      return `az_${availabilityZone.replace(/[^a-z0-9]+/giu, "_").replace(/^_|_$/g, "")}`;
    }
  }

  if (resourceType === "aws_region") {
    const region = parameterValues?.["awsRegion"];

    if (typeof region === "string" && region.trim().length > 0) {
      return `region_${region.replace(/[^a-z0-9]+/giu, "_").replace(/^_|_$/g, "")}`;
    }
  }

  return resourceType.replace(/^aws_/, "");
}

// Terraform 참조 문자열보다 시각 계층을 우선해야 하는 노드에 부모 영역을 고정합니다.
function applyParentMetadata(
  node: DiagramNode,
  nodeIds: ReadonlySet<string>,
  availabilityZoneParentBySubnetId: ReadonlyMap<string, string>
): DiagramNode {
  const fixedParentAreaNodeId = PARENT_BY_NODE_ID[node.id];
  const parentAreaNodeId =
    availabilityZoneParentBySubnetId.get(node.id) ??
    getCloudContainerParentAreaNodeId(node) ??
    (fixedParentAreaNodeId && nodeIds.has(fixedParentAreaNodeId) ? fixedParentAreaNodeId : undefined);

  if (!parentAreaNodeId) {
    return node;
  }

  return {
    ...node,
    metadata: {
      ...node.metadata,
      parentAreaNodeId
    }
  };
}

function createResourceItemsByType(resources: readonly ResourceItem[]): Map<string, ResourceItem> {
  const resourcesByType = new Map<string, ResourceItem>();

  for (const resource of resources) {
    if (resourcesByType.has(resource.nodeDefaults.type)) {
      continue;
    }

    resourcesByType.set(resource.nodeDefaults.type, resource);
  }

  return resourcesByType;
}

function getCloudContainerParentAreaNodeId(node: DiagramNode): string | undefined {
  const resourceType = getNodeResourceType(node);

  if (resourceType === "aws_vpc" || REGION_PARENT_RESOURCE_TYPES.has(resourceType)) {
    return AREA_NODE_IDS.region;
  }

  if (AZ_PARENT_RESOURCE_TYPES.has(resourceType)) {
    return undefined;
  }

  return undefined;
}

function getNodeResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
