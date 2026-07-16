import type {
  ArchitecturePatchPreview,
  ArchitectureJson,
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  ResourceNode
} from "../../../../packages/types/src";
import type { DiagramPreviewAnnotations, DiagramPreviewState } from "../diagram-editor";
import { createPlannedDiagramJson } from "./workspace-ai-diagram-adapter";

export type WorkspaceAiPatchPreviewModel = {
  readonly preview: ArchitecturePatchPreview;
  readonly proposedDiagram: DiagramJson;
  readonly visualPreviewDiagram: DiagramJson;
  readonly annotations: DiagramPreviewAnnotations;
  readonly parameterChanges: readonly WorkspaceAiPatchParameterChange[];
  readonly isParameterOnly: boolean;
};

export type WorkspaceAiPatchParameterChange = {
  readonly resourceId: string;
  readonly resourceLabel: string;
  readonly resourceType: string;
  readonly parameter: string;
  readonly before: string;
  readonly after: string;
};

export function createWorkspaceAiPatchPreviewModel(
  baseDiagram: DiagramJson,
  preview: ArchitecturePatchPreview
): WorkspaceAiPatchPreviewModel {
  const proposedDiagram = createPlannedDiagramJson({
    architectureJson: preview.proposedArchitectureJson,
    previousDiagram: baseDiagram
  });
  const proposedNodeIds = new Set(proposedDiagram.nodes.map((node) => node.id));
  const proposedEdgeIds = new Set(proposedDiagram.edges.map((edge) => edge.id));
  const parameterChanges = getWorkspaceAiPatchParameterChanges(
    preview.baseArchitectureJson,
    preview.proposedArchitectureJson
  );
  const visualNodes = [...proposedDiagram.nodes];
  const visualEdges = [...proposedDiagram.edges];
  const nodeStates: Record<string, DiagramPreviewState> = {};
  const edgeStates: Record<string, DiagramPreviewState> = {};
  const baseNodeById = new Map(baseDiagram.nodes.map((node) => [node.id, node]));
  const baseEdgeById = new Map(baseDiagram.edges.map((edge) => [edge.id, edge]));

  for (const proposedNode of proposedDiagram.nodes) {
    const baseNode = baseNodeById.get(proposedNode.id);

    if (!baseNode) {
      nodeStates[proposedNode.id] = "added";
      continue;
    }

    if (isDiagramNodeChanged(baseNode, proposedNode)) {
      nodeStates[proposedNode.id] = "modified";
    }
  }

  for (const baseNode of baseDiagram.nodes) {
    if (!proposedNodeIds.has(baseNode.id)) {
      visualNodes.push(baseNode);
      nodeStates[baseNode.id] = "deleted";
    }
  }

  for (const proposedEdge of proposedDiagram.edges) {
    if (!baseEdgeById.has(proposedEdge.id)) {
      edgeStates[proposedEdge.id] = "added";
    }
  }

  for (const baseEdge of baseDiagram.edges) {
    if (!proposedEdgeIds.has(baseEdge.id) && isEdgeVisuallyRestorable(baseEdge, visualNodes)) {
      visualEdges.push(baseEdge);
      edgeStates[baseEdge.id] = "deleted";
    }
  }

  return {
    preview,
    proposedDiagram,
    visualPreviewDiagram: {
      nodes: visualNodes,
      edges: visualEdges,
      viewport: { ...baseDiagram.viewport }
    },
    annotations: {
      nodeStates,
      edgeStates
    },
    parameterChanges,
    isParameterOnly: isParameterOnlyPatch(
      preview.baseArchitectureJson,
      preview.proposedArchitectureJson,
      parameterChanges
    )
  };
}

