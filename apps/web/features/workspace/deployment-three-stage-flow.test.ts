import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mergeGeneratedTerraformFiles } from "./terraform-panel-utils";

const managerSource = read("ProjectWorkspaceDraftManager.tsx");
const directDeploymentSource = read("DirectDeploymentScreen.tsx");
const deploymentProgressSource = read("DeploymentProgressBar.tsx");
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
  assert.match(
    rightPanelSource,
    /className=\{styles\.panelModeButton\}[\s\S]*?title="Live Observation"/
  );
  assert.match(managerSource, /isDeploymentConsoleOpen=\{isDeploymentConsoleOpen\}/);
  assert.match(managerSource, /onDeploymentConsoleOpenChange=\{setDeploymentConsoleOpen\}/);
  assert.match(projectBarSource, /aria-haspopup="dialog"/);
  assert.match(projectBarSource, /data-active=\{workspace\.isDeploymentConsoleOpen\}/);
  assert.match(
    projectBarSource,
    /className=\{`\$\{styles\.projectBarIconButton\} \$\{styles\.projectBarDeployButton\}`\}/
  );
  assert.doesNotMatch(projectBarSource, /<span>배포<\/span>/);
  assert.doesNotMatch(diagramEditorStyles, /\.projectBarPrimaryAction/);
  assert.match(
    diagramEditorStyles,
    /\.projectBarDeployButton\[data-active="true"\]\s*\{[^}]*background:\s*var\(--workspace-text\);[^}]*color:\s*var\(--workspace-surface\);/s
  );
});

test("the modal labels the primary deployment path as 배포", () => {
  const navigationStart = deploymentShellSource.indexOf(
    '<nav className={styles.deploymentConsoleScreenNavigation}'
  );
  const navigationEnd = deploymentShellSource.indexOf("</nav>", navigationStart);
  const navigationSource = deploymentShellSource.slice(navigationStart, navigationEnd);

  assert.match(navigationSource, />\s*배포\s*</);
  assert.match(navigationSource, />\s*CI\/CD\s*</);
  assert.doesNotMatch(navigationSource, />\s*직접 배포\s*</);
});

test("deployment preparation flushes the synchronized draft before artifact creation", () => {
  const syncIndex = rightPanelSource.indexOf("prepareWorkspaceTerraformSource({");
  const saveIndex = rightPanelSource.indexOf("context.saveDiagramNow?.()", syncIndex);
  const artifactIndex = rightPanelSource.indexOf("savePreparedTerraformArtifact", saveIndex);

  assert.ok(syncIndex > -1);
  assert.ok(saveIndex > syncIndex);
  assert.ok(artifactIndex > saveIndex);
  assert.match(rightPanelSource, /requireSavedProjectDraftRevision\(saveResult\)/);
});

