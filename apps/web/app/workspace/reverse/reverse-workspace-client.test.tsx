import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReverseEngineeringCandidatePanelState } from "../../../features/workspace/ReverseEngineeringPanel";
import { ReverseBoardCandidateSelectionPanel } from "./reverse-workspace-client";

const reverseWorkspaceClientSource = readFileSync(
  new URL("./reverse-workspace-client.tsx", import.meta.url),
  "utf8"
);

const emptyState: ReverseEngineeringCandidatePanelState = {
  candidates: [],
  hasScanResult: false,
  onCandidateSelect() {},
  selectedCandidateId: null
};

test("스캔 전 왼쪽 패널은 이전 보드 후보 선택 안내를 보여주지 않는다", () => {
  const html = renderToStaticMarkup(
    createElement(ReverseBoardCandidateSelectionPanel, {
      onChooseAnotherStartMode() {},
      state: emptyState
    })
  );

  assert.doesNotMatch(html, /보드 후보 선택/);
  assert.doesNotMatch(html, /아직 가져온 구조가 없습니다/);
  assert.match(html, /시작 방식 다시 선택/);
});

test("스캔 뒤 왼쪽 패널은 가져온 구조 요약만 보여준다", () => {
  const html = renderToStaticMarkup(
    createElement(ReverseBoardCandidateSelectionPanel, {
      onChooseAnotherStartMode() {},
      state: {
        candidates: [
          {
            architectureJson: { edges: [], nodes: [] },
            description: "AWS에서 가져온 구조입니다.",
            edgeCount: 3,
            id: "candidate-1",
            nodeCount: 4,
            resourceCount: 4,
            title: "가져온 구조"
          }
        ],
        hasScanResult: true,
        onCandidateSelect() {},
        selectedCandidateId: "candidate-1"
      }
    })
  );

  assert.match(html, /가져온 구조/);
  assert.doesNotMatch(html, /보드 후보 선택/);
});

test("리버스 엔지니어링은 처음에 양쪽 패널을 최소 폭으로 연다", () => {
  assert.match(
    reverseWorkspaceClientSource,
    /const REVERSE_ENGINEERING_INITIAL_PANEL_LAYOUT = \{\s*leftPanelOpen: true,\s*rightPanelOpen: true,\s*startWithMinimumWidths: true\s*\} as const;/s
  );
  assert.match(
    reverseWorkspaceClientSource,
    /<DiagramEditor[\s\S]*?initialPanelLayout=\{REVERSE_ENGINEERING_INITIAL_PANEL_LAYOUT\}/
  );
});
