import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);

test("diagram editor uses partial box selection for overlapping area nodes", () => {
  assert.match(diagramEditorSource, /selectionOnDrag=\{interactionMode === "select" && !isPreviewActive\}/);
  assert.match(diagramEditorSource, /selectionMode=\{SelectionMode\.Partial\}/);
});

test("diagram editor exposes a floating panel slot over the workspace", () => {
  assert.match(diagramEditorSource, /floatingPanel/);
  assert.match(diagramEditorSource, /floatingPanel\?\.\(panelContext\)/);
  assert.match(diagramEditorSource, /className=\{styles\.floatingPanelSlot\}/);
});
