import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);

test("open and collapsed left panels both expose the viewport measurement ref", () => {
  assert.match(
    diagramEditorSource,
    /<div className=\{styles\.leftRail\} ref=\{leftRailRef\}>/
  );
  assert.match(
    diagramEditorSource,
    /className=\{styles\.collapsedLeftPanel\}[\s\S]*?ref=\{leftRailRef\}/
  );
});
