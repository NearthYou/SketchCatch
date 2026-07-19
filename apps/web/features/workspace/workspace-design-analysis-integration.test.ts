import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const analysisPanelSource = readFileSync(
  new URL("./WorkspaceDesignAnalysisPanel.tsx", import.meta.url),
  "utf8"
);
const rightPanelSource = readFileSync(
  new URL("./WorkspaceRightPanel.tsx", import.meta.url),
  "utf8"
);
const rightPanelTypesSource = readFileSync(
  new URL("./workspace-right-panel.types.ts", import.meta.url),
  "utf8"
);

test("현재 Workspace 오른쪽 패널에서 설계 분석을 직접 열 수 있다", () => {
  assert.match(rightPanelTypesSource, /"analysis"/);
  assert.match(rightPanelSource, /WorkspaceDesignAnalysisPanel/);
  assert.match(rightPanelSource, /requestView\("analysis"\)/);
  assert.match(rightPanelSource, /openCollapsedView\("analysis"\)/);
  assert.match(rightPanelSource, /activeView === "analysis"/);
  assert.match(rightPanelSource, /title="설계 분석"/);
  assert.match(
    rightPanelSource,
    /hidden=\{activeView !== "analysis"\}[\s\S]*?<WorkspaceDesignAnalysisPanel context=\{context\}/
  );
});

test("설계 분석은 현재 Board로 시뮬레이션과 보안 점검을 함께 실행한다", () => {
  assert.match(analysisPanelSource, /createWorkspaceAiBoardSnapshot\(context\.diagram\)/);
  assert.match(analysisPanelSource, /runAiDesignSimulation/);
  assert.match(analysisPanelSource, /runAiPreDeploymentCheck/);
  assert.match(analysisPanelSource, /Promise\.all/);
  assert.match(analysisPanelSource, /WorkspaceDesignAnalysisResult/);
  assert.match(analysisPanelSource, /보드 변경됨 · 다시 실행 필요/);
});

test("Live Observation은 설계 분석과 분리된 런타임 관측 진입점으로 유지한다", () => {
  assert.match(rightPanelSource, /onClick=\{\(\) => openLiveObservation\(\)\}/);
  assert.doesNotMatch(analysisPanelSource, /LiveObservation|openLiveObservation/);
});
