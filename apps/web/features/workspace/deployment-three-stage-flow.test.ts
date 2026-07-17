import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const managerSource = read("ProjectWorkspaceDraftManager.tsx");
const directDeploymentSource = read("DirectDeploymentScreen.tsx");
const rightPanelSource = read("WorkspaceRightPanel.tsx");
const projectBarSource = read("../diagram-editor/WorkspaceProjectBar.tsx");

test("the main board opens deployment immediately without saving", () => {
  const callbackStart = managerSource.indexOf("const saveAndOpenDeployment");
  const callbackEnd = managerSource.indexOf("useEffect", callbackStart);
  const callbackSource = managerSource.slice(callbackStart, callbackEnd);

  assert.ok(callbackStart > -1);
  assert.ok(callbackEnd > callbackStart);
  assert.match(callbackSource, /setDeploymentOpenRequestId/);
  assert.doesNotMatch(callbackSource, /flushDraftToServer|setSaveAndDeployError/);
  assert.match(projectBarSource, />\s*배포\s*</);
});

test("the deployment entry has no save-dependent pending state", () => {
  assert.doesNotMatch(projectBarSource, /isSaveAndDeployPending|setSaveAndDeployPending/);
  assert.doesNotMatch(projectBarSource, /aria-busy=\{isSaveAndDeployPending\}/);
  assert.doesNotMatch(projectBarSource, /disabled=\{isSaving \|\| isSaveAndDeployPending\}/);
  assert.doesNotMatch(projectBarSource, /저장하고 배포|저장·배포 준비 중/);
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

test("Direct Deployment keeps the URL visible and offers frontend-only retry after partial failure", () => {
  assert.match(directDeploymentSource, /PARTIALLY_FAILED/);
  assert.match(directDeploymentSource, /같은 빌드 결과로 웹 배포 재시도/);
  assert.match(directDeploymentSource, /retryDeploymentFrontend\(selectedDeployment\.id\)/);
  assert.match(directDeploymentSource, /현재 주소와 QR, Live Observation은 계속 사용할 수 있지만/);
});

test("Direct Deployment auto-selects the verified AWS connection without rendering a selector", () => {
  assert.doesNotMatch(directDeploymentSource, /ariaLabel="AWS 연결 선택"/);
  assert.match(directDeploymentSource, /awsConnectionId: selectedAwsConnectionId/);
});

test("Direct Deployment omits the removed deployment context and run-details sections", () => {
  assert.doesNotMatch(directDeploymentSource, /deploymentContextPanel/);
  assert.doesNotMatch(directDeploymentSource, /deployment-run-details|실행 세부정보/);
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
