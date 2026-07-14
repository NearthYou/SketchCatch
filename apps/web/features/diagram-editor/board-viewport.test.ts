import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyInitialSourceViewBoxViewport,
  getBoardZoomPresentationScale,
  getCenteredBoardViewport,
  getSourceViewBoxMinimumZoom,
  getSourceViewBoxViewport,
  getUnobscuredBoardViewportFrame,
  offsetBoardViewportToFrame,
  rebaseBoardViewport,
  parseBoardZoom
} from "./board-viewport";

test("parses only finite board zooms inside the editor range", () => {
  assert.equal(parseBoardZoom("0.25"), 0.25);
  assert.equal(parseBoardZoom("0.50"), 0.5);
  assert.equal(parseBoardZoom("0.75"), 0.75);
  assert.equal(parseBoardZoom("1"), 1);
  assert.equal(parseBoardZoom("1.35"), 1.35);
  assert.equal(parseBoardZoom("2"), 2);

  for (const value of [undefined, "", "0.24", "2.01", "NaN", "1x"]) {
    assert.equal(parseBoardZoom(value), undefined, String(value));
  }
});

test("centers fixed diagram bounds at the requested exact zoom", () => {
  assert.deepEqual(
    getCenteredBoardViewport(
      { x: 100, y: 200, width: 400, height: 200 },
      { width: 1_000, height: 800 },
      0.5
    ),
    { x: 350, y: 250, zoom: 0.5 }
  );
  assert.deepEqual(
    getCenteredBoardViewport(
      { x: 100, y: 200, width: 400, height: 200 },
      { x: 370, y: 0, width: 630, height: 800 },
      0.5
    ),
    { x: 535, y: 250, zoom: 0.5 }
  );
});

test("measures open and collapsed left overlays as unobscured board frames", () => {
  const canvas = { x: 0, y: 0, width: 1_000, height: 800 };

  assert.deepEqual(
    getUnobscuredBoardViewportFrame(canvas, { x: 12, y: 72, width: 346, height: 716 }),
    { x: 370, y: 0, width: 630, height: 800 }
  );
  assert.deepEqual(
    getUnobscuredBoardViewportFrame(canvas, { x: 12, y: 72, width: 46, height: 92 }),
    { x: 70, y: 0, width: 930, height: 800 }
  );
  assert.deepEqual(
    getUnobscuredBoardViewportFrame(
      canvas,
      { x: 12, y: 72, width: 346, height: 716 },
      12,
      { top: 84, bottom: 72 }
    ),
    { x: 370, y: 84, width: 630, height: 644 }
  );
  assert.deepEqual(getUnobscuredBoardViewportFrame(canvas, null), {
    x: 0,
    y: 0,
    width: 1_000,
    height: 800
  });
});

test("offsets fitted viewports and rebases panel changes without changing zoom", () => {
  assert.deepEqual(
    offsetBoardViewportToFrame(
      { x: 100, y: 80, zoom: 0.75 },
      { x: 370, y: 0, width: 630, height: 800 }
    ),
    { x: 470, y: 80, zoom: 0.75 }
  );
  assert.deepEqual(
    rebaseBoardViewport(
      { x: 470, y: 80, zoom: 0.75 },
      { x: 370, y: 0, width: 630, height: 800 },
      { x: 70, y: 0, width: 930, height: 800 }
    ),
    { x: 320, y: 80, zoom: 0.75 }
  );
});

test("uses a stable one-pixel fallback for invalid canvas dimensions", () => {
  assert.deepEqual(
    getCenteredBoardViewport(
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 0, height: Number.NaN },
      1
    ),
    { x: -49.5, y: -49.5, zoom: 1 }
  );
});

test("keeps low-zoom labels readable and coarse controls screen-sized", () => {
  assert.deepEqual(getBoardZoomPresentationScale(0.25), {
    compactLabelScale: 3,
    controlScale: 4
  });
  assert.deepEqual(getBoardZoomPresentationScale(0.5), {
    compactLabelScale: 1.5,
    controlScale: 2
  });
  assert.deepEqual(getBoardZoomPresentationScale(0.75), {
    compactLabelScale: 1,
    controlScale: 4 / 3
  });
  assert.deepEqual(getBoardZoomPresentationScale(1), {
    compactLabelScale: 1,
    controlScale: 1
  });
});

test("fits negative wide source bounds exactly inside the unobscured frame at padding zero", () => {
  const sourceViewBox = { x: -500, y: -40, width: 1_500, height: 900 };
  const frame = { x: 370, y: 84, width: 630, height: 644 };
  const viewport = getSourceViewBoxViewport(sourceViewBox, frame);

  assert.equal(viewport.zoom, 0.42);
  assertSourceBoundsAreContained(sourceViewBox, frame, viewport);
  assertAlmostEqual(sourceViewBox.x * viewport.zoom + viewport.x, frame.x);
  assertAlmostEqual(
    (sourceViewBox.x + sourceViewBox.width) * viewport.zoom + viewport.x,
    frame.x + frame.width
  );
});

