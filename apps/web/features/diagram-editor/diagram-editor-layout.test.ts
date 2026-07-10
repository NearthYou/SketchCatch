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
const diagramEdgeToolbarSource = readFileSync(
  fileURLToPath(new URL("./DiagramEdgeToolbar.tsx", import.meta.url)),
  "utf8"
);
const workspaceProjectBarSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceProjectBar.tsx", import.meta.url)),
  "utf8"
);

test("Architecture Board styles do not restore the removed purple UI theme", () => {
  assert.doesNotMatch(
    diagramEditorStyles,
    /#6f4cf6|#5f3de8|#8b71ff|#f0edff|#f1edff|#d6cbff|#d8ceff|#dcd2ff|rgba\(111,\s*76,\s*246/i
  );
  assert.match(diagramEdgeToolbarSource, /tone="workspace"/);
  assert.doesNotMatch(diagramEdgeToolbarSource, /tone="purple"/);
});

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

test("diagram editor exposes project, save, and panel controls in one stable top bar", () => {
  const projectBarBlock = getCssBlock(".projectBar");
  const brandLinkBlock = getCssBlock(".projectBarBrand");
  const saveStatusBlock = getCssBlock(".projectBarSaveStatus");

  assert.match(diagramEditorSource, /dashboardHref = "\/dashboard"/);
  assert.match(diagramEditorSource, /workspaceUserName = "Personal workspace"/);
  assert.match(diagramEditorSource, /saveStatus = "편집 중"/);
  assert.match(diagramEditorSource, /<WorkspaceProjectBar/);
  assert.match(diagramEditorSource, /onSave:\s*onDiagramSaveRequest/);
  assert.match(diagramEditorSource, /onToggleLeftPanel:\s*toggleLeftPanel/);
  assert.match(diagramEditorSource, /onToggleRightPanel:\s*toggleRightPanel/);

  assert.match(workspaceProjectBarSource, /src="\/sketchcatch-logo\.png"/);
  assert.match(workspaceProjectBarSource, /className=\{styles\.projectBarSaveStatus\}/);
  assert.match(workspaceProjectBarSource, /aria-label="지금 저장"/);
  assert.match(workspaceProjectBarSource, /"리소스 패널 열기"/);
  assert.match(workspaceProjectBarSource, /"Inspector 열기"/);

  assert.match(projectBarBlock, /grid-column:\s*1 \/ -1;/);
  assert.match(projectBarBlock, /height:\s*64px;/);
  assert.match(brandLinkBlock, /background:\s*transparent;/);
  assert.match(saveStatusBlock, /min-width:\s*0;/);
});

test("workspace shell docks both panels and collapses them on compact screens", () => {
  const editorShellBlock = getCssBlock(".editorShell");
  const compactRule = getCssRuleContaining("@media (max-width: 1120px)");

  assert.match(editorShellBlock, /grid-template-rows:\s*64px minmax\(0, 1fr\);/);
  assert.match(diagramEditorStyles, /\.leftRail\s*\{[^}]*grid-row:\s*2;[^}]*position:\s*relative;/s);
  assert.match(diagramEditorStyles, /\.rightRail\s*\{[^}]*grid-row:\s*2;[^}]*position:\s*relative;/s);
  assert.match(compactRule, /grid-template-columns:\s*0 minmax\(0, 1fr\) 0;/);
  assert.match(diagramEditorSource, /matchMedia\("\(max-width: 1120px\)"\)/);
});

test("compact workspace refits the board without changing the saved DiagramJson", () => {
  assert.match(diagramEditorSource, /const fitVisibleDiagram = useCallback/);
  assert.match(diagramEditorSource, /const runViewportMoveWithoutPersistence = useCallback/);
  assert.match(
    diagramEditorSource,
    /const handleMoveEnd[\s\S]*?persistViewportAfterMove\([\s\S]*?automaticViewportMoveRequestIdRef\.current/
  );
  assert.match(
    diagramEditorSource,
    /initialAutoFitFrameRef\.current = null;[\s\S]*?fitVisibleDiagram\(false\);/
  );
  assert.match(
    diagramEditorSource,
    /function refitCompactBoard\(\): void \{[\s\S]*?window\.innerWidth > 1120[\s\S]*?fitVisibleDiagram\(false\)/
  );
  assert.match(diagramEditorSource, /new ResizeObserver\(refitCompactBoard\)/);
  assert.match(
    diagramEditorSource,
    /function handleWindowResize\(\): void \{[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?fitVisibleDiagram\(false\)/
  );
});

test("fit view uses the visible canvas width after docked panels take space", () => {
  assert.match(
    diagramEditorSource,
    /getViewportForBounds\(\s*getDiagramBounds\(currentNodes\),\s*canvasBounds\.width,\s*canvasBounds\.height/s
  );
  assert.doesNotMatch(diagramEditorSource, /const fitViewWidth = editorBounds/);
});

test("viewport controls use the React Flow instance received from onInit", () => {
  assert.match(diagramEditorSource, /const fallbackFlowInstanceRef = useRef\(reactFlow\);/);
  assert.match(diagramEditorSource, /fallbackFlowInstanceRef\.current = reactFlow;/);
  assert.match(diagramEditorSource, /const getFlowInstance = useCallback/);
  assert.match(
    diagramEditorSource,
    /\(\) => flowInstanceRef\.current \?\? fallbackFlowInstanceRef\.current,\s*\[\]/
  );
  assert.match(diagramEditorSource, /const handleZoomIn[\s\S]*?getFlowInstance\(\)\.zoomIn/);
  assert.match(diagramEditorSource, /const handleZoomOut[\s\S]*?getFlowInstance\(\)\.zoomOut/);
  assert.match(diagramEditorSource, /const fitVisibleDiagram[\s\S]*?const flowInstance = getFlowInstance\(\)/);
});

test("a single node click opens the matching resource inspector", () => {
  assert.match(
    diagramEditorSource,
    /const handleFlowNodeClick[\s\S]*?setSelectedNodeIds\(\[node\.id\]\);[\s\S]*?setInspectedNodeId\(node\.id\);[\s\S]*?setRightPanelOpen\(true\);/
  );
});

test("reverse preview can opt into read-only resource inspection", () => {
  assert.match(diagramEditorSource, /allowPreviewInspection = false/);
  assert.match(diagramEditorSource, /elementsSelectable=\{!isPreviewActive \|\| allowPreviewInspection\}/);
  assert.match(
    diagramEditorSource,
    /!isPreviewActive \|\| allowPreviewInspection\s*\? \{ onNodeClick: handleFlowNodeClick \}/s
  );
});

test("a dedicated workflow can replace the default empty board guidance", () => {
  assert.match(diagramEditorSource, /emptyBoardDescription = "왼쪽 Resource에서 필요한 항목을 끌어오세요\."/);
  assert.match(diagramEditorSource, /<span>\{emptyBoardDescription\}<\/span>/);
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
