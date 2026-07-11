import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Position } from "@xyflow/react";

import { getDiagramEdgePatchBadgePosition } from "./diagram-edge-patch-badge";
import { getDiagramEdgeLabelOffset, getDiagramEdgePath } from "./diagram-edge-path";

const diagramEdgeViewSource = readFileSync(
  fileURLToPath(new URL("./DiagramEdgeView.tsx", import.meta.url)),
  "utf8"
);
const diagramEditorCssSource = readFileSync(
  fileURLToPath(new URL("./diagram-editor.module.css", import.meta.url)),
  "utf8"
);

test("custom edge renderer keeps halo, semantic, motion, interaction, and label layers ordered", () => {
  const haloIndex = diagramEdgeViewSource.indexOf("styles.edgeHalo");
  const semanticIndex = diagramEdgeViewSource.indexOf("styles.edgeSemanticPath");
  const motionIndex = diagramEdgeViewSource.indexOf("styles.edgeMotionPath");
  const interactionIndex = diagramEdgeViewSource.indexOf("styles.edgeInteractionPath");
  const labelIndex = diagramEdgeViewSource.indexOf("styles.edgeLabel");
  const patchBadgeIndex = diagramEdgeViewSource.indexOf("styles.edgePatchBadge");

  assert.ok(haloIndex >= 0);
  assert.ok(haloIndex < semanticIndex);
  assert.ok(semanticIndex < motionIndex);
  assert.ok(motionIndex < interactionIndex);
  assert.ok(interactionIndex < labelIndex);
  assert.ok(labelIndex < patchBadgeIndex);
});

test("custom edge renderer keeps all stored path kinds renderable", () => {
  const input = {
    sourcePosition: Position.Right,
    sourceX: 0,
    sourceY: 20,
    targetPosition: Position.Left,
    targetX: 180,
    targetY: 100
  };

  for (const kind of ["default", "smoothstep", "step", "straight"] as const) {
    const [path, labelX, labelY] = getDiagramEdgePath(kind, input);

    assert.match(path, /^M/u);
    assert.equal(Number.isFinite(labelX), true);
    assert.equal(Number.isFinite(labelY), true);
  }
});

test("smooth paths keep shared endpoint stubs below the eight-pixel visual limit", () => {
  const [path] = getDiagramEdgePath("smoothstep", {
    sourcePosition: Position.Bottom,
    sourceX: 100,
    sourceY: 20,
    targetPosition: Position.Left,
    targetX: 80,
    targetY: 220
  });
  const endpointStubMatch = /Q [^,]+,220 ([\d.]+),220L80 220$/u.exec(path);

  assert.ok(endpointStubMatch);
  assert.ok(80 - Number(endpointStubMatch[1]) <= 8);
});

test("mixed-orientation routes offset labels away from competing vertical relationships", () => {
  assert.equal(getDiagramEdgeLabelOffset(Position.Top, Position.Left), -20);
  assert.equal(getDiagramEdgeLabelOffset(Position.Bottom, Position.Left), 20);
  assert.equal(getDiagramEdgeLabelOffset(Position.Right, Position.Left), 0);
  assert.equal(getDiagramEdgeLabelOffset(Position.Bottom, Position.Top), 0);
});

test("custom edge renderer renders motion only from mapped edge data", () => {
  assert.match(diagramEdgeViewSource, /data\?\.isAnimated\s*\?\s*\(/);
  assert.doesNotMatch(diagramEdgeViewSource, /animated\s*\?\s*\(/);
});

test("edge hover stays quieter than keyboard focus and selection", () => {
  const hoverRule = getCssRuleContaining(
    ".canvasPanel :global(.react-flow__edge:hover) .edgeHalo {"
  );
  const focusRule = getCssRuleContaining(
    ".canvasPanel :global(.react-flow__edge:focus-visible) .edgeHalo {"
  );
  const selectionRule = getCssRuleContaining(".edgeHaloSelected {");

  assert.match(hoverRule, /opacity:\s*0\.1;/);
  assert.match(focusRule, /opacity:\s*0\.7;/);
  assert.match(selectionRule, /opacity:\s*0\.2;/);
});

test("reduced motion removes edge halo and compact label transitions", () => {
  assert.match(
    diagramEditorCssSource,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.edgeHalo,\s*\.canvasPanelEdgeLabelsCompact :global\(\.react-flow__edge-text\),\s*\.canvasPanelEdgeLabelsCompact :global\(\.react-flow__edge-textbg\)\s*\{[^}]*transition:\s*none;/
  );
});

test("patch edges expose non-color glyphs with an accessible edge identity", () => {
  assert.match(diagramEdgeViewSource, /added:\s*\{\s*glyph:\s*"\+",\s*label:\s*"추가됨"\s*\}/);
  assert.match(diagramEdgeViewSource, /modified:\s*\{\s*glyph:\s*"~",\s*label:\s*"수정됨"\s*\}/);
  assert.match(diagramEdgeViewSource, /deleted:\s*\{\s*glyph:\s*"−",\s*label:\s*"삭제됨"\s*\}/);
  assert.match(
    diagramEdgeViewSource,
    /const edgeAccessibleName = getEdgeAccessibleName\(data\?\.edge\.label \?\? label, source, target\);/
  );
  assert.match(
    diagramEdgeViewSource,
    /const patchBadgeAccessibleLabel = patchBadge\s*\? `\$\{patchBadge\.label\}: \$\{edgeAccessibleName\}`/
  );
  assert.match(diagramEdgeViewSource, /aria-label=\{patchBadgeAccessibleLabel\}/);
  assert.match(diagramEdgeViewSource, /role="img"/);
  assert.match(diagramEdgeViewSource, /<title>\{edgeAccessibleName\}<\/title>/);
  assert.match(diagramEdgeViewSource, /<title>\{patchBadgeAccessibleLabel\}<\/title>/);
  assert.match(
    diagramEditorCssSource,
    /\.edgePatchBadge text\s*\{[^}]*font-family:\s*var\(--workspace-font\);/s
  );
});

test("unlabelled patch badges use a perpendicular offset instead of covering the semantic path", () => {
  assert.deepEqual(
    getDiagramEdgePatchBadgePosition({
      hasLabel: false,
      labelX: 100,
      labelY: 0,
      patchState: "modified",
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 0
    }),
    { x: 100, y: -14 }
  );
  assert.deepEqual(
    getDiagramEdgePatchBadgePosition({
      hasLabel: false,
      labelX: 0,
      labelY: 100,
      patchState: "deleted",
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 200
    }),
    { x: 14, y: 100 }
  );
  assert.deepEqual(
    getDiagramEdgePatchBadgePosition({
      hasLabel: false,
      labelX: 100,
      labelY: 0,
      patchState: "added",
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 0
    }),
    { x: 50, y: -14 }
  );
  assert.deepEqual(
    getDiagramEdgePatchBadgePosition({
      hasLabel: true,
      labelX: 100,
      labelY: 50,
      patchState: "modified",
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 100
    }),
    { x: 100, y: 32 }
  );
  assert.match(
    diagramEdgeViewSource,
    /const patchBadgePosition = patchState\s*\? getDiagramEdgePatchBadgePosition/
  );
});

function getCssRuleContaining(selector: string): string {
  const selectorStart = diagramEditorCssSource.indexOf(selector);

  assert.notEqual(selectorStart, -1);

  const blockEnd = diagramEditorCssSource.indexOf("}", selectorStart);

  assert.notEqual(blockEnd, -1);

  return diagramEditorCssSource.slice(selectorStart, blockEnd + 1);
}
