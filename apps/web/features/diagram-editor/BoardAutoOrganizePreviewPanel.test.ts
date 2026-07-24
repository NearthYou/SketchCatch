import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { BoardAutoOrganizeCandidateSet, DiagramJson } from "@sketchcatch/types";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createBoardAutoOrganizePreviewSession } from "../architecture-board-compiler";

const cssLoaderSource = `export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "export default {};" };
  }
  return nextLoad(url, context);
}`;
const diagramEditorStyles = readFileSync(
  fileURLToPath(new URL("./diagram-editor.module.css", import.meta.url)),
  "utf8"
);

register(`data:text/javascript,${encodeURIComponent(cssLoaderSource)}`, import.meta.url);
Object.assign(globalThis, { React });

test("preview panel exposes only the original and organized Board views without image candidates", async () => {
  const { BoardAutoOrganizePreviewPanel } = await import("./BoardAutoOrganizePreviewPanel");
  const source = createDiagram();
  const candidateSet = createCandidateSet(source);
  const session = {
    ...createBoardAutoOrganizePreviewSession(source, candidateSet, 7),
    compilerVersion: "hidden-compiler",
    qualityScore: "hidden-quality-score"
  };
  const html = renderToStaticMarkup(
    createElement(BoardAutoOrganizePreviewPanel, {
      session,
      onKeepOriginal() {},
      onSelectView() {},
      onUseOrganized() {}
    })
  );

  assert.equal(html.includes("자동 정리 미리보기"), true);
  assert.equal(html.includes("원본"), true);
  assert.equal(html.includes("정리본"), true);
  assert.equal(html.includes("이 정리본 적용"), true);
  assert.equal(html.includes("Resource, 설정, 연결 관계는 바뀌지 않았습니다."), true);
  assert.equal(html.includes("정리안 1"), false);
  assert.equal(html.includes("정리안 2"), false);
  assert.equal(html.includes("원본과 정리안 비교"), false);
  assert.equal(html.includes("<svg"), false);
  assert.equal(html.includes("role=\"img\""), false);
  assert.equal(html.includes("candidate-secret-alpha"), false);
  assert.equal(html.includes("candidate-secret-beta"), false);
  assert.equal(html.includes("hidden-compiler"), false);
  assert.equal(html.includes("hidden-quality-score"), false);
  assert.equal(html.includes("score"), false);
  assert.equal(html.includes("Compiler"), false);
});

test("original and organized toggle is visible at every screen size", () => {
  const viewToggle = getCssBlock(".autoOrganizeViewToggle");

  assert.match(viewToggle, /display:\s*inline-flex/);
  assert.equal(diagramEditorStyles.includes(".autoOrganizeCandidateStrip"), false);
  assert.equal(diagramEditorStyles.includes(".autoOrganizeDiagramThumbnail"), false);
  assert.equal(diagramEditorStyles.includes(".autoOrganizeComparison"), false);
  assert.equal(diagramEditorStyles.includes(".autoOrganizeMobileToggle"), false);
});

test("automatic organization failure uses short copy without internal diagnostics", async () => {
  const { BoardAutoOrganizeFailurePanel } = await import("./BoardAutoOrganizePreviewPanel");
  const html = renderToStaticMarkup(
    createElement(BoardAutoOrganizeFailurePanel, {
      onClose() {},
      onRetry() {}
    })
  );

  assert.equal(html.includes("정리안을 적용하지 못했어요."), true);
  assert.equal(html.includes("다시 시도"), true);
  assert.equal(html.includes("stack"), false);
  assert.equal(html.includes("Error:"), false);
});

/** 선택한 selector의 단일 CSS block을 회귀 검사용으로 읽습니다. */
function getCssBlock(selector: string): string {
  const start = diagramEditorStyles.indexOf(`${selector} {`);
  const end = diagramEditorStyles.indexOf("}\n", start);

  assert.notEqual(start, -1, `${selector} must exist`);
  assert.notEqual(end, -1, `${selector} block must close`);
  return diagramEditorStyles.slice(start, end + 2);
}

/** 자동 정리 미리보기 계약을 확인할 최소 Diagram을 만듭니다. */
function createDiagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "node-a",
        type: "aws_instance",
        kind: "resource",
        position: { x: 40, y: 40 },
        size: { width: 168, height: 96 },
        label: "Web server",
        locked: false,
        zIndex: 1
      },
      {
        id: "node-b",
        type: "aws_s3_bucket",
        kind: "resource",
        position: { x: 320, y: 180 },
        size: { width: 168, height: 96 },
        label: "Storage",
        locked: false,
        zIndex: 1
      }
    ],
    edges: [{ id: "edge-a", sourceNodeId: "node-a", targetNodeId: "node-b" }],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}

/** public preview가 첫 번째 정리 결과만 선택하는지 확인할 후보 집합을 만듭니다. */
function createCandidateSet(source: DiagramJson): BoardAutoOrganizeCandidateSet {
  const first = structuredClone(source);
  first.nodes[0]!.position = { x: 180, y: 120 };
  const second = structuredClone(source);
  second.nodes[0]!.position = { x: 180, y: 260 };

  return {
    sessionId: "board-auto-session:hidden",
    sourceFingerprint: "1234abcd",
    candidates: [first, second].map((diagram, index) => ({
      id: index === 0 ? "candidate-secret-alpha" : "candidate-secret-beta",
      diagram,
      visualDiff: {
        movedNodeIds: ["node-a"],
        resizedNodeIds: [],
        reroutedEdgeIds: [],
        addedFrameIds: [],
        changedFrameIds: [],
        removedFrameIds: []
      },
      explanations: [
        index === 0
          ? "Web server를 보기 편한 위치로 옮겼습니다."
          : "Web server와 Storage 사이 흐름을 정리했습니다.",
        "Resource, 설정, 연결 관계는 바뀌지 않았습니다."
      ],
      visualFingerprint: `visual-secret-${index}`
    }))
  };
}
