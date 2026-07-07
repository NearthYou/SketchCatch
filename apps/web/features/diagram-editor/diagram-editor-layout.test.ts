import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("./DiagramEditor.tsx", import.meta.url)),
  "utf8"
);
const diagramEditorStyles = readFileSync(
  fileURLToPath(new URL("./diagram-editor.module.css", import.meta.url)),
  "utf8"
);
const diagramNodeViewSource = readFileSync(
  fileURLToPath(new URL("./DiagramNodeView.tsx", import.meta.url)),
  "utf8"
);

test("diagram editor uses partial box selection for overlapping area nodes", () => {
  assert.match(diagramEditorSource, /selectionOnDrag=\{interactionMode === "select" && !isPreviewActive\}/);
  assert.match(diagramEditorSource, /selectionMode=\{SelectionMode\.Partial\}/);
});

test("diagram editor restores select mode after temporary middle-button pan", () => {
  assert.match(diagramEditorSource, /getTemporaryPanReleaseMode/);
  assert.match(diagramEditorSource, /window\.addEventListener\("pointerup",\s*restoreTemporaryPanMode\)/);
  assert.match(diagramEditorSource, /window\.addEventListener\("pointercancel",\s*restoreTemporaryPanMode\)/);
});

test("diagram editor clears active connection handles on fallback release events", () => {
  assert.match(diagramEditorSource, /window\.addEventListener\("pointerup",\s*clearConnectionActivityOnRelease\)/);
  assert.match(diagramEditorSource, /window\.addEventListener\("mouseup",\s*clearConnectionActivityOnRelease\)/);
  assert.match(diagramEditorSource, /window\.addEventListener\("pointercancel",\s*resetConnectionStateOnCancel\)/);
  assert.match(diagramEditorSource, /window\.addEventListener\("blur",\s*resetConnectionStateOnCancel\)/);
  assert.match(diagramEditorSource, /window\.removeEventListener\("pointerup",\s*clearConnectionActivityOnRelease\)/);
  assert.match(diagramEditorSource, /window\.removeEventListener\("blur",\s*resetConnectionStateOnCancel\)/);
});

test("right panel resize handle does not show a purple hover rail", () => {
  const rightRailStateRule = getCssRuleContaining(".rightRailResizeHandle:hover::after");

  assert.match(rightRailStateRule, /background:\s*transparent;/);
  assert.match(rightRailStateRule, /box-shadow:\s*none;/);
  assert.doesNotMatch(rightRailStateRule, /#7c5cff/);
  assert.doesNotMatch(rightRailStateRule, /rgba\(124,\s*92,\s*255/);
});

test("left panel resize handle does not show a purple hover rail", () => {
  const leftRailStateRule = getCssRuleContaining(".leftRailResizeHandle:hover::after");

  assert.match(leftRailStateRule, /background:\s*transparent;/);
  assert.match(leftRailStateRule, /box-shadow:\s*none;/);
  assert.doesNotMatch(leftRailStateRule, /#7c5cff/);
  assert.doesNotMatch(leftRailStateRule, /rgba\(124,\s*92,\s*255/);
});

test("left and right resize handle hover states share one transparent rule", () => {
  assert.match(
    diagramEditorStyles,
    /\.leftRailResizeHandle:hover::after,\s*\.leftRailResizeHandle:focus-visible::after,\s*\.leftRailResizeHandle:active::after,\s*\.rightRailResizeHandle:hover::after,\s*\.rightRailResizeHandle:focus-visible::after,\s*\.rightRailResizeHandle:active::after\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s
  );
});

test("area node header uses a folder tab shape", () => {
  const areaBlock = getCssBlock(".nodeShellArea");
  const headerBlock = getCssBlock(".areaNodeHeader");
  const headerBeforeBlock = getCssBlock(".areaNodeHeader::before");

  assert.match(areaBlock, /--area-body-background:\s*rgba\(255,\s*255,\s*255,\s*0\.14\);/);
  assert.match(areaBlock, /--area-border-width:\s*2px;/);
  assert.match(areaBlock, /--area-border-color:\s*var\(--node-border-color, #8b98aa\);/);
  assert.match(areaBlock, /background:\s*var\(--area-body-background\);/);
  assert.match(areaBlock, /border-top-left-radius:\s*0;/);
  assert.match(headerBlock, /border:\s*var\(--area-border-width\) solid var\(--area-border-color\);/);
  assert.match(headerBlock, /border-bottom:\s*0;/);
  assert.match(headerBlock, /border-radius:\s*10px 18px 0 0;/);
  assert.match(headerBlock, /top:\s*0;/);
  assert.match(headerBlock, /transform:\s*translateY\(-100%\);/);
  assert.doesNotMatch(headerBlock, /border-radius:\s*999px;/);
  assert.match(headerBeforeBlock, /background:\s*var\(--area-body-background\);/);
  assert.equal(diagramEditorStyles.includes(".areaNodeHeader::after {"), false);
});

test("manual resize relies on node size effects to refresh React Flow internals", () => {
  assert.match(diagramNodeViewSource, /useEffect\(\(\) => \{\s*updateNodeInternals\(id\);/);
  assert.doesNotMatch(
    diagramNodeViewSource,
    /window\.requestAnimationFrame\(\(\) => updateNodeInternals\(id\)\)/
  );
});

function getCssBlock(selector: string): string {
  const selectorStart = diagramEditorStyles.indexOf(`${selector} {`);

  assert.notEqual(selectorStart, -1);

  const blockStart = diagramEditorStyles.indexOf("{", selectorStart);
  const blockEnd = diagramEditorStyles.indexOf("}", blockStart);

  assert.notEqual(blockStart, -1);
  assert.notEqual(blockEnd, -1);

  return diagramEditorStyles.slice(blockStart + 1, blockEnd);
}

function getCssRuleContaining(selector: string): string {
  const selectorStart = diagramEditorStyles.indexOf(selector);

  assert.notEqual(selectorStart, -1);

  const blockStart = diagramEditorStyles.indexOf("{", selectorStart);
  const blockEnd = diagramEditorStyles.indexOf("}", blockStart);

  assert.notEqual(blockStart, -1);
  assert.notEqual(blockEnd, -1);

  return diagramEditorStyles.slice(selectorStart, blockEnd + 1);
}
