import assert from "node:assert/strict";
import { test } from "node:test";

import { getResourceNodeIconFrameSize } from "./resource-node-icon-size";

test("getResourceNodeIconFrameSize changes smoothly while resizing square resource nodes", () => {
  let previousSize = getResourceNodeIconFrameSize({ width: 74, height: 74 });

  for (let side = 75; side <= 260; side += 1) {
    const nextSize = getResourceNodeIconFrameSize({ width: side, height: side });

    assert.ok(nextSize >= previousSize, `expected ${nextSize}px to be at least ${previousSize}px at ${side}px`);
    assert.ok(nextSize - previousSize <= 1, `expected resize step at ${side}px to grow by 1px or less`);
    previousSize = nextSize;
  }
});

test("getResourceNodeIconFrameSize uses the full square node when the label is external", () => {
  assert.equal(getResourceNodeIconFrameSize({ width: 48, height: 48 }), 48);
  assert.equal(getResourceNodeIconFrameSize({ width: 28, height: 28 }), 28);
});
