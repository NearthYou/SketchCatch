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
const normalizedDiagramEditorCssSource = diagramEditorCssSource.replace(/\r\n?/gu, "\n");

test("diagram node view is a memoized custom node renderer", () => {
  assert.match(diagramNodeViewSource, /import \{[^}]*memo[^}]*\} from "react"/);
  assert.match(diagramNodeViewSource, /export const DiagramNodeView = memo\(/);
});

test("diagram node view uses React's default memo comparison and retains its zoom subscription", () => {
  const rendererStart = diagramNodeViewSource.indexOf("export const DiagramNodeView = memo(function DiagramNodeView(");
  const rendererEnd = diagramNodeViewSource.indexOf("\nfunction getKeyboardResizeDelta", rendererStart);

  assert.notEqual(rendererStart, -1);
  assert.notEqual(rendererEnd, -1);

  const rendererSource = diagramNodeViewSource.slice(rendererStart, rendererEnd);

  assert.match(rendererSource, /useStore\(\(state\) => getBoardZoomLevel\(state\.transform\[2\]\)\)/);
  assert.match(rendererSource, /\n\}\);\s*$/);
});

test("diagram node view renders source and target handles matching edge mapper ids", () => {
  assert.match(diagramNodeViewSource, /id=\{`source-\$\{handle\.id\}`\}/);
  assert.match(diagramNodeViewSource, /type="source"/);
  assert.match(diagramNodeViewSource, /id=\{`target-\$\{handle\.id\}`\}/);
  assert.match(diagramNodeViewSource, /type="target"/);
  assert.doesNotMatch(diagramNodeViewSource, /CONNECTION_SOURCE_POSITIONS/);
  assert.match(
    diagramNodeViewSource,
    /const canStartFromHandle =\s*canConnect &&\s*!data\.isConnectionActive;/
  );
  assert.match(
    diagramNodeViewSource,
    /const canEndAtHandle =\s*data\.isValidConnectionTarget;/
  );
});

