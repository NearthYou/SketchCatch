import type { DiagramEdge, DiagramJson, DiagramNode, DiagramPoint } from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";
import type { ArchitectureBoardKnowledgeCase } from "./architecture-board-knowledge-contract";

export function extractArchitectureBoardKnowledgeCase(
  id: string,
  diagram: DiagramJson
): ArchitectureBoardKnowledgeCase {
  const nodes = [...diagram.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const areas = nodes.filter(isAreaNode);
  const parentedNodes = nodes.filter((node) => node.metadata?.parentAreaNodeId !== undefined);
  const sortedX = nodes.map((node) => node.position.x).sort((left, right) => left - right);
  const sortedY = nodes.map((node) => node.position.y).sort((left, right) => left - right);
  const bounds = getDiagramBounds(nodes);
  const nodeArea = nodes.reduce(
    (total, node) => total + Math.max(0, node.size.width) * Math.max(0, node.size.height),
    0
  );
  const areaChildCounts = areas.map(
    (area) => parentedNodes.filter((node) => node.metadata?.parentAreaNodeId === area.id).length
  );
  const areaPaddings = parentedNodes.flatMap((node) => {
    const parent = node.metadata?.parentAreaNodeId
      ? nodeById.get(node.metadata.parentAreaNodeId)
      : undefined;
    return parent ? [minimumAreaPadding(parent, node)] : [];
  });
  const edgeLengths = diagram.edges.map((edge) => getEdgeLength(edge, nodeById));
  const horizontalEdges = diagram.edges.filter((edge) => isHorizontalFlow(edge, nodeById)).length;
  const supportNodes = nodes.filter(isSupportNode).length;

  return {
    id,
    nodeTypes: [...new Set(nodes.map((node) => node.type))].sort(),
    nodeCount: nodes.length,
    edgeCount: diagram.edges.length,
    areaCount: areas.length,
    parentedNodeCount: parentedNodes.length,
    maxContainmentDepth: Math.max(0, ...nodes.map((node) => getContainmentDepth(node, nodeById))),
    meanAreaChildDensity: round(mean(areaChildCounts)),
    meanAreaPadding: round(mean(areaPaddings)),
    meanSiblingGap: round(mean(toGaps(sortedX))),
    meanVerticalGap: round(mean(toGaps(sortedY))),
    meanNodeWidth: round(mean(nodes.map((node) => node.size.width))),
    meanNodeHeight: round(mean(nodes.map((node) => node.size.height))),
    meanAspectRatio: round(
      mean(nodes.map((node) => node.size.width / Math.max(1, node.size.height)))
    ),
    meanCaptionWidth: round(mean(nodes.map((node) => Math.max(1, node.label.length) * 7))),
    meanZIndex: round(mean(nodes.map((node) => node.zIndex))),
    meanEdgeLength: round(mean(edgeLengths)),
    meanEdgeWaypointCount: round(
      mean(diagram.edges.map((edge) => edge.route?.waypoints.length ?? 0))
    ),
    routedEdgeRatio: round(
      ratio(diagram.edges.filter((edge) => edge.route !== undefined).length, diagram.edges.length)
    ),
    horizontalFlowRatio: round(ratio(horizontalEdges, diagram.edges.length)),
    supportNodeRatio: round(ratio(supportNodes, nodes.length)),
    viewportAspectRatio: round(bounds.width / Math.max(1, bounds.height)),
    whitespaceRatio: round(clamp(1 - nodeArea / Math.max(1, bounds.width * bounds.height), 0, 1))
  };
}

function getContainmentDepth(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): number {
  let depth = 0;
  let parentId = node.metadata?.parentAreaNodeId;
  const visited = new Set<string>();

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
  }

  return depth;
}

function minimumAreaPadding(parent: DiagramNode, child: DiagramNode): number {
  return Math.max(
    0,
    Math.min(
      child.position.x - parent.position.x,
      child.position.y - parent.position.y,
      parent.position.x + parent.size.width - (child.position.x + child.size.width),
      parent.position.y + parent.size.height - (child.position.y + child.size.height)
    )
  );
}

function getEdgeLength(edge: DiagramEdge, nodeById: ReadonlyMap<string, DiagramNode>): number {
  const source = edge.route?.sourcePoint ?? centerOf(nodeById.get(edge.sourceNodeId));
  const target = edge.route?.targetPoint ?? centerOf(nodeById.get(edge.targetNodeId));
  if (!source || !target) return 0;
  const points = [source, ...(edge.route?.waypoints ?? []), target];
  return points
    .slice(1)
    .reduce((total, point, index) => total + distance(points[index]!, point), 0);
}

function isHorizontalFlow(edge: DiagramEdge, nodeById: ReadonlyMap<string, DiagramNode>): boolean {
  const source = centerOf(nodeById.get(edge.sourceNodeId));
  const target = centerOf(nodeById.get(edge.targetNodeId));
  return source !== null && target !== null
    ? Math.abs(target.x - source.x) >= Math.abs(target.y - source.y)
    : false;
}

function isSupportNode(node: DiagramNode): boolean {
  if (node.metadata?.liveObservationRole === "support") return true;
  return /iam|role|policy|log|cloudwatch|monitor|observ|ecr|secret|kms/i.test(
    `${node.type} ${node.parameters?.resourceType ?? ""}`
  );
}

function centerOf(node: DiagramNode | undefined): DiagramPoint | null {
  return node
    ? {
        x: node.position.x + node.size.width / 2,
        y: node.position.y + node.size.height / 2
      }
    : null;
}

function getDiagramBounds(nodes: readonly DiagramNode[]): { width: number; height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 };
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.size.height));
  return { width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function toGaps(values: readonly number[]): number[] {
  return values.slice(1).map((value, index) => Math.max(0, value - values[index]!));
}

function distance(left: DiagramPoint, right: DiagramPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
