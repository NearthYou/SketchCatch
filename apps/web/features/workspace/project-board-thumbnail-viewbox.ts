import { BOARD_LABEL_PERSISTENT_ZOOM } from "../diagram-editor/board-viewport";

export type BoardThumbnailBounds = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type BoardThumbnailViewport = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

type RenderedNodeRect = {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
};

type RootRect = {
  readonly left: number;
  readonly top: number;
};

const THUMBNAIL_PADDING_RATIO = 0.08;

export function getBoardThumbnailPersistentLabelScale(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 && zoom < BOARD_LABEL_PERSISTENT_ZOOM
    ? BOARD_LABEL_PERSISTENT_ZOOM / zoom
    : 1;
}

export function getBoardViewportFromCssTransform(
  transform: string
): BoardThumbnailViewport | null {
  if (transform === "none") {
    return { x: 0, y: 0, zoom: 1 };
  }

  const matrixMatch = transform.match(/^matrix\(([^)]+)\)$/);

  if (matrixMatch) {
    const values = matrixMatch[1]?.split(",").map((value) => Number(value.trim()));

    if (values?.length === 6) {
      const zoom = values[0];
      const skewY = values[1];
      const skewX = values[2];
      const verticalZoom = values[3];
      const x = values[4];
      const y = values[5];

      if (
        typeof zoom === "number" &&
        Number.isFinite(zoom) &&
        zoom > 0 &&
        skewX === 0 &&
        skewY === 0 &&
        verticalZoom === zoom &&
        typeof x === "number" &&
        Number.isFinite(x) &&
        typeof y === "number" &&
        Number.isFinite(y)
      ) {
        return { x, y, zoom };
      }
    }
  }

  const translateScaleMatch = transform.match(
    /^translate\(\s*([-+]?\d*\.?\d+)px\s*,\s*([-+]?\d*\.?\d+)px\s*\)\s*scale\(\s*([-+]?\d*\.?\d+)\s*\)$/
  );

  if (!translateScaleMatch) {
    return null;
  }

  const [, xValue, yValue, zoomValue] = translateScaleMatch;
  const x = Number(xValue);
  const y = Number(yValue);
  const zoom = Number(zoomValue);

  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom) && zoom > 0
    ? { x, y, zoom }
    : null;
}

export function getLogicalBoardBoundsFromRenderedNodes({
  nodeRects,
  rootRect,
  viewport
}: {
  readonly nodeRects: readonly RenderedNodeRect[];
  readonly rootRect: RootRect;
  readonly viewport: BoardThumbnailViewport;
}): BoardThumbnailBounds | null {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) {
    return null;
  }

  const logicalRects = nodeRects
    .filter(hasPositiveFiniteSize)
    .map((rect) => ({
      height: rect.height / viewport.zoom,
      width: rect.width / viewport.zoom,
      x: (rect.left - rootRect.left - viewport.x) / viewport.zoom,
      y: (rect.top - rootRect.top - viewport.y) / viewport.zoom
    }));

  if (logicalRects.length === 0) {
    return null;
  }

  const left = Math.min(...logicalRects.map((rect) => rect.x));
  const top = Math.min(...logicalRects.map((rect) => rect.y));
  const right = Math.max(...logicalRects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...logicalRects.map((rect) => rect.y + rect.height));

  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top
  };
}

export function getFullBoardThumbnailViewport(
  bounds: BoardThumbnailBounds,
  targetSize: { readonly height: number; readonly width: number }
): BoardThumbnailViewport {
  const width = getPositiveDimension(targetSize.width);
  const height = getPositiveDimension(targetSize.height);
  const contentWidth = width * (1 - THUMBNAIL_PADDING_RATIO * 2);
  const contentHeight = height * (1 - THUMBNAIL_PADDING_RATIO * 2);
  const zoom = Math.min(
    contentWidth / getPositiveDimension(bounds.width),
    contentHeight / getPositiveDimension(bounds.height)
  );

  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom
  };
}

function hasPositiveFiniteSize(rect: RenderedNodeRect): boolean {
  return (
    Number.isFinite(rect.height) &&
    rect.height > 0 &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    rect.width > 0
  );
}

function getPositiveDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