test("fits tall source bounds exactly inside the unobscured frame at padding zero", () => {
  const sourceViewBox = { x: -120, y: -600, width: 400, height: 1_600 };
  const frame = { x: 70, y: 84, width: 930, height: 644 };
  const viewport = getSourceViewBoxViewport(sourceViewBox, frame);

  assert.equal(viewport.zoom, 0.4025);
  assertSourceBoundsAreContained(sourceViewBox, frame, viewport);
  assertAlmostEqual(sourceViewBox.y * viewport.zoom + viewport.y, frame.y);
  assertAlmostEqual(
    (sourceViewBox.y + sourceViewBox.height) * viewport.zoom + viewport.y,
    frame.y + frame.height
  );
});

test("uses a stable one-pixel fallback when fitting a source viewBox without a valid frame", () => {
  assert.deepEqual(
    getSourceViewBoxViewport(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: 0, height: Number.NaN }
    ),
    { x: 0, y: 0, zoom: 0.01 }
  );
});

test("lowers the board minimum zoom only when source bounds require it", () => {
  const frame = { x: 0, y: 0, width: 1_000, height: 800 };
  const extremelyLargeSourceViewBox = {
    x: -500_000,
    y: -500_000,
    width: 1_000_000,
    height: 1_000_000
  };
  const exactViewport = getSourceViewBoxViewport(extremelyLargeSourceViewBox, frame);

  assert.equal(
    getSourceViewBoxMinimumZoom({ x: 0, y: 0, width: 2_000, height: 1_000 }, frame),
    0.25
  );
  assert.equal(
    getSourceViewBoxMinimumZoom({ x: 0, y: 0, width: 50_000, height: 20_000 }, frame),
    0.02
  );
  assert.equal(
    getSourceViewBoxMinimumZoom(extremelyLargeSourceViewBox, frame),
    0.01
  );
  assert.equal(exactViewport.zoom, 0.0008);
  assertSourceBoundsAreContained(extremelyLargeSourceViewBox, frame, exactViewport);
});

test("consumes a pending source viewport once and preserves the saved viewport on reload", () => {
  const frame = { x: 370, y: 84, width: 630, height: 644 };
  const pendingDiagram = {
    nodes: [],
    edges: [],
    viewport: { x: 17, y: 23, zoom: 0.8 },
    presentation: {
      geometryPolicy: "source-exact" as const,
      sourceViewBox: { x: -500, y: -40, width: 1_500, height: 900 },
      initialViewportPending: true
    }
  };

  const appliedDiagram = applyInitialSourceViewBoxViewport(pendingDiagram, frame);
  const independentlyAppliedDiagram = applyInitialSourceViewBoxViewport(
    structuredClone(pendingDiagram),
    frame
  );

  assert.notStrictEqual(appliedDiagram, pendingDiagram);
  assert.deepEqual(appliedDiagram, independentlyAppliedDiagram);
  assert.deepEqual(appliedDiagram.viewport, { x: 580, y: 233.8, zoom: 0.42 });
  assert.equal(appliedDiagram.presentation?.initialViewportPending, false);
  assert.equal(pendingDiagram.presentation.initialViewportPending, true);
  assert.strictEqual(applyInitialSourceViewBoxViewport(appliedDiagram, frame), appliedDiagram);

  const savedReloadDiagram = {
    ...appliedDiagram,
    viewport: { x: -91, y: 124, zoom: 0.3 }
  };

  assert.strictEqual(
    applyInitialSourceViewBoxViewport(savedReloadDiagram, frame),
    savedReloadDiagram
  );
});

test("leaves legacy diagrams unchanged even if they carry source-like metadata", () => {
  const legacyDiagram = {
    nodes: [],
    edges: [],
    viewport: { x: 10, y: 20, zoom: 0.8 },
    presentation: {
      geometryPolicy: "catalog-normalized" as const,
      sourceViewBox: { x: 0, y: 0, width: 50_000, height: 20_000 },
      initialViewportPending: true
    }
  };

  assert.strictEqual(
    applyInitialSourceViewBoxViewport(
      legacyDiagram,
      { x: 0, y: 0, width: 1_000, height: 800 }
    ),
    legacyDiagram
  );
});

function assertSourceBoundsAreContained(
  sourceViewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  viewport: { readonly x: number; readonly y: number; readonly zoom: number }
): void {
  const left = sourceViewBox.x * viewport.zoom + viewport.x;
  const top = sourceViewBox.y * viewport.zoom + viewport.y;
  const right = (sourceViewBox.x + sourceViewBox.width) * viewport.zoom + viewport.x;
  const bottom = (sourceViewBox.y + sourceViewBox.height) * viewport.zoom + viewport.y;

  const epsilon = 1e-9;

  assert.ok(left >= frame.x - epsilon);
  assert.ok(top >= frame.y - epsilon);
  assert.ok(right <= frame.x + frame.width + epsilon);
  assert.ok(bottom <= frame.y + frame.height + epsilon);
}

function assertAlmostEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${actual} !== ${expected}`);
}
