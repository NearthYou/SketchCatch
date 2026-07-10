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

test("diagram editor keeps the canvas white with a smaller dotted grid", () => {
  const editorShellBlock = getCssBlock(".editorShell");
  const canvasPanelBlock = getCssBlock(".canvasPanel");
  const reactFlowBlock = getCssRuleContaining(".canvasPanel :global(.react-flow)");

  assert.match(editorShellBlock, /--workspace-page:\s*#ffffff;/);
  assert.match(canvasPanelBlock, /background:\s*var\(--workspace-page\);/);
  assert.match(reactFlowBlock, /background:\s*var\(--workspace-page\);/);
  assert.match(
    diagramEditorSource,
    /<Background\s+bgColor="#ffffff"\s+color="#d8e0ef"\s+gap=\{24\}\s+size=\{1\}\s+variant=\{BackgroundVariant\.Dots\}\s+\/>/
  );
});

test("diagram editor shows the workspace context switcher without save status text", () => {
  const contextLinkBlock = getCssBlock(".toolbarContextLink");
  const avatarBlock = getCssBlock(".toolbarAvatar");
  const userNameBlock = getCssBlock(".toolbarUserName");

  assert.match(diagramEditorSource, /dashboardHref = "\/dashboard"/);
  assert.match(diagramEditorSource, /href=\{dashboardHref\}/);
  assert.match(diagramEditorSource, /workspaceUserName = "Personal workspace"/);
  assert.match(diagramEditorSource, /getWorkspaceInitials\(workspaceUserName\)/);
  assert.match(diagramEditorSource, /className=\{styles\.toolbarContextLink\}/);
  assert.match(diagramEditorSource, /className=\{styles\.toolbarProjectName\}/);
  assert.match(diagramEditorSource, /className=\{styles\.toolbarUserName\}/);
  assert.doesNotMatch(diagramEditorSource, /ChevronDown/);
  assert.doesNotMatch(diagramEditorSource, /myPageHref/);
  assert.doesNotMatch(diagramEditorSource, /className=\{styles\.toolbarStatus\}/);
  assert.doesNotMatch(diagramEditorSource, /<span>\{saveStatus\}<\/span>/);

  assert.match(contextLinkBlock, /grid-template-columns:\s*34px minmax\(0, 1fr\);/);
  assert.match(contextLinkBlock, /background:\s*var\(--workspace-surface\);/);
  assert.match(contextLinkBlock, /border:\s*1px solid var\(--workspace-line\);/);
  assert.match(contextLinkBlock, /border-radius:\s*8px;/);
  assert.match(avatarBlock, /background:\s*var\(--workspace-accent\);/);
  assert.match(userNameBlock, /color:\s*var\(--workspace-muted\);/);
});

test("collapsed right panel does not leave the mobile fixed rail shell visible", () => {
  const collapsedMobileRightRailRule = getCssRuleContaining(".editorShellRightCollapsed .rightRail");

  assert.match(collapsedMobileRightRailRule, /background:\s*transparent;/);
  assert.match(collapsedMobileRightRailRule, /border:\s*0;/);
  assert.match(collapsedMobileRightRailRule, /box-shadow:\s*none;/);
  assert.match(collapsedMobileRightRailRule, /height:\s*0;/);
  assert.match(collapsedMobileRightRailRule, /width:\s*0;/);
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

test("area node header sits inside a rectangular area node", () => {
  const areaBlock = getCssBlock(".nodeShellArea");
  const headerBlock = getCssBlock(".areaNodeHeader");

  assert.match(areaBlock, /--area-body-background:\s*rgba\(255,\s*255,\s*255,\s*0\.14\);/);
  assert.match(areaBlock, /--area-border-width:\s*2px;/);
  assert.match(areaBlock, /--area-border-color:\s*var\(--node-border-color, #cbd5e1\);/);
  assert.match(areaBlock, /background:\s*var\(--area-body-background\);/);
  assert.doesNotMatch(areaBlock, /border-top-left-radius:\s*0;/);
  assert.match(headerBlock, /background:\s*transparent;/);
  assert.match(headerBlock, /border:\s*0;/);
  assert.match(headerBlock, /left:\s*14px;/);
  assert.match(headerBlock, /top:\s*14px;/);
  assert.doesNotMatch(headerBlock, /transform:\s*translateY\(-100%\);/);
  assert.equal(diagramEditorStyles.includes(".areaNodeHeader::before {"), false);
  assert.equal(diagramEditorStyles.includes(".areaNodeHeader::after {"), false);
});

test("manual resize relies on node size effects to refresh React Flow internals", () => {
  assert.match(diagramNodeViewSource, /useEffect\(\(\) => \{\s*updateNodeInternals\(id\);/);
  assert.doesNotMatch(
    diagramNodeViewSource,
    /window\.requestAnimationFrame\(\(\) => updateNodeInternals\(id\)\)/
  );
});

test("parameter updates synchronize all reference edges within one diagram update transaction", () => {
  assert.match(
    diagramEditorSource,
    /const nextNodes = updateNodeById\(currentDiagram\.nodes, nodeId, \(node\) =>\s*applyNodeParametersUpdateWithResourceLabel\(node, update\)\s*\);/s
  );
  assert.match(
    diagramEditorSource,
    /nodes: nextNodes,\s*edges: syncParameterReferenceEdges\(nextNodes, currentDiagram\.edges\)/s
  );
});

test("new resource drops expand assigned parent areas before applying reference targets", () => {
  assert.match(
    diagramEditorSource,
    /const nodesWithAssignedParents = applyAreaNodeParentAssignments\(\s*nodesWithNextNode,\s*new Set\(\[nextNode\.id\]\)\s*\);\s*const nodesWithExpandedParents =\s*expandParentAreaNodesForChildren\(nodesWithAssignedParents,\s*new Set\(\[nextNode\.id\]\)\);\s*return \{\s*\.\.\.currentDiagram,\s*nodes: applyContainingReferenceDropTargets\(\s*nodesWithExpandedParents,/s
  );
  assert.doesNotMatch(
    diagramEditorSource,
    /nodes: applyContainingReferenceDropTargets\(\s*nodesWithAssignedParents,\s*new Set\(\[nextNode\.id\]\)/s
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
