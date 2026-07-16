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

test("diagram editor commits the Flow-node cache after mapping rather than during render", () => {
  const flowNodesStart = diagramEditorSource.indexOf("  const flowNodes = useMemo(");
  const flowNodeCacheEffectStart = diagramEditorSource.indexOf("  useEffect(() => {", flowNodesStart);
  const flowEdgesStart = diagramEditorSource.indexOf("  const flowEdges = useMemo(", flowNodesStart);

  assert.notEqual(flowNodesStart, -1);
  assert.notEqual(flowNodeCacheEffectStart, -1);
  assert.notEqual(flowEdgesStart, -1);

  const flowNodeMappingSource = diagramEditorSource.slice(flowNodesStart, flowNodeCacheEffectStart);
  const flowNodeCacheEffectSource = diagramEditorSource.slice(flowNodeCacheEffectStart, flowEdgesStart);

  assert.match(
    diagramEditorSource,
    /const flowNodeCacheRef = useRef<ReadonlyMap<string, DiagramFlowNode>>\(new Map\(\)\);/
  );
  assert.match(flowNodeMappingSource, /cachedNodesById:\s*flowNodeCacheRef\.current/);
  assert.doesNotMatch(flowNodeMappingSource, /flowNodeCacheRef\.current\s*=/);
  assert.match(
    flowNodeCacheEffectSource,
    /useEffect\(\(\) => \{\s*flowNodeCacheRef\.current = new Map\(flowNodes\.map\(\(node\) => \[node\.id, node\]\)\);\s*\}, \[flowNodes\]\);/
  );
});

test("direct node drags leave preview position updates to onNodeDrag", () => {
  const handleNodesChangeSource = getSourceBlock(
    diagramEditorSource,
    "const handleNodesChange = useCallback<OnNodesChange<DiagramFlowNode>>(",
    "const handleEdgesChange = useCallback<OnEdgesChange<DiagramFlowEdge>>("
  );
  const selectionChangesIndex = handleNodesChangeSource.indexOf(
    "const nextSelectedNodeIds = applySelectionChanges(selectedNodeIds, changes);"
  );
  const selectionStateUpdateIndex = handleNodesChangeSource.indexOf(
    "setSelectedNodeIds((currentIds) =>"
  );
  const directDragReturnIndex = handleNodesChangeSource.indexOf(
    "if (dragSnapshot && directNodeDragIds) {"
  );
  const liveDiagramUpdateIndex = handleNodesChangeSource.indexOf(
    "applyLiveDiagramUpdate((currentDiagram) =>"
  );

  assert.match(handleNodesChangeSource, /if \(dragSnapshot && directNodeDragIds\) \{\s*return;\s*\}/);
  assert.notEqual(selectionChangesIndex, -1);
  assert.notEqual(selectionStateUpdateIndex, -1);
  assert.notEqual(directDragReturnIndex, -1);
  assert.notEqual(liveDiagramUpdateIndex, -1);
  assert.ok(selectionChangesIndex < selectionStateUpdateIndex);
  assert.ok(selectionStateUpdateIndex < directDragReturnIndex);
  assert.ok(directDragReturnIndex < liveDiagramUpdateIndex);
});

