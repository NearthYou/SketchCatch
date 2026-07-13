import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const panelSource = readFileSync(
  new URL("./ParameterInputPanel.tsx", import.meta.url),
  "utf8"
);

test("MapEditor does not remount a row when its editable key changes", () => {
  assert.doesNotMatch(panelSource, /key=\{`\$\{entryKey\}-\$\{index\}`\}/);
  assert.match(panelSource, /key=\{rowId\}/);
});

test("MapEditor explicitly restores focus after adding or deleting a row", () => {
  assert.match(panelSource, /focusMapEntryAfterChange/);
  assert.match(panelSource, /addButtonRef/);
});