test("deployment preparation does not depend on a mounted Terraform panel", () => {
  const preparationStart = rightPanelSource.indexOf("const prepareDeploymentArtifacts");
  const validationStart = rightPanelSource.indexOf(
    "const validateTerraformForPreDeployment",
    preparationStart
  );
  const preparationSource = rightPanelSource.slice(preparationStart, validationStart);

  assert.ok(preparationStart > -1);
  assert.ok(validationStart > preparationStart);
  assert.match(preparationSource, /latestTerraformFilesRef\.current/);
  assert.match(preparationSource, /prepareWorkspaceTerraformSource\(\{/);
  assert.doesNotMatch(preparationSource, /terraformPanelRef/);
  assert.match(rightPanelSource, /if \(!context\.isRightPanelOpen\)\s*\{\s*return/);
});

test("collapsed right panel keeps the Terraform artifact provider mounted for deployment", () => {
  const collapsedPanelStart = rightPanelSource.indexOf("if (!context.isRightPanelOpen)");
  const expandedPanelStart = rightPanelSource.indexOf(
    '<aside className={styles.rightPanelShell}>',
    collapsedPanelStart
  );
  const collapsedPanelSource = rightPanelSource.slice(collapsedPanelStart, expandedPanelStart);

  assert.ok(collapsedPanelStart > -1);
  assert.ok(expandedPanelStart > collapsedPanelStart);
  assert.match(collapsedPanelSource, /<TerraformCodePanel/);
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

test("managed deployment uses prepare, approve, and execute with three external phases", () => {
  assert.match(directDeploymentSource, /prepareDeployment\(\{/);
  assert.match(directDeploymentSource, /approveDeploymentPlan\(selectedDeployment\.id\)/);
  assert.match(directDeploymentSource, /executeDeployment\(selectedDeployment\.id\)/);
  assert.doesNotMatch(directDeploymentSource, /selectedLiveProfile|liveProfileOptions/);
  assert.match(directDeploymentSource, /stepId === "validation"/);
  assert.match(directDeploymentSource, /stepId === "approval"/);
});

test("application-only deployment continues from one user action without a manual approval step", () => {
  const completionStart = directDeploymentSource.indexOf(
    "async function completeApplicationDeployment"
  );
  const reviewStart = directDeploymentSource.indexOf(
    "async function startDeploymentReview",
    completionStart
  );
  const planActionStart = directDeploymentSource.indexOf(
    "async function startTerraformPlan",
    reviewStart
  );
  const completionSource = directDeploymentSource.slice(completionStart, reviewStart);
  const reviewSource = directDeploymentSource.slice(reviewStart, planActionStart);

  assert.ok(completionStart > -1);
  assert.ok(reviewStart > completionStart);
  assert.match(completionSource, /approveDeploymentPlan\(plannedDeployment\.id\)/);
  assert.match(completionSource, /executeDeployment\(approvedDeployment\.id\)/);
  assert.doesNotMatch(reviewSource, /completeApplicationDeployment\(plannedDeployment\)/);
  assert.match(directDeploymentSource, /completeApplicationDeployment\(selectedDeployment\)/);
  assert.match(directDeploymentSource, /shouldShowApplyButton && selectedDeployment\?\.scope !== "application"/);
  assert.match(directDeploymentSource, /isApplicationOnlyFlow[\s\S]*"앱 배포 중"[\s\S]*"앱 배포"/);
});

test("approval owns the Plan summary while execution keeps final target confirmation", () => {
  const contentStart = directDeploymentSource.indexOf("function renderDirectStepContent");
  const approvalStart = directDeploymentSource.indexOf(
    'if (stepId === "approval")',
    contentStart
  );
  const executionStart = directDeploymentSource.indexOf("\n      return (", approvalStart);
  const executionEnd = directDeploymentSource.indexOf(
    "function renderDirectStepActions",
    executionStart
  );
  const approvalSource = directDeploymentSource.slice(approvalStart, executionStart);
  const executionSource = directDeploymentSource.slice(executionStart, executionEnd);

  assert.ok(approvalStart > contentStart);
  assert.ok(executionStart > approvalStart);
  assert.ok(executionEnd > executionStart);
  assert.match(approvalSource, /<InfoRow label="범위"/);
  assert.match(approvalSource, /label="차단"/);
  assert.match(approvalSource, /<PlanSummaryRows/);
  assert.match(approvalSource, /실행 대상과 스냅샷/);
  assert.match(approvalSource, /selectedAwsConnection\?\.accountId/);
  assert.match(approvalSource, /selectedAwsConnection\?\.region/);
  assert.match(approvalSource, /preparedSnapshotHash/);
  assert.doesNotMatch(executionSource, /<InfoRow label="범위"/);
  assert.doesNotMatch(executionSource, /<PlanSummaryRows/);
  assert.match(executionSource, /<InfoRow label="상태"/);
  assert.match(executionSource, /<InfoRow label="현재 작업"/);
  assert.match(executionSource, /<h3>최종 실행 대상<\/h3>/);
  assert.match(executionSource, /approvedAwsAccountId/);
  assert.match(executionSource, /approvedAwsRegion/);
  assert.match(
    executionSource,
    /승인된 Plan과 프로젝트 스냅샷이 일치할 때만 실행됩니다/
  );
});

test("the common step workspace owns current logs before Deployment History exists", () => {
  const contentStart = directDeploymentSource.indexOf("function renderDirectStepContent");
  const approvalStart = directDeploymentSource.indexOf(
    'if (stepId === "approval")',
    contentStart
  );
  const executionStart = directDeploymentSource.indexOf("\n      return (", approvalStart);
  const executionEnd = directDeploymentSource.indexOf(
    "function renderDirectStepActions",
    executionStart
  );
  const executionSource = directDeploymentSource.slice(executionStart, executionEnd);
  const selectedContentStart = directDeploymentSource.indexOf(
    "{renderDirectStepContent(selectedStep.id)}",
    executionEnd
  );
  const commonAlertStart = directDeploymentSource.indexOf(
    "{deploymentTargetPrerequisite ? (",
    selectedContentStart
  );
  const commonWorkspaceSource = directDeploymentSource.slice(
    selectedContentStart,
    commonAlertStart
  );

  assert.ok(selectedContentStart > executionEnd);
  assert.ok(commonAlertStart > selectedContentStart);
  assert.doesNotMatch(executionSource, /deploymentLogView\.source === "current"/);
  assert.doesNotMatch(executionSource, /현재 실행 로그/);
  assert.match(commonWorkspaceSource, /deploymentLogView\.source === "current"/);
  assert.match(commonWorkspaceSource, /현재 실행 로그/);
  assert.match(commonWorkspaceSource, /<DeploymentLogList logs=\{deploymentLogs\}/);
  assert.equal(directDeploymentSource.match(/현재 실행 로그/g)?.length, 2);
  assert.equal(
    directDeploymentSource.match(/<DeploymentLogList logs=\{deploymentLogs\}/g)?.length,
    1
  );
});

test("history keeps selected-version logs separate from current execution logs", () => {
  const logsStart = directDeploymentSource.indexOf("const renderLogsSection");
  const historyStart = directDeploymentSource.indexOf(
    "const renderDeploymentHistory",
    logsStart
  );
  const historyEnd = directDeploymentSource.indexOf("const renderHistoryView", historyStart);
  const logsSource = directDeploymentSource.slice(logsStart, historyStart);
  const historySource = directDeploymentSource.slice(historyStart, historyEnd);

  assert.match(logsSource, /<DeploymentLogList logs=\{loadedHistoryDeploymentLogs\}/);
  assert.doesNotMatch(logsSource, /deploymentLogView/);
  assert.match(historySource, /loadedHistoryDeploymentLogs\.length/);
  assert.doesNotMatch(historySource, /deploymentLogView/);
  assert.equal(
    directDeploymentSource.match(/<DeploymentLogList logs=\{loadedHistoryDeploymentLogs\}/g)
      ?.length,
    1
  );
});

test("deployment polling keeps unrelated failures but reconciles its accepted Plan", () => {
  const refreshStart = directDeploymentSource.indexOf("async function refreshSnapshot");
  const intervalStart = directDeploymentSource.indexOf("const intervalId", refreshStart);
  const refreshSource = directDeploymentSource.slice(refreshStart, intervalStart);

  assert.ok(refreshStart > -1);
  assert.ok(intervalStart > refreshStart);
  assert.doesNotMatch(directDeploymentSource, /recoverableSnapshotRequestErrorRef/);
  assert.match(directDeploymentSource, /snapshotErrorMessage/);
  assert.match(refreshSource, /setSnapshotErrorMessage\(""\)/);
  assert.match(refreshSource, /setSnapshotErrorMessage\(\s*getApiErrorMessage/);
  assert.doesNotMatch(refreshSource, /setRequestState\(/);
  assert.doesNotMatch(refreshSource, /setErrorMessage\(/);
  assert.match(
    directDeploymentSource,
    /pendingAutoAdvanceDeploymentIdRef\.current === selectedDeployment\.id/
  );
  assert.match(directDeploymentSource, /reconciledRequestState/);
  assert.match(directDeploymentSource, /currentPlanArtifactId/);
});

test("deployment commands stop their failure boundary before secondary hydration", () => {
  const reviewStart = directDeploymentSource.indexOf("async function startDeploymentReview");
  const retryStart = directDeploymentSource.indexOf(
    "async function startTerraformPlan",
    reviewStart
  );
  const reviewSource = directDeploymentSource.slice(reviewStart, retryStart);
  const planIndex = reviewSource.indexOf("await runDeploymentPlan(preparedDeployment.id)");
  const detailsIndex = reviewSource.indexOf("refreshDeploymentDetails", planIndex);

  assert.ok(planIndex > -1);
  assert.ok(detailsIndex > planIndex);
  assert.doesNotMatch(
    reviewSource.slice(planIndex, detailsIndex),
    /listDeploymentLogs|listDeploymentResources|listTerraformOutputs/
  );
  assert.match(directDeploymentSource, /actionInFlightRef/);
});

test("deployment progress renders actual and stage-estimated percentages without catch-up", () => {
  assert.match(deploymentProgressSource, /DeploymentProgressPoller/);
  assert.match(deploymentProgressSource, /getDeploymentProgressSnapshot/);
  assert.match(deploymentProgressSource, /getDeploymentProgressPresentation/);
  assert.match(deploymentProgressSource, /data-estimated/);
  assert.match(deploymentProgressSource, /aria-valuenow=/);
  assert.doesNotMatch(deploymentProgressSource, /advanceDisplayedDeploymentProgress/);
  assert.doesNotMatch(deploymentProgressSource, /setInterval/);
  assert.doesNotMatch(deploymentProgressSource, /예상 진행률/);
});

test("deployment progress values reserve their content width and never wrap", () => {
  assert.match(
    workspaceStyles,
    /\.deploymentExecutionPanel\s*\{[^}]*grid-template-columns:\s*52px minmax\(0, 1fr\) max-content;/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentExecutionPanel output\s*\{[^}]*white-space:\s*nowrap;/s
  );
});

test("deployment review delegates build preparation and repository verification to the Plan API", () => {
  const reviewStart = directDeploymentSource.indexOf("async function startDeploymentReview");
  const planActionStart = directDeploymentSource.indexOf(
    "async function startTerraformPlan",
    reviewStart
  );
  const reviewSource = directDeploymentSource.slice(reviewStart, planActionStart);
  const prepareIndex = reviewSource.indexOf("await prepareDeployment({");
  const planIndex = reviewSource.indexOf("await runDeploymentPlan(preparedDeployment.id)");

  assert.ok(reviewStart > -1);
  assert.ok(planActionStart > reviewStart);
  assert.ok(prepareIndex > -1);
  assert.ok(planIndex > prepareIndex);
  assert.doesNotMatch(reviewSource, /prepareProjectBuildEnvironment/);
  assert.doesNotMatch(reviewSource, /verifyProjectRepositoryAccess/);
  assert.doesNotMatch(reviewSource, /verifyRepositoryAccessForPlan/);
  assert.doesNotMatch(reviewSource, /runDeploymentInit|queuedApplyPlan/);
});

test("application-only deployment waits for the durable Plan before automatic approval", () => {
  const reviewStart = directDeploymentSource.indexOf("async function startDeploymentReview");
  const planActionStart = directDeploymentSource.indexOf(
    "async function startTerraformPlan",
    reviewStart
  );
  const reviewSource = directDeploymentSource.slice(reviewStart, planActionStart);

  assert.doesNotMatch(reviewSource, /completeApplicationDeployment\(plannedDeployment\)/);
  assert.match(
    reviewSource,
    /plannedDeployment\.scope !== "application"[\s\S]*pendingAutoAdvanceDeploymentIdRef\.current = ""/
  );
  assert.match(
    directDeploymentSource,
    /pendingAutoAdvanceDeploymentIdRef\.current === selectedDeployment\.id[\s\S]*selectedDeployment\.scope === "application"[\s\S]*selectedDeployment\.currentPlanArtifactId[\s\S]*completeApplicationDeployment\(selectedDeployment\)/
  );
});

test("durable Plan polling refreshes Repository verification after worker completion", () => {
  const runtimeLoadStart = directDeploymentSource.indexOf("const loadDeploymentRuntimeSnapshot");
  const runtimeApplyStart = directDeploymentSource.indexOf(
    "const applyDeploymentRuntimeSnapshot",
    runtimeLoadStart
  );
  const panelLoadStart = directDeploymentSource.indexOf(
    "const loadDeploymentPanelSnapshot",
    runtimeApplyStart
  );
  const runtimeLoadSource = directDeploymentSource.slice(runtimeLoadStart, runtimeApplyStart);
  const runtimeApplySource = directDeploymentSource.slice(runtimeApplyStart, panelLoadStart);

  assert.ok(runtimeLoadStart > -1);
  assert.ok(runtimeApplyStart > runtimeLoadStart);
  assert.ok(panelLoadStart > runtimeApplyStart);
  assert.match(runtimeLoadSource, /getProjectBuildEnvironment\(projectId\)/);
  assert.match(runtimeApplySource, /setBuildEnvironment\(snapshot\.buildEnvironment\)/);
});

test("Plan responses request an immediate Repository verification refresh", () => {
  const reviewStart = directDeploymentSource.indexOf("async function startDeploymentReview");
  const retryStart = directDeploymentSource.indexOf(
    "async function startTerraformPlan",
    reviewStart
  );
  const approveStart = directDeploymentSource.indexOf(
    "async function approveCurrentPlan",
    retryStart
  );
  const reviewSource = directDeploymentSource.slice(reviewStart, retryStart);
  const retrySource = directDeploymentSource.slice(retryStart, approveStart);

  assert.match(reviewSource, /await runDeploymentPlan\(preparedDeployment\.id\)/);
  assert.match(reviewSource, /preparedDeployment\.currentPlanOperation === "apply"/);
  assert.match(reviewSource, /refreshBuildEnvironmentAfterPlan\(plannedDeployment\)/);
  assert.match(retrySource, /runDeploymentPlan\(selectedDeployment\.id\)/);
  assert.match(retrySource, /refreshBuildEnvironmentAfterPlan\(deployment\)/);
  assert.match(
    directDeploymentSource,
    /function refreshBuildEnvironmentAfterPlan[\s\S]*getProjectBuildEnvironment\(projectId\)[\s\S]*\.then\(setBuildEnvironment\)/
  );
});

test("successful Plan approval selects deployment and refreshes its build environment", () => {
  const approveStart = directDeploymentSource.indexOf("async function approveCurrentPlan");
  const revokeStart = directDeploymentSource.indexOf(
    "async function revokeCurrentPlanApproval",
    approveStart
  );
  const approveSource = directDeploymentSource.slice(approveStart, revokeStart);

  assert.ok(approveStart > -1);
  assert.ok(revokeStart > approveStart);
  assert.match(approveSource, /setSelectedDirectStepId\("deployment"\)/);
  assert.match(approveSource, /refreshBuildEnvironmentAfterPlan\(deployment\)/);
});

test("terminal application failures hide stale approval and remain visible from every step", () => {
  const approvalActionsStart = directDeploymentSource.indexOf('if (stepId === "approval")');
  const deploymentActionsStart = directDeploymentSource.indexOf("return (", approvalActionsStart);
  const approvalActionsSource = directDeploymentSource.slice(
    approvalActionsStart,
    deploymentActionsStart
  );

  assert.match(approvalActionsSource, /shouldShowApprovePlanButton/);
  assert.match(
    directDeploymentSource,
    /selectedDeployment\?\.status === "FAILED" \? \([\s\S]*selectedDeployment\.errorSummary/
  );
  assert.doesNotMatch(
    directDeploymentSource,
    /selectedStep\.id === "deployment" && selectedDeployment\?\.status === "FAILED"/
  );
});

test("full-stack validation checks the confirmed target and prepared Terraform files", () => {
  const targetCheckIndex = directDeploymentSource.indexOf("getProjectDeploymentTarget(projectId)");
  const artifactPreparationIndex = directDeploymentSource.indexOf(
    "onPrepareDeploymentArtifacts()",
    targetCheckIndex
  );
  const targetPrerequisiteCheckIndex = directDeploymentSource.indexOf(
    "getDeploymentTargetPrerequisite({",
    targetCheckIndex
  );
  const runtimeSecretPrerequisiteCheckIndex = directDeploymentSource.indexOf(
    "getDeploymentRuntimeSecretPrerequisite({",
    targetCheckIndex
  );

  assert.ok(targetCheckIndex > -1);
  assert.ok(targetPrerequisiteCheckIndex > targetCheckIndex);
  assert.ok(targetPrerequisiteCheckIndex < artifactPreparationIndex);
  assert.ok(artifactPreparationIndex > targetCheckIndex);
  assert.ok(runtimeSecretPrerequisiteCheckIndex > artifactPreparationIndex);
  assert.match(
    directDeploymentSource,
    /getDeploymentRuntimeSecretPrerequisite\(\{[\s\S]*?diagramJson: preparedArtifacts\.diagramJson,[\s\S]*?terraformFiles: preparedArtifacts\.terraformFiles/
  );
  assert.match(directDeploymentSource, /CI\/CD 설정으로 이동/);
  assert.match(directDeploymentSource, /onOpenDeliverySetup/);
  assert.match(directDeploymentSource, /deploymentTargetSavedRevision/);
  assert.match(
    deploymentShellSource,
    /deploymentTargetSavedRevision=\{deploymentTargetSavedRevision\}/
  );
});

test("runtime Secret mismatch returns to the current Terraform editor", () => {
  assert.match(directDeploymentSource, /deploymentTargetPrerequisite\.action/);
  assert.match(directDeploymentSource, /Terraform 코드 수정/);
  assert.doesNotMatch(directDeploymentSource, /Repository 다시 분석|Fixed Template Board/);
  assert.match(deploymentShellSource, /projectName=\{projectName\}/);
  assert.match(managerSource, /requiredRuntimeSecrets:\s*template\.requiredRuntimeSecrets/);
});

test("deployment actions preserve detailed preparation errors", () => {
  const runActionStart = directDeploymentSource.indexOf("async function runAction");
  const refreshDetailsStart = directDeploymentSource.indexOf(
    "function refreshDeploymentDetails",
    runActionStart
  );
  const runActionSource = directDeploymentSource.slice(runActionStart, refreshDetailsStart);

  assert.ok(runActionStart > -1);
  assert.ok(refreshDetailsStart > runActionStart);
  assert.match(
    runActionSource,
    /setErrorMessage\(getDeploymentPreparationErrorMessage\(error, fallbackMessage\)\)/
  );
});

test("a current request error does not suppress the selected deployment failure", () => {
  assert.doesNotMatch(
    directDeploymentSource,
    /!requestError\s*&&\s*selectedDeployment\?\.status === "FAILED"/
  );
  assert.match(directDeploymentSource, /선택한 배포 실패/);
});

test("changed drafts keep cleanup available beside save and validation", () => {
  const actionsStart = directDeploymentSource.indexOf("function renderCleanupPlanActions");
  const validationStart = directDeploymentSource.indexOf(
    'if (stepId === "validation")',
    actionsStart
  );
  const approvalStart = directDeploymentSource.indexOf(
    'if (stepId === "approval")',
    validationStart
  );
  const validationSource = directDeploymentSource.slice(actionsStart, approvalStart);

  assert.ok(actionsStart > -1);
  assert.ok(validationStart > -1);
  assert.ok(approvalStart > validationStart);
  assert.match(validationSource, /startTerraformDestroyPlan/);
  assert.match(validationSource, /!hasCurrentPlan[\s\S]*renderCleanupPlanActions\(\)[\s\S]*검증 실행/);
  assert.match(validationSource, /저장 후 검증/);
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

test("setup removes the duplicate recent result card", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const historyStart = directDeploymentSource.indexOf("const renderResultsSection", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, historyStart);

  assert.doesNotMatch(setupSource, /deploymentRecentResultCard/);
  assert.doesNotMatch(setupSource, /최근 실행 결과|마지막 완료 단계/);
});

test("the page header owns the single primary action before the stepper", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const historyStart = directDeploymentSource.indexOf("const renderResultsSection", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, historyStart);
  const stepperIndex = setupSource.lastIndexOf("styles.deploymentStepNavigation");
  const actionsIndex = setupSource.lastIndexOf("renderDirectStepActions(selectedStep.id)");
  const workspaceIndex = setupSource.lastIndexOf("styles.deploymentStepWorkspace");

  assert.ok(actionsIndex > -1);
  assert.ok(stepperIndex > actionsIndex);
  assert.ok(workspaceIndex > actionsIndex);
  assert.doesNotMatch(setupSource, /styles\.deploymentStepHeading/);
  assert.match(workspaceStyles, /"page-header"\s*"steps"\s*"readiness"/s);
});

test("deployment action buttons fit their label without clipping", () => {
  const actionsStart = directDeploymentSource.indexOf("function renderDirectStepActions");
  const resultsStart = directDeploymentSource.indexOf("const renderResultsSection", actionsStart);
  const actionsSource = directDeploymentSource.slice(actionsStart, resultsStart);
  const actionRailStart = workspaceStyles.indexOf("/* managed deployment action rail */");
  const executiveConsoleStart = workspaceStyles.indexOf(
    "/* Approved blue executive deployment console */",
    actionRailStart
  );
  const actionRailStyles = workspaceStyles.slice(actionRailStart, executiveConsoleStart);

  assert.match(actionsSource, /data-active=/);
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar\s*\{[^}]*justify-content:\s*start;[^}]*justify-items:\s*start;/s
  );
  assert.match(
    actionRailStyles,
    /\.deploymentConsoleGrid > \.deploymentStepActionBar > button,[\s\S]*?flex:\s*0 1 auto;[\s\S]*?font-size:\s*calc\(14px \+ var\(--presentation-font-size-increase\)\);[\s\S]*?height:\s*44px;[\s\S]*?min-width:\s*152px;[\s\S]*?white-space:\s*nowrap;[\s\S]*?width:\s*auto;/
  );
  assert.doesNotMatch(
    actionRailStyles,
    /(?:flex:\s*0 0 152px|(?:^|\n)\s*width:\s*152px)/
  );
  assert.match(
    actionRailStyles,
    /@media \(max-width:\s*420px\)[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;/
  );
  assert.match(
    workspaceStyles,
    /\.deploymentConsoleGrid\s*>\s*\.deploymentStepActionBar\s*:is\([\s\S]*?\)\s*svg\s*\{[^}]*color:\s*inherit;/s
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

test("managed deployment keeps the URL visible and offers frontend-only retry after partial failure", () => {
  assert.match(directDeploymentSource, /PARTIALLY_FAILED/);
  assert.match(directDeploymentSource, /같은 빌드 결과로 웹 배포 재시도/);
  assert.match(directDeploymentSource, /retryDeploymentFrontend\(selectedDeployment\.id\)/);
  assert.match(directDeploymentSource, /현재 주소와 QR, Live Observation은 계속 사용할 수 있지만/);
});

test("managed deployment auto-selects the verified AWS connection without rendering a selector", () => {
  assert.doesNotMatch(directDeploymentSource, /ariaLabel="AWS 연결 선택"/);
  assert.match(directDeploymentSource, /awsConnectionId: selectedAwsConnectionId/);
});

test("managed deployment omits the removed deployment context and run-details sections", () => {
  assert.doesNotMatch(directDeploymentSource, /deploymentContextPanel/);
  assert.doesNotMatch(directDeploymentSource, /deployment-run-details|실행 세부정보/);
});

test("Deployment screen follows the approved operational hierarchy", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const historyStart = directDeploymentSource.indexOf("const renderDeploymentHistory", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, historyStart);
  const historyEnd = directDeploymentSource.indexOf("const deploymentContent", historyStart);
  const historySource = directDeploymentSource.slice(historyStart, historyEnd);

  assert.match(setupSource, /<h1>배포<\/h1>/);
  assert.match(setupSource, /변경 확인/);
  assert.match(setupSource, /결과 승인/);
  assert.match(setupSource, /배포 적용/);
  assert.match(
    setupSource,
    /실행 대상[\s\S]*감지 방식[\s\S]*설정 변경[\s\S]*앱 빌드/
  );
  assert.match(setupSource, /검증 실행/);
  assert.doesNotMatch(setupSource, /DeploymentBaselineIcon/);
  assert.match(
    historySource,
    /상태[\s\S]*실행 시각[\s\S]*변경 결과[\s\S]*대상[\s\S]*버전 ID[\s\S]*소요 시간[\s\S]*상세/
  );
  assert.match(historySource, /placeholder="버전 ID 또는 실행 범위 검색"/);
  assert.match(historySource, /deploymentHistorySearchQuery/);
  assert.doesNotMatch(historySource, /deploymentHistoryMetrics|전체 배포|평균 실행 시간/);
  assert.doesNotMatch(historySource, /\?\? filteredDeploymentHistoryEntries\[0\]/);
  assert.match(historySource, /selectedHistoryDeploymentId\.length > 0/);
  assert.match(historySource, /setSelectedHistoryDeploymentId\(""\)/);
  assert.doesNotMatch(historySource, /성공한 배포의 변경 내용과 실행 결과를 확인합니다/);
});

test("Deployment approval and History use the shared import-aware change summary", () => {
  assert.match(
    directDeploymentSource,
    /import \{[\s\S]*formatDeploymentPlanChangeSummary[\s\S]*\} from "\.\/deployment-presentation";/
  );
  assert.match(
    directDeploymentSource,
    /<InfoRow\s+label="변경 사항"\s+value=\{formatDeploymentPlanChangeSummary\(summary\)\}/
  );
  assert.equal(
    directDeploymentSource.match(
      /formatDeploymentPlanChangeSummary\(deployment\.planSummary\)/gu
    )?.length,
    2
  );
});

test("Deployment console global header owns refresh and close tools", () => {
  assert.match(deploymentShellSource, /RefreshCw/);
  assert.match(deploymentShellSource, /"새로고침 중"\s*:\s*"새로고침"/);
  assert.match(deploymentShellSource, /refreshRequestId=\{directRefreshRequestId\}/);
  assert.match(workspaceStyles, /\.deploymentConsoleHeaderActions/);
});

test("manual deployment refresh preserves the selected deployment evidence", () => {
  const loadStart = directDeploymentSource.indexOf("const loadDeploymentPanelSnapshot");
  const applyStart = directDeploymentSource.indexOf("const applyDeploymentPanelSnapshot", loadStart);
  const effectStart = directDeploymentSource.indexOf("useEffect", applyStart);
  const loadSource = directDeploymentSource.slice(loadStart, applyStart);
  const applySource = directDeploymentSource.slice(applyStart, effectStart);
  const detailLoadStart = directDeploymentSource.indexOf("async function loadApplyDetails");
  const detailLoadSetupStart = directDeploymentSource.lastIndexOf(
    "let cancelled = false",
    detailLoadStart
  );
  const detailLoadSetupSource = directDeploymentSource.slice(detailLoadSetupStart, detailLoadStart);

  assert.doesNotMatch(loadSource, /logs:\s*\[\]|resources:\s*\[\]|outputs:\s*\[\]/);
  assert.doesNotMatch(applySource, /applyDeploymentRuntimeSnapshot/);
  assert.match(applySource, /setDeployments\(snapshot\.deployments\)/);
  assert.match(applySource, /setApplicationReleases\(snapshot\.releases\)/);
  assert.doesNotMatch(detailLoadSetupSource, /dispatchTerraformOutputState/);
  assert.match(
    directDeploymentSource,
    /dispatchTerraformOutputState\(\{\s*type: "clear",\s*deploymentId: selectedDeploymentId \|\| null\s*\}\);[\s\S]*?\}, \[selectedDeploymentId\]\);/
  );
  assert.match(directDeploymentSource, /\}, \[selectedDeploymentId, refreshRequestId\]\);/);
  assert.match(directDeploymentSource, /if \(!hasLoadedDeploymentPanelRef\.current\)/);
});

test("deployment log rows expose the persisted sequence instead of a visual row index", () => {
  const logListStart = directDeploymentSource.indexOf("function DeploymentLogList");
  const logListSource = directDeploymentSource.slice(logListStart);

  assert.match(logListSource, /String\(log\.sequence\)\.padStart\(3,\s*"0"\)/);
  assert.doesNotMatch(logListSource, /String\(index \+ 1\)\.padStart/);
});

test("automatic deployment scope stays unresolved until the current Plan resolves it", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const setupEnd = directDeploymentSource.indexOf("const renderDeploymentHistory", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, setupEnd);

  assert.match(setupSource, /resolveDeploymentReadinessScope\(/);
  assert.match(setupSource, /검증 후 결정/);
  assert.doesNotMatch(setupSource, /selectedDeployment\?\.scope \?\? "infrastructure"/);
});

test("manual deployment scope changes discard the previous Plan before another execution", () => {
  assert.match(
    directDeploymentSource,
    /function beginDeploymentScope\([\s\S]*?setSelectedScope\(scope\);[\s\S]*?setSelectedDeploymentId\(""\);[\s\S]*?setShowApplyConfirmation\(false\);[\s\S]*?setSelectedDirectStepId\("validation"\);/
  );
  assert.match(directDeploymentSource, /label: "인프라만"/);
  assert.match(directDeploymentSource, /label: "앱만"/);
  assert.match(directDeploymentSource, /label: "인프라 \+ 앱 함께"/);
  assert.match(directDeploymentSource, /앱만 이어서 배포/);
});

test("deployment console horizontal container margin uses a valid length", () => {
  assert.doesNotMatch(workspaceStyles, /margin:\s*22 auto;/);
  assert.match(workspaceStyles, /margin:\s*22px auto;/);
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
