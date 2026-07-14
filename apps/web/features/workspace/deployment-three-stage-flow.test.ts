import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const managerSource = read("ProjectWorkspaceDraftManager.tsx");
const directDeploymentSource = read("DirectDeploymentScreen.tsx");
const rightPanelSource = read("WorkspaceRightPanel.tsx");
const projectBarSource = read("../diagram-editor/WorkspaceProjectBar.tsx");

test("the main board saves the project before opening deployment", () => {
  const saveIndex = managerSource.indexOf('await flushDraftToServer("manual")');
  const openIndex = managerSource.indexOf("setDeploymentOpenRequestId", saveIndex);

  assert.ok(saveIndex > -1);
  assert.ok(openIndex > saveIndex);
  assert.match(managerSource, /if \(!result\.ok\)[\s\S]*?return;/);
  assert.match(managerSource, /setTimeout\(\(\) => setSaveAndDeployError\(""\), 3_000\)/);
  assert.match(projectBarSource, /저장하고 배포/);
});

test("save and deploy gives immediate progress feedback in the project bar", () => {
  assert.match(projectBarSource, /isSaveAndDeployPending/);
  assert.match(projectBarSource, /aria-busy=\{isSaveAndDeployPending\}/);
  assert.match(projectBarSource, /저장·배포 준비 중/);
  assert.match(projectBarSource, /styles\.saveStatusSpinner/);
});

test("deployment preparation flushes the synchronized draft before artifact creation", () => {
  const syncIndex = rightPanelSource.indexOf("prepareTerraformArtifact()");
  const saveIndex = rightPanelSource.indexOf("context.saveDiagramNow?.()", syncIndex);
  const artifactIndex = rightPanelSource.indexOf("savePreparedTerraformArtifact", saveIndex);

  assert.ok(syncIndex > -1);
  assert.ok(saveIndex > syncIndex);
  assert.ok(artifactIndex > saveIndex);
  assert.match(rightPanelSource, /requireSavedProjectDraftRevision\(saveResult\)/);
});

test("Direct Deployment uses prepare, approve, and execute with three external phases", () => {
  assert.match(directDeploymentSource, /prepareDeployment\(\{/);
  assert.match(directDeploymentSource, /approveDeploymentPlan\(selectedDeployment\.id\)/);
  assert.match(directDeploymentSource, /executeDeployment\(selectedDeployment\.id\)/);
  assert.doesNotMatch(directDeploymentSource, /selectedLiveProfile|liveProfileOptions/);
  assert.match(directDeploymentSource, /stepId === "validation"/);
  assert.match(directDeploymentSource, /stepId === "approval"/);
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
