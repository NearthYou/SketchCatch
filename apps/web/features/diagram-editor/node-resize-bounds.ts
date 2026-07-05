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

const designAreaMinResizeBounds = {
  minHeight: 72,
  minWidth: 96
} as const;

const resourceNodeResizeBounds: NodeResizeBounds = {
  maxHeight: 260,
  maxWidth: 260,
  minHeight: 56,
  minWidth: 56
};

const areaNodeMaxResizeBounds = {
  maxHeight: Number.MAX_SAFE_INTEGER,
  maxWidth: Number.MAX_SAFE_INTEGER
};

const designAreaResizeBoundsByType: Record<string, NodeResizeBounds> = Object.fromEntries(
  [
    "design_region",
    "design_az",
    "design_group",
    "sketchcatch_region",
    "sketchcatch_az",
    "sketchcatch_group"
  ].map((type) => [
    type,
    {
      ...areaNodeMaxResizeBounds,
      minHeight: designAreaMinResizeBounds.minHeight,
      minWidth: designAreaMinResizeBounds.minWidth
    }
  ])
);

const resourceAreaResizeBoundsByType: Record<string, NodeResizeBounds> = {
  aws_availability_zone: {
    ...areaNodeMaxResizeBounds,
    minHeight: 150,
    minWidth: 220
  },
  aws_region: {
    ...areaNodeMaxResizeBounds,
    minHeight: 180,
    minWidth: 260
  },
  aws_vpc: {
    ...areaNodeMaxResizeBounds,
    minHeight: 160,
    minWidth: 240
  },
  aws_subnet: {
    ...areaNodeMaxResizeBounds,
    minHeight: 112,
    minWidth: 144
  },
  aws_security_group: {
    ...areaNodeMaxResizeBounds,
    minHeight: 112,
    minWidth: 144
  }
};

export function getNodeResizeBounds(node: Pick<DiagramNode, "kind" | "parameters" | "type">): NodeResizeBounds {
  if (node.kind === "design") {
    return designAreaResizeBoundsByType[node.type] ?? designNodeResizeBounds;
  }

  return resourceAreaResizeBoundsByType[getResourceNodeType(node)] ?? resourceNodeResizeBounds;
}

function getResourceNodeType(node: Pick<DiagramNode, "parameters" | "type">): string {
  return node.parameters?.resourceType ?? node.type;
}
