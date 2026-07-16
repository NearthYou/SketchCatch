import type { DiagramNode } from "../../../../packages/types/src";
import { RESOURCE_NODE_COMPACT_MIN_SIZE } from "./resource-node-geometry";

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
  minHeight: 36,
  minWidth: 48
} as const;

const resourceNodeResizeBounds: NodeResizeBounds = {
  maxHeight: 260,
  maxWidth: 260,
  minHeight: RESOURCE_NODE_COMPACT_MIN_SIZE.height,
  minWidth: RESOURCE_NODE_COMPACT_MIN_SIZE.width
};

const areaNodeMaxResizeBounds = {
  maxHeight: Number.MAX_SAFE_INTEGER,
  maxWidth: Number.MAX_SAFE_INTEGER
};

const designAreaResizeBoundsByType: Record<string, NodeResizeBounds> = Object.fromEntries(
  [
    "design_region",
    "design-aws-account",
    "design_az",
    "design_group",
    "sketchcatch_region",
    "sketchcatch_aws_account",
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
  aws_region: {
    ...areaNodeMaxResizeBounds,
    minHeight: 90,
    minWidth: 130
  },
  aws_availability_zone: {
    ...areaNodeMaxResizeBounds,
    minHeight: 75,
    minWidth: 110
  },
  aws_vpc: {
    ...areaNodeMaxResizeBounds,
    minHeight: 80,
    minWidth: 120
  },
  aws_subnet: {
    ...areaNodeMaxResizeBounds,
    minHeight: 56,
    minWidth: 72
  },
  aws_security_group: {
    ...areaNodeMaxResizeBounds,
    minHeight: 56,
    minWidth: 72
  }
};

export function getNodeResizeBounds(
  node: Pick<DiagramNode, "iconUrl" | "kind" | "parameters" | "type">
): NodeResizeBounds {
  if (node.kind === "design") {
    if (node.iconUrl && !designAreaResizeBoundsByType[node.type]) {
      return resourceNodeResizeBounds;
    }

    return designAreaResizeBoundsByType[node.type] ?? designNodeResizeBounds;
  }

  return resourceAreaResizeBoundsByType[getResourceNodeType(node)] ?? resourceNodeResizeBounds;
}

function getResourceNodeType(node: Pick<DiagramNode, "parameters" | "type">): string {
  return node.parameters?.resourceType ?? node.type;
}
