import type {
  ArchitectureJson,
  DeploymentResourceObservationState,
  DiagramEdge,
  DiagramJson,
  LiveObservationProviderSnapshot,
  LiveObservationProviderState,
  LiveObservationV2Snapshot,
  ResourceType
} from "@sketchcatch/types";

import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";

export const OBSERVABLE_RESOURCE_TYPES: ReadonlySet<ResourceType> = new Set([
  "CLOUDFRONT",
  "S3",
  "LOAD_BALANCER",
  "LOAD_BALANCER_TARGET_GROUP",
  "ECS_CLUSTER",
  "ECS_SERVICE",
  "CLOUDWATCH_LOG_GROUP"
]);

export type LiveObservationArchitectureAggregateState =
  | "configured"
  | Exclude<DeploymentResourceObservationState, "not_supported">;

export type LiveObservationArchitectureResourceState =
  | "configured"
  | DeploymentResourceObservationState;

export type LiveObservationArchitectureResource = {
  readonly detailLines: readonly string[];
  readonly id: string;
  readonly label: string;
  readonly observable: boolean;
  readonly observationState: LiveObservationArchitectureResourceState;
  readonly resourceType: ResourceType;
};

export type LiveObservationArchitectureModel = {
  readonly aggregateObservationState: LiveObservationArchitectureAggregateState;
  readonly capacityModeLabel: "고정 용량" | "Auto Scaling" | null;
  readonly diagram: DiagramJson;
  readonly resources: readonly LiveObservationArchitectureResource[];
};

export type LiveObservationCapacityModeLabel = "고정 용량" | "Auto Scaling";

