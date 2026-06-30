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
  subnet: "security-group",
  vpc: AREA_NODE_IDS.region
};
const RESOURCE_ITEMS_BY_TYPE = new Map<string, ResourceItem>(
  resourceCatalog.map((item) => [item.nodeDefaults.type, item])
);

// 서버+스토리지 Draft에만 Region/AZ 보조 영역을 더해 보드 포함관계를 읽기 좋게 만듭니다.
export function addServerStorageAreaNodes(nodes: readonly DiagramNode[]): DiagramNode[] {
  if (!isServerStorageDraftNodeSet(nodes)) {
    return [...nodes];
  }

  return [
    createDesignAreaNode({
      id: AREA_NODE_IDS.region,
      label: "Region",
      position: { x: 40, y: 70 },
      size: { width: 1160, height: 1080 },
      type: "design_region",
      zIndex: 0
    }),
    createDesignAreaNode({
      id: AREA_NODE_IDS.availabilityZone,
      label: "Availability Zone",
      metadata: { parentAreaNodeId: "vpc" },
      position: { x: 155, y: 430 },
      size: { width: 780, height: 620 },
      type: "design_az",
      zIndex: 2
    }),
    ...nodes.map(applyParentMetadata)
  ];
}

// 고정 MVP 템플릿에만 적용해 다른 Architecture Draft 좌표를 침범하지 않습니다.
function isServerStorageDraftNodeSet(nodes: readonly DiagramNode[]): boolean {
  const nodeIds = new Set(nodes.map((node) => node.id));

  return REQUIRED_RESOURCE_IDS.every((nodeId) => nodeIds.has(nodeId));
}

type DesignAreaInput = {
  readonly id: string;
  readonly label: string;
  readonly metadata?: DiagramNode["metadata"] | undefined;
  readonly position: DiagramNode["position"];
  readonly size: DiagramNode["size"];
  readonly type: string;
  readonly zIndex: number;
};

// 수동으로 놓은 design area와 같은 catalog 스타일을 재사용합니다.
function createDesignAreaNode(input: DesignAreaInput): DiagramNode {
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
    size: input.size
  };
}

// Terraform 참조 문자열보다 시각 계층을 우선해야 하는 노드에 부모 영역을 고정합니다.
function applyParentMetadata(node: DiagramNode): DiagramNode {
  const parentAreaNodeId = PARENT_BY_NODE_ID[node.id];

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
