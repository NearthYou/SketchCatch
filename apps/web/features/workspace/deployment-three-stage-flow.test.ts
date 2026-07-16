import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const managerSource = read("ProjectWorkspaceDraftManager.tsx");
const directDeploymentSource = read("DirectDeploymentScreen.tsx");
const deploymentShellSource = read("DeploymentConsoleShell.tsx");
const rightPanelSource = read("WorkspaceRightPanel.tsx");
const projectBarSource = read("../diagram-editor/WorkspaceProjectBar.tsx");
const workspaceStyles = read("workspace.module.css");

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
  const actionsStart = directDeploymentSource.indexOf("function renderDirectStepActions");
  const validationStart = directDeploymentSource.indexOf(
    'if (stepId === "validation")',
    actionsStart
  );
  const approvalStart = directDeploymentSource.indexOf(
    'if (stepId === "approval")',
    validationStart
  );
  const validationSource = directDeploymentSource.slice(validationStart, approvalStart);

  assert.ok(actionsStart > -1);
  assert.ok(validationStart > -1);
  assert.ok(approvalStart > validationStart);
  assert.match(validationSource, /startTerraformDestroyPlan/);
  assert.match(validationSource, /저장 후 검증 실행/);
});

test("idle validation has no cancel button while running deployment can still be cancelled", () => {
  const actionsStart = directDeploymentSource.indexOf("function renderDirectStepActions");
  const validationStart = directDeploymentSource.indexOf(
    'if (stepId === "validation")',
    actionsStart
  );
  const approvalStart = directDeploymentSource.indexOf(
    'if (stepId === "approval")',
    validationStart
  );
  const validationSource = directDeploymentSource.slice(validationStart, approvalStart);

  assert.doesNotMatch(validationSource, /onClick=\{onCancel\}/);
  assert.doesNotMatch(validationSource, />\s*취소\s*</);
  assert.match(validationSource, /selectedDeployment\?\.status === "RUNNING"/);
  assert.match(validationSource, /onClick=\{cancelSelectedDeployment\}/);
  assert.match(validationSource, />\s*실행 취소\s*</);
  assert.match(directDeploymentSource, /setShowApplyConfirmation\(false\)/);
  assert.match(directDeploymentSource, /setShowDestroyConfirmation\(false\)/);
  assert.match(directDeploymentSource, /confirmationDismissRequestId/);
  assert.match(deploymentShellSource, /confirmationDismissRequestId/);
});

test("the recent validation result aligns with settings and does not follow scrolling", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const historyStart = directDeploymentSource.indexOf("const renderResultsSection", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, historyStart);
  const headingIndex = setupSource.indexOf("styles.deploymentStepHeading");
  const workspaceIndex = setupSource.indexOf("styles.deploymentStepWorkspace", headingIndex);
  const recentResultIndex = setupSource.indexOf("styles.deploymentRecentResultCard", workspaceIndex);

  assert.ok(headingIndex > -1);
  assert.ok(workspaceIndex > headingIndex);
  assert.ok(recentResultIndex > workspaceIndex);
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepHeading\s*\{[^}]*grid-column:\s*1 \/ -1;/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentRecentResultCard\s*\{[^}]*position:\s*static;/s
  );
});

test("deployment actions sit directly above the recent result without a divider", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const historyStart = directDeploymentSource.indexOf("const renderResultsSection", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, historyStart);
  const headingIndex = setupSource.lastIndexOf("styles.deploymentStepHeading");
  const actionsIndex = setupSource.lastIndexOf("renderDirectStepActions(selectedStep.id)");
  const workspaceIndex = setupSource.lastIndexOf("styles.deploymentStepWorkspace");
  const recentResultIndex = setupSource.lastIndexOf("styles.deploymentRecentResultCard");

  assert.ok(actionsIndex > headingIndex);
  assert.ok(workspaceIndex > actionsIndex);
  assert.ok(recentResultIndex > workspaceIndex);
  assert.match(
    workspaceStyles,
    /"heading actions"\s*"workspace result"/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar\s*\{[^}]*border:\s*0;[^}]*grid-area:\s*actions;/s
  );
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
  assert.match(historySource, /deploymentHistoryHeader/);
  assert.match(historySource, /deploymentHistoryPicker/);
  assert.match(historySource, /deploymentHistorySnapshot/);
  assert.match(historySource, /deploymentHistoryMetrics/);
  assert.match(directDeploymentSource, /label: formatDeploymentVersionDate\(deployment\.createdAt\)/);
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

test("expanded history details do not repeat their disclosure titles", () => {
  const resultsStart = directDeploymentSource.indexOf("const renderResultsSection");
  const logsStart = directDeploymentSource.indexOf("const renderLogsSection", resultsStart);
  const historyStart = directDeploymentSource.indexOf("const renderDeploymentHistory", logsStart);
  const resultsSource = directDeploymentSource.slice(resultsStart, logsStart);
  const logsSource = directDeploymentSource.slice(logsStart, historyStart);

  assert.doesNotMatch(resultsSource, /<h3>리소스와 Output<\/h3>/);
  assert.doesNotMatch(logsSource, /<h3>전체 로그<\/h3>/);
  assert.match(resultsSource, /aria-label="리소스와 Output 세부 내용"/);
  assert.match(logsSource, /aria-label="전체 로그 세부 내용"/);
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
