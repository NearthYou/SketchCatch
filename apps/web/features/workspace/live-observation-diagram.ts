import type { DiagramJson, DiagramNode, LiveObservationSnapshot } from "@sketchcatch/types";

const TRAFFIC_RESOURCE_TYPES = new Set([
  "aws_s3_object",
  "aws_lb",
  "aws_lb_listener",
  "aws_lb_target_group",
  "aws_ecs_service"
]);

export type LiveObservationDiagramNodeState = "active" | "inactive" | "launching" | "context";

export type LiveObservationDiagramNode = DiagramNode & {
  readonly observationState: LiveObservationDiagramNodeState;
};

export type LiveObservationDiagramModel = {
  readonly nodes: readonly LiveObservationDiagramNode[];
  readonly activeEdgeIds: ReadonlySet<string>;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
};

export function createLiveObservationDiagramModel(
  diagram: DiagramJson,
  snapshot: LiveObservationSnapshot | null
): LiveObservationDiagramModel {
  const capacityNodes = diagram.nodes
    .filter((node) => node.metadata?.liveObservationRole === "capacity-unit")
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
  const runningCount = snapshot?.capacity.inServiceInstanceCount ?? 0;
  const desiredCount = snapshot?.capacity.desiredCapacity ?? runningCount;
  const capacityStateById = new Map(
    capacityNodes.map((node, index) => [
      node.id,
      index < runningCount ? "active" : index < desiredCount ? "launching" : "inactive"
    ] as const)
  );
  const trafficNodeIds = new Set(
    diagram.nodes
      .filter(
        (node) =>
          isTrafficNode(node) ||
          (node.metadata?.liveObservationRole === "capacity-unit" &&
            capacityStateById.get(node.id) !== "inactive")
      )
      .map((node) => node.id)
  );
  const activeEdgeIds = new Set(
    diagram.edges
      .filter((edge) => trafficNodeIds.has(edge.sourceNodeId) && trafficNodeIds.has(edge.targetNodeId))
      .map((edge) => edge.id)
  );

  return {
    nodes: diagram.nodes.map((node) => ({
      ...node,
      observationState:
        capacityStateById.get(node.id) ?? (isTrafficNode(node) ? "active" : "context")
    })),
    activeEdgeIds,
    bounds: getDiagramBounds(diagram.nodes)
  };
}

function isTrafficNode(node: DiagramNode): boolean {
  const resourceType = node.parameters?.resourceType ?? node.type;
  return TRAFFIC_RESOURCE_TYPES.has(resourceType);
}

function getDiagramBounds(nodes: readonly DiagramNode[]) {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.size.height));
  const padding = 24;

  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2)
  };
}
