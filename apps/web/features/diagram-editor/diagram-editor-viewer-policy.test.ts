import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson } from "@sketchcatch/types";

import {
  getDiagramEditorViewerPolicy,
  resolveDiagramEditorVisibleDiagram,
  shouldRenderDiagramNodeEdgeAnchors,
  shouldRenderDiagramNodeInteractionHandles
} from "./types";

test("editor mode retains the editable workspace policy", () => {
  assert.deepEqual(getDiagramEditorViewerPolicy("editor"), {
    canPanAndZoom: true,
    canSelectNodes: true,
    isPreview: false,
    isViewer: false,
    panOnScroll: true,
    showBoardGrid: true,
    showEditingControls: true,
    showPanels: true,
    showViewportControls: true,
    showWorkspaceChrome: true,
    usesContainerHeight: false
  });
});

test("viewer mode is a compact preview that permits only viewport navigation", () => {
  assert.deepEqual(getDiagramEditorViewerPolicy("viewer"), {
    canPanAndZoom: true,
    canSelectNodes: false,
    isPreview: true,
    isViewer: true,
    panOnScroll: true,
    showBoardGrid: false,
    showEditingControls: false,
    showPanels: false,
    showViewportControls: true,
    showWorkspaceChrome: false,
    usesContainerHeight: true
  });
});

test("embedded viewer can keep drag pan while refusing page scroll gestures", () => {
  assert.equal(
    getDiagramEditorViewerPolicy("viewer", { panOnScroll: false }).panOnScroll,
    false
  );
});

test("viewer nodes do not render editing interaction handles", () => {
  assert.equal(shouldRenderDiagramNodeInteractionHandles(true), false);
  assert.equal(shouldRenderDiagramNodeInteractionHandles(false), true);
});

test("viewer nodes retain only inert edge anchors so compiled relationships render without warnings", () => {
  assert.equal(shouldRenderDiagramNodeEdgeAnchors(true), true);
  assert.equal(shouldRenderDiagramNodeEdgeAnchors(false), false);
});

test("viewer displays the exact Compiler proposal geometry that approval will save", () => {
  const normalizedInternalDiagram: DiagramJson = {
    edges: [],
    nodes: [
      {
        id: "lambda",
        kind: "resource",
        label: "Lambda",
        locked: false,
        position: { x: 104, y: 104 },
        size: { height: 48, width: 48 },
        type: "aws-lambda-function",
        zIndex: 1
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const compilerProposalDiagram: DiagramJson = {
    ...normalizedInternalDiagram,
    nodes: [
      {
        ...normalizedInternalDiagram.nodes[0]!,
        position: { x: 100, y: 100 },
        size: { height: 56, width: 56 }
      }
    ]
  };

  const visible = resolveDiagramEditorVisibleDiagram({
    currentDiagram: normalizedInternalDiagram,
    initialDiagram: compilerProposalDiagram,
    initialPreviewDiagram: compilerProposalDiagram,
    mode: "viewer",
    previewDiagram: normalizedInternalDiagram
  });

  assert.equal(visible, compilerProposalDiagram);
  assert.deepEqual(visible.nodes[0]?.position, { x: 100, y: 100 });
  assert.deepEqual(visible.nodes[0]?.size, { height: 56, width: 56 });
});
