import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const managerSource = readFileSync(
  new URL("./ProjectWorkspaceDraftManager.tsx", import.meta.url),
  "utf8"
);
const rightPanelSource = readFileSync(
  new URL("./WorkspaceRightPanel.tsx", import.meta.url),
  "utf8"
);
const modalSource = readFileSync(new URL("./LiveObservationModal.tsx", import.meta.url), "utf8");

test("Live Observation applies Terraform files to the current Project Draft before saving", () => {
  const managerCallback = sourceBlock(
    managerSource,
    "const handleLiveObservationTerraformFilesApply",
    "const handleTerraformFilesReplacementApplied"
  );
  const applyCallback = sourceBlock(
    rightPanelSource,
    "const applyLiveObservationTerraformUpdate",
    "const openLiveObservationTerraformEditor"
  );

  assert.match(managerCallback, /latestDiagramRef\.current = diagramJson/);
  assert.match(managerCallback, /handleTerraformFilesChange\(files\)/);
  assert.match(managerCallback, /setTerraformFilesReplacement/);
  assert.match(managerCallback, /notifyFilesChange: false/);
  assert.match(applyCallback, /incrementLiveObservationEcsScalingSettings/);
  assert.match(applyCallback, /const originalDiagram = context\.diagram/);
  assert.match(applyCallback, /const originalFiles = terraformAiCodeContext\.files/);
  assert.match(applyCallback, /catch \(error\)/);
  assert.match(applyCallback, /context\.applyDiagramJson\(originalDiagram\)/);
  assert.match(applyCallback, /diagramJson: originalDiagram,[\s\S]*?files: originalFiles/);
  assert.match(applyCallback, /syncTerraformToDiagram/);
  assert.match(applyCallback, /context\.applyDiagramJson\(syncResult\.diagramJson\)/);
  assert.match(
    applyCallback,
    /onLiveObservationTerraformFilesApply\(\{[\s\S]*?diagramJson: syncResult\.diagramJson,[\s\S]*?files: result\.files/
  );
  assert.match(applyCallback, /await context\.saveDiagramNow\?\.\(\)/);
  assert.match(applyCallback, /requireSavedProjectDraftRevision\(saveResult\)/);
  assert.match(
    rightPanelSource,
    /<LiveObservationModal[\s\S]*?onApplyTerraformUpdate=\{applyLiveObservationTerraformUpdate\}/
  );
});

test("Live Observation keeps the warning outside the modal until Project Draft save succeeds", () => {
  assert.match(
    rightPanelSource,
    /const \[liveObservationIncidentSnapshot, setLiveObservationIncidentSnapshot\] =/
  );
  assert.match(rightPanelSource, /trafficIncidentSnapshot=\{liveObservationIncidentSnapshot\}/);
  assert.doesNotMatch(modalSource, /useState<LiveObservationV2Snapshot \| null>\(null\)/);

  const applyCallback = sourceBlock(
    modalSource,
    "async function applyTerraformUpdate",
    "if (!mounted) return null"
  );
  assert.match(applyCallback, /const result = await onApplyTerraformUpdate\(\)/);
  assert.match(applyCallback, /onAppliedTerraformUpdateChange\(result\)/);
  assert.match(applyCallback, /onTrafficIncidentSnapshotChange\(null\)/);
});

test("Live Observation clears an old incident result when the Deployment or session changes", () => {
  const deploymentChange = sourceBlock(
    rightPanelSource,
    "const updateLiveObservationDeployment",
    "const updateLiveObservationSession"
  );
  const sessionChange = sourceBlock(
    rightPanelSource,
    "const updateLiveObservationSession",
    "const updateLiveObservationSnapshot"
  );

  for (const block of [deploymentChange, sessionChange]) {
    assert.match(block, /setLiveObservationIncidentSnapshot\(null\)/);
    assert.match(block, /setLiveObservationAppliedTerraformUpdate\(null\)/);
  }
});

test("Live Observation closes the Deployment overlay before opening from its console", () => {
  const openCallback = sourceBlock(
    rightPanelSource,
    "const openLiveObservation = useCallback",
    "const applyLiveObservationTerraformUpdate"
  );

  assert.match(openCallback, /setIsDeploymentConsoleOpen\(false\)/);
  assert.match(openCallback, /setIsLiveObservationOpen\(true\)/);
});

test("Live Observation opens and highlights the exact saved Terraform location", () => {
  const openCallback = sourceBlock(
    rightPanelSource,
    "const openLiveObservationTerraformEditor",
    "const updateLiveObservationDeployment"
  );

  assert.match(openCallback, /setIsDeploymentConsoleOpen\(false\)/);
  assert.match(openCallback, /openTerraformIssueSourceLocation\(\{/);
  assert.match(openCallback, /fileName: liveObservationAppliedTerraformUpdate\.fileName/);
  assert.match(openCallback, /line: liveObservationAppliedTerraformUpdate\.line/);
  assert.match(openCallback, /resourceAddress: liveObservationAppliedTerraformUpdate\.address/);
});

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}
