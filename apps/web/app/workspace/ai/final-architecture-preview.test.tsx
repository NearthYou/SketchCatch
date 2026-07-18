import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiagramJson } from "@sketchcatch/types";
import { FinalArchitecturePreview } from "./final-architecture-preview";

Object.assign(globalThis, { React });

test("최종 미리보기는 상단 요약과 확인할 점 없이 Diagram과 적용 동작만 보여준다", () => {
  const diagram = {
    edges: [],
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  } as DiagramJson;

  const html = renderToStaticMarkup(
    createElement(FinalArchitecturePreview, {
      approvalError: null,
      canApprove: true,
      diagram,
      isApplying: false,
      onApply: async () => undefined,
      onBackToConversation: () => undefined,
      onRegenerate: async () => undefined,
      selections: []
    })
  );

  assert.doesNotMatch(html, /AI 초안|초안이 준비됐어요|확인할 점|모두 보기/);
  assert.match(html, /다시 생성/);
  assert.match(html, /보드에 적용/);
});
