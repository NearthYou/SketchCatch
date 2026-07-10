type ResourceNodeSize = {
  height: number;
  width: number;
};

const RESOURCE_NODE_LABEL_RESERVE_PX = 22;
const RESOURCE_NODE_ICON_MIN_SIZE_PX = 12;

export function getResourceNodeIconFrameSize(nodeSize: ResourceNodeSize): number {
  const usableWidth = Math.max(0, nodeSize.width);
  const labelReserve = Math.min(
    RESOURCE_NODE_LABEL_RESERVE_PX,
    Math.max(0, nodeSize.height / 2)
  );
  const usableHeight = Math.max(0, nodeSize.height - labelReserve);
  const fittedSize = Math.min(usableWidth, usableHeight);

  return Math.round(Math.max(RESOURCE_NODE_ICON_MIN_SIZE_PX, fittedSize));
}
