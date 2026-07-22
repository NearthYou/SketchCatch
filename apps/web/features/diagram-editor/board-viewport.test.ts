import assert from "node:assert/strict";
import test from "node:test";

import { getBoardZoomPresentationScale, getFitViewMinimumZoom } from "./board-viewport";

test("fit view allows the zoom required to contain an extremely large diagram", () => {
  const minimumZoom = getFitViewMinimumZoom(
    { x: 0, y: 0, width: 1_000_000, height: 800_000 },
    { width: 1_000, height: 600 },
    0.24
  );

  assert.ok(minimumZoom < 0.01);
  assert.ok(minimumZoom <= 600 / (800_000 * 1.24));
});

test("visible twelve pixel labels remain at least twelve screen pixels while zoomed out", () => {
  for (const zoom of [0.01, 0.1, 0.25, 0.5, 0.75, 0.99]) {
    const scale = getBoardZoomPresentationScale(zoom).compactLabelScale;
    assert.ok(12 * scale * zoom >= 12, `expected readable label at zoom ${zoom}`);
  }

  assert.equal(getBoardZoomPresentationScale(1.25).compactLabelScale, 1);
});
