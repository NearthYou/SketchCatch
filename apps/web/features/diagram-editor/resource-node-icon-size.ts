type ResourceNodeSize = {
  height: number;
  width: number;
};

const RESOURCE_NODE_LABEL_RESERVE_PX = 22;
const RESOURCE_NODE_ICON_MIN_SIZE_PX = 24;

export function getResourceNodeIconFrameSize(nodeSize: ResourceNodeSize): number {
  const usableWidth = Math.max(0, nodeSize.width);
  const usableHeight = Math.max(0, nodeSize.height - RESOURCE_NODE_LABEL_RESERVE_PX);
  const fittedSize = Math.min(usableWidth, usableHeight);

  return Math.round(Math.max(RESOURCE_NODE_ICON_MIN_SIZE_PX, fittedSize));
}
