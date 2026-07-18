import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mergeGeneratedTerraformFiles } from "./terraform-panel-utils";

const managerSource = read("ProjectWorkspaceDraftManager.tsx");
const directDeploymentSource = read("DirectDeploymentScreen.tsx");
const deploymentShellSource = read("DeploymentConsoleShell.tsx");
const deploymentArtifactsSource = read("workspace-deployment-artifacts.ts");
const rightPanelSource = read("WorkspaceRightPanel.tsx");
const projectBarSource = read("../diagram-editor/WorkspaceProjectBar.tsx");
const diagramEditorStyles = read("../diagram-editor/diagram-editor.module.css");
const workspaceStyles = read("workspace.module.css");

test("Terraform refresh removes outputs that reference removed managed resources", () => {
  const result = mergeGeneratedTerraformFiles(
    [
      {
        fileName: "main.tf",
        code: `output "cloudfront_url" {
  value = "https://\${aws_cloudfront_distribution.distribution.domain_name}"
}

output "static_bucket_name" {
  value = aws_s3_bucket.bucket.bucket
}

output "operator_note" {
  value = "keep me"
}`
      }
    ],
    [
      {
        fileName: "main.tf",
        code: `resource "aws_s3_bucket" "s3_bucket" {
  force_destroy = false
}`
      }
    ],
    new Set()
  );
  const mainCode = result.find((file) => file.fileName === "main.tf")?.code ?? "";

  assert.doesNotMatch(mainCode, /aws_cloudfront_distribution\.distribution/);
  assert.doesNotMatch(mainCode, /aws_s3_bucket\.bucket\.bucket/);
  assert.match(mainCode, /resource "aws_s3_bucket" "s3_bucket"/);
  assert.match(mainCode, /output "operator_note"/);
});

test("the main board opens deployment immediately without saving", () => {
  const callbackStart = managerSource.indexOf("const saveAndOpenDeployment");
  const callbackEnd = managerSource.indexOf("useEffect", callbackStart);
  const callbackSource = managerSource.slice(callbackStart, callbackEnd);

  assert.ok(callbackStart > -1);
  assert.ok(callbackEnd > callbackStart);
  assert.match(callbackSource, /setDeploymentOpenRequestId/);
  assert.doesNotMatch(callbackSource, /flushDraftToServer|setSaveAndDeployError/);
  assert.match(projectBarSource, /aria-label="배포"/);
});

test("the deployment entry has no save-dependent pending state", () => {
  assert.doesNotMatch(projectBarSource, /isSaveAndDeployPending|setSaveAndDeployPending/);
  assert.doesNotMatch(projectBarSource, /aria-busy=\{isSaveAndDeployPending\}/);
  assert.doesNotMatch(projectBarSource, /disabled=\{isSaving \|\| isSaveAndDeployPending\}/);
  assert.doesNotMatch(projectBarSource, /저장하고 배포|저장·배포 준비 중/);
});

