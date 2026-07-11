import type { DiagramPreviewState } from "./types";

export type BoardZoomLevel = "far" | "full" | "medium";
export type BoardNodeStateBadge = {
  glyph: "+" | "~" | "−";
  label: "삭제됨" | "수정됨" | "추가됨";
  tone: "danger" | "success" | "warning";
};

export function getBoardZoomLevel(zoom: number): BoardZoomLevel {
  if (zoom < 0.5) {
    return "far";
  }

  return zoom < 0.75 ? "medium" : "full";
}

export function getBoardNodeStateBadge(
  previewState: DiagramPreviewState | undefined
): BoardNodeStateBadge | null {
  if (previewState === "added") {
    return { glyph: "+", label: "추가됨", tone: "success" };
  }

  if (previewState === "modified") {
    return { glyph: "~", label: "수정됨", tone: "warning" };
  }

  if (previewState === "deleted") {
    return { glyph: "−", label: "삭제됨", tone: "danger" };
  }

  return null;
}
