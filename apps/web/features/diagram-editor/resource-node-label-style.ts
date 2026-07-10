type ResourceNodeLabelStyle = {
  color: string;
  fontSize: string;
};

const RESOURCE_NODE_LABEL_MAX_FONT_SIZE_PX = 14.5;
const RESOURCE_NODE_LABEL_MIN_FONT_SIZE_PX = 10;

export function getResourceNodeLabelStyle(
  label: string,
  nodeWidth: number,
  textColor: string
): ResourceNodeLabelStyle {
  const usableWidth = Math.max(42, nodeWidth - 12);
  const estimatedTextWidth = Math.max(1, label.length) * 7.1;
  const fittedFontSize = Math.min(
    RESOURCE_NODE_LABEL_MAX_FONT_SIZE_PX,
    Math.max(
      RESOURCE_NODE_LABEL_MIN_FONT_SIZE_PX,
      (usableWidth / estimatedTextWidth) * RESOURCE_NODE_LABEL_MAX_FONT_SIZE_PX
    )
  );

  return {
    color: textColor,
    fontSize: `${fittedFontSize.toFixed(2)}px`
  };
}
