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

test("changed drafts keep cleanup available beside save and validation", () => {
  const validationStart = directDeploymentSource.indexOf('if (stepId === "validation")');
  const approvalStart = directDeploymentSource.indexOf('if (stepId === "approval")');
  const validationSource = directDeploymentSource.slice(validationStart, approvalStart);

  assert.ok(validationStart > -1);
  assert.ok(approvalStart > validationStart);
  assert.match(validationSource, /startTerraformDestroyPlan/);
  assert.match(validationSource, /저장 후 검증 실행/);
});

test("reload restores the persisted ProjectDraft revision instead of assuming changes", () => {
  assert.match(
    managerSource,
    /setProjectDraftRevision\(loadedDraft\.serverDraft\?\.revision \?\? null\)/
  );
  assert.match(managerSource, /projectDraftRevision=\{projectDraftRevision\}/);
  assert.match(rightPanelSource, /useState\(false\)/);
  assert.match(
    rightPanelSource,
    /useState<string \| null>\(\(\) => toDeploymentBaselineFingerprint\(context\.diagram\)\)/
  );
  assert.match(rightPanelSource, /projectDraftRevision=\{projectDraftRevision\}/);
});

test("Direct Deployment auto-selects the verified AWS connection without rendering a selector", () => {
  assert.doesNotMatch(directDeploymentSource, /ariaLabel="AWS 연결 선택"/);
  assert.match(directDeploymentSource, /awsConnectionId: selectedAwsConnectionId/);
});

test("Direct Deployment omits the removed deployment context and run-details sections", () => {
  assert.doesNotMatch(directDeploymentSource, /deploymentContextPanel/);
  assert.doesNotMatch(directDeploymentSource, /deployment-run-details|실행 세부정보/);
});

test("Deployment History selects one successful version and renders only its details", () => {
  const historyStart = directDeploymentSource.indexOf("const renderDeploymentHistory");
  const historyEnd = directDeploymentSource.indexOf("const renderHistoryView", historyStart);
  const historySource = directDeploymentSource.slice(historyStart, historyEnd);

  assert.ok(historyStart > -1);
  assert.ok(historyEnd > historyStart);
  assert.match(historySource, /id="deployment-history-version-select"/);
  assert.match(historySource, /onChange=\{setSelectedHistoryDeploymentId\}/);
  assert.doesNotMatch(historySource, /deploymentHistoryEntries\.map/);
  assert.doesNotMatch(historySource, /setSelectedDeploymentId/);
  assert.match(directDeploymentSource, /listDeploymentLogs\(deploymentId\)/);
  assert.match(directDeploymentSource, /beginDeploymentHistoryDetailsLoad/);
  assert.match(directDeploymentSource, /completeDeploymentHistoryDetailsLoad/);
  assert.match(directDeploymentSource, /failDeploymentHistoryDetailsLoad/);
  assert.match(directDeploymentSource, /aria-busy="true"/);
  assert.match(directDeploymentSource, /role="alert"/);
  assert.match(directDeploymentSource, /historyDeploymentResources/);
  assert.match(directDeploymentSource, /historyTerraformOutputs/);
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
