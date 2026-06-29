import type { DiagramNode } from "../../../../packages/types/src";

export type NodeResizeBounds = {
  maxHeight: number;
  maxWidth: number;
  minHeight: number;
  minWidth: number;
};

const designNodeResizeBounds: NodeResizeBounds = {
  maxHeight: 640,
  maxWidth: 840,
  minHeight: 100,
  minWidth: 140
};

const resourceNodeResizeBounds: NodeResizeBounds = {
  maxHeight: 260,
  maxWidth: 260,
  minHeight: 74,
  minWidth: 74
};

const areaResourceResizeBoundsByType: Record<string, NodeResizeBounds> = {
  aws_vpc: {
    maxHeight: 960,
    maxWidth: 1440,
    minHeight: 240,
    minWidth: 360
  },
  aws_subnet: {
    maxHeight: 720,
    maxWidth: 960,
    minHeight: 168,
    minWidth: 240
  }
};

export function getNodeResizeBounds(node: Pick<DiagramNode, "kind" | "parameters" | "type">): NodeResizeBounds {
  if (node.kind === "design") {
    return designNodeResizeBounds;
  }

  return areaResourceResizeBoundsByType[getResourceNodeType(node)] ?? resourceNodeResizeBounds;
}

function getResourceNodeType(node: Pick<DiagramNode, "parameters" | "type">): string {
  return node.parameters?.resourceType ?? node.type;
}
