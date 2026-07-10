type ResourceNodeSize = {
  height: number;
  width: number;
};

const RESOURCE_NODE_ICON_MIN_SIZE_PX = 12;

export function getResourceNodeIconFrameSize(nodeSize: ResourceNodeSize): number {
  const fittedSize = Math.min(
    Math.max(0, nodeSize.width),
    Math.max(0, nodeSize.height)
  );

  return Math.round(Math.max(RESOURCE_NODE_ICON_MIN_SIZE_PX, fittedSize));
}
