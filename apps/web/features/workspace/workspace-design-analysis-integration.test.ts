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
const liveObservationModalSource = readFileSync(
  new URL("./LiveObservationModal.tsx", import.meta.url),
  "utf8"
);
const rightPanelTypesSource = readFileSync(
  new URL("./workspace-right-panel.types.ts", import.meta.url),
  "utf8"
);

test("설계 분석은 별도 오른쪽 패널 없이 Live Observation 본문 아래에서 제공된다", () => {
  assert.doesNotMatch(rightPanelTypesSource, /"analysis"/);
  assert.doesNotMatch(rightPanelSource, /requestView\("analysis"\)/);
  assert.doesNotMatch(rightPanelSource, /openCollapsedView\("analysis"\)/);
  assert.doesNotMatch(rightPanelSource, /activeView === "analysis"/);
  assert.doesNotMatch(rightPanelSource, /title="설계 분석"/);
  assert.match(rightPanelSource, /<LiveObservationModal[\s\S]*?diagramContext=\{context\}/);
  assert.match(
    liveObservationModalSource,
    /<WorkspaceDesignAnalysisPanel context=\{diagramContext\} \/>[\s\S]*?<\/main>/
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

test("Live Observation은 런타임 관측과 사전 설계 분석을 한 화면에 제공한다", () => {
  assert.match(rightPanelSource, /onClick=\{\(\) => openLiveObservation\(\)\}/);
  assert.match(liveObservationModalSource, /WorkspaceDesignAnalysisPanel/);
});
