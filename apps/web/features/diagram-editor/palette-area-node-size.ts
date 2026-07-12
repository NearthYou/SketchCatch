import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";

const PALETTE_AREA_SIZE_SCALE = 2;

export function scalePaletteAreaNodeSize(node: DiagramNode): DiagramNode {
  if (!isAreaNode(node)) {
    return node;
  }

  return {
    ...node,
    size: {
      width: node.size.width * PALETTE_AREA_SIZE_SCALE,
      height: node.size.height * PALETTE_AREA_SIZE_SCALE
    }
  };
}
