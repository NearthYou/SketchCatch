import type { DiagramJson, DiagramNode, LiveObservationSnapshot } from "@sketchcatch/types";

const TRAFFIC_SOURCE_TYPES = new Set([
  "aws_apigatewayv2_api",
  "aws_api_gateway_rest_api",
  "aws_cloudfront_distribution",
  "aws_route53_record",
  "aws_s3_object",
  "sketchcatch_internet",
  "sketchcatch_user"
]);

const TRAFFIC_HOP_TYPES = new Set([
  "aws_api_gateway_deployment",
  "aws_api_gateway_integration",
  "aws_api_gateway_stage",
  "aws_apigatewayv2_integration",
  "aws_apigatewayv2_route",
  "aws_apigatewayv2_stage",
  "aws_autoscaling_group",
  "aws_ecs_service",
  "aws_instance",
  "aws_lambda_function",
  "aws_lb",
  "aws_lb_listener",
  "aws_lb_target_group"
]);

const SUPPORT_TYPE_PREFIXES = [
  "aws_appautoscaling_",
  "aws_cloudwatch_",
  "aws_iam_"
];

const SUPPORT_TYPES = new Set([
  "aws_ecs_cluster",
  "aws_ecs_task_definition",
  "aws_security_group",
  "aws_subnet",
  "aws_vpc"
]);
const MAX_PATH_CANDIDATES = 256;
const MAX_PATH_DEPTH = 64;

export type LiveObservationDiagramNodeState = "active" | "inactive" | "launching";
export type LiveObservationPresentationRole = "source" | "hop" | "controller";

export type LiveObservationPresentationStage = {
  readonly node: DiagramNode;
  readonly role: LiveObservationPresentationRole;
};

export type LiveObservationCapacityUnit = {
  readonly node: DiagramNode;
  readonly observationState: LiveObservationDiagramNodeState;
};

export type LiveObservationDiagramModel =
  | {
      readonly status: "ready";
      readonly stages: readonly LiveObservationPresentationStage[];
      readonly capacityUnits: readonly LiveObservationCapacityUnit[];
      readonly pressureLevel: LiveObservationSnapshot["live"]["pressureLevel"];
    }
  | {
      readonly status: "unavailable";
      readonly reason: "capacity-missing" | "path-missing";
    };

type PathCandidate = {
  readonly nodeIds: readonly string[];
  readonly score: number;
};

export function createLiveObservationDiagramModel(
  diagram: DiagramJson,
  snapshot: LiveObservationSnapshot | null
): LiveObservationDiagramModel {
  const capacityNodes = diagram.nodes.filter(
    (node) => node.metadata?.liveObservationRole === "capacity-unit"
  );

  if (capacityNodes.length === 0) {
    return { status: "unavailable", reason: "capacity-missing" };
  }

  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const predecessors = createPredecessorMap(diagram);
  const controllerIds = [...new Set(
    capacityNodes.flatMap((node) => predecessors.get(node.id) ?? [])
  )].sort();
  const pathCandidates = controllerIds.flatMap((controllerId) =>
    findSourcePaths(controllerId, predecessors, nodeById).map((nodeIds) => ({
      nodeIds,
      score: scorePath(nodeIds, nodeById)
    }))
  );
  const selectedPath = pathCandidates.sort(comparePathCandidates)[0];

  if (!selectedPath) {
    return { status: "unavailable", reason: "path-missing" };
  }

  const runningCount = snapshot?.capacity.inServiceInstanceCount ?? 0;
  const desiredCount = snapshot?.capacity.desiredCapacity ?? runningCount;
  const orderedCapacityNodes = [...capacityNodes].sort(compareCapacityNodes);

  return {
    status: "ready",
    stages: selectedPath.nodeIds.flatMap((nodeId, index, nodeIds) => {
      const node = nodeById.get(nodeId);
      if (!node) return [];

      return [{
        node,
        role: index === 0 ? "source" : index === nodeIds.length - 1 ? "controller" : "hop"
      } satisfies LiveObservationPresentationStage];
    }),
    capacityUnits: orderedCapacityNodes.map((node, index) => ({
      node,
      observationState:
        index < runningCount ? "active" : index < desiredCount ? "launching" : "inactive"
    })),
    pressureLevel: snapshot?.live.pressureLevel ?? "normal"
  };
}

function createPredecessorMap(diagram: DiagramJson): ReadonlyMap<string, readonly string[]> {
  const predecessors = new Map<string, string[]>();

  for (const edge of diagram.edges) {
    const current = predecessors.get(edge.targetNodeId) ?? [];
    current.push(edge.sourceNodeId);
    predecessors.set(edge.targetNodeId, current);
  }

  for (const values of predecessors.values()) {
    values.sort();
  }

  return predecessors;
}

function findSourcePaths(
  controllerId: string,
  predecessors: ReadonlyMap<string, readonly string[]>,
  nodeById: ReadonlyMap<string, DiagramNode>
): readonly (readonly string[])[] {
  const paths: string[][] = [];

  function visit(nodeId: string, reversedPath: readonly string[], visited: ReadonlySet<string>) {
    if (
      visited.has(nodeId) ||
      paths.length >= MAX_PATH_CANDIDATES ||
      reversedPath.length >= MAX_PATH_DEPTH
    ) return;
    const node = nodeById.get(nodeId);
    if (!node) return;

    const nextPath = [...reversedPath, nodeId];
    if (nextPath.length > 1 && isTrafficSource(node)) {
      paths.push([...nextPath].reverse());
      return;
    }

    const nextVisited = new Set(visited).add(nodeId);
    for (const predecessorId of predecessors.get(nodeId) ?? []) {
      visit(predecessorId, nextPath, nextVisited);
    }
  }

  visit(controllerId, [], new Set());
  return paths;
}

function scorePath(nodeIds: readonly string[], nodeById: ReadonlyMap<string, DiagramNode>): number {
  return nodeIds.reduce((score, nodeId, index) => {
    const node = nodeById.get(nodeId);
    if (!node) return score;
    const role = node.metadata?.liveObservationRole;
    const resourceType = getResourceType(node);

    if (role === "traffic-source") return score + (index === 0 ? 1_000 : 300);
    if (role === "traffic-hop") return score + 160;
    if (role === "capacity-controller") return score + 180;
    if (role === "support") return score - 500;
    if (TRAFFIC_SOURCE_TYPES.has(resourceType)) return score + (index === 0 ? 220 : 40);
    if (TRAFFIC_HOP_TYPES.has(resourceType)) return score + 80;
    if (isSupportType(resourceType)) return score - 90;
    return score - 10;
  }, nodeIds.length);
}

function comparePathCandidates(left: PathCandidate, right: PathCandidate): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.nodeIds.length !== right.nodeIds.length) return right.nodeIds.length - left.nodeIds.length;
  return left.nodeIds.join("\u0000").localeCompare(right.nodeIds.join("\u0000"));
}

function compareCapacityNodes(left: DiagramNode, right: DiagramNode): number {
  return left.position.x - right.position.x || left.position.y - right.position.y || left.id.localeCompare(right.id);
}

function isTrafficSource(node: DiagramNode): boolean {
  return node.metadata?.liveObservationRole === "traffic-source" ||
    TRAFFIC_SOURCE_TYPES.has(getResourceType(node));
}

function isSupportType(resourceType: string): boolean {
  return SUPPORT_TYPES.has(resourceType) ||
    SUPPORT_TYPE_PREFIXES.some((prefix) => resourceType.startsWith(prefix));
}

function getResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