test("direct node drag coalesces preview work to animation frames and flushes the final payload", () => {
  const queueNodeDragPreviewSource = getSourceBlock(
    diagramEditorSource,
    "const queueNodeDragPreview = useCallback(",
    "const handleNodeDragStart = useCallback("
  );
  const handleNodeDragStopSource = getSourceBlock(
    diagramEditorSource,
    "const handleNodeDragStop = useCallback(",
    "const clearConnectionActivityOnRelease = useCallback("
  );

  assert.match(
    diagramEditorSource,
    /const nodeDragPreviewFrameRef = useRef<number \| null>\(null\);/
  );
  assert.match(queueNodeDragPreviewSource, /pendingNodeDragPreviewRef\.current = \{ draggedNodeId, nodes \};/);
  assert.match(
    queueNodeDragPreviewSource,
    /if \(nodeDragPreviewFrameRef\.current !== null\) \{\s*return;\s*\}/
  );
  assert.match(
    queueNodeDragPreviewSource,
    /nodeDragPreviewFrameRef\.current = window\.requestAnimationFrame\(\(\) => \{[\s\S]*?nodeDragPreviewFrameRef\.current = null;[\s\S]*?pendingNodeDragPreviewRef\.current = null;[\s\S]*?commitNodeDragPreview\(/
  );
  assert.match(handleNodeDragStopSource, /const previewNodes = flushNodeDragPreview\(node\.id, nodes\);/);
  assert.match(
    diagramEditorSource,
    /useEffect\(\(\) => \(\) => cancelQueuedNodeDragPreview\(\), \[cancelQueuedNodeDragPreview\]\);/
  );
});

test("source-exact geometry policy and explicit live-route staleness reach React Flow", () => {
  assert.equal(
    diagramEditorSource.match(/geometryPolicy: visibleDiagram\.presentation\?\.geometryPolicy/g)?.length,
    2
  );
  assert.match(
    diagramEditorSource,
    /const staleAuthoredRouteNodeIds = useMemo\([\s\S]*?getNodeGeometryChangedIds\([\s\S]*?\);/s
  );
  assert.match(diagramEditorSource, /staleAuthoredRouteNodeIds,/);
  assert.match(
    diagramEditorSource,
    /elevateNodesOnSelect=\{visibleDiagram\.presentation\?\.geometryPolicy !== "source-exact"\}/
  );
});

test("every persisted node geometry mutation invalidates incident authored routes", () => {
  assert.match(
    diagramEditorSource,
    /function clearAuthoredRoutesForNodeGeometryChanges\([\s\S]*?clearAuthoredRoutesForNodeIds\([\s\S]*?getNodeGeometryChangedIds\(/s
  );

  const mutationBlocks = [
    ["const updateNodeMetadata = useCallback(", "const updateNodeParameters = useCallback"],
    ["const updateNodeParameters = useCallback", "const applyDiagramJson = useCallback"],
    ["const handleResizeEnd = useCallback(", "const flowNodeHandlers = useMemo"],
    ["const handleNodesChange = useCallback", "const handleEdgesChange = useCallback"],
    ["const finishAreaBlankDrag = useCallback(", "const handleCanvasPointerDown = useCallback"],
    ["const handleNodeDragStop = useCallback(", "const clearConnectionActivityOnRelease = useCallback"],
    ["const finalizeAreaBlankDragWithoutAnimation = useCallback(", "const finalizeNodeDragWithoutAnimation = useCallback"],
    ["const finalizeNodeDragWithoutAnimation = useCallback(", "const finalizeActiveDragWithoutAnimation = useCallback"],
    ["const handleDrop = useCallback(", "const handleDragOver = useCallback"],
    ["const deleteSelection = useCallback(", "const copySelectedNodes = useCallback"]
  ] as const;

  for (const [startMarker, endMarker] of mutationBlocks) {
    assert.match(
      getSourceBlock(diagramEditorSource, startMarker, endMarker),
      /clearAuthoredRoutesForNodeGeometryChanges\(/,
      startMarker
    );
  }
});

test("edge type changes clear authored routes while style-only changes preserve them", () => {
  const styleBlock = getSourceBlock(
    diagramEditorSource,
    "const updateEdgeStyle = useCallback(",
    "const updateEdgeType = useCallback("
  );
  const typeBlock = getSourceBlock(
    diagramEditorSource,
    "const updateEdgeType = useCallback(",
    "const deleteEdge = useCallback("
  );

  assert.match(styleBlock, /edge\.id === edgeId \? \{ \.\.\.edge, style \} : edge/);
  assert.doesNotMatch(styleBlock, /route|clearAuthoredRoutes/);
  assert.match(typeBlock, /const \{ route: _route, \.\.\.edgeWithoutRoute \} = edge;/);
  assert.match(typeBlock, /return \{ \.\.\.edgeWithoutRoute, type \};/);
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

test("palette drag preview and drop use the same Area size transformer", () => {
  assert.match(
    diagramEditorSource,
    /import \{ scalePaletteAreaNodeSize \} from "\.\/palette-area-node-size";/
  );
  assert.equal(
    diagramEditorSource.match(
      /scalePaletteAreaNodeSize\(\s*createDiagramNodeFromPayload\(/g
    )?.length,
    2
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
  const saveStatusBlock = getCssBlock(".projectBarSaveStatus");

  assert.match(diagramEditorSource, /dashboardHref = "\/dashboard"/);
  assert.match(diagramEditorSource, /workspaceUserName = "Personal workspace"/);
  assert.match(diagramEditorSource, /saveStatus = "편집 중"/);
  assert.match(diagramEditorSource, /<WorkspaceProjectBar/);
  assert.match(diagramEditorSource, /onSave:\s*onDiagramSaveRequest/);
  assert.match(diagramEditorSource, /onToggleLeftPanel:\s*toggleLeftPanel/);
  assert.match(diagramEditorSource, /onToggleRightPanel:\s*toggleRightPanel/);

  assert.match(workspaceProjectBarSource, /import \{ ProductBrand \} from "\.\.\/\.\.\/components\/ui\/ProductBrand"/);
  assert.match(workspaceProjectBarSource, /<ProductBrand href=\{workspace\.dashboardHref\} \/>/);
  assert.doesNotMatch(
    workspaceProjectBarSource,
    /handleDashboardNavigation|createDashboardNavigationHandler/
  );
  assert.match(workspaceProjectBarSource, /className=\{styles\.projectBarSaveStatus\}/);
  assert.match(workspaceProjectBarSource, /aria-label="지금 저장"/);
  assert.match(workspaceProjectBarSource, /"리소스 패널 열기"/);
  assert.match(workspaceProjectBarSource, /"Inspector 열기"/);

  assert.match(projectBarBlock, /grid-column:\s*1 \/ -1;/);
  assert.match(projectBarBlock, /height:\s*64px;/);
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

test("right panel resize handle shows a muted hover grip", () => {
  const rightRailStateRule = getCssRuleContaining(".rightRailResizeHandle:hover::after");

  assert.match(rightRailStateRule, /background:\s*#8b9098;/);
  assert.match(rightRailStateRule, /box-shadow:\s*none;/);
});

test("left panel resize handle shows a muted hover grip", () => {
  const leftRailStateRule = getCssRuleContaining(".leftRailResizeHandle:hover::after");

  assert.match(leftRailStateRule, /background:\s*#8b9098;/);
  assert.match(leftRailStateRule, /box-shadow:\s*none;/);
});

test("left and right resize handles share the muted hover, focus, and active grip", () => {
  assert.match(
    diagramEditorStyles,
    /\.leftRailResizeHandle:hover::after,\s*\.leftRailResizeHandle:focus-visible::after,\s*\.leftRailResizeHandle:active::after,\s*\.rightRailResizeHandle:hover::after,\s*\.rightRailResizeHandle:focus-visible::after,\s*\.rightRailResizeHandle:active::after\s*\{[^}]*background:\s*#8b9098;[^}]*box-shadow:\s*none;/s
  );
});

test("panel resize grip is short, centered, and rounded instead of a full-height rail", () => {
  const resizeGripRule = getCssRuleContaining(".leftRailResizeHandle::after,");

  assert.match(resizeGripRule, /border-radius:\s*999px;/);
  assert.match(resizeGripRule, /height:\s*40px;/);
  assert.match(resizeGripRule, /top:\s*50%;/);
  assert.match(resizeGripRule, /transform:\s*translateY\(-50%\);/);
  assert.match(resizeGripRule, /width:\s*3px;/);
  assert.doesNotMatch(resizeGripRule, /bottom:\s*10px;/);
});

test("left and right resize handles use the bidirectional horizontal resize cursor", () => {
  assert.match(
    diagramEditorStyles,
    /button\.leftRailResizeHandle,\s*button\.rightRailResizeHandle\s*\{[^}]*cursor:\s*ew-resize;/s
  );
});

test("area node header uses a rounded icon without a bottom divider", () => {
  const areaBlock = getCssBlock(".nodeShellArea");
  const headerBlock = getCssBlock(".areaNodeHeader");
  const headerContentBlock = getCssBlock(".areaNodeHeaderContent");
  const depth0Block = getCssBlock(".nodeShellAreaDepth0");
  const depth1Block = getCssBlock(".nodeShellAreaDepth1");
  const depth2Block = getCssBlock(".nodeShellAreaDepth2");
  const depth3Block = getCssBlock(".nodeShellAreaDepth3");
  const metaBlock = getCssBlock(".areaNodeHeaderMeta");
  const iconBlock = getCssBlock(".areaNodeHeaderIcon");

  assert.match(
    areaBlock,
    /--area-body-background:\s*transparent;/
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
  assert.match(headerContentBlock, /background:\s*var\(--board-surface\);/);
  assert.match(headerContentBlock, /border-radius:\s*6px;/);
  assert.doesNotMatch(headerBlock, /board-surface-subtle/);
  assert.match(headerBlock, /border-bottom:\s*0;/);
  assert.match(iconBlock, /border-radius:\s*4px;/);
  assert.match(depth0Block, /--area-body-background:\s*transparent;/);
  assert.match(depth1Block, /--area-body-background:\s*transparent;/);
  assert.match(depth2Block, /--area-body-background:\s*transparent;/);
  assert.match(depth3Block, /--area-body-background:\s*transparent;/);
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

test("diagram editor applies the shared geometry policy at every diagram entry point", () => {
  assert.match(diagramEditorSource, /import \{ normalizeDiagramResourceNodeGeometry \} from "\.\/resource-node-geometry";/);
  assert.match(
    diagramEditorSource,
    /useState<DiagramJson>\(\(\) =>\s*normalizeDiagramResourceNodeGeometry\(cloneDiagram\(initialDiagram \?\? EMPTY_DIAGRAM\)\)\s*\)/s
  );
  assert.match(
    diagramEditorSource,
    /useState<DiagramJson \| null>\(\(\) =>\s*initialPreviewDiagram\s*\? normalizeDiagramResourceNodeGeometry\(cloneDiagram\(initialPreviewDiagram\)\)\s*:\s*null\s*\)/s
  );
  assert.match(
    diagramEditorSource,
    /const nextDiagram = normalizeDiagramResourceNodeGeometry\(cloneDiagram\(initialDiagram \?\? EMPTY_DIAGRAM\)\);/
  );
  assert.match(
    diagramEditorSource,
    /setPreviewDiagramState\(\s*nextPreviewDiagram === null\s*\? null\s*:\s*normalizeDiagramResourceNodeGeometry\(nextPreviewDiagram\)\s*\)/s
  );
  assert.match(
    diagramEditorSource,
    /commitDiagramUpdate\(\(\) =>\s*normalizeDiagramResourceNodeGeometry\(cloneDiagram\(nextDiagram\)\)\s*\)/s
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

test("source-exact entries consume a pending source viewport once and otherwise restore the saved viewport", () => {
  const sourceViewportBlock = getSourceBlock(
    diagramEditorSource,
    "const applyRequestedInitialViewport = useCallback(",
    "const handleMoveEnd = useCallback<OnMoveEnd>("
  );
  const consumePendingIndex = sourceViewportBlock.indexOf(
    "shouldApplySourceViewportRef.current = false;"
  );
  const applyPendingIndex = sourceViewportBlock.indexOf(
    "applyInitialSourceViewBoxViewport(visibleDiagram, frame)"
  );

  assert.match(
    diagramEditorSource,
    /import \{[\s\S]*applyInitialSourceViewBoxViewport,[\s\S]*getSourceViewBoxMinimumZoom,[\s\S]*\} from "\.\/board-viewport";/
  );
  assert.match(
    diagramEditorSource,
    /const shouldApplySourceViewportRef = useRef\(true\);/
  );
  assert.match(
    diagramEditorSource,
    /const wasSourceViewBoxViewportRef = useRef\(false\);/
  );
  assert.notEqual(consumePendingIndex, -1);
  assert.notEqual(applyPendingIndex, -1);
  assert.ok(consumePendingIndex < applyPendingIndex);
  assert.match(sourceViewportBlock, /const viewport = nextDiagram\.viewport;/);
  assert.match(
    sourceViewportBlock,
    /if \(previewDiagram !== null\) \{\s*setPreviewDiagramState\(nextDiagram\);\s*\} else \{\s*replaceDiagram\(nextDiagram\);\s*\}/
  );
  assert.match(
    sourceViewportBlock,
    /runViewportMoveWithoutPersistence\(\(\) =>\s*getFlowInstance\(\)\.setViewport\(viewport, \{ duration: 0 \}\)\s*\)/
  );
  assert.match(
    sourceViewportBlock,
    /const shouldRestoreLegacyViewport = wasSourceViewBoxViewportRef\.current;[\s\S]*?wasSourceViewBoxViewportRef\.current = false;[\s\S]*?if \(shouldRestoreLegacyViewport\) \{[\s\S]*?getFlowInstance\(\)\.setViewport\(visibleDiagram\.viewport, \{ duration: 0 \}\)/
  );
  assert.match(
    sourceViewportBlock,
    /wasSourceViewBoxViewportRef\.current = true;[\s\S]*?applyInitialSourceViewBoxViewport\(visibleDiagram, frame\)/
  );
  assert.doesNotMatch(sourceViewportBlock, /fitVisibleDiagram/);
  assert.match(
    sourceViewportBlock,
    /initialSourceViewportFrameRef\.current = window\.requestAnimationFrame\(\(\) => \{[\s\S]*?applyRequestedInitialViewport\(\);/
  );
});

test("source viewport requests are renewed by prop replacement, preview, and apply entry points", () => {
  const setPreviewBlock = getSourceBlock(
    diagramEditorSource,
    'const setPreviewDiagram = useCallback<DiagramEditorPanelContext["setPreviewDiagram"]>(',
    "const setDragPreviewNodesForState = useCallback("
  );
  const propReplacementBlock = getSourceBlock(
    diagramEditorSource,
    "useEffect(() => {\n    cancelSnapAnimation();",
    "const pushHistory = useCallback("
  );
  const applyDiagramBlock = getSourceBlock(
    diagramEditorSource,
    'const applyDiagramJson = useCallback<DiagramEditorPanelContext["applyDiagramJson"]>(',
    "// 템플릿 적용은"
  );

  assert.match(setPreviewBlock, /shouldApplySourceViewportRef\.current = true;/);
  assert.match(propReplacementBlock, /shouldApplySourceViewportRef\.current = true;/);
  assert.match(applyDiagramBlock, /setPreviewDiagram\(null\);/);
});

test("source-exact boards lower min zoom conditionally without changing the legacy zoom contract", () => {
  assert.match(diagramEditorSource, /const \[boardMinimumZoom, setBoardMinimumZoom\] = useState\(0\.25\);/);
  assert.match(
    diagramEditorSource,
    /getSourceViewBoxMinimumZoom\(presentation\.sourceViewBox, frame\)/
  );
  assert.match(diagramEditorSource, /minZoom=\{boardMinimumZoom\}/);
  assert.match(diagramEditorSource, /maxZoom=\{2\}/);
  assert.match(diagramEditorSource, /const normalizedInitialBoardZoom = parseBoardZoom\(initialBoardZoom\);/);
  assert.match(
    diagramEditorSource,
    /const hasSourceViewBoxViewport =\s*visibleDiagram\.presentation\?\.geometryPolicy === "source-exact" &&\s*visibleDiagram\.presentation\.sourceViewBox !== undefined;/
  );
  assert.match(
    diagramEditorSource,
    /!shouldApplyInitialBoardZoomRef\.current \|\|[\s\S]*?hasSourceViewBoxViewport/
  );
  assert.match(
    diagramEditorSource,
    /!shouldAutoFitInitialDiagramRef\.current \|\|[\s\S]*?hasSourceViewBoxViewport/
  );
  assert.match(
    diagramEditorSource,
    /function refitCompactBoard\(\): void \{\s*if \(hasSourceViewBoxViewport \|\| window\.innerWidth > 1120\)/
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
  assert.doesNotMatch(diagramEditorSource, /collapsedLeftPanel/);
});

test("parameter updates do not create hardcoded reference edges", () => {
  assert.match(
    diagramEditorSource,
    /const nextNodes = updateNodeById\(currentDiagram\.nodes, nodeId, \(node\) =>\s*applyNodeParametersUpdateWithAutoTagSync\(node, update\)\s*\);/s
  );
  assert.doesNotMatch(diagramEditorSource, /syncParameterReferenceEdges/);
  assert.match(
    diagramEditorSource,
    /nodes: refitSecurityGroupScopesForTargetChanges\(\{\s*changedNodeIds: new Set\(\[nodeId\]\),\s*currentNodes: nextNodes,\s*previousNodes: currentDiagram\.nodes\s*\}\)/s
  );
});

test("deleting a Resource refits the Security Group scopes that referenced it", () => {
  const deleteSelectionSource = getSourceBlock(
    diagramEditorSource,
    "const deleteSelection = useCallback(",
    "const copySelectedNodes = useCallback("
  );

  assert.match(
    deleteSelectionSource,
    /refitSecurityGroupScopesForTargetChanges\(\{\s*changedNodeIds: deletedNodeIds,\s*currentNodes: nodesWithReconciledAreas,\s*previousNodes: currentDiagram\.nodes\s*\}\)/s
  );
});

test("finishing a Resource resize refits its referenced Security Group scope", () => {
  const handleResizeEndSource = getSourceBlock(
    diagramEditorSource,
    "const handleResizeEnd = useCallback(",
    "const flowNodeHandlers = useMemo<DiagramFlowNodeHandlers>("
  );

  assert.match(
    handleResizeEndSource,
    /refitSecurityGroupScopesForTargetChanges\(\{\s*changedNodeIds: new Set\(\[nodeId\]\),\s*currentNodes: nodesWithReconciledAreas,\s*previousNodes: before\?\.nodes \?\? resizedDiagram\.nodes\s*\}\)/s
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
    /const nodesWithReconciledAreas = autoExpandAreasEnabled\s*\? reconcileAreaNodeGeometry\(\s*currentDiagram\.nodes,\s*nodesWithAssignedParents,\s*new Set\(\[nextNode\.id\]\)\s*\)\s*:\s*nodesWithAssignedParents;/s
  );
  assert.match(diagramEditorSource, /<Expand aria-hidden="true" size=\{16\} \/>/);
});

test("canvas tools dock vertically along the left center", () => {
  const canvasToolbarRule = getCssBlock(".canvasToolbar");
  const toolbarGroupRule = getCssBlock(".toolbarGroup");

  assert.match(canvasToolbarRule, /display:\s*flex;/);
  assert.match(canvasToolbarRule, /flex-direction:\s*column;/);
  assert.match(canvasToolbarRule, /left:\s*16px;/);
  assert.match(canvasToolbarRule, /top:\s*50%;/);
  assert.match(canvasToolbarRule, /transform:\s*translateY\(-50%\);/);
  assert.doesNotMatch(canvasToolbarRule, /bottom:/);
  assert.doesNotMatch(canvasToolbarRule, /translateX/);
  assert.match(toolbarGroupRule, /display:\s*inline-flex;/);
  assert.match(toolbarGroupRule, /flex-direction:\s*column;/);
  assert.match(
    diagramEditorStyles,
    /@media \(max-width:\s*640px\)[\s\S]*?\.canvasToolbar\s*\{[^}]*left:\s*10px;[^}]*max-height:\s*calc\(100% - 20px\);/s
  );
});

test("new and existing resources expand newly assigned parent areas before applying reference targets", () => {
  assert.match(
    diagramEditorSource,
    /const nodesWithAssignedParents = applyAreaNodeParentAssignments\(\s*nodesWithNextNode,\s*new Set\(\[nextNode\.id\]\)\s*\);\s*const nodesWithReconciledAreas = autoExpandAreasEnabled\s*\? reconcileAreaNodeGeometry\(\s*currentDiagram\.nodes,\s*nodesWithAssignedParents,\s*new Set\(\[nextNode\.id\]\)\s*\)\s*:\s*nodesWithAssignedParents;\s*const nextDiagram = \{\s*\.\.\.currentDiagram,\s*nodes: applyContainingReferenceDropTargets\(\s*nodesWithReconciledAreas,[\s\S]*?return clearAuthoredRoutesForNodeGeometryChanges\(currentDiagram\.nodes, nextDiagram\);/s
  );
  assert.match(
    dragTransactionSource,
    /const nodesWithReconciledAreas = autoExpandAreasEnabled\s*\? reconcileAreaNodeGeometry\(snapshotNodes, nodesWithAssignedParents, movedNodeIds\)\s*:\s*nodesWithAssignedParents;/s
  );
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

function getSourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return source.slice(start, end);
}
