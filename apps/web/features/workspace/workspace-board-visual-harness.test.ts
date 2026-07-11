import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspacePageSource = readFileSync(
  fileURLToPath(new URL("../../app/workspace/page.tsx", import.meta.url)),
  "utf8"
);
const workspaceDraftManagerSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceDraftManager.tsx", import.meta.url)),
  "utf8"
);
const diagramEditorSource = readFileSync(
  fileURLToPath(new URL("../diagram-editor/DiagramEditor.tsx", import.meta.url)),
  "utf8"
);
const diagramEditorTypesSource = readFileSync(
  fileURLToPath(new URL("../diagram-editor/types.ts", import.meta.url)),
  "utf8"
);

test("workspace fixtures pass an exact query zoom through to the board", () => {
  assert.match(workspacePageSource, /readonly boardZoom\?: string \| string\[\] \| undefined;/);
  assert.match(workspacePageSource, /parseBoardZoom\(getSingleSearchParam\(params\?\.boardZoom\)\)/);
  assert.match(workspacePageSource, /initialBoardZoom=\{initialBoardZoom\}/);
  assert.match(workspaceDraftManagerSource, /readonly initialBoardZoom\?: number \| undefined;/);
  assert.match(workspaceDraftManagerSource, /initialBoardZoom=\{initialBoardZoom\}/);
  assert.match(diagramEditorTypesSource, /initialBoardZoom\?: number \| undefined;/);
});

test("diagram editor centers exact fixture zoom instead of running initial auto-fit", () => {
  assert.match(diagramEditorSource, /getCenteredBoardViewport/);
  assert.match(diagramEditorSource, /shouldApplyInitialBoardZoomRef/);
  assert.match(diagramEditorSource, /shouldAutoFitInitialDiagramRef\.current =\s*normalizedInitialBoardZoom === undefined/);
  assert.match(diagramEditorSource, /reactFlow\.setViewport\(viewport, \{ duration: 0 \}\)/);
});

test("workspace visual fixtures preserve their authored geometry instead of rerunning topology layout", () => {
  const fixtureBranchStart = workspaceDraftManagerSource.indexOf("if (initialDiagramOverride)");
  const fixtureBranchEnd = workspaceDraftManagerSource.indexOf("const metadata =", fixtureBranchStart);

  assert.notEqual(fixtureBranchStart, -1);
  assert.notEqual(fixtureBranchEnd, -1);

  const fixtureBranch = workspaceDraftManagerSource.slice(fixtureBranchStart, fixtureBranchEnd);

  assert.match(fixtureBranch, /const nextDiagram = cloneDiagram\(initialDiagramOverride\);/);
  assert.doesNotMatch(fixtureBranch, /normalizeDiagramJsonConventions/);
});

test("workspace fixtures pass deterministic board interaction and preview states", () => {
  assert.match(workspacePageSource, /getWorkspaceDiagramFixtureViewState/);
  assert.match(workspacePageSource, /initialSelectedNodeIds=\{initialFixtureViewState\?\.selectedNodeIds\}/);
  assert.match(workspacePageSource, /initialSelectedEdgeIds=\{initialFixtureViewState\?\.selectedEdgeIds\}/);
  assert.match(
    workspacePageSource,
    /initialReferenceDropTargetNodeId=\{initialFixtureViewState\?\.referenceDropTargetNodeId\}/
  );
  assert.match(workspacePageSource, /initialPreviewDiagram=\{initialFixtureViewState\?\.previewDiagram\}/);
  assert.match(
    workspacePageSource,
    /initialPreviewAnnotations=\{initialFixtureViewState\?\.previewAnnotations\}/
  );

  for (const propName of [
    "initialSelectedNodeIds",
    "initialSelectedEdgeIds",
    "initialReferenceDropTargetNodeId",
    "initialPreviewDiagram",
    "initialPreviewAnnotations"
  ]) {
    assert.match(workspaceDraftManagerSource, new RegExp(`${propName}\\?`));
    assert.match(workspaceDraftManagerSource, new RegExp(`${propName}=\\{${propName}\\}`));
    assert.match(diagramEditorTypesSource, new RegExp(`${propName}\\?`));
    assert.match(diagramEditorSource, new RegExp(propName));
  }

  assert.match(diagramEditorSource, /useState<DiagramJson \| null>\(\(\) =>/);
  assert.match(diagramEditorSource, /normalizeSelectedNodeIds\(diagram\.nodes, initialSelectedNodeIds \?\? \[\]\)/);
  assert.match(
    diagramEditorSource,
    /!isFlowReady \|\|\s*normalizedInitialBoardZoom !== undefined \|\|\s*previewDiagram === null/
  );
  assert.match(
    diagramEditorSource,
    /getDiagramVisualBounds\(previewDiagram\?\.nodes \?\? diagramRef\.current\.nodes\)/
  );
  assert.match(
    diagramEditorSource,
    /normalizeSelectedNodeIds\(\s*nextDiagram\.nodes,\s*initialSelectedNodeIds \?\? \[\]\s*\)/
  );
  assert.match(
    diagramEditorSource,
    /getValidInitialSelectedEdgeIds\(\s*nextDiagram\.edges,\s*initialSelectedEdgeIds\s*\)/
  );
  assert.match(
    diagramEditorSource,
    /getValidInitialAreaDropTargetNodeId\(\s*nextDiagram\.nodes,\s*initialReferenceDropTargetNodeId\s*\)/
  );
  assert.match(
    diagramEditorSource,
    /setPreviewDiagram\(initialPreviewDiagram \?\? null, initialPreviewAnnotations \?\? null\)/
  );
});
