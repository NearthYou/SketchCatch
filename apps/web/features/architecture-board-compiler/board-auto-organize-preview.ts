import type { DiagramJson } from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { hasSameBoardAutoOrganizeSemantics } from "./board-auto-organize";

export type BoardAutoOrganizePreviewView = "original" | "organized";
export type BoardAutoOrganizeDecision = "keep-original" | "use-organized";
export type BoardAutoOrganizeViewportAction = "open" | "switch";

export type BoardAutoOrganizeViewportPolicy = {
  readonly applySourceViewport: boolean;
  readonly autoFit: boolean;
};

export type BoardAutoOrganizePreviewSummary = {
  readonly whatChanged: string;
  readonly reviewItems: readonly string[];
};

export type BoardAutoOrganizePreviewSession = {
  readonly activeView: BoardAutoOrganizePreviewView;
  readonly originalDiagram: DiagramJson;
  readonly organizedDiagram: DiagramJson;
  readonly visibleDiagram: DiagramJson;
  readonly viewportBeforePreview: DiagramJson["viewport"];
  readonly summary: BoardAutoOrganizePreviewSummary;
};

export type BoardAutoOrganizeResolution = {
  readonly diagramToApply: DiagramJson | null;
  readonly isStale: boolean;
  readonly viewportToRestore: DiagramJson["viewport"] | null;
};

export function getBoardAutoOrganizeViewportPolicy(
  action: BoardAutoOrganizeViewportAction
): BoardAutoOrganizeViewportPolicy {
  return action === "open"
    ? { applySourceViewport: true, autoFit: true }
    : { applySourceViewport: false, autoFit: false };
}

export function createBoardAutoOrganizePreviewSession(
  originalDiagram: DiagramJson,
  organizedDiagram: DiagramJson,
  viewportBeforePreview: DiagramJson["viewport"] = originalDiagram.viewport
): BoardAutoOrganizePreviewSession {
  const original = structuredClone(originalDiagram);
  const organized = structuredClone(organizedDiagram);

  return {
    activeView: "organized",
    originalDiagram: original,
    organizedDiagram: organized,
    visibleDiagram: structuredClone(organized),
    viewportBeforePreview: structuredClone(viewportBeforePreview),
    summary: createPreviewSummary(original, organized)
  };
}

export function selectBoardAutoOrganizePreviewView(
  session: BoardAutoOrganizePreviewSession,
  activeView: BoardAutoOrganizePreviewView
): BoardAutoOrganizePreviewSession {
  const selected = activeView === "original" ? session.originalDiagram : session.organizedDiagram;

  return {
    ...session,
    activeView,
    visibleDiagram: structuredClone(selected)
  };
}

export function resolveBoardAutoOrganizeDecision(
  session: BoardAutoOrganizePreviewSession,
  decision: BoardAutoOrganizeDecision,
  currentDiagram: DiagramJson = session.originalDiagram
): BoardAutoOrganizeResolution {
  if (decision === "keep-original") {
    return {
      diagramToApply: null,
      isStale: false,
      viewportToRestore: structuredClone(session.viewportBeforePreview)
    };
  }

  if (!hasSameBoardAutoOrganizeSemantics(session.originalDiagram, currentDiagram)) {
    return {
      diagramToApply: null,
      isStale: true,
      viewportToRestore: structuredClone(session.viewportBeforePreview)
    };
  }

  return {
    diagramToApply: structuredClone(session.organizedDiagram),
    isStale: false,
    viewportToRestore: null
  };
}

function createPreviewSummary(
  originalDiagram: DiagramJson,
  organizedDiagram: DiagramJson
): BoardAutoOrganizePreviewSummary {
  const organizedNodesById = new Map(organizedDiagram.nodes.map((node) => [node.id, node]));
  const organizedEdgesById = new Map(organizedDiagram.edges.map((edge) => [edge.id, edge]));
  let movedNodeCount = 0;
  let resizedAreaCount = 0;
  let resizedResourceCount = 0;
  let reroutedEdgeCount = 0;

  for (const node of originalDiagram.nodes) {
    const organizedNode = organizedNodesById.get(node.id);
    if (!organizedNode) continue;

    if (!samePoint(node.position, organizedNode.position)) {
      movedNodeCount += 1;
    }

    if (!sameSize(node.size, organizedNode.size)) {
      if (isAreaNode(node)) {
        resizedAreaCount += 1;
      } else {
        resizedResourceCount += 1;
      }
    }
  }

  for (const edge of originalDiagram.edges) {
    const organizedEdge = organizedEdgesById.get(edge.id);
    if (organizedEdge && JSON.stringify(edge.route) !== JSON.stringify(organizedEdge.route)) {
      reroutedEdgeCount += 1;
    }
  }

  const changes = [
    movedNodeCount > 0 ? `리소스 위치 ${movedNodeCount}곳` : null,
    resizedAreaCount > 0 ? `영역 크기 ${resizedAreaCount}곳` : null,
    resizedResourceCount > 0 ? `리소스 크기 ${resizedResourceCount}곳` : null,
    reroutedEdgeCount > 0 ? `연결선 ${reroutedEdgeCount}개` : null
  ].filter((value): value is string => value !== null);

  if (changes.length === 0) {
    return {
      whatChanged: "정리할 부분을 찾지 못했어요.",
      reviewItems: ["현재 배치를 그대로 사용해도 돼요."]
    };
  }

  const reviewItems = [
    movedNodeCount > 0 ? "리소스가 원하는 위치에 놓였는지 확인해 주세요." : null,
    resizedAreaCount > 0 ? "영역 크기와 여백이 자연스러운지 확인해 주세요." : null,
    resizedResourceCount > 0 ? "리소스 크기가 자연스러운지 확인해 주세요." : null,
    reroutedEdgeCount > 0 ? "연결선이 리소스를 가리지 않는지 확인해 주세요." : null
  ]
    .filter((value): value is string => value !== null)
    .slice(0, 3);

  return {
    whatChanged: `${changes.join(", ")}를 정리했어요.`,
    reviewItems
  };
}

function samePoint(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameSize(
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number }
): boolean {
  return left.width === right.width && left.height === right.height;
}