test("ports stay quiet by default but expose a stable, forgiving connection target", () => {
  const defaultHandleBlock = getCssBlock(".connectionHandle");
  const revealRule = getCssRuleContaining(
    ".canvasPanel :global(.react-flow__node:hover) .connectionHandleSource:not(.connectionHandleInactive),"
  );
  const globalHandleBlock = getCssRuleContaining(".canvasPanel :global(.react-flow__handle)");
  const globalHitTargetBlock = getCssRuleContaining(
    ".canvasPanel :global(.react-flow__handle)::before"
  );
  const globalHandleVisualBlock = getCssRuleContaining(
    ".canvasPanel :global(.react-flow__handle)::after"
  );
  const sourceHandleStart = diagramNodeViewSource.indexOf("styles.connectionHandleSource");
  const targetHandleStart = diagramNodeViewSource.indexOf("styles.connectionHandleTarget");
  const sourceHandleSource = diagramNodeViewSource.slice(sourceHandleStart, targetHandleStart);

  assert.match(defaultHandleBlock, /opacity:\s*0;/);
  assert.match(defaultHandleBlock, /pointer-events:\s*none;/);
  assert.match(revealRule, /\.connectionHandleTarget\.connectionHandleActive/);
  assert.match(revealRule, /opacity:\s*1;/);
  assert.match(revealRule, /pointer-events:\s*all;/);
  assert.match(
    revealRule,
    /\.nodeShellSelected ~ \.connectionHandleSource:not\(\.connectionHandleInactive\)/
  );
  assert.match(revealRule, /\.connectionHandleSource:hover/);
  assert.doesNotMatch(revealRule, /\.connectionHandleSource\.connectionHandleActive/);
  assert.doesNotMatch(sourceHandleSource, /data\.isConnectionActive \? styles\.connectionHandleActive/);
  assert.match(sourceHandleSource, /isConnectableStart=\{canStartFromHandle\}/);
  assert.match(sourceHandleSource, /isConnectable=\{canStartFromHandle\}/);
  assert.match(diagramNodeViewSource, /canEndAtHandle \? styles\.connectionHandleActive/);
  assert.match(
    diagramNodeViewSource,
    /aria-label=\{`\$\{resourceNodeLabel\} \$\{handle\.label\} 연결 시작`\}/
  );
  assert.match(
    diagramNodeViewSource,
    /aria-label=\{`\$\{resourceNodeLabel\} \$\{handle\.label\} 연결 대상`\}/
  );
  assert.match(diagramNodeViewSource, /onKeyDown=\{handleConnectionHandleKeyDown\}/);
  assert.match(diagramNodeViewSource, /role="button"/);
  assert.match(
    sourceHandleSource,
    /tabIndex=\{selected && canStartFromHandle \? 0 : -1\}/
  );
  assert.match(
    diagramEditorCssSource,
    /@media \(pointer: coarse\)\s*\{[\s\S]*?\.nodeShellSelected ~ \.connectionHandleSource:not\(\.connectionHandleInactive\)\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*all;/
  );
  assert.match(
    diagramEditorCssSource,
    /@media \(pointer: coarse\)\s*\{[\s\S]*?\.react-flow__handle\)::before,\s*\.manualResizeHandle::before,\s*\.manualResizeHandleArea::before\s*\{[^}]*height:\s*calc\(44px \* var\(--board-control-scale\)\);[^}]*width:\s*calc\(44px \* var\(--board-control-scale\)\);/
  );

  assert.match(globalHandleBlock, /height:\s*6px;/);
  assert.match(globalHandleBlock, /min-height:\s*6px;/);
  assert.match(globalHandleBlock, /width:\s*6px;/);
  assert.match(globalHitTargetBlock, /height:\s*calc\(28px \* var\(--board-control-scale\)\);/);
  assert.match(globalHitTargetBlock, /width:\s*calc\(28px \* var\(--board-control-scale\)\);/);
  assert.match(globalHandleVisualBlock, /height:\s*calc\(10px \* var\(--board-control-scale\)\);/);
  assert.match(globalHandleVisualBlock, /pointer-events:\s*none;/);
  assert.match(globalHandleVisualBlock, /width:\s*calc\(10px \* var\(--board-control-scale\)\);/);

  const sourceVisualBlock = getCssBlock(".connectionHandleSource::after");
  assert.match(sourceVisualBlock, /content:\s*"\+";/);
  assert.match(sourceVisualBlock, /background:\s*var\(--board-primary\);/);
  assert.match(sourceVisualBlock, /color:\s*#ffffff;/);

  const activeTargetBlock = getCssBlock(".connectionHandleTarget.connectionHandleActive");
  const activeTargetVisualBlock = getCssBlock(
    ".connectionHandleTarget.connectionHandleActive::after"
  );

  assert.match(activeTargetBlock, /border-color:\s*var\(--board-success\);/);
  assert.doesNotMatch(activeTargetBlock, /height:/);
  assert.doesNotMatch(activeTargetBlock, /width:/);
  assert.match(activeTargetVisualBlock, /box-shadow:\s*0 0 0 calc\(4px \* var\(--board-control-scale\)\) rgba\(40, 125, 60, 0\.16\);/);
  assert.match(activeTargetVisualBlock, /height:\s*calc\(12px \* var\(--board-control-scale\)\);/);
  assert.match(activeTargetVisualBlock, /width:\s*calc\(12px \* var\(--board-control-scale\)\);/);
  assert.match(
    diagramEditorCssSource,
    /@media \(pointer: coarse\)\s*\{[\s\S]*?\.connectionHandleSource::after,\s*\.connectionHandleTarget\.connectionHandleActive::after\s*\{[^}]*height:\s*calc\(14px \* var\(--board-control-scale\)\);[^}]*width:\s*calc\(14px \* var\(--board-control-scale\)\);/
  );
});

test("selected node toolbar clears the outward connection source hit target", () => {
  assert.match(diagramNodeViewSource, /<NodeToolbar[\s\S]*?offset=\{34\}/);
});

test("diagram node view renders resource and icon design nodes with icon-only geometry", () => {
  assert.match(
    diagramNodeViewSource,
    /usesIconTileLayout = isResourceNode \|\| \(node\.kind === "design" && !isArea && Boolean\(displayIconUrl\)\)/
  );
  assert.match(diagramNodeViewSource, /const displayIconUrl = node\.iconUrl \?\? getDesignNodeFallbackIconUrl\(node\);/);
  assert.match(diagramNodeViewSource, /aws_ecs_task_definition:[\s\S]*Res_Amazon-Elastic-Container-Service_Task_48\.svg/);
  assert.match(diagramNodeViewSource, /github_actions:[\s\S]*Res_Git-Repository_48_Light\.svg/);
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

test("diagram node view restores the light-board default text color", () => {
  assert.match(
    diagramNodeViewSource,
    /const textColor = node\.style\?\.textColor \?\? "#172033";/
  );
});

test("resource node shells reset inherited box constraints to match explicit geometry", () => {
  assert.match(
    diagramEditorCssSource,
    /\.nodeShell\s*\{[^}]*border:\s*1px solid var\(--board-border\);[^}]*min-height:\s*72px;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellResource\s*\{[^}]*border-width:\s*0;[^}]*min-height:\s*0;/s
  );
  assert.match(diagramEditorCssSource, /\.nodeShellArea\s*\{[^}]*min-height:\s*0;/s);
});

test("diagram node view renders bounded two-line labels on a transparent background", () => {
  const labelBlock = getCssBlock(".resourceNodeLabel");

  assert.match(diagramNodeViewSource, /title=\{resourceNodeLabel\}/);
  assert.match(labelBlock, /background:\s*transparent;/);
  assert.match(labelBlock, /pointer-events:\s*none;/);
  assert.match(labelBlock, /display:\s*-webkit-box;/);
  assert.match(
    labelBlock,
    /font-size:\s*calc\(6px \+ var\(--presentation-font-size-increase\)\);/
  );
  assert.match(
    labelBlock,
    /font-weight:\s*var\(--presentation-font-weight-bold\);/
  );
  assert.match(labelBlock, /line-height:\s*15px;/);
  assert.match(labelBlock, /max-height:\s*30px;/);
  assert.match(labelBlock, /max-width:\s*112px;/);
  assert.match(labelBlock, /overflow:\s*hidden;/);
  assert.match(labelBlock, /overflow-wrap:\s*normal;/);
  assert.match(labelBlock, /text-overflow:\s*ellipsis;/);
  assert.match(labelBlock, /-webkit-line-clamp:\s*2;/);
});

test("resource and design icons scale with their node geometry", () => {
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellResource\s*\{[^}]*background:\s*transparent;[^}]*border-width:\s*0;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeIconFrame\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*height:\s*100%;[^}]*padding:\s*4cqmin;[^}]*width:\s*100%;/s
  );
  const resourceIconBlock = getCssBlock(".resourceNodeIcon");
  assert.match(resourceIconBlock, /height:\s*100%;/);
  assert.match(resourceIconBlock, /object-fit:\s*contain;/);
  assert.match(resourceIconBlock, /width:\s*100%;/);
  assert.doesNotMatch(resourceIconBlock, /max-height:/);
  assert.doesNotMatch(resourceIconBlock, /max-width:/);
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeIconFallback\s*\{[^}]*background:\s*transparent;[^}]*height:\s*100%;[^}]*width:\s*100%;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeIconFallback svg\s*\{[^}]*height:\s*70%;[^}]*width:\s*70%;/s
  );
  assert.doesNotMatch(diagramNodeViewSource, /resourcePresentation\.icon\.opticalSize/);
  assert.doesNotMatch(diagramNodeViewSource, /--resource-node-icon-optical-size/);

  const hoverBlock = getCssBlock(".nodeShellResource:hover");
  const iconHoverBlock = getCssRuleContaining(
    ".nodeShellResource:hover .resourceNodeIcon,"
  );
  assert.match(hoverBlock, /box-shadow:\s*none;/);
  assert.match(iconHoverBlock, /filter:\s*drop-shadow\(/);
});

