import type {
  ArchitecturePatchPreview,
  DiagramEdge,
  DiagramJson,
  DiagramNode
} from "../../../../packages/types/src";
import type { DiagramPreviewAnnotations, DiagramPreviewState } from "../diagram-editor";
import { convertArchitectureJsonToDiagramJson } from "./workspace-ai-diagram-adapter";

export type WorkspaceAiPatchPreviewModel = {
  readonly preview: ArchitecturePatchPreview;
  readonly proposedDiagram: DiagramJson;
  readonly visualPreviewDiagram: DiagramJson;
  readonly annotations: DiagramPreviewAnnotations;
};

export function createWorkspaceAiPatchPreviewModel(
  baseDiagram: DiagramJson,
  preview: ArchitecturePatchPreview
): WorkspaceAiPatchPreviewModel {
  const convertedProposedDiagram = convertArchitectureJsonToDiagramJson(
    preview.proposedArchitectureJson
  );
  const proposedDiagram = mergeProposedDiagramWithBaseGeometry(
    baseDiagram,
    convertedProposedDiagram
  );
  const proposedNodeIds = new Set(proposedDiagram.nodes.map((node) => node.id));
  const proposedEdgeIds = new Set(proposedDiagram.edges.map((edge) => edge.id));
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
    }
  };
}

function mergeProposedDiagramWithBaseGeometry(
  baseDiagram: DiagramJson,
  proposedDiagram: DiagramJson
): DiagramJson {
  const baseNodeById = new Map(baseDiagram.nodes.map((node) => [node.id, node]));
  const baseEdgeById = new Map(baseDiagram.edges.map((edge) => [edge.id, edge]));

  return {
    nodes: proposedDiagram.nodes.map((proposedNode) => {
      const baseNode = baseNodeById.get(proposedNode.id);

      if (!baseNode) {
        return proposedNode;
      }

      return {
        ...proposedNode,
        locked: baseNode.locked,
        metadata: baseNode.metadata ?? proposedNode.metadata,
        position: { ...baseNode.position },
        size: { ...baseNode.size },
        zIndex: baseNode.zIndex
      };
    }),
    edges: proposedDiagram.edges.map(
      (proposedEdge) => baseEdgeById.get(proposedEdge.id) ?? proposedEdge
    ),
    viewport: { ...baseDiagram.viewport }
  };
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
