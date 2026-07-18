import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardCompilationProposal } from "@sketchcatch/types";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchitectureBoardCompilationSummary } from "./architecture-board-compilation-summary";

Object.assign(globalThis, { React });

const proposal = {
  architecture: { nodes: [], edges: [] },
  diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  changes: [],
  diagnostics: [],
  quality: {
    before: {
      score: 12_000_000,
      visualPenalty: 12_000_000,
      structuralPenalty: 0,
      semanticDiagnosticPenalty: 0,
      metrics: {
        nodeOverlapCount: 2,
        edgeNodeIntersectionCount: 1,
        edgeCrossingCount: 1,
        parentBoundaryViolationCount: 0
      }
    },
    after: {
      score: 1_000_000,
      visualPenalty: 1_000_000,
      structuralPenalty: 0,
      semanticDiagnosticPenalty: 0,
      metrics: {
        nodeOverlapCount: 0,
        edgeNodeIntersectionCount: 0,
        edgeCrossingCount: 1,
        parentBoundaryViolationCount: 0
      }
    },
    compilationDistance: 13
  },
  provenance: {
    compilerVersion: "architecture-board-compiler/v3",
    candidateId: "compiled:internal",
    referenceTemplateIds: ["internal-template-id"]
  }
} satisfies ArchitectureBoardCompilationProposal;

test("공유 Compiler 요약은 기본 화면에서 실제 문제 변화와 남은 검토 항목을 설명한다", () => {
  const html = renderToStaticMarkup(
    createElement(ArchitectureBoardCompilationSummary, { proposal })
  );
  const technicalDetailsIndex = html.indexOf("기술 세부 정보");
  const defaultSurface = technicalDetailsIndex === -1 ? html : html.slice(0, technicalDetailsIndex);

  assert.match(defaultSurface, /배치 문제 3건을 줄였습니다/);
  assert.match(defaultSurface, /Resource 겹침/);
  assert.match(defaultSurface, /서로 교차하는 연결선/);
  assert.match(defaultSurface, /배치 문제 1건이 남아 있습니다/);
  assert.doesNotMatch(defaultSurface, /정리 점수|변경 거리|compiled:internal|internal-template-id/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:=|\s|>)/);
});
