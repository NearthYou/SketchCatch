import assert from "node:assert/strict";
import { test } from "node:test";

import { getBoardNodeStateBadge, getBoardZoomLevel } from "./board-visual-state";

test("quantizes board zoom at the 50 and 75 percent LOD boundaries", () => {
  assert.equal(getBoardZoomLevel(0.25), "far");
  assert.equal(getBoardZoomLevel(0.49), "far");
  assert.equal(getBoardZoomLevel(0.5), "medium");
  assert.equal(getBoardZoomLevel(0.74), "medium");
  assert.equal(getBoardZoomLevel(0.75), "full");
  assert.equal(getBoardZoomLevel(1.35), "full");
});

test("maps only explicit patch states to non-color glyph badges", () => {
  assert.equal(getBoardNodeStateBadge(undefined), null);
  assert.deepEqual(getBoardNodeStateBadge("added"), {
    glyph: "+",
    label: "추가됨",
    tone: "success"
  });
  assert.deepEqual(getBoardNodeStateBadge("modified"), {
    glyph: "~",
    label: "수정됨",
    tone: "warning"
  });
  assert.deepEqual(getBoardNodeStateBadge("deleted"), {
    glyph: "−",
    label: "삭제됨",
    tone: "danger"
  });
});
