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
const dragTransactionSource = readFileSync(
  fileURLToPath(new URL("./drag-transaction.ts", import.meta.url)),
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

test("diagram editor uses partial box selection for overlapping area nodes", () => {
  assert.match(diagramEditorSource, /selectionOnDrag=\{interactionMode === "select" && !isPreviewActive\}/);
  assert.match(diagramEditorSource, /selectionMode=\{SelectionMode\.Partial\}/);
});

test("clicking any interactive flow node replaces the current single selection", () => {
  const handleFlowNodeClickStart = diagramEditorSource.indexOf("const handleFlowNodeClick = useCallback(");
  const handleFlowNodeClickEnd = diagramEditorSource.indexOf("const handleFlowNodeDoubleClick = useCallback(");

  assert.notEqual(handleFlowNodeClickStart, -1);
  assert.notEqual(handleFlowNodeClickEnd, -1);

  const handleFlowNodeClickSource = diagramEditorSource.slice(handleFlowNodeClickStart, handleFlowNodeClickEnd);

  assert.match(handleFlowNodeClickSource, /setSelectedNodeIds\(\[node\.id\]\)/);
  assert.match(diagramEditorSource, /onNodeClick:\s*handleFlowNodeClick/);
});

test("controlled React Flow selection reuses state when selection membership is unchanged", () => {
  assert.match(
    diagramEditorSource,
    /import \{[\s\S]*stabilizeSelectedIds[\s\S]*\} from "\.\/selection-utils";/
  );
  assert.match(
    diagramEditorSource,
    /setSelectedNodeIds\(\(currentIds\) =>\s*stabilizeSelectedIds\(currentIds, nextSelectedNodeIds\)\s*\)/
  );
  assert.match(
    diagramEditorSource,
    /setSelectedEdgeIds\(\(currentIds\) =>\s*stabilizeSelectedIds\(currentIds, nextSelectedEdgeIds\)\s*\)/
  );
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

test("diagram editor makes click-to-connect and nearby target acquisition explicit", () => {
  assert.match(diagramEditorSource, /connectOnClick=\{true\}/);
  assert.match(
    diagramEditorSource,
    /connectionRadius=\{28 \* boardZoomPresentationScale\.controlScale\}/
  );
});

test("diagram editor restores the light canvas with a restrained two-level grid", () => {
  const editorShellBlock = getCssBlock(".editorShell");
  const canvasPanelBlock = getCssBlock(".canvasPanel");
  const reactFlowBlock = getCssRuleContaining(".canvasPanel :global(.react-flow)");
  const selectionBlock = getCssRuleContaining(".canvasPanel :global(.react-flow__selection)");

  assert.match(editorShellBlock, /--board-canvas:\s*#f6f8fc;/i);
  assert.match(editorShellBlock, /--board-surface:\s*#ffffff;/i);
  assert.match(editorShellBlock, /--board-ink:\s*#172033;/i);
  assert.match(editorShellBlock, /--board-primary:\s*#1f6feb;/i);
  assert.match(canvasPanelBlock, /background:\s*var\(--board-canvas\);/);
  assert.doesNotMatch(canvasPanelBlock, /radial-gradient|linear-gradient/);
  assert.match(reactFlowBlock, /background:\s*transparent;/);
  assert.match(selectionBlock, /border:\s*1px solid var\(--board-primary\);/);
  assert.doesNotMatch(selectionBlock, /dotted/);
  assert.match(
    diagramEditorSource,
    /<Background\s+id="board-grid-major"\s+color="rgba\(101, 116, 139, 0\.18\)"\s+gap=\{80\}\s+size=\{1\.15\}\s+variant=\{BackgroundVariant\.Dots\}\s+\/>/
  );
  assert.match(
    diagramEditorSource,
    /<Background\s+id="board-grid-minor"\s+color="rgba\(101, 116, 139, 0\.1\)"\s+gap=\{16\}\s+size=\{0\.8\}\s+variant=\{BackgroundVariant\.Dots\}\s+\/>/
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

test("fit view uses the unobscured board frame and visual resource bounds", () => {
  assert.match(
    diagramEditorSource,
    /getViewportForBounds\(\s*getDiagramVisualBounds\(currentNodes\),\s*frame\.width,\s*frame\.height/s
  );
  assert.match(diagramEditorSource, /offsetBoardViewportToFrame/);
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

test("a preview-only workflow can hide the project save action", () => {
  assert.match(diagramEditorSource, /showSaveAction = true/);
  assert.match(diagramEditorSource, /showSaveAction,\s*userName:/s);
  assert.match(workspaceProjectBarSource, /\{workspace\.showSaveAction \? \(/);
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

test("area node header uses a rounded icon without a bottom divider", () => {
  const areaBlock = getCssBlock(".nodeShellArea");
  const headerBlock = getCssBlock(".areaNodeHeader");
  const depth0Block = getCssBlock(".nodeShellAreaDepth0");
  const depth1Block = getCssBlock(".nodeShellAreaDepth1");
  const depth2Block = getCssBlock(".nodeShellAreaDepth2");
  const depth3Block = getCssBlock(".nodeShellAreaDepth3");
  const metaBlock = getCssBlock(".areaNodeHeaderMeta");
  const iconBlock = getCssBlock(".areaNodeHeaderIcon");

  assert.match(
    areaBlock,
    /--area-body-background:\s*color-mix\(in srgb, var\(--board-surface\) 24%, transparent\);/
  );
  assert.match(areaBlock, /--area-border-width:\s*1px;/);
  assert.match(areaBlock, /--area-border-color:\s*var\(--node-border-color, var\(--board-border\)\);/);
  assert.match(areaBlock, /background:\s*var\(--area-body-background\);/);
  assert.match(areaBlock, /border-radius:\s*10px;/);
  assert.match(headerBlock, /height:\s*34px;/);
  assert.match(headerBlock, /font-size:\s*14px;/);
  assert.match(headerBlock, /font-weight:\s*650;/);
  assert.match(headerBlock, /left:\s*0;/);
  assert.match(headerBlock, /top:\s*0;/);
  assert.match(
    headerBlock,
    /background:\s*transparent;/
  );
  assert.doesNotMatch(headerBlock, /board-surface-subtle/);
  assert.match(headerBlock, /border-bottom:\s*0;/);
  assert.match(iconBlock, /border-radius:\s*4px;/);
  assert.match(depth0Block, /var\(--board-surface\) 24%/);
  assert.match(depth1Block, /var\(--board-surface\) 32%/);
  assert.match(depth2Block, /var\(--board-surface\) 40%/);
  assert.match(depth3Block, /var\(--board-surface\) 48%/);
  assert.match(metaBlock, /background:\s*var\(--board-primary-soft\);/);
  assert.match(metaBlock, /color:\s*var\(--board-primary\);/);
  assert.doesNotMatch(headerBlock, /transform:\s*translateY\(-100%\);/);
  assert.equal(diagramEditorStyles.includes(".areaNodeHeader::before {"), false);
  assert.equal(diagramEditorStyles.includes(".areaNodeHeader::after {"), false);
});

test("React Flow parents do not override per-node and per-edge stacking", () => {
  const parentLayerRule = getCssRuleContaining(
    ".canvasPanel :global(.react-flow__nodes),"
  );

  assert.match(parentLayerRule, /position:\s*absolute;/);
  assert.doesNotMatch(parentLayerRule, /z-index:/);
  assert.doesNotMatch(
    diagramEditorStyles,
    /\.canvasPanel :global\(\.react-flow__edges\)\s*\{[^}]*z-index:/s
  );
  assert.doesNotMatch(
    diagramEditorStyles,
    /\.canvasPanel :global\(\.react-flow__nodes\)\s*\{[^}]*z-index:/s
  );
});

test("Board viewport transitions honor reduced motion", () => {
  assert.match(
    diagramEditorSource,
    /function getBoardMotionDuration\(durationMs: number\): number/
  );
  assert.match(
    diagramEditorSource,
    /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? 0 : durationMs/
  );
  assert.doesNotMatch(diagramEditorSource, /duration:\s*(?:140|180)\b/);
  assert.match(diagramEditorSource, /duration:\s*getBoardMotionDuration\(140\)/);
  assert.match(diagramEditorSource, /duration:\s*getBoardMotionDuration\(180\)/);
});

test("edge labels use a quantized 75 percent canvas LOD", () => {
  const compactTextRule = getCssRuleContaining(
    ".canvasPanelEdgeLabelsCompact :global(.react-flow__edge-text)"
  );
  const compactBackgroundRule = getCssRuleContaining(
    ".canvasPanelEdgeLabelsCompact :global(.react-flow__edge-textbg)"
  );
  const compactRevealRule = getCssRuleContaining(
    ".canvasPanelEdgeLabelsCompact :global(.react-flow__edge:hover .react-flow__edge-text)"
  );

  assert.match(diagramEditorSource, /const boardZoom = useStore\(\(state\) => state\.transform\[2\]\);/);
  assert.match(diagramEditorSource, /const showAllEdgeLabels = boardZoom >= EDGE_LABEL_MIN_ZOOM;/);
  assert.match(
    diagramEditorSource,
    /showAllEdgeLabels\s*\?\s*styles\.canvasPanelEdgeLabelsVisible\s*:\s*styles\.canvasPanelEdgeLabelsCompact/
  );
  assert.match(compactTextRule, /opacity:\s*0;/);
  assert.match(compactTextRule, /visibility:\s*hidden;/);
  assert.match(
    diagramEditorStyles,
    /\.canvasPanelEdgeLabelsCompact :global\(\.react-flow__edge-text\)\s*\{[^}]*font-size:\s*calc\(12px \* var\(--board-lod-label-scale\)\) !important;/s
  );
  assert.match(compactBackgroundRule, /opacity:\s*0;/);
  assert.match(compactBackgroundRule, /visibility:\s*hidden;/);
  assert.match(compactRevealRule, /opacity:\s*1;/);
  assert.match(compactRevealRule, /visibility:\s*visible;/);
});

test("edge toolbar keeps style controls in a compact keyboard-accessible disclosure", () => {
  const toolbarBlock = getCssBlock(".edgeToolbar");
  const disclosureBlock = getCssBlock(".nodeToolbarDisclosure");
  const panelBlock = getCssBlock(".edgeToolbarPanel");
  const swatchButtonBlock = getCssBlock(".edgeSwatchButton");
  const swatchVisualBlock = getCssBlock(".edgeSwatchVisual");
  const dangerGroupBlock = getCssBlock(".edgeToolbarDangerGroup");

  assert.match(toolbarBlock, /min-height:\s*36px;/);
  assert.match(toolbarBlock, /flex-wrap:\s*nowrap;/);
  assert.match(toolbarBlock, /width:\s*max-content;/);
  assert.match(toolbarBlock, /background:\s*var\(--board-surface\);/);
  assert.match(toolbarBlock, /border:\s*1px solid var\(--board-border\);/);
  assert.match(toolbarBlock, /border-radius:\s*8px;/);
  assert.match(toolbarBlock, /box-shadow:\s*var\(--board-shadow-toolbar\);/);
  assert.match(disclosureBlock, /position:\s*relative;/);
  assert.match(panelBlock, /position:\s*absolute;/);
  assert.match(panelBlock, /top:\s*calc\(100% \+ 6px\);/);
  assert.match(swatchButtonBlock, /height:\s*32px;/);
  assert.match(swatchButtonBlock, /width:\s*32px;/);
  assert.match(swatchVisualBlock, /height:\s*18px;/);
  assert.match(swatchVisualBlock, /width:\s*18px;/);
  assert.match(dangerGroupBlock, /border-left:\s*1px solid var\(--board-border\);/);
  assert.match(diagramEdgeToolbarSource, /className=\{styles\.edgeSwatchVisual\}/);
  assert.equal([...diagramEdgeToolbarSource.matchAll(/<EdgeToolbarDisclosure\b/g)].length, 3);
  assert.match(diagramEdgeToolbarSource, /name=\{groupName\}/);
  assert.match(diagramEdgeToolbarSource, /onKeyDown=\{handleEdgeDisclosureKeyDown\}/);
  assert.match(diagramEdgeToolbarSource, /styles\.edgeToolbarPanel/);
  assert.match(diagramEdgeToolbarSource, /className=\{styles\.edgeToolbarTriggerStroke\}/);
  assert.match(diagramEdgeToolbarSource, /className=\{styles\.edgeToolbarDangerGroup\}/);
  assert.match(diagramEdgeToolbarSource, /role="toolbar"/);
  assert.doesNotMatch(diagramEdgeToolbarSource, /SelectMenu|styles\.edgeSelect/);
  assert.match(diagramEdgeToolbarSource, /event\.currentTarget\.removeAttribute\("open"\)/);
  assert.match(diagramEdgeToolbarSource, /querySelector\("summary"\)\?\.focus\(\)/);
  assert.match(
    diagramEditorSource,
    /<DiagramEdgeToolbar\s+edge=\{selectedEdge\}\s+key=\{selectedEdge\.id\}/
  );
  assert.match(
    diagramEditorStyles,
    /@media \(pointer: coarse\)\s*\{[\s\S]*?\.edgeToolbarDangerGroup\s*\{[^}]*height:\s*44px;/
  );
  assert.match(
    diagramEditorStyles,
    /@media \(pointer: coarse\)\s*\{[\s\S]*?\.iconButtonDanger[\s\S]*?height:\s*44px;[\s\S]*?width:\s*44px;/
  );
});

test("manual resize relies on node size effects to refresh React Flow internals", () => {
  assert.match(diagramNodeViewSource, /useEffect\(\(\) => \{\s*updateNodeInternals\(id\);/);
  assert.doesNotMatch(
    diagramNodeViewSource,
    /window\.requestAnimationFrame\(\(\) => updateNodeInternals\(id\)\)/
  );
});

test("diagram editor normalizes legacy Resource Object geometry at every diagram entry point", () => {
  assert.match(diagramEditorSource, /import \{ normalizeDiagramResourceNodeGeometry \} from "\.\/resource-node-geometry";/);
  assert.match(
    diagramEditorSource,
    /useState<DiagramJson>\(\(\) =>\s*normalizeDiagramResourceNodeGeometry\(cloneDiagram\(initialDiagram \?\? EMPTY_DIAGRAM\)\)\s*\)/s
  );
  assert.match(
    diagramEditorSource,
    /const nextDiagram = normalizeDiagramResourceNodeGeometry\(cloneDiagram\(initialDiagram \?\? EMPTY_DIAGRAM\)\);/
  );
  assert.match(
    diagramEditorSource,
    /setPreviewDiagramState\(\s*nextPreviewDiagram === null\s*\? null\s*:\s*normalizeDiagramResourceNodeGeometry\(nextPreviewDiagram\)\s*\)/s
  );
});

test("diagram editor gives exact fixture zoom priority over initial fit-view", () => {
  assert.match(diagramEditorSource, /const normalizedInitialBoardZoom = parseBoardZoom\(initialBoardZoom\);/);
  assert.match(diagramEditorSource, /getCenteredBoardViewport\(/);
  assert.match(diagramEditorSource, /shouldApplyInitialBoardZoomRef\.current/);
  assert.match(diagramEditorSource, /reactFlow\.setViewport\(viewport, \{ duration: 0 \}\)/);
  assert.match(diagramEditorSource, /getBoardZoomPresentationScale\(boardZoom\)/);
  assert.match(
    diagramEditorSource,
    /"--board-control-scale": boardZoomPresentationScale\.controlScale/
  );
  assert.match(
    diagramEditorSource,
    /"--board-lod-label-scale": boardZoomPresentationScale\.compactLabelScale/
  );
  assert.match(
    diagramEditorSource,
    /getCenteredBoardViewport\(\s*getDiagramVisualBounds\(previewDiagram\?\.nodes \?\? diagramRef\.current\.nodes\),\s*frame,/s
  );
});

test("diagram editor fits and centers visual footprints inside the unobscured board frame", () => {
  assert.match(
    diagramEditorSource,
    /import \{ getDiagramVisualBounds \} from "\.\/resource-node-visual-footprint";/
  );
  assert.match(diagramEditorSource, /getDiagramVisualBounds\(\[targetNode\]\)/);
  assert.match(diagramEditorSource, /getDiagramVisualBounds\(currentNodes\)/);
  assert.match(
    diagramEditorSource,
    /getDiagramVisualBounds\(previewDiagram\?\.nodes \?\? diagramRef\.current\.nodes\)/
  );
  assert.doesNotMatch(diagramEditorSource, /function getDiagramBounds\(/);
  assert.doesNotMatch(diagramEditorSource, /const fitViewWidth = editorBounds/);
  assert.match(
    diagramEditorSource,
    /offsetBoardViewportToFrame\(\s*getViewportForBounds\(\s*getDiagramVisualBounds\(\[targetNode\]\),\s*frame\.width,\s*frame\.height,/s
  );
  assert.match(
    diagramEditorSource,
    /offsetBoardViewportToFrame\(\s*getViewportForBounds\(\s*getDiagramVisualBounds\(currentNodes\),\s*frame\.width,\s*frame\.height,/s
  );
  assert.match(diagramEditorSource, /getUnobscuredBoardViewportFrame\(/);
  assert.match(diagramEditorSource, /BOARD_VIEWPORT_TOP_INSET/);
  assert.match(diagramEditorSource, /BOARD_VIEWPORT_BOTTOM_INSET/);
  assert.match(diagramEditorSource, /rebaseBoardViewport\(reactFlow\.getViewport\(\), previousFrame, nextFrame\)/);
  assert.match(
    diagramEditorSource,
    /<div className=\{styles\.leftRail\} ref=\{leftRailRef\}>/
  );
  assert.match(
    diagramEditorSource,
    /className=\{styles\.collapsedLeftPanel\}[\s\S]*?ref=\{leftRailRef\}/
  );
});

test("parameter updates synchronize all reference edges within one diagram update transaction", () => {
  assert.match(
    diagramEditorSource,
    /const nextNodes = updateNodeById\(currentDiagram\.nodes, nodeId, \(node\) =>\s*applyNodeParametersUpdateWithAutoTagSync\(node, update\)\s*\);/s
  );
  assert.match(
    diagramEditorSource,
    /nodes: nextNodes,\s*edges: syncParameterReferenceEdges\(nextNodes, currentDiagram\.edges\)/s
  );
});

test("Area auto expansion is a persistent pressed toolbar preference after canvas pan", () => {
  assert.match(
    diagramEditorSource,
    /const \[autoExpandAreasEnabled, setAutoExpandAreasEnabled\] = useState\(\(\) =>\s*readAutoExpandAreasEnabled\(typeof window === "undefined" \? null : window\.localStorage\)\s*\);/s
  );
  assert.match(
    diagramEditorSource,
    /aria-label="캔버스 이동"[\s\S]*?<\/button>\s*<button\s+aria-label="영역 자동 확장"\s+aria-pressed=\{autoExpandAreasEnabled\}/s
  );
  assert.match(
    diagramEditorSource,
    /writeAutoExpandAreasEnabled\(\s*typeof window === "undefined" \? null : window\.localStorage,\s*nextEnabled\s*\)/s
  );
  assert.match(
    diagramEditorSource,
    /const nodesWithExpandedParents = autoExpandAreasEnabled\s*\? expandParentAreaNodesForEnteredChild\(nodesWithAssignedParents, nextNode\.id\)\s*:\s*nodesWithAssignedParents;/s
  );
  assert.match(diagramEditorSource, /<Expand aria-hidden="true" size=\{16\} \/>/);
});

test("new and existing resources expand newly assigned parent areas before applying reference targets", () => {
  assert.match(
    diagramEditorSource,
    /const nodesWithAssignedParents = applyAreaNodeParentAssignments\(\s*nodesWithNextNode,\s*new Set\(\[nextNode\.id\]\)\s*\);\s*const nodesWithExpandedParents = autoExpandAreasEnabled\s*\? expandParentAreaNodesForEnteredChild\(nodesWithAssignedParents, nextNode\.id\)\s*:\s*nodesWithAssignedParents;\s*return \{\s*\.\.\.currentDiagram,\s*nodes: applyContainingReferenceDropTargets\(\s*nodesWithExpandedParents,/s
  );
  assert.match(
    diagramEditorSource,
    /expandParentAreaNodesForEnteredChild\(nodesWithAssignedParents,\s*nextNode\.id\)/s
  );
  assert.match(dragTransactionSource, /expandParentAreaNodesForEnteredChild/);
  assert.match(dragTransactionSource, /autoExpandAreasEnabled\s*\? enteredResourceNodeIds\.reduce/);
  assert.match(dragTransactionSource, /getEnteredResourceNodeIds/);
  assert.doesNotMatch(
    diagramEditorSource,
    /nodes: applyContainingReferenceDropTargets\(\s*nodesWithAssignedParents,\s*new Set\(\[nextNode\.id\]\)/s
  );
});

function getCssBlock(selector: string): string {
  const selectorMarker = `${selector} {`;
  const lineStart = diagramEditorStyles.indexOf(`\n${selectorMarker}`);
  const selectorStart = diagramEditorStyles.startsWith(selectorMarker)
    ? 0
    : lineStart >= 0
      ? lineStart + 1
      : -1;

  assert.notEqual(selectorStart, -1);

  const blockStart = diagramEditorStyles.indexOf("{", selectorStart + 1);
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
