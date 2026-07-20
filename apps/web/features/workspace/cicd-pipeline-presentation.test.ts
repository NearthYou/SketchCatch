import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("./CicdPipelineRunsPanel.tsx", import.meta.url), "utf8");
const activitySource = readFileSync(new URL("./CicdActivityView.tsx", import.meta.url), "utf8");
const logsSource = readFileSync(new URL("./CicdLogsView.tsx", import.meta.url), "utf8");

test("renders one empty-state action instead of empty Pipeline controls", () => {
  assert.match(panelSource, /!presentation\.showRunControls \? \(/);
  assert.match(panelSource, /isHandoffReady \? \(/);
  assert.match(panelSource, /Pipeline 새로고침/);
  assert.match(panelSource, /href="#cicd-handoff"/);
  assert.match(panelSource, /presentation\.showRunControls \? \([\s\S]*새로고침[\s\S]*\) : null/);
});

test("uses tabs only for a selected Pipeline Run", () => {
  assert.match(panelSource, /role="tablist"/);
  assert.match(panelSource, /role="tab"/);
  assert.match(panelSource, /role="tabpanel"/);
  assert.match(panelSource, /aria-selected=\{activeView === view\}/);
  assert.match(panelSource, /hidden=\{activeView !== "activity"\}/);
  assert.match(panelSource, /hidden=\{activeView !== "logs"\}/);
  assert.match(panelSource, /formatPipelineRunOption\(run\)/);
});

test("keeps output and Live Observation actions outside Activity and Logs", () => {
  assert.match(panelSource, /<DeploymentOutputLinks/);
  assert.doesNotMatch(activitySource, /outputUrl|runUrl|GitHub Actions에서 보기/);
  assert.doesNotMatch(logsSource, /onOpenLiveObservation|Live Observation/);
});
