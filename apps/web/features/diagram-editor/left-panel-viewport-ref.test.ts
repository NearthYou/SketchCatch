import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);

test("collapsed left panel leaves no shortcut rail beside the board", () => {
  assert.match(
    diagramEditorSource,
    /<div className=\{styles\.leftRail\} ref=\{leftRailRef\}>/
  );
  assert.doesNotMatch(
    diagramEditorSource,
    /collapsedLeftPanel|Open resources panel|Open templates panel/
  );
});
