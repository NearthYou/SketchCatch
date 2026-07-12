import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getBoardZoomPresentationScale,
  getCenteredBoardViewport,
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
