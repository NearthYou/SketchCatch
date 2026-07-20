import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("design analysis is not exposed as a separate Workspace panel", () => {
  assert.doesNotMatch(rightPanelTypesSource, /"analysis"/);
  assert.doesNotMatch(rightPanelSource, /requestView\("analysis"\)/);
  assert.doesNotMatch(rightPanelSource, /openCollapsedView\("analysis"\)/);
  assert.doesNotMatch(rightPanelSource, /activeView === "analysis"/);
  assert.doesNotMatch(liveObservationModalSource, /WorkspaceDesignAnalysisPanel/);
});

test("Live Observation keeps operational analysis collapsed beneath the focused flow", () => {
  assert.match(rightPanelSource, /onClick=\{\(\) => openLiveObservation\(\)\}/);
  assert.match(rightPanelSource, /<LiveObservationModal[\s\S]*?projectId=\{projectId\}/);
  assert.match(liveObservationModalSource, /<LiveObservationFocusedFlow[\s\S]*?<details/);
  assert.match(liveObservationModalSource, /getLiveObservationOperationalAnalysis/);
  assert.match(liveObservationModalSource, /data-analysis-state=\{operationalAnalysis\.state\}/);
  assert.match(liveObservationModalSource, /operationalAnalysis\.terraformAction/);
});
