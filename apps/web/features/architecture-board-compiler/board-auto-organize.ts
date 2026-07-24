import {
  hasSameBoardAutoOrganizeSemantics,
  isBoardAutoPresentationFrameNode,
  isNodeInsideReverseEngineeringInfrastructureFrame,
  isReverseEngineeringInfrastructureFrameNode,
  type DiagramNode,
  type DiagramJson
} from "@sketchcatch/types";
import { convertDiagramJsonToArchitectureJson } from "../workspace/workspace-ai-diagram-adapter";
import {
  compileArchitectureBoard,
  type ArchitectureBoardCompilationProposal
} from "./architecture-board-compiler";
import { reconcilePresentationFrames } from "./board-auto-organize-frames";

export { hasSameBoardAutoOrganizeSemantics } from "@sketchcatch/types";

export function createBoardAutoOrganizeProposal(
  currentDiagram: DiagramJson
): ArchitectureBoardCompilationProposal {
  const proposal = compileArchitectureBoard({
    architecture: convertDiagramJsonToArchitectureJson(currentDiagram),
    currentDiagram,
    trigger: "board-auto-organize"
  });

  return constrainBoardAutoOrganizeProposal(currentDiagram, proposal);
}

/**
 * Compiler 전체 권한은 유지하되, Board의 `자동 정리` 진입점에서는 시각 정보만 채택한다.
 * 원본을 기준으로 다시 조립하므로 후보의 Resource·관계·설정·parent·가져오기 프레임 변경은 적용될 수 없다.
 */
export function constrainBoardAutoOrganizeProposal(
  currentDiagram: DiagramJson,
  proposal: ArchitectureBoardCompilationProposal
): ArchitectureBoardCompilationProposal {
  const candidateNodesById = new Map(proposal.diagram.nodes.map((node) => [node.id, node]));
  const candidateEdgesById = new Map(proposal.diagram.edges.map((edge) => [edge.id, edge]));
  const infrastructureFrameByMemberNodeId =
    createReverseEngineeringInfrastructureFrameByMemberNodeId(currentDiagram.nodes);
  const constrainedCandidate: DiagramJson = {
    ...structuredClone(currentDiagram),
    nodes: [
      ...currentDiagram.nodes
        .filter((sourceNode) => !isBoardAutoPresentationFrameNode(sourceNode))
        .map((sourceNode) => {
          const candidateNode = candidateNodesById.get(sourceNode.id);

          if (!candidateNode) {
            return structuredClone(sourceNode);
          }

          if (isReverseEngineeringInfrastructureFrameNode(sourceNode)) {
            return structuredClone(sourceNode);
          }

          const candidatePosition = isFinitePoint(candidateNode.position)
            ? structuredClone(candidateNode.position)
            : structuredClone(sourceNode.position);
          const candidateSize = isValidSize(candidateNode.size)
            ? structuredClone(candidateNode.size)
            : structuredClone(sourceNode.size);
          const infrastructureFrame = infrastructureFrameByMemberNodeId.get(sourceNode.id);
          const candidateGeometryNode = {
            ...structuredClone(sourceNode),
            position: candidatePosition,
            size: candidateSize
          };
          const keepSourceGeometry =
            infrastructureFrame !== undefined &&
            !isNodeInsideReverseEngineeringInfrastructureFrame(
              candidateGeometryNode,
              infrastructureFrame
            );

          return {
            ...structuredClone(sourceNode),
            position: keepSourceGeometry
              ? structuredClone(sourceNode.position)
              : candidatePosition,
            size: keepSourceGeometry
              ? structuredClone(sourceNode.size)
              : candidateSize
          };
        }),
      ...proposal.diagram.nodes
        .filter(isBoardAutoPresentationFrameNode)
        .map((node) => structuredClone(node))
    ],
    edges: currentDiagram.edges.map((sourceEdge) => {
      const candidateEdge = candidateEdgesById.get(sourceEdge.id);
      const canReuseRoute =
        candidateEdge?.sourceNodeId === sourceEdge.sourceNodeId &&
        candidateEdge.targetNodeId === sourceEdge.targetNodeId;

      return {
        ...structuredClone(sourceEdge),
        ...(canReuseRoute && candidateEdge.route
          ? { route: mergeVisualRoute(sourceEdge.route, candidateEdge.route) }
          : sourceEdge.route
            ? { route: structuredClone(sourceEdge.route) }
            : {})
      };
    })
  };
  const diagram = reconcilePresentationFrames(currentDiagram, constrainedCandidate);

  if (!hasSameBoardAutoOrganizeSemantics(currentDiagram, diagram)) {
    throw new Error("Board auto organize changed semantic Diagram data.");
  }

  return {
    ...proposal,
    architecture: convertDiagramJsonToArchitectureJson(diagram),
    diagram,
    changes: proposal.changes
      .filter(({ kind }) => kind === "geometry" || kind === "edge-routing")
      .map((change) => structuredClone(change))
  };
}

/** gg: 멤버가 여러 표시 프레임에 잘못 겹쳐도 안정적인 첫 프레임 하나만 안전 경계로 사용합니다. */
function createReverseEngineeringInfrastructureFrameByMemberNodeId(
  nodes: readonly DiagramNode[]
): ReadonlyMap<string, DiagramNode> {
  const frameByMemberNodeId = new Map<string, DiagramNode>();

  for (const frame of [...nodes]
    .filter(isReverseEngineeringInfrastructureFrameNode)
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const marker = frame.metadata?.reverseEngineeringInfrastructureFrame;
    for (const memberNodeId of marker?.memberNodeIds ?? []) {
      if (!frameByMemberNodeId.has(memberNodeId)) {
        frameByMemberNodeId.set(memberNodeId, frame);
      }
    }
  }

  return frameByMemberNodeId;
}

function mergeVisualRoute(
  sourceRoute: NonNullable<DiagramJson["edges"][number]["route"]> | undefined,
  candidateRoute: NonNullable<DiagramJson["edges"][number]["route"]>
): NonNullable<DiagramJson["edges"][number]["route"]> {
  const route = structuredClone(candidateRoute);

  if (sourceRoute?.arrowDirection === undefined) {
    delete route.arrowDirection;
  } else {
    route.arrowDirection = sourceRoute.arrowDirection;
  }

  return route;
}

function isFinitePoint(value: { readonly x: number; readonly y: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isValidSize(value: { readonly width: number; readonly height: number }): boolean {
  return (
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width > 0 &&
    value.height > 0
  );
}
