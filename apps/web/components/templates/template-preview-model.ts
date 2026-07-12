import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "../../features/diagram-editor/area-nodes";
import { isRenderableDiagramNode } from "../../features/diagram-editor/diagram-node-visibility";

const MAX_VISIBLE_NODES = 8;
const VIEWBOX_HEIGHT = 60;
const VIEWBOX_WIDTH = 100;
const VIEWBOX_PADDING = 5;
const RESOURCE_TILE_SIZE = 8;

export type TemplatePreviewNode = {
  readonly id: string;
  readonly iconUrl?: string | undefined;
  readonly isArea: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type TemplatePreviewEdge = {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
};

export type TemplatePreviewModel = {
  readonly nodes: readonly TemplatePreviewNode[];
  readonly edges: readonly TemplatePreviewEdge[];
  readonly omittedNodeCount: number;
};

type DiagramBounds = {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
};

// Template board data can contain many Terraform helper nodes. This model keeps the preview compact
// while retaining the placement and catalog icon data of the nodes that remain visible.
export function createTemplatePreviewModel(diagramJson: DiagramJson): TemplatePreviewModel {
  const renderableNodes = diagramJson.nodes.filter(isRenderableDiagramNode);
  const selectedNodes = selectPreviewNodes(renderableNodes, diagramJson);
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const bounds = getDiagramBounds(selectedNodes);

  return {
    nodes: selectedNodes.map((node) => projectPreviewNode(node, bounds)),
    edges: diagramJson.edges
      .filter(
        (edge) => selectedNodeIds.has(edge.sourceNodeId) && selectedNodeIds.has(edge.targetNodeId)
      )
      .map(({ id, sourceNodeId, targetNodeId }) => ({ id, sourceNodeId, targetNodeId })),
    omittedNodeCount: Math.max(0, diagramJson.nodes.length - selectedNodes.length)
  };
}

function selectPreviewNodes(
  renderableNodes: readonly DiagramNode[],
  diagramJson: DiagramJson
): DiagramNode[] {
  const areaNodes = renderableNodes.filter(isAreaNode);
  const selectedAreaNodes = areaNodes.slice(0, MAX_VISIBLE_NODES);
  const resourceSlots = MAX_VISIBLE_NODES - selectedAreaNodes.length;

  if (resourceSlots <= 0) {
    return selectedAreaNodes;
  }

  const degreeByNodeId = getVisibleEdgeDegreeByNodeId(renderableNodes, diagramJson);
  const resourceNodes = renderableNodes
    .map((node, sourceIndex) => ({ node, sourceIndex }))
    .filter(({ node }) => !isAreaNode(node))
    .sort((left, right) => {
      const degreeDifference =
        (degreeByNodeId.get(right.node.id) ?? 0) - (degreeByNodeId.get(left.node.id) ?? 0);

      return degreeDifference !== 0 ? degreeDifference : left.sourceIndex - right.sourceIndex;
    })
    .slice(0, resourceSlots)
    .map(({ node }) => node);
  const selectedNodeIds = new Set([...selectedAreaNodes, ...resourceNodes].map((node) => node.id));

  return renderableNodes.filter((node) => selectedNodeIds.has(node.id));
}

function getVisibleEdgeDegreeByNodeId(
  renderableNodes: readonly DiagramNode[],
  diagramJson: DiagramJson
): ReadonlyMap<string, number> {
  const renderableNodeIds = new Set(renderableNodes.map((node) => node.id));
  const degreeByNodeId = new Map(renderableNodes.map((node) => [node.id, 0]));

  for (const edge of diagramJson.edges) {
    if (!renderableNodeIds.has(edge.sourceNodeId) || !renderableNodeIds.has(edge.targetNodeId)) {
      continue;
    }

    degreeByNodeId.set(edge.sourceNodeId, (degreeByNodeId.get(edge.sourceNodeId) ?? 0) + 1);
    degreeByNodeId.set(edge.targetNodeId, (degreeByNodeId.get(edge.targetNodeId) ?? 0) + 1);
  }

  return degreeByNodeId;
}

function getDiagramBounds(nodes: readonly DiagramNode[]): DiagramBounds {
  if (nodes.length === 0) {
    return { height: 1, minX: 0, minY: 0, width: 1 };
  }

  const minX = Math.min(...nodes.map((node) => finiteNumber(node.position.x)));
  const minY = Math.min(...nodes.map((node) => finiteNumber(node.position.y)));
  const maxX = Math.max(...nodes.map((node) => finiteNumber(node.position.x) + nodeWidth(node)));
  const maxY = Math.max(...nodes.map((node) => finiteNumber(node.position.y) + nodeHeight(node)));

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function projectPreviewNode(node: DiagramNode, bounds: DiagramBounds): TemplatePreviewNode {
  const isArea = isAreaNode(node);

  if (isArea) {
    const x = projectX(finiteNumber(node.position.x), bounds);
    const y = projectY(finiteNumber(node.position.y), bounds);
    const right = projectX(finiteNumber(node.position.x) + nodeWidth(node), bounds);
    const bottom = projectY(finiteNumber(node.position.y) + nodeHeight(node), bounds);

    return {
      id: node.id,
      iconUrl: node.iconUrl,
      isArea: true,
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y)
    };
  }

  const centerX = projectX(finiteNumber(node.position.x) + nodeWidth(node) / 2, bounds);
  const centerY = projectY(finiteNumber(node.position.y) + nodeHeight(node) / 2, bounds);
  const width = Math.min(RESOURCE_TILE_SIZE, VIEWBOX_WIDTH - VIEWBOX_PADDING * 2);
  const height = Math.min(RESOURCE_TILE_SIZE, VIEWBOX_HEIGHT - VIEWBOX_PADDING * 2);

  return {
    id: node.id,
    iconUrl: node.iconUrl,
    isArea: false,
    x: clamp(centerX - width / 2, 0, VIEWBOX_WIDTH - width),
    y: clamp(centerY - height / 2, 0, VIEWBOX_HEIGHT - height),
    width,
    height
  };
}

function projectX(value: number, bounds: DiagramBounds): number {
  return clamp(
    VIEWBOX_PADDING + ((value - bounds.minX) / bounds.width) * (VIEWBOX_WIDTH - VIEWBOX_PADDING * 2),
    0,
    VIEWBOX_WIDTH
  );
}

function projectY(value: number, bounds: DiagramBounds): number {
  return clamp(
    VIEWBOX_PADDING + ((value - bounds.minY) / bounds.height) * (VIEWBOX_HEIGHT - VIEWBOX_PADDING * 2),
    0,
    VIEWBOX_HEIGHT
  );
}

function nodeWidth(node: DiagramNode): number {
  return Math.max(1, finiteNumber(node.size.width));
}

function nodeHeight(node: DiagramNode): number {
  return Math.max(1, finiteNumber(node.size.height));
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
