import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AREA_AUTO_EXPAND_STORAGE_KEY,
  readAutoExpandAreasEnabled,
  writeAutoExpandAreasEnabled
} from "./area-auto-expand-preference";

test("readAutoExpandAreasEnabled defaults to ON for missing or invalid values", () => {
  assert.equal(readAutoExpandAreasEnabled(null), true);
  assert.equal(readAutoExpandAreasEnabled(makeStorage()), true);
  assert.equal(readAutoExpandAreasEnabled(makeStorage("invalid")), true);
  assert.equal(readAutoExpandAreasEnabled(makeStorage("true")), true);
});

test("readAutoExpandAreasEnabled restores an explicit OFF preference", () => {
  assert.equal(readAutoExpandAreasEnabled(makeStorage("false")), false);
});

test("writeAutoExpandAreasEnabled persists the boolean preference under the Board key", () => {
  const writes: Array<[string, string]> = [];

  writeAutoExpandAreasEnabled(
    {
      setItem: (key, value) => writes.push([key, value])
    },
    false
  );

  assert.deepEqual(writes, [[AREA_AUTO_EXPAND_STORAGE_KEY, "false"]]);
});

function makeStorage(value?: string): Pick<Storage, "getItem"> {
  return {
    getItem: (key) =>
      key === AREA_AUTO_EXPAND_STORAGE_KEY && value !== undefined ? value : null
  };
}
