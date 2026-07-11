import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOARD_DEFAULT_EDGE_COLOR,
  DEFAULT_PALETTE_ITEMS,
  EDGE_COLOR_SWATCHES,
  EDGE_LABEL_MIN_ZOOM
} from "./constants";

test("default resource palette icons create 48px icon nodes", () => {
  const resourceItems = DEFAULT_PALETTE_ITEMS.filter((item) => item.category !== "Design");

  assert.ok(resourceItems.length > 0);
  for (const item of resourceItems) {
    assert.deepEqual(item.nodeDefaults.size, { width: 48, height: 48 }, item.id);
  }
});

test("edge labels become persistent at 75 percent zoom", () => {
  assert.equal(EDGE_LABEL_MIN_ZOOM, 0.75);
});

test("edge creation and toolbar share the Board semantic default color", () => {
  assert.equal(BOARD_DEFAULT_EDGE_COLOR, "#59687d");
  assert.equal(EDGE_COLOR_SWATCHES[0], BOARD_DEFAULT_EDGE_COLOR);
});
