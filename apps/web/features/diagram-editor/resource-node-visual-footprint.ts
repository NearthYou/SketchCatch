import type { DiagramNode } from "../../../../packages/types/src";

import { isAreaNode } from "./area-nodes";

export const RESOURCE_CAPTION_MAX_WIDTH = 112;
export const RESOURCE_CAPTION_GAP = 4;
export const RESOURCE_CAPTION_MAX_HEIGHT = 30;

export type BoardVisualBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getResourceNodeVisualBounds(node: DiagramNode): BoardVisualBounds {
  if (isAreaNode(node) || (node.kind === "design" && !node.iconUrl)) {
    return getStoredNodeBounds(node);
  }

  const width = Math.max(node.size.width, RESOURCE_CAPTION_MAX_WIDTH);

  return {
    x: node.position.x - (width - node.size.width) / 2,
    y: node.position.y,
    width,
    height: node.size.height + RESOURCE_CAPTION_GAP + RESOURCE_CAPTION_MAX_HEIGHT
  };
}

export function getDiagramVisualBounds(nodes: readonly DiagramNode[]): BoardVisualBounds {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const bounds = nodes.map((node) => getResourceNodeVisualBounds(node));
  const left = Math.min(...bounds.map((nodeBounds) => nodeBounds.x));
  const top = Math.min(...bounds.map((nodeBounds) => nodeBounds.y));
  const right = Math.max(...bounds.map((nodeBounds) => nodeBounds.x + nodeBounds.width));
  const bottom = Math.max(...bounds.map((nodeBounds) => nodeBounds.y + nodeBounds.height));

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

function getStoredNodeBounds(node: DiagramNode): BoardVisualBounds {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height
  };
}
