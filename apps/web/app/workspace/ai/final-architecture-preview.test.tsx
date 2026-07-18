import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiagramJson } from "@sketchcatch/types";
import { FinalArchitecturePreview } from "./final-architecture-preview";

Object.assign(globalThis, { React });

test("최종 미리보기는 Diagram과 선택 기록만 보여주고 동작 버튼은 상단 바에 맡긴다", () => {
  const diagram = {
    edges: [],
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  } as DiagramJson;

  const html = renderToStaticMarkup(
    createElement(FinalArchitecturePreview, {
      diagram,
      selections: []
    })
  );

  assert.doesNotMatch(html, /AI 초안|초안이 준비됐어요|확인할 점|모두 보기/);
  assert.doesNotMatch(html, /다시 생성|보드에 적용|대화로 돌아가기/);
  assert.doesNotMatch(html, /적용하기 전에는 보드가 바뀌지 않아요/);
});
