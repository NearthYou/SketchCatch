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

test("getResourceNodeIconFrameSize reserves label space below the icon", () => {
  assert.equal(getResourceNodeIconFrameSize({ width: 112, height: 112 }), 90);
  assert.equal(getResourceNodeIconFrameSize({ width: 168, height: 96 }), 74);
});

test("getResourceNodeIconFrameSize fits compact regular and fallback resource nodes", () => {
  assert.equal(getResourceNodeIconFrameSize({ width: 62, height: 48 }), 26);
  assert.equal(getResourceNodeIconFrameSize({ width: 28, height: 28 }), 14);
});
