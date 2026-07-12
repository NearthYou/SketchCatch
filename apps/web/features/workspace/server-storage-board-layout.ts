import type { DiagramNode, ResourceDragPayload, ResourceItem } from "@sketchcatch/types";
import { createDiagramNodeFromPayload } from "../diagram-editor/diagram-utils";
import { resourceCatalog } from "../resource-settings/catalog";

const AREA_NODE_IDS = {
  availabilityZone: "server-storage-az",
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
  "security-group": AREA_NODE_IDS.availabilityZone,
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

  const nodeIds = new Set(nodes.map((node) => node.id));

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
    createAreaNode({
      id: AREA_NODE_IDS.availabilityZone,
      label: "Availability Zone",
      metadata: { parentAreaNodeId: vpcAreaNodeId },
      parameterValues: { awsAvailabilityZone: "ap-northeast-2a" },
      position: { x: 155, y: 430 },
      size: { width: 780, height: 620 },
      type: "aws_availability_zone",
      zIndex: 2
    }),
    ...nodes.map((node) => applyParentMetadata(node, nodeIds))
  ];
}

// VPC/Subnet/EC2가 함께 있는 Draft에만 적용해 다른 Architecture Draft 좌표를 침범하지 않습니다.
function isCloudRuntimeDraftNodeSet(nodes: readonly DiagramNode[]): boolean {
  if (nodes.some((node) => node.id === AREA_NODE_IDS.region || node.id === AREA_NODE_IDS.availabilityZone)) {
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
          values: {
            ...baseNode.parameters.values,
            ...(input.parameterValues ?? {})
          }
        }
      : undefined,
    size: input.size
  };
}

// Terraform 참조 문자열보다 시각 계층을 우선해야 하는 노드에 부모 영역을 고정합니다.
function applyParentMetadata(node: DiagramNode, nodeIds: ReadonlySet<string>): DiagramNode {
  const fixedParentAreaNodeId = PARENT_BY_NODE_ID[node.id];
  const parentAreaNodeId =
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
    return AREA_NODE_IDS.availabilityZone;
  }

  return undefined;
}

function getNodeResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