export function getWorkspaceAiPatchParameterChanges(
  baseArchitectureJson: ArchitectureJson,
  proposedArchitectureJson: ArchitectureJson
): readonly WorkspaceAiPatchParameterChange[] {
  const baseNodeById = new Map(baseArchitectureJson.nodes.map((node) => [node.id, node]));
  const changes: WorkspaceAiPatchParameterChange[] = [];

  for (const proposedNode of proposedArchitectureJson.nodes) {
    const baseNode = baseNodeById.get(proposedNode.id);

    if (!baseNode) {
      continue;
    }

    const baseValues = baseNode.config;
    const proposedValues = proposedNode.config;
    const parameterNames = [...new Set([...Object.keys(baseValues), ...Object.keys(proposedValues)])].sort(
      (left, right) => left.localeCompare(right)
    );

    for (const parameter of parameterNames) {
      const beforeValue = baseValues[parameter];
      const afterValue = proposedValues[parameter];

      if (areParameterValuesEqual(beforeValue, afterValue)) {
        continue;
      }

      changes.push({
        resourceId: proposedNode.id,
        resourceLabel: proposedNode.label ?? proposedNode.id,
        resourceType: getResourceParameterType(proposedNode),
        parameter,
        before: formatParameterValue(beforeValue),
        after: formatParameterValue(afterValue)
      });
    }
  }

  return changes;
}

function isParameterOnlyPatch(
  baseArchitectureJson: ArchitectureJson,
  proposedArchitectureJson: ArchitectureJson,
  parameterChanges: readonly WorkspaceAiPatchParameterChange[]
): boolean {
  if (
    parameterChanges.length === 0 ||
    baseArchitectureJson.nodes.length !== proposedArchitectureJson.nodes.length
  ) {
    return false;
  }

  const baseNodeById = new Map(baseArchitectureJson.nodes.map((node) => [node.id, node]));
  const baseEdgeById = new Map(baseArchitectureJson.edges.map((edge) => [edge.id, edge]));

  if (baseArchitectureJson.edges.length !== proposedArchitectureJson.edges.length) {
    return false;
  }

  for (const proposedNode of proposedArchitectureJson.nodes) {
    const baseNode = baseNodeById.get(proposedNode.id);

    if (!baseNode || !hasOnlyConfigChanges(baseNode, proposedNode)) {
      return false;
    }
  }

  return proposedArchitectureJson.edges.every((proposedEdge) => {
    const baseEdge = baseEdgeById.get(proposedEdge.id);

    return (
      baseEdge !== undefined &&
      baseEdge.label === proposedEdge.label &&
      baseEdge.sourceId === proposedEdge.sourceId &&
      baseEdge.targetId === proposedEdge.targetId
    );
  });
}

function hasOnlyConfigChanges(baseNode: ResourceNode, proposedNode: ResourceNode): boolean {
  return JSON.stringify({
    label: baseNode.label,
    positionX: baseNode.positionX,
    positionY: baseNode.positionY,
    type: baseNode.type
  }) === JSON.stringify({
    label: proposedNode.label,
    positionX: proposedNode.positionX,
    positionY: proposedNode.positionY,
    type: proposedNode.type
  });
}

function getResourceParameterType(node: ResourceNode): string {
  const terraformResourceType = node.config["terraformResourceType"];

  return typeof terraformResourceType === "string" && terraformResourceType.length > 0
    ? terraformResourceType
    : node.type;
}

function areParameterValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatParameterValue(value: unknown): string {
  if (value === undefined) {
    return "설정되지 않음";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  return JSON.stringify(value);
}

function isDiagramNodeChanged(baseNode: DiagramNode, proposedNode: DiagramNode): boolean {
  return JSON.stringify({
    label: baseNode.label,
    metadata: baseNode.metadata,
    parameters: baseNode.parameters,
    type: baseNode.type
  }) !== JSON.stringify({
    label: proposedNode.label,
    metadata: proposedNode.metadata,
    parameters: proposedNode.parameters,
    type: proposedNode.type
  });
}

function isEdgeVisuallyRestorable(edge: DiagramEdge, nodes: readonly DiagramNode[]): boolean {
  const nodeIds = new Set(nodes.map((node) => node.id));

  return nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId);
}
