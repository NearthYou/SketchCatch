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

  assert.match(managerCallback, /handleTerraformFilesChange\(files\)/);
  assert.match(managerCallback, /setTerraformFilesReplacement/);
  assert.match(managerCallback, /notifyFilesChange: false/);
  assert.match(applyCallback, /incrementLiveObservationEcsMaxCapacity/);
  assert.match(applyCallback, /onLiveObservationTerraformFilesApply\(result\.files\)/);
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

function sourceBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}
