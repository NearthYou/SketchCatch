import { getResourceDefinitionByTerraform } from "@sketchcatch/types/resource-definitions";
import type { CuratedModuleDefinition } from "./module-catalog";

export type ModuleCatalogPreviewResource = {
  readonly id: string;
  readonly label: string;
  readonly type: string;
};

export type ModuleCatalogPreviewRelationship = {
  readonly id: string;
  readonly label: string;
  readonly sourceLabel: string;
  readonly targetLabel: string;
};

export type ModuleCatalogPreviewInput = {
  readonly name: string;
  readonly type: string;
};

export type ModuleCatalogPreviewThumbnailNode = {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
};

export type ModuleCatalogPreviewThumbnailEdge = {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
};

export type ModuleCatalogPreview = {
  readonly resources: readonly ModuleCatalogPreviewResource[];
  readonly relationships: readonly ModuleCatalogPreviewRelationship[];
  readonly providers: readonly string[];
  readonly inputs: readonly ModuleCatalogPreviewInput[];
  /** Board Modules do not currently model Terraform output blocks. */
  readonly outputs: readonly string[];
  readonly version: string;
  readonly thumbnail: {
    readonly nodes: readonly ModuleCatalogPreviewThumbnailNode[];
    readonly edges: readonly ModuleCatalogPreviewThumbnailEdge[];
  };
};

/**
 * Produces only facts that the checked-in Board Module pattern owns. In particular, outputs stay
 * empty instead of inventing Terraform outputs from resource references.
 */
export function createModuleCatalogPreview(
  moduleDefinition: CuratedModuleDefinition
): ModuleCatalogPreview {
  const resourceNodes = moduleDefinition.nodes.filter(({ kind }) => kind === "resource");
  const resourceById = new Map(resourceNodes.map((node) => [node.id, node]));
  const resources = resourceNodes.map((node) => ({
    id: node.id,
    label: node.label,
    type: getResourceType(node)
  }));
  const relationships = moduleDefinition.edges.flatMap((edge) => {
    const sourceNode = resourceById.get(edge.sourceNodeId);
    const targetNode = resourceById.get(edge.targetNodeId);

    if (!sourceNode || !targetNode) return [];

    return [{
      id: edge.id,
      label: edge.label?.trim() || "연결",
      sourceLabel: sourceNode.label,
      targetLabel: targetNode.label
    }];
  });
  const providers = [
    ...new Set(
      resourceNodes.flatMap((node) =>
        getProviderLabel(
          node.parameters?.terraformBlockType ?? "resource",
          getResourceType(node)
        )
      )
    )
  ].sort(compareText);

  return {
    resources,
    relationships,
    providers,
    inputs: moduleDefinition.variables.map(({ name, type }) => ({ name, type })),
    outputs: [],
    version: moduleDefinition.version,
    thumbnail: createThumbnail(resourceNodes, moduleDefinition.edges)
  };
}

function getResourceType(node: CuratedModuleDefinition["nodes"][number]): string {
  return node.parameters?.resourceType ?? node.type;
}

function getProviderLabel(
  blockType: "resource" | "data",
  resourceType: string
): string[] {
  const definition = getResourceDefinitionByTerraform(blockType, resourceType);
  if (definition) return [definition.provider.toUpperCase()];

  const normalizedResourceType = resourceType.replace(/^data\./u, "");
  const provider = normalizedResourceType.split("_", 1)[0];

  if (!provider) return [];
  return [provider === "aws" ? "AWS" : provider.toUpperCase()];
}

function createThumbnail(
  resourceNodes: readonly CuratedModuleDefinition["nodes"][number][],
  edges: readonly CuratedModuleDefinition["edges"][number][]
): ModuleCatalogPreview["thumbnail"] {
  if (resourceNodes.length === 0) return { nodes: [], edges: [] };

  const nodeCenters = resourceNodes.map((node) => ({
    id: node.id,
    label: node.label,
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  }));
  const minX = Math.min(...nodeCenters.map(({ x }) => x));
  const maxX = Math.max(...nodeCenters.map(({ x }) => x));
  const minY = Math.min(...nodeCenters.map(({ y }) => y));
  const maxY = Math.max(...nodeCenters.map(({ y }) => y));
  const nodeIds = new Set(nodeCenters.map(({ id }) => id));

  return {
    nodes: nodeCenters.map((node) => ({
      ...node,
      x: scaleThumbnailCoordinate(node.x, minX, maxX, 18, 202),
      y: scaleThumbnailCoordinate(node.y, minY, maxY, 18, 72)
    })),
    edges: edges.flatMap(({ id, sourceNodeId, targetNodeId }) =>
      nodeIds.has(sourceNodeId) && nodeIds.has(targetNodeId)
        ? [{ id, sourceNodeId, targetNodeId }]
        : []
    )
  };
}

function scaleThumbnailCoordinate(
  value: number,
  min: number,
  max: number,
  start: number,
  end: number
): number {
  if (min === max) return (start + end) / 2;
  return start + ((value - min) / (max - min)) * (end - start);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