export function createLiveObservationArchitectureModel(
  architecture: ArchitectureJson,
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationArchitectureModel {
  const convertedDiagram = convertArchitectureJsonToDiagramJson(architecture);
  const diagram = preserveDeployedArchitectureGraph(architecture, convertedDiagram);
  const aggregateObservationState = getAggregateObservationState(snapshot);
  const hasEcsCapacity = architecture.nodes.some(
    (node) => node.type === "ECS_CLUSTER" || node.type === "ECS_SERVICE"
  );
  const providerCapacity = snapshot?.latestObservation?.payload.capacity;
  const scalingDetailLinesByResourceId = getServiceAutoScalingDetailLines(architecture);

  return {
    aggregateObservationState,
    capacityModeLabel: hasEcsCapacity
      ? getLiveObservationCapacityMode(architecture, providerCapacity)
      : null,
    diagram,
    resources: architecture.nodes.map((node) => {
      const observable = OBSERVABLE_RESOURCE_TYPES.has(node.type);

      return {
        detailLines: scalingDetailLinesByResourceId.get(node.id) ?? [],
        id: node.id,
        label: node.label ?? node.type,
        observable,
        observationState: observable ? aggregateObservationState : "not_supported",
        resourceType: node.type
      };
    })
  };
}

export function getLiveObservationCapacityMode(
  architecture: ArchitectureJson,
  providerCapacity: LiveObservationProviderSnapshot["capacity"] | null | undefined
): LiveObservationCapacityModeLabel {
  if (hasCompleteProviderCapacityEvidence(providerCapacity)) {
    return providerCapacity.max === null ? "고정 용량" : "Auto Scaling";
  }

  return hasEcsServiceAutoScalingBinding(architecture) ? "Auto Scaling" : "고정 용량";
}

function getServiceAutoScalingDetailLines(
  architecture: ArchitectureJson
): ReadonlyMap<string, readonly string[]> {
  const nodeById = new Map(architecture.nodes.map((node) => [node.id, node]));
  const detailsByResourceId = new Map<string, readonly string[]>();

  for (const target of architecture.nodes.filter(
    (node) => node.type === "APPLICATION_AUTO_SCALING_TARGET"
  )) {
    const serviceEdges = architecture.edges.filter(
      (edge) =>
        edge.targetId === target.id && nodeById.get(edge.sourceId)?.type === "ECS_SERVICE"
    );
    const policyEdges = architecture.edges.filter(
      (edge) =>
        edge.sourceId === target.id &&
        nodeById.get(edge.targetId)?.type === "APPLICATION_AUTO_SCALING_POLICY"
    );
    if (serviceEdges.length !== 1 || policyEdges.length !== 1) continue;

    const policy = nodeById.get(policyEdges[0]!.targetId);
    const evidence = policy ? readServiceAutoScalingEvidence(target.config, policy.config) : null;
    if (!evidence || !policy) continue;

    detailsByResourceId.set(target.id, [
      `최소 ${evidence.minCapacity} · 최대 ${evidence.maxCapacity}`
    ]);
    detailsByResourceId.set(policy.id, [
      `${formatScalingMetric(evidence.metric)} · 목표 ${evidence.targetValue}`
    ]);
  }

  return detailsByResourceId;
}

function readServiceAutoScalingEvidence(
  targetConfig: Readonly<Record<string, unknown>>,
  policyConfig: Readonly<Record<string, unknown>>
): {
  readonly minCapacity: number;
  readonly maxCapacity: number;
  readonly metric: string;
  readonly targetValue: number;
} | null {
  const minCapacity = readNonNegativeInteger(targetConfig["minCapacity"]);
  const maxCapacity = readPositiveInteger(targetConfig["maxCapacity"]);
  if (minCapacity === null || maxCapacity === null || minCapacity > maxCapacity) return null;
  if (policyConfig["policyType"] !== "TargetTrackingScaling") return null;

  const tracking = readRecord(policyConfig["targetTrackingScalingPolicyConfiguration"]);
  if (!tracking) return null;
  const targetValue = readPositiveNumber(tracking["targetValue"]);
  if (targetValue === null) return null;

  const rawSpecifications = tracking["predefinedMetricSpecification"];
  const specifications = Array.isArray(rawSpecifications)
    ? rawSpecifications
    : rawSpecifications === undefined
      ? []
      : [rawSpecifications];
  if (specifications.length !== 1) return null;

  const specification = readRecord(specifications[0]);
  const rawMetric = specification?.["predefinedMetricType"];
  if (typeof rawMetric !== "string" || !rawMetric.trim()) return null;

  return {
    minCapacity,
    maxCapacity,
    metric: rawMetric.trim(),
    targetValue
  };
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function formatScalingMetric(metric: string): string {
  if (metric === "ECSServiceAverageCPUUtilization") return "ECS 평균 CPU 사용률";
  if (metric === "ECSServiceAverageMemoryUtilization") return "ECS 평균 메모리 사용률";
  if (metric === "ALBRequestCountPerTarget") return "ALB 대상별 요청 수";
  return metric;
}

function hasCompleteProviderCapacityEvidence(
  capacity: LiveObservationProviderSnapshot["capacity"] | null | undefined
): capacity is LiveObservationProviderSnapshot["capacity"] {
  return (
    capacity !== null &&
    capacity !== undefined &&
    capacity.desired !== null &&
    capacity.running !== null &&
    capacity.healthy !== null
  );
}

function hasEcsServiceAutoScalingBinding(architecture: ArchitectureJson): boolean {
  const ecsServiceIds = new Set(
    architecture.nodes
      .filter((node) => node.type === "ECS_SERVICE")
      .map((node) => node.id)
  );
  const scalingTargetIds = new Set(
    architecture.nodes
      .filter((node) => node.type === "APPLICATION_AUTO_SCALING_TARGET")
      .map((node) => node.id)
  );

  return architecture.edges.some(
    (edge) => ecsServiceIds.has(edge.sourceId) && scalingTargetIds.has(edge.targetId)
  );
}

function getAggregateObservationState(
  snapshot: LiveObservationV2Snapshot | null
): LiveObservationArchitectureAggregateState {
  const providerState = snapshot?.latestObservation?.payload.state;

  return providerState ? mapProviderState(providerState) : "configured";
}

function mapProviderState(
  providerState: LiveObservationProviderState
): Exclude<DeploymentResourceObservationState, "not_supported"> {
  return providerState === "available" ? "observed" : providerState;
}

function preserveDeployedArchitectureGraph(
  architecture: ArchitectureJson,
  convertedDiagram: DiagramJson
): DiagramJson {
  const convertedNodeIds = new Set(convertedDiagram.nodes.map((node) => node.id));
  const missingResourceIds = architecture.nodes
    .map((node) => node.id)
    .filter((nodeId) => !convertedNodeIds.has(nodeId));

  if (missingResourceIds.length > 0) {
    throw new Error(
      `Live Observation Architecture conversion omitted Resource nodes: ${missingResourceIds.join(", ")}`
    );
  }

  const architectureEdgeIds = new Set(architecture.edges.map((edge) => edge.id));
  const convertedEdgeById = new Map(convertedDiagram.edges.map((edge) => [edge.id, edge]));
  const architectureEdges = architecture.edges.map((edge) => {
    const convertedEdge = convertedEdgeById.get(edge.id);

    return {
      ...(convertedEdge ?? createFallbackDiagramEdge(edge)),
      id: edge.id,
      label: edge.label,
      sourceNodeId: edge.sourceId,
      style: {
        ...(convertedEdge?.style ?? {}),
        animated: false
      },
      targetNodeId: edge.targetId
    } satisfies DiagramEdge;
  });
  const presentationEdges = convertedDiagram.edges
    .filter((edge) => !architectureEdgeIds.has(edge.id))
    .map((edge) => ({
      ...edge,
      style: { ...edge.style, animated: false }
    }));

  return {
    ...convertedDiagram,
    edges: [...architectureEdges, ...presentationEdges]
  };
}

function createFallbackDiagramEdge(
  edge: ArchitectureJson["edges"][number]
): DiagramEdge {
  return {
    id: edge.id,
    label: edge.label,
    sourceNodeId: edge.sourceId,
    style: {
      animated: false,
      color: "#6b7280",
      lineStyle: "solid",
      width: "thin"
    },
    targetNodeId: edge.targetId,
    type: "smoothstep"
  };
}
