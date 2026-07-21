import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("./CicdPipelineRunsPanel.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./DeploymentConsoleShell.tsx", import.meta.url), "utf8");
const activitySource = readFileSync(new URL("./CicdActivityView.tsx", import.meta.url), "utf8");
const logsSource = readFileSync(new URL("./CicdLogsView.tsx", import.meta.url), "utf8");

test("keeps Pipeline refresh owned by the global CI/CD header", () => {
  assert.match(panelSource, /!presentation\.showRunControls \? \(/);
  assert.doesNotMatch(panelSource, /headerAction=|Pipeline 새로고침|onManualRefresh/);
  assert.doesNotMatch(panelSource, /href="#cicd-handoff"/);
  assert.match(panelSource, /아직 실행된 Pipeline이 없습니다/);
  assert.match(shellSource, /onClick=\{refreshActiveScreen\}/);
  assert.match(shellSource, /새로고침 중/);
});

test("presents Pipeline as the flat fourth phase", () => {
  assert.match(panelSource, /<CicdAccordionSection/);
  assert.match(panelSource, /phaseNumber="04"/);
  assert.match(panelSource, /title="Pipeline"/);
  assert.match(panelSource, /className=\{deliveryStyles\.accordionContent\}/);
  assert.match(
    panelSource,
    /\{selectedRun \? <SelectedRunSummary run=\{selectedRun\} \/> : null\}/
  );
  assert.doesNotMatch(panelSource, /Pipeline 상태 카드|Pipeline 실행 카드|최근 실행 수/);
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
