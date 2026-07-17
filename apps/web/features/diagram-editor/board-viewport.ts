import type { DiagramJson } from "../../../../packages/types/src";

const BOARD_MIN_ZOOM = 0.25;
const BOARD_MAX_ZOOM = 2;
export const BOARD_LABEL_PERSISTENT_ZOOM = 0.75;
const SOURCE_VIEWBOX_HARD_MIN_ZOOM = 0.01;

export type BoardBounds = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type BoardViewportSize = {
  readonly height: number;
  readonly width: number;
};

export type BoardViewportFrame = BoardViewportSize & {
  readonly x: number;
  readonly y: number;
};

export type BoardViewportVerticalInsets = {
  readonly bottom: number;
  readonly top: number;
};

export type CenteredBoardViewport = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

export type BoardZoomPresentationScale = {
  readonly compactLabelScale: number;
  readonly controlScale: number;
};

export function parseBoardZoom(value: string | number | undefined): number | undefined {
  const serializedValue = typeof value === "number" ? String(value) : value?.trim();

  if (!serializedValue) {
    return undefined;
  }

  const zoom = Number(serializedValue);

  return Number.isFinite(zoom) && zoom >= BOARD_MIN_ZOOM && zoom <= BOARD_MAX_ZOOM
    ? zoom
    : undefined;
}

export function getCenteredBoardViewport(
  bounds: BoardBounds,
  viewportSize: BoardViewportFrame | BoardViewportSize,
  zoom: number
): CenteredBoardViewport {
  const viewportWidth = getPositiveFiniteDimension(viewportSize.width);
  const viewportHeight = getPositiveFiniteDimension(viewportSize.height);
  const viewportX = "x" in viewportSize && Number.isFinite(viewportSize.x) ? viewportSize.x : 0;
  const viewportY = "y" in viewportSize && Number.isFinite(viewportSize.y) ? viewportSize.y : 0;
  const boundsX = Number.isFinite(bounds.x) ? bounds.x : 0;
  const boundsY = Number.isFinite(bounds.y) ? bounds.y : 0;
  const boundsWidth = getPositiveFiniteDimension(bounds.width);
  const boundsHeight = getPositiveFiniteDimension(bounds.height);
  const centerX = boundsX + boundsWidth / 2;
  const centerY = boundsY + boundsHeight / 2;

  return {
    x: viewportX + viewportWidth / 2 - centerX * zoom,
    y: viewportY + viewportHeight / 2 - centerY * zoom,
    zoom
  };
}

export function getSourceViewBoxViewport(
  sourceViewBox: BoardBounds,
  frame: BoardViewportFrame
): CenteredBoardViewport {
  const frameWidth = getPositiveFiniteDimension(frame.width);
  const frameHeight = getPositiveFiniteDimension(frame.height);
  const sourceWidth = getPositiveFiniteDimension(sourceViewBox.width);
  const sourceHeight = getPositiveFiniteDimension(sourceViewBox.height);
  const fittedZoom = Math.min(frameWidth / sourceWidth, frameHeight / sourceHeight);
  const zoom = Math.min(BOARD_MAX_ZOOM, fittedZoom);

  return getCenteredBoardViewport(sourceViewBox, frame, zoom);
}

export function getSourceViewBoxMinimumZoom(
  sourceViewBox: BoardBounds,
  frame: BoardViewportFrame
): number {
  return Math.min(
    BOARD_MIN_ZOOM,
    Math.max(
      SOURCE_VIEWBOX_HARD_MIN_ZOOM,
      getSourceViewBoxViewport(sourceViewBox, frame).zoom
    )
  );
}

export function getFitViewMinimumZoom(
  bounds: BoardBounds,
  viewportSize: BoardViewportSize,
  padding: number
): number {
  const viewportWidth = getPositiveFiniteDimension(viewportSize.width);
  const viewportHeight = getPositiveFiniteDimension(viewportSize.height);
  const boundsWidth = getPositiveFiniteDimension(bounds.width);
  const boundsHeight = getPositiveFiniteDimension(bounds.height);
  const paddingScale = 1 + getNonNegativeFiniteDimension(padding);
  const fittedZoom = Math.min(
    viewportWidth / (boundsWidth * paddingScale),
    viewportHeight / (boundsHeight * paddingScale)
  );

  return Math.min(BOARD_MIN_ZOOM, fittedZoom);
}

