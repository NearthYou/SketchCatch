import type { DiagramJson } from "../../../../packages/types/src";

export const DEFAULT_DIAGRAM_VIEWPORT = {
  x: 0,
  y: 0,
  zoom: 1
} as const;

export const EMPTY_DIAGRAM: DiagramJson = {
  nodes: [],
  edges: [],
  viewport: DEFAULT_DIAGRAM_VIEWPORT
};

export const RESOURCE_DRAG_MIME_TYPE = "application/vnd.sketchcatch.resource-settings+json";

export const NODE_COLOR_SWATCHES = ["#172033", "#1f6feb", "#287d3c", "#b45309", "#b42318"] as const;
export const BORDER_COLOR_SWATCHES = ["#8b98aa", "#2f6db3", "#2f8c55", "#d76613", "#c9473d"] as const;
export const EDGE_COLOR_SWATCHES = ["#506176", "#1f6feb", "#287d3c", "#d76613", "#b42318"] as const;
