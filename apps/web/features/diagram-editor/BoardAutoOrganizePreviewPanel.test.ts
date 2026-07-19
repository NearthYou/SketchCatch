import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import type { DiagramJson } from "@sketchcatch/types";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createBoardAutoOrganizePreviewSession } from "../architecture-board-compiler";

const cssLoaderSource = `export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "export default {};" };
  }
  return nextLoad(url, context);
}`;

register(`data:text/javascript,${encodeURIComponent(cssLoaderSource)}`, import.meta.url);
Object.assign(globalThis, { React });
const stylesSource = readFileSync(new URL("./diagram-editor.module.css", import.meta.url), "utf8");

test("자동 정리 패널은 보기 전환 없이 정리 결과와 두 최종 선택만 보여준다", async () => {
  const { BoardAutoOrganizePreviewPanel } = await import("./BoardAutoOrganizePreviewPanel");
  const source = diagram();
  const organized = structuredClone(source);
  organized.nodes[0]!.position = { x: 240, y: 120 };
  const session = {
    ...createBoardAutoOrganizePreviewSession(source, organized),
    candidateId: "hidden-candidate",
    compilerVersion: "hidden-compiler",
    templateId: "hidden-template",
    qualityScore: 99
  };
  const html = renderToStaticMarkup(
    createElement(BoardAutoOrganizePreviewPanel, {
      session,
      onKeepOriginal() {},
      onUseOrganized() {}
    })
  );

  assert.equal(html.includes("원본 유지"), true);
  assert.equal(html.includes("이 정리 사용"), true);
  assert.equal(html.includes('aria-label="미리보기 선택"'), false);
  assert.equal(html.includes("aria-pressed"), false);
  assert.equal(html.includes(session.summary.whatChanged), false);
  assert.equal(html.includes(session.summary.reviewItems[0]!), false);
  assert.equal(html.includes("hidden-candidate"), false);
  assert.equal(html.includes("hidden-compiler"), false);
  assert.equal(html.includes("hidden-template"), false);
  assert.equal(html.includes("99"), false);
  assert.match(
    stylesSource,
    /\.compilerPreviewNotice\s*\{[^}]*max-width:\s*calc\(100% - 24px\);[^}]*padding:\s*8px;[^}]*width:\s*360px;/s
  );
  assert.doesNotMatch(stylesSource, /\.compilerPreviewViewToggle/);
  assert.equal(html.includes("기술 세부 정보"), false);
});

test("자동 정리 실패 패널은 내부 오류 대신 짧은 안내와 재시도만 보여준다", async () => {
  const { BoardAutoOrganizeFailurePanel } = await import("./BoardAutoOrganizePreviewPanel");
  const html = renderToStaticMarkup(
    createElement(BoardAutoOrganizeFailurePanel, {
      onClose() {},
      onRetry() {}
    })
  );

  assert.equal(html.includes("자동 정리를 준비하지 못했어요."), true);
  assert.equal(html.includes("다시 시도"), true);
  assert.equal(html.includes("stack"), false);
  assert.equal(html.includes("Error:"), false);
});

function diagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "node-a",
        type: "aws_instance",
        kind: "resource",
        position: { x: 40, y: 40 },
        size: { width: 48, height: 48 },
        label: "EC2",
        locked: false,
        zIndex: 1
      }
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
