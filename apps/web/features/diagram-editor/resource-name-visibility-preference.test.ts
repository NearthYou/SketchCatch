import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readResourceNamesVisible,
  RESOURCE_NAME_VISIBILITY_STORAGE_KEY,
  writeResourceNamesVisible
} from "./resource-name-visibility-preference";

test("resource names stay hidden until explicitly enabled", () => {
  assert.equal(readResourceNamesVisible(null), false);
  assert.equal(readResourceNamesVisible(createStorage()), false);
});

test("resource name visibility persists the selected display mode", () => {
  const storage = createStorage();

  writeResourceNamesVisible(storage, true);
  assert.equal(storage.getItem(RESOURCE_NAME_VISIBILITY_STORAGE_KEY), "true");
  assert.equal(readResourceNamesVisible(storage), true);

  writeResourceNamesVisible(storage, false);
  assert.equal(readResourceNamesVisible(storage), false);
});

function createStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}