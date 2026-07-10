import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_PALETTE_ITEMS } from "./constants";

test("default resource palette icons create 48px nodes", () => {
  const resourceItems = DEFAULT_PALETTE_ITEMS.filter((item) => item.category !== "Design");

  assert.ok(resourceItems.length > 0);
  for (const item of resourceItems) {
    assert.deepEqual(item.nodeDefaults.size, { width: 48, height: 48 }, item.id);
  }
});