test("resource labels stay four pixels below the icon and metadata is not rendered", () => {
  assert.doesNotMatch(diagramNodeViewSource, /className=\{styles\.resourceNodeContent\}/);
  assert.doesNotMatch(diagramNodeViewSource, /className=\{styles\.resourceNodeMeta\}/);
  assert.match(
    diagramEditorCssSource,
    /\.resourceNodeLabel\s*\{[^}]*left:\s*50%;[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ 4px\);[^}]*transform:\s*translateX\(-50%\);/s
  );
});

test("icon-less resources use a neutral glyph instead of provider metadata", () => {
  assert.match(
    diagramNodeViewSource,
    /<ResourceIconImage[\s\S]*?fallbackClassName=\{styles\.resourceNodeIconFallback\}[\s\S]*?fallbackSize=\{18\}/
  );
  assert.match(diagramNodeViewSource, /fallbackClassName=\{styles\.areaNodeHeaderIcon\}/);
  assert.match(diagramNodeViewSource, /fallbackClassName=\{styles\.nodeGlyphIcon\}/);
  assert.doesNotMatch(
    diagramNodeViewSource,
    /resourcePresentation\.providerLabel/
  );
});

test("manual resize handles expose corners and the full four sides", () => {
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1px solid var\(--board-primary\);[^}]*border-radius:\s*2px;[^}]*height:\s*6px;[^}]*width:\s*6px;/s
  );
  assert.match(diagramEditorCssSource, /\.manualResizeHandle::before\s*\{[^}]*inset:\s*-7px;/s);
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandleArea\s*\{[^}]*height:\s*8px;[^}]*width:\s*8px;/s
  );
  assert.match(diagramEditorCssSource, /\.manualResizeHandleArea::before\s*\{[^}]*inset:\s*-6px;/s);
  assert.match(diagramNodeViewSource, /isArea \? styles\.manualResizeHandleArea : undefined/);
  for (const position of [
    "top-left",
    "top",
    "top-right",
    "right",
    "bottom-right",
    "bottom",
    "bottom-left",
    "left"
  ]) {
    assert.match(diagramNodeViewSource, new RegExp(`position: "${position}"`));
  }
  assert.match(
    diagramNodeViewSource,
    /handle\.isSide \? styles\.manualResizeHandleSide : undefined/
  );
  assert.doesNotMatch(diagramEditorCssSource, /\.manualResizeHandleSide::after/);
  assert.doesNotMatch(diagramEditorCssSource, /\.manualResizeHandleSide:hover/);
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandleTop,\s*\.manualResizeHandleBottom\s*\{[^}]*width:\s*calc\(100% - 24px\);/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandleLeft,\s*\.manualResizeHandleRight\s*\{[^}]*height:\s*calc\(100% - 24px\);/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle\.manualResizeHandleTop,\s*\.manualResizeHandle\.manualResizeHandleBottom\s*\{[^}]*cursor:\s*ns-resize;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle\.manualResizeHandleLeft,\s*\.manualResizeHandle\.manualResizeHandleRight\s*\{[^}]*cursor:\s*ew-resize;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle\.manualResizeHandleTopLeft,\s*\.manualResizeHandle\.manualResizeHandleBottomRight\s*\{[^}]*cursor:\s*nwse-resize;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle\.manualResizeHandleTopRight,\s*\.manualResizeHandle\.manualResizeHandleBottomLeft\s*\{[^}]*cursor:\s*nesw-resize;/s
  );
  assert.match(diagramNodeViewSource, /onKeyDown=\{\(event\) => handleResizeKeyDown\(event, handle\.position\)\}/);
  assert.match(
    diagramNodeViewSource,
    /const canResize =\s*!node\.locked &&\s*!data\.isPreview &&\s*!data\.isConnectionActive &&\s*\(node\.rotation \?\? 0\) === 0;/
  );
  assert.match(
    diagramNodeViewSource,
    /\{canResize \? \([\s\S]*?tabIndex=\{selected \? 0 : -1\}/
  );
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.canvasPanel\s+:global\(\.react-flow__node:hover\)\s+\.manualResizeHandle:not\(\.manualResizeHandleSide\),\s*\.nodeShellSelected\s*~\s*\.manualResizeHandle\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*all;/s
  );
  assert.match(
    diagramEditorCssSource,
    /@media \(pointer: coarse\)\s*\{[\s\S]*?\.manualResizeHandle::before,\s*\.manualResizeHandleArea::before\s*\{[^}]*height:\s*calc\(44px \* var\(--board-control-scale\)\);/
  );
  assert.doesNotMatch(
    diagramEditorCssSource,
    /\.nodeShellResource ~ \.manualResizeHandle:not\(\.manualResizeHandleBottomRight\)/
  );
  assert.match(
    diagramEditorCssSource,
    /\.manualResizeHandle:not\(\.manualResizeHandleSide\):hover,\s*\.manualResizeHandle:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 2px var\(--board-primary-soft\);/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellSelected ~ \.connectionHandleSource:global\(\.react-flow__handle-top\)\s*\{[^}]*top:\s*calc\(-18px \* var\(--board-control-scale\)\);/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellSelected ~ \.connectionHandleSource:global\(\.react-flow__handle-right\)\s*\{[^}]*right:\s*calc\(-18px \* var\(--board-control-scale\)\);/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellSelected ~ \.connectionHandleSource:global\(\.react-flow__handle-bottom\)\s*\{[^}]*bottom:\s*calc\(-18px \* var\(--board-control-scale\)\);/s
  );
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellSelected ~ \.connectionHandleSource:global\(\.react-flow__handle-left\)\s*\{[^}]*left:\s*calc\(-18px \* var\(--board-control-scale\)\);/s
  );
});

