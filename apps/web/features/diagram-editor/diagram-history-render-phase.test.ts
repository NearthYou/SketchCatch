import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);

function getCallbackSource(startMarker: string, endMarker: string): string {
  const startIndex = diagramEditorSource.indexOf(startMarker);
  const endIndex = diagramEditorSource.indexOf(endMarker, startIndex);

  assert.ok(startIndex >= 0, `Missing callback marker: ${startMarker}`);
  assert.ok(endIndex > startIndex, `Missing callback boundary: ${endMarker}`);

  return diagramEditorSource.slice(startIndex, endIndex);
}

test("undo publishes the restored diagram outside the history state updater", () => {
  const undoSource = getCallbackSource(
    "const undo = useCallback",
    "const redo = useCallback"
  );

  assert.match(undoSource, /replaceDiagram\(/u);
  assert.doesNotMatch(
    undoSource,
    /setHistory\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*replaceDiagram\(/u
  );
});

test("redo publishes the restored diagram outside the history state updater", () => {
  const redoSource = getCallbackSource(
    "const redo = useCallback",
    "const addCuratedModule = useCallback"
  );

  assert.match(redoSource, /replaceDiagram\(/u);
  assert.doesNotMatch(
    redoSource,
    /setHistory\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*replaceDiagram\(/u
  );
});
