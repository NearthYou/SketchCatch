import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getBoardViewportFromCssTransform,
  getFullBoardThumbnailViewport,
  getLogicalBoardBoundsFromRenderedNodes
} from "./project-board-thumbnail-viewbox";

test("React Flow's CSS transform preserves its current translation and zoom", () => {
  assert.deepEqual(getBoardViewportFromCssTransform("matrix(0.5, 0, 0, 0.5, -100, -50)"), {
    x: -100,
    y: -50,
    zoom: 0.5
  });
});

test("rendered Board nodes are normalized to their full logical bounds", () => {
  const bounds = getLogicalBoardBoundsFromRenderedNodes({
    nodeRects: [
      { height: 25, left: -50, top: -30, width: 50 },
      { height: 50, left: 450, top: 170, width: 100 }
    ],
    rootRect: { left: 50, top: 20 },
    viewport: { x: -100, y: -50, zoom: 0.5 }
  });

  assert.deepEqual(bounds, { height: 500, width: 1200, x: 0, y: 0 });
});

test("full Board thumbnail viewport contains every logical node with a stable margin", () => {
  const viewport = getFullBoardThumbnailViewport(
    { height: 500, width: 1200, x: 0, y: 0 },
    { height: 720, width: 1280 }
  );

  assert.ok(Math.abs(viewport.x - 102.4) < 0.0001);
  assert.equal(viewport.y, 136);
  assert.equal(viewport.zoom, 0.896);
});