test("node rotation stays on a centered inner frame while the toolbar remains unrotated", () => {
  const toolbarIndex = diagramNodeViewSource.indexOf("<NodeToolbar");
  const rotationFrameIndex = diagramNodeViewSource.indexOf(
    "className={styles.nodeRotationFrame}"
  );
  const rotationFrameBlock = getCssBlock(".nodeRotationFrame");

  assert.notEqual(toolbarIndex, -1);
  assert.notEqual(rotationFrameIndex, -1);
  assert.ok(toolbarIndex < rotationFrameIndex);
  assert.match(
    diagramNodeViewSource,
    /const nodeRotationStyle =\s*node\.rotation === undefined \|\| node\.rotation === 0\s*\? undefined\s*:\s*\{\s*transform: `rotate\(\$\{node\.rotation\}deg\)`,\s*transformOrigin: "center"\s*\};/s
  );
  assert.match(
    diagramNodeViewSource,
    /<div className=\{styles\.nodeRotationFrame\} style=\{nodeRotationStyle\}>[\s\S]*?<div\s+className=\{\[/
  );
  assert.match(rotationFrameBlock, /height:\s*100%;/);
  assert.match(rotationFrameBlock, /position:\s*relative;/);
  assert.match(rotationFrameBlock, /width:\s*100%;/);
  assert.doesNotMatch(rotationFrameBlock, /translate/);
  assert.match(
    diagramNodeViewSource,
    /\[id, node\.rotation, node\.size\.height, node\.size\.width, updateNodeInternals\]/
  );
});

test("node toolbar uses compact board tokens and honest color targets", () => {
  const toolbarBlock = getCssBlock(".nodeToolbar");
  const disclosureBlock = getCssBlock(".nodeToolbarDisclosure");
  const panelBlock = getCssBlock(".nodeToolbarPanel");
  const iconButtonBlock = getCssRuleContaining(
    ".iconButton,\n.iconButtonSelected,\n.iconButtonDanger {"
  );
  const swatchButtonBlock = getCssBlock(".swatchButton");
  const swatchVisualBlock = getCssBlock(".nodeSwatchVisual");

  assert.match(toolbarBlock, /background:\s*var\(--board-surface\);/);
  assert.match(toolbarBlock, /border:\s*1px solid var\(--board-border\);/);
  assert.match(toolbarBlock, /box-shadow:\s*var\(--board-shadow-toolbar\);/);
  assert.match(toolbarBlock, /gap:\s*2px;/);
  assert.match(toolbarBlock, /min-height:\s*36px;/);
  assert.match(toolbarBlock, /max-width:\s*calc\(100vw - 24px\);/);
  assert.match(diagramNodeViewSource, /"#6f4cf6":\s*"보라"/);
  assert.match(toolbarBlock, /width:\s*max-content;/);
  assert.match(disclosureBlock, /position:\s*relative;/);
  assert.match(panelBlock, /position:\s*absolute;/);
  assert.match(iconButtonBlock, /height:\s*32px;/);
  assert.match(iconButtonBlock, /width:\s*32px;/);
  assert.match(iconButtonBlock, /color:\s*var\(--board-body\);/);
  assert.match(swatchButtonBlock, /height:\s*32px;/);
  assert.match(swatchButtonBlock, /width:\s*32px;/);
  assert.match(swatchVisualBlock, /height:\s*18px;/);
  assert.match(swatchVisualBlock, /width:\s*18px;/);
  assert.match(diagramNodeViewSource, /className=\{styles\.nodeSwatchVisual\}/);
  assert.match(diagramNodeViewSource, /aria-label=\{`\$\{resourceNodeLabel\} 노드 편집`\}/);
  assert.match(diagramNodeViewSource, /role="toolbar"/);
  assert.match(
    diagramNodeViewSource,
    /<details\s+className=\{styles\.nodeToolbarDisclosure\}[\s\S]*?name=\{groupName\}/
  );
  assert.match(diagramNodeViewSource, /aria-label="레이어 순서"/);
  assert.match(diagramNodeViewSource, /role="group"/);
  assert.match(diagramNodeViewSource, /aria-label=\{`\$\{label\} 사용자 지정`\}/);
  assert.match(
    diagramEditorCssSource,
    /@media \(pointer: coarse\)\s*\{[\s\S]*?\.iconButton,\s*\.iconButtonDanger,\s*\.swatchButton,\s*\.edgeSwatchButton,\s*\.segmentButton,\s*\.colorInput\s*\{[^}]*height:\s*44px;[^}]*width:\s*44px;/
  );
});

test("hides Terraform data source implementation labels", () => {
  assert.doesNotMatch(diagramNodeViewSource, /resourceNodeBadge/);
  assert.doesNotMatch(diagramNodeViewSource, /isDataNode/);
  assert.doesNotMatch(diagramEditorCssSource, /\.resourceNodeBadge\s*\{/);
});

test("uses one presentation seam and keeps resource labels uppercase", () => {
  assert.match(diagramNodeViewSource, /getResourceNodePresentation\(\{ \.\.\.node, iconUrl: displayIconUrl \}\)/);
  assert.match(diagramNodeViewSource, /getAreaNodeLabel\(node\)/);
  assert.doesNotMatch(diagramNodeViewSource, /parameters\?\.resourceName\?\.trim/);
});

test("diagram node view applies zoom LOD and non-color state badges", () => {
  assert.match(diagramNodeViewSource, /useStore\(\(state\) => getBoardZoomLevel\(state\.transform\[2\]\)\)/);
  assert.match(diagramNodeViewSource, /getBoardNodeStateBadge\(data\.previewState\)/);
  assert.match(diagramNodeViewSource, /styles\.nodeShellZoomFar/);
  assert.match(diagramNodeViewSource, /styles\.nodeShellZoomMedium/);
  assert.match(diagramNodeViewSource, /aria-label=\{`\$\{stateBadge\.label\}: \$\{resourceNodeLabel\}`\}/);
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellZoomMedium \.resourceNodeLabel,\s*\.nodeShellZoomFar \.resourceNodeLabel\s*\{[^}]*scale\(var\(--board-lod-label-scale\)\)/s
  );
});

test("dimmed and preview states preserve label contrast while muting the object", () => {
  const dimmedBlock = getCssBlock(".nodeShellDimmed");
  const previewBlock = getCssBlock(".nodeShellAiPreview");
  const deletedBlock = getCssBlock(".nodeShellPatchDeleted");
  const dimmedObjectRule = getCssRuleContaining(
    ".nodeShellDimmed .resourceNodeIconFrame,"
  );
  const deletedObjectRule = getCssRuleContaining(
    ".nodeShellPatchDeleted .resourceNodeIconFrame,"
  );

  assert.match(dimmedBlock, /opacity:\s*1;/);
  assert.match(previewBlock, /opacity:\s*1;/);
  assert.match(deletedBlock, /opacity:\s*1;/);
  assert.match(dimmedObjectRule, /opacity:\s*0\.46;/);
  assert.match(deletedObjectRule, /filter:\s*grayscale\(0\.6\);/);
  assert.match(deletedObjectRule, /opacity:\s*0\.44;/);
  assert.doesNotMatch(dimmedObjectRule, /resourceNodeLabel/);
  assert.doesNotMatch(deletedObjectRule, /resourceNodeLabel/);
  assert.doesNotMatch(deletedObjectRule, /nodeContent|areaNodeHeader\b/);
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellPatchDeleted \.nodeLabel,\s*\.nodeShellPatchDeleted \.areaNodeHeaderText\s*\{[^}]*text-decoration:\s*line-through;/s
  );
});

test("reduced motion overrides are ordered after label and connection transition declarations", () => {
  const reducedMotionIndex = diagramEditorCssSource.lastIndexOf(
    "@media (prefers-reduced-motion: reduce)"
  );

  assert.ok(reducedMotionIndex > diagramEditorCssSource.indexOf(".resourceNodeLabel {"));
  assert.ok(reducedMotionIndex > diagramEditorCssSource.indexOf(".connectionHandle {"));
  assert.ok(reducedMotionIndex > diagramEditorCssSource.indexOf(".edgeHalo {"));
});

test("resource labels scale while area metadata hides at the 50 and 75 percent LOD", () => {
  const areaMetadataRule = getCssRuleContaining(".nodeShellZoomMedium .areaNodeHeaderMeta,");
  const resourceLabelRule = getCssRuleContaining(".nodeShellZoomMedium .resourceNodeLabel,");

  assert.match(areaMetadataRule, /\.nodeShellZoomFar \.areaNodeHeaderMeta/);
  assert.match(areaMetadataRule, /opacity:\s*0;/);
  assert.match(areaMetadataRule, /visibility:\s*hidden;/);

  assert.match(resourceLabelRule, /\.nodeShellZoomFar \.resourceNodeLabel/);
  assert.match(resourceLabelRule, /scale\(var\(--board-lod-label-scale\)\)/);
  assert.match(resourceLabelRule, /transform-origin:\s*top center;/);
  assert.doesNotMatch(resourceLabelRule, /opacity:\s*0;/);
  assert.doesNotMatch(resourceLabelRule, /visibility:\s*hidden;/);

  assert.match(
    diagramEditorCssSource,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.nodeShell,\s*\.resourceNodeLabel,\s*\.connectionHandle\s*\{[^}]*transition:\s*none;/
  );
});

test("compound node states identify the affected resource without a placement badge", () => {
  const stateBadgeBlock = getCssBlock(".stateBadge");
  const lockBadgeBlock = getCssBlock(".lockBadge");

  assert.match(diagramNodeViewSource, /aria-label=\{`\$\{stateBadge\.label\}: \$\{resourceNodeLabel\}`\}/);
  assert.match(diagramNodeViewSource, /className=\{styles\.lockBadge\}[\s\S]*?role="img"/);
  assert.match(diagramNodeViewSource, /className=\{`\$\{styles\.stateBadge\}[\s\S]*?role="img"/);
  assert.doesNotMatch(diagramNodeViewSource, /referenceTargetBadge|참조 대상/);
  assert.match(stateBadgeBlock, /right:\s*4px;/);
  assert.match(stateBadgeBlock, /top:\s*4px;/);
  assert.doesNotMatch(stateBadgeBlock, /bottom:/);
  assert.doesNotMatch(stateBadgeBlock, /left:/);
  assert.match(lockBadgeBlock, /bottom:\s*4px;/);
  assert.match(lockBadgeBlock, /right:\s*4px;/);
  assert.match(lockBadgeBlock, /background:\s*var\(--board-ink\);/);
  assert.match(lockBadgeBlock, /color:\s*#ffffff;/);
  assert.match(getCssBlock(".nodeShellResource"), /container-type:\s*size;/);
  assert.match(
    diagramEditorCssSource,
    /@container \(max-width:\s*39px\)\s*\{[\s\S]*?\.lockBadge,\s*\.stateBadge\s*\{[^}]*height:\s*18px;[^}]*line-height:\s*16px;[^}]*min-height:\s*18px;[^}]*min-width:\s*18px;[^}]*width:\s*18px;/
  );
});

test("diagram node view applies computed area border style through CSS variables", () => {
  assert.match(diagramNodeViewSource, /getNodeDisplayBorderStyle/);
  assert.match(diagramNodeViewSource, /"--area-border-style": borderStyle/);
  assert.match(
    diagramEditorCssSource,
    /\.nodeShellArea\s*\{[^}]*border-style:\s*var\(--area-border-style,\s*solid\);/
  );
});

test("Security Group scopes use border-only presentation without area fill", () => {
  const scopeBlock = getCssBlock(".nodeShellArea.nodeShellSecurityGroupScope");

  assert.match(diagramNodeViewSource, /isSecurityGroupScopeNode/);
  assert.match(diagramNodeViewSource, /styles\.nodeShellSecurityGroupScope/);
  assert.doesNotMatch(scopeBlock, /--area-body-background:/);
  assert.match(scopeBlock, /--area-border-width:\s*2px;/);
  assert.match(getCssBlock(".nodeShellArea"), /--area-body-background:\s*transparent;/);
});

test("Area placement feedback uses border-only target state without a reference badge", () => {
  const targetBlock = getCssBlock(".nodeShellArea.nodeShellAreaDropTarget");

  assert.match(diagramNodeViewSource, /data\.isAreaDropTarget \? styles\.nodeShellAreaDropTarget/);
  assert.doesNotMatch(diagramNodeViewSource, /styles\.referenceTargetBadge/);
  assert.match(targetBlock, /--area-border-color:\s*#6f4cf6;/);
  assert.match(targetBlock, /background:\s*transparent;/);
  assert.doesNotMatch(targetBlock, /inset 0 0 0 999px/);
  assert.match(targetBlock, /0 0 0 4px rgba\(111, 76, 246, 0\.14\)/);
});

function getCssBlock(selector: string): string {
  const selectorStart = diagramEditorCssSource.lastIndexOf(`\n${selector} {`);

  assert.notEqual(selectorStart, -1);

  const blockStart = diagramEditorCssSource.indexOf("{", selectorStart + 1);
  const blockEnd = diagramEditorCssSource.indexOf("}", blockStart);

  assert.notEqual(blockStart, -1);
  assert.notEqual(blockEnd, -1);

  return diagramEditorCssSource.slice(blockStart + 1, blockEnd);
}

function getCssRuleContaining(selector: string): string {
  const selectorStart = normalizedDiagramEditorCssSource.indexOf(selector);

  assert.notEqual(selectorStart, -1);

  const blockStart = normalizedDiagramEditorCssSource.indexOf("{", selectorStart);
  const blockEnd = normalizedDiagramEditorCssSource.indexOf("}", blockStart);

  assert.notEqual(blockStart, -1);
  assert.notEqual(blockEnd, -1);

  return normalizedDiagramEditorCssSource.slice(selectorStart, blockEnd + 1);
}
