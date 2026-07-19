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
  const resourceType = readNonEmptyString(node.config["terraformResourceType"]);
  const resourceName = readNonEmptyString(node.config["terraformResourceName"]);
  const fileName = readNonEmptyString(node.config["terraformFileName"]);
  const terraformBlockType = readTerraformBlockType(node.config["terraformBlockType"]);
  const hasSourceTerraformIdentity = resourceType !== undefined && resourceName !== undefined;

  return {
    id: node.id,
    type: resourceType ?? node.type,
    kind: "resource",
    position: { x: node.positionX, y: node.positionY },
    size: catalogItem ? { ...catalogItem.nodeDefaults.size } : { ...FALLBACK_NODE_SIZE },
    label: node.label ?? catalogItem?.nodeDefaults.label ?? node.id,
    ...(catalogItem?.iconUrl ? { iconUrl: catalogItem.iconUrl } : {}),
    locked: false,
    zIndex: index + 1,
    parameters: {
      ...(terraformBlockType ? { terraformBlockType } : {}),
      resourceType: resourceType ?? "",
      resourceName: resourceName ?? "",
      fileName: fileName ?? "",
      values: structuredClone(node.config),
      ...(!hasSourceTerraformIdentity ? { invalid: true } : {})
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