test("workspace runtime actions use icon-only controls", () => {
  assert.equal(rightPanelSource.match(/title="Live Observation"/g)?.length, 2);
  assert.doesNotMatch(rightPanelSource, /<span>Live Observation<\/span>/);
  assert.match(rightPanelSource, /className=\{styles\.panelModeButton\}[\s\S]*?title="Live Observation"/);
  assert.match(managerSource, /isDeploymentConsoleOpen=\{isDeploymentConsoleOpen\}/);
  assert.match(managerSource, /onDeploymentConsoleOpenChange=\{setDeploymentConsoleOpen\}/);
  assert.match(projectBarSource, /aria-haspopup="dialog"/);
  assert.match(projectBarSource, /data-active=\{workspace\.isDeploymentConsoleOpen\}/);
  assert.match(projectBarSource, /className=\{`\$\{styles\.projectBarIconButton\} \$\{styles\.projectBarDeployButton\}`\}/);
  assert.doesNotMatch(projectBarSource, /<span>배포<\/span>/);
  assert.doesNotMatch(diagramEditorStyles, /\.projectBarPrimaryAction/);
  assert.match(
    diagramEditorStyles,
    /\.projectBarDeployButton\[data-active="true"\]\s*\{[^}]*background:\s*var\(--workspace-text\);[^}]*color:\s*var\(--workspace-surface\);/s
  );
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

test("deployment preparation validates the exact merged Terraform artifact without a bypass", () => {
  const validationIndex = deploymentArtifactsSource.indexOf("validateTerraformCode({");
  const snapshotIndex = deploymentArtifactsSource.indexOf(
    "saveWorkspaceArchitectureSnapshot({",
    validationIndex
  );

  assert.ok(validationIndex > -1);
  assert.ok(snapshotIndex > validationIndex);
  assert.doesNotMatch(deploymentArtifactsSource, /skipValidation/);
  assert.doesNotMatch(rightPanelSource, /skipValidation:\s*true/);
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
  assert.doesNotMatch(validationSource, /검증 단계에서는 실제 리소스를 변경하지 않습니다/);
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
  assert.match(setupSource, /마지막 완료 단계/);
  assert.match(directDeploymentSource, /getLatestCompletedDeploymentStep\(selectedDeployment\)/);
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
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar \.deploymentValidationActions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar \.deploymentPrimaryButton,[\s\S]*?white-space:\s*nowrap;[\s\S]*?width:\s*152px;/
  );
});

test("deployment action buttons use one size and fill only while active", () => {
  const actionsStart = directDeploymentSource.indexOf("function renderDirectStepActions");
  const resultsStart = directDeploymentSource.indexOf("const renderResultsSection", actionsStart);
  const actionsSource = directDeploymentSource.slice(actionsStart, resultsStart);

  assert.match(actionsSource, /data-active=/);
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar\s*\{[^}]*justify-content:\s*start;[^}]*justify-items:\s*start;/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar > button,[\s\S]*?font-size:\s*14px;[\s\S]*?height:\s*44px;[\s\S]*?justify-content:\s*center;[\s\S]*?justify-self:\s*start;[\s\S]*?min-width:\s*152px;[\s\S]*?width:\s*152px;/
  );
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar :is\([\s\S]*?\) svg\s*\{[^}]*color:\s*inherit;/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar [^{]*\[data-active="true"\][\s\S]*?background:\s*var\(--workspace-accent,\s*#000000\);/
  );
});

test("Destroy execution starts directly from the action rail without another confirmation", () => {
  const actionsStart = directDeploymentSource.indexOf("function renderDirectStepActions");
  const resultsStart = directDeploymentSource.indexOf("const renderResultsSection", actionsStart);
  const actionsSource = directDeploymentSource.slice(actionsStart, resultsStart);

  assert.ok(actionsStart > -1);
  assert.ok(resultsStart > actionsStart);
  assert.match(actionsSource, /showApplyConfirmation && selectedDeployment/);
  assert.match(actionsSource, /onClick=\{startTerraformApply\}/);
  assert.match(actionsSource, /onClick=\{\(\) => void startTerraformDestroy\(deployment\)\}/);
  assert.match(directDeploymentSource, /return "Destroy 실행"/);
  assert.doesNotMatch(directDeploymentSource, /정리 실행 확인|setShowDestroyConfirmation\(true\)/);
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
  assert.doesNotMatch(historySource, /Deployment history/);
  assert.doesNotMatch(historySource, /성공한 버전의 변경 범위와 실행 결과를 확인합니다/);
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
  assert.match(
    workspaceStyles,
    /\.deploymentHistorySection\s*\{[^}]*border:\s*1px solid var\(--workspace-line[^}]*box-shadow:\s*none;/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentHistoryHeader\s*\{[^}]*border-bottom:\s*0;/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentHistorySnapshot\s*\{[^}]*border:\s*1px solid var\(--workspace-line,[^}]*box-shadow:\s*none;/s
  );
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
