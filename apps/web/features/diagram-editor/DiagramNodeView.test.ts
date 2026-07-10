import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const diagramNodeViewSource = readFileSync(
  fileURLToPath(new URL("./DiagramNodeView.tsx", import.meta.url)),
  "utf8"
);
const diagramEditorCssSource = readFileSync(
  fileURLToPath(new URL("./diagram-editor.module.css", import.meta.url)),
  "utf8"
);

test("diagram node view renders source and target handles matching edge mapper ids", () => {
  assert.match(diagramNodeViewSource, /id=\{`source-\$\{handle\.id\}`\}/);
  assert.match(diagramNodeViewSource, /type="source"/);
  assert.match(diagramNodeViewSource, /id=\{`target-\$\{handle\.id\}`\}/);
  assert.match(diagramNodeViewSource, /type="target"/);
  assert.match(diagramNodeViewSource, /isConnectable=\{canConnect\}/);
});

test("diagram node view renders icon design nodes with resource icon tile layout", () => {
  assert.match(
    diagramNodeViewSource,
    /usesIconTileLayout = isResourceNode \|\| \(node\.kind === "design" && !isArea && Boolean\(node\.iconUrl\)\)/
  );
  assert.match(
    diagramNodeViewSource,
    /usesIconTileLayout \? styles\.nodeShellResource : styles\.nodeShellDesign/
  );
  assert.match(diagramNodeViewSource, /\) : usesIconTileLayout \? \(/);
  assert.match(
    diagramNodeViewSource,
    /resizeMode: usesIconTileLayout && !isArea \? "square" : "free"/
  );
});

test("resource node shells reset inherited box constraints to match explicit geometry", () => {
  assert.match(
    diagramEditorCssSource,
    /\.nodeShell\s*\{[^}]*border:\s*2px solid #9aa5b8;[^}]*min-height:\s*72px;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellResource\s*\{[^}]*border-width:\s*0;[^}]*min-height:\s*0;/s
  );
});

test("diagram node view renders resource icon labels in bold", () => {
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeLabel\s*\{[^}]*font-weight:\s*900;/
  );
});

test("resource icon frames cover the dotted canvas grid", () => {
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeIconFrame\s*\{[^}]*background:\s*#ffffff;/s
  );
});

test("resource labels stay outside the icon-only resize geometry", () => {
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeIconFrame\s*\{[^}]*max-height:\s*100%;[^}]*max-width:\s*100%;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeLabel\s*\{[^}]*left:\s*50%;[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 4px\);[^}]*transform:\s*translateX\(-50%\);/s
  );
});

test("manual resize handles are small hollow squares", () => {
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid #6f4cf6;[^}]*border-radius:\s*1px;[^}]*height:\s*8px;[^}]*width:\s*8px;/s
  );
});

test("hides Terraform data source implementation labels", () => {
  assert.doesNotMatch(diagramNodeViewSource, /resourceNodeBadge/);
  assert.doesNotMatch(diagramNodeViewSource, /isDataNode/);
  assert.doesNotMatch(diagramEditorCssSource, /\.resourceNodeBadge\s*\{/);
});

test("uses the presentation-only label helper", () => {
  assert.match(diagramNodeViewSource, /getResourceNodeDisplayLabel\(node\)/);
  assert.match(
    diagramNodeViewSource,
    /isResourceNode\s*\?\s*getResourceNodeDisplayLabel\(node\)\s*:\s*getAreaNodeLabel\(node\)\.toLocaleUpperCase\(\)/s
  );
  assert.doesNotMatch(diagramNodeViewSource, /parameters\?\.resourceName\?\.trim/);
});

test("diagram node view applies computed area border style through CSS variables", () => {
  assert.match(diagramNodeViewSource, /getNodeDisplayBorderStyle/);
  assert.match(diagramNodeViewSource, /"--area-border-style": borderStyle/);
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellArea\s*\{[^}]*border-style:\s*var\(--area-border-style,\s*solid\);/
  );
});