export function applyInitialSourceViewBoxViewport(
  diagram: DiagramJson,
  frame: BoardViewportFrame
): DiagramJson {
  const presentation = diagram.presentation;

  if (
    presentation?.geometryPolicy !== "source-exact" ||
    presentation.initialViewportPending !== true ||
    !presentation.sourceViewBox
  ) {
    return diagram;
  }

  return {
    ...diagram,
    viewport: getSourceViewBoxViewport(presentation.sourceViewBox, frame),
    presentation: {
      ...presentation,
      initialViewportPending: false
    }
  };
}

export function getUnobscuredBoardViewportFrame(
  canvasBounds: BoardViewportFrame,
  leftOverlayBounds: BoardViewportFrame | null,
  gutter = 12,
  verticalInsets: BoardViewportVerticalInsets = { top: 0, bottom: 0 }
): BoardViewportFrame {
  const canvasWidth = getPositiveFiniteDimension(canvasBounds.width);
  const canvasHeight = getPositiveFiniteDimension(canvasBounds.height);
  const frameY = Math.min(canvasHeight - 1, getNonNegativeFiniteDimension(verticalInsets.top));
  const bottomInset = Math.min(
    canvasHeight - frameY - 1,
    getNonNegativeFiniteDimension(verticalInsets.bottom)
  );
  const frameHeight = Math.max(1, canvasHeight - frameY - bottomInset);
  const fullFrame = { x: 0, y: frameY, width: canvasWidth, height: frameHeight };

  if (!leftOverlayBounds || !doFramesOverlap(canvasBounds, leftOverlayBounds)) {
    return fullFrame;
  }

  const overlayRight = leftOverlayBounds.x + leftOverlayBounds.width;
  const obscuredWidth = Math.max(0, overlayRight - canvasBounds.x + gutter);
  const frameX = Math.min(canvasWidth - 1, obscuredWidth);

  return {
    x: frameX,
    y: frameY,
    width: Math.max(1, canvasWidth - frameX),
    height: frameHeight
  };
}

export function offsetBoardViewportToFrame(
  viewport: CenteredBoardViewport,
  frame: BoardViewportFrame
): CenteredBoardViewport {
  return {
    x: viewport.x + frame.x,
    y: viewport.y + frame.y,
    zoom: viewport.zoom
  };
}

export function rebaseBoardViewport(
  viewport: CenteredBoardViewport,
  previousFrame: BoardViewportFrame,
  nextFrame: BoardViewportFrame
): CenteredBoardViewport {
  return {
    x: viewport.x + getFrameCenterX(nextFrame) - getFrameCenterX(previousFrame),
    y: viewport.y + getFrameCenterY(nextFrame) - getFrameCenterY(previousFrame),
    zoom: viewport.zoom
  };
}

export function getBoardZoomPresentationScale(zoom: number): BoardZoomPresentationScale {
  const safeZoom = Number.isFinite(zoom)
    ? Math.min(BOARD_MAX_ZOOM, Math.max(BOARD_MIN_ZOOM, zoom))
    : 1;

  return {
    compactLabelScale:
      safeZoom < BOARD_LABEL_PERSISTENT_ZOOM
        ? BOARD_LABEL_PERSISTENT_ZOOM / safeZoom
        : 1,
    controlScale: 1 / safeZoom
  };
}

function getPositiveFiniteDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function getNonNegativeFiniteDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function doFramesOverlap(left: BoardViewportFrame, right: BoardViewportFrame): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function getFrameCenterX(frame: BoardViewportFrame): number {
  return frame.x + frame.width / 2;
}

function getFrameCenterY(frame: BoardViewportFrame): number {
  return frame.y + frame.height / 2;
}
