import type {
  ArchitectureJson,
  DiagramJson,
  DiagramNode,
  TerraformBlockType
} from "@sketchcatch/types";
import { getDefaultResourceDefinitionByResourceType } from "@sketchcatch/types/resource-definitions";
import { resourceCatalog } from "../resource-settings/catalog";

const FALLBACK_NODE_SIZE = { width: 48, height: 48 } as const;

/** gg: AWS 원본에 없는 Resource, 설정, 관계를 추론하지 않고 Board 표시 정보만 덧붙입니다. */
export function createSourceExactReverseEngineeringDiagram(
  architecture: ArchitectureJson
): DiagramJson {
  return {
    nodes: architecture.nodes.map(createSourceExactNode),
    edges: architecture.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceId,
      targetNodeId: edge.targetId,
      ...(edge.label === undefined ? {} : { label: edge.label })
    })),
    viewport: { x: 0, y: 0, zoom: 1 },
    presentation: {
      geometryPolicy: "source-exact",
      initialViewportPending: true
    }
  };
}

/** gg: Catalog은 아이콘과 카드 크기에만 사용하고 AWS config에는 기본값을 섞지 않습니다. */
function createSourceExactNode(
  node: ArchitectureJson["nodes"][number],
  index: number
): DiagramNode {
  const definition = getDefaultResourceDefinitionByResourceType(node.type);
  const catalogItem = definition
    ? resourceCatalog.find((candidate) => candidate.id === definition.id)
    : undefined;
  const resourceType = readNonEmptyString(node.config["terraformResourceType"])
    ?? definition?.terraform.resourceType
    ?? "unknown_resource";
  const terraformBlockType = readTerraformBlockType(node.config["terraformBlockType"])
    ?? definition?.terraform.blockType
    ?? "resource";

  return {
    id: node.id,
    type: resourceType,
    kind: "resource",
    position: { x: node.positionX, y: node.positionY },
    size: catalogItem ? { ...catalogItem.nodeDefaults.size } : { ...FALLBACK_NODE_SIZE },
    label: node.label ?? catalogItem?.nodeDefaults.label ?? node.id,
    ...(catalogItem?.iconUrl ? { iconUrl: catalogItem.iconUrl } : {}),
    locked: false,
    zIndex: index + 1,
    parameters: {
      terraformBlockType,
      resourceType,
      resourceName:
        readNonEmptyString(node.config["terraformResourceName"]) ?? createStableResourceName(node.id),
      fileName: readNonEmptyString(node.config["terraformFileName"]) ?? "main",
      values: structuredClone(node.config)
    }
  };
}

/** gg: source config에 명시된 Terraform block 종류만 신뢰합니다. */
function readTerraformBlockType(value: unknown): TerraformBlockType | undefined {
  return value === "resource" || value === "data" ? value : undefined;
}

/** gg: 공백뿐인 식별자는 원본 식별자로 취급하지 않습니다. */
function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** gg: Terraform 편집기에 필요한 이름만 안정적으로 만들고 source config는 바꾸지 않습니다. */
function createStableResourceName(nodeId: string): string {
  const normalized = nodeId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]/, "resource_$&");

  return normalized || "resource";
}
