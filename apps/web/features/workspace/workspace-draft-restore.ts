import type { DiagramJson } from "@sketchcatch/types";

/** 저장된 Board는 사용자 이름, 위치, ID를 고치지 않고 그대로 복원합니다. */
export function restoreSavedDiagram(
  savedDiagram: DiagramJson | null | undefined,
  fallbackDiagram: DiagramJson
): DiagramJson {
  if (!savedDiagram) {
    return fallbackDiagram;
  }

  const hasNodes = Array.isArray(savedDiagram.nodes);
  const hasEdges = Array.isArray(savedDiagram.edges);
  const hasViewport = isDiagramViewport(savedDiagram.viewport);
  const restoredEdges = hasEdges
    ? savedDiagram.edges.filter((edge) => edge.metadata?.managedBy !== "parameter-reference")
    : fallbackDiagram.edges;

  if (hasNodes && hasEdges && hasViewport) {
    return restoredEdges.length === savedDiagram.edges.length
      ? savedDiagram
      : { ...savedDiagram, edges: restoredEdges };
  }

  return {
    ...savedDiagram,
    edges: restoredEdges,
    nodes: hasNodes ? savedDiagram.nodes : fallbackDiagram.nodes,
    viewport: hasViewport ? savedDiagram.viewport : fallbackDiagram.viewport
  };
}

function isDiagramViewport(value: unknown): value is DiagramJson["viewport"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const viewport = value as Partial<DiagramJson["viewport"]>;
  return (
    typeof viewport.x === "number" &&
    Number.isFinite(viewport.x) &&
    typeof viewport.y === "number" &&
    Number.isFinite(viewport.y) &&
    typeof viewport.zoom === "number" &&
    Number.isFinite(viewport.zoom)
  );
}
