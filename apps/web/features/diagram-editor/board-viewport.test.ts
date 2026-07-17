import assert from "node:assert/strict";
import test from "node:test";

import { getFitViewMinimumZoom } from "./board-viewport";

test("fit view allows the zoom required to contain an extremely large diagram", () => {
  const minimumZoom = getFitViewMinimumZoom(
    { x: 0, y: 0, width: 1_000_000, height: 800_000 },
    { width: 1_000, height: 600 },
    0.24
  );

  assert.ok(minimumZoom < 0.01);
  assert.ok(minimumZoom <= 600 / (800_000 * 1.24));
});
