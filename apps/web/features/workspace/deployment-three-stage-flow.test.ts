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

test("the modal distinguishes the Direct Deployment path from its execution step", () => {
  const navigationStart = deploymentShellSource.indexOf(
    '<nav className={styles.deploymentConsoleScreenNavigation}'
  );
  const navigationEnd = deploymentShellSource.indexOf("</nav>", navigationStart);
  const navigationSource = deploymentShellSource.slice(navigationStart, navigationEnd);

  assert.match(navigationSource, />\s*직접 배포\s*</);
  assert.match(navigationSource, />\s*CI\/CD\s*</);
  assert.doesNotMatch(navigationSource, />\s*배포\s*</);
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

test("approval owns the Plan summary while execution keeps final target confirmation", () => {
  assert.equal(directDeploymentSource.match(/<PlanSummaryRows/g)?.length, 1);
  assert.equal(directDeploymentSource.match(/<InfoRow label="범위"/g)?.length, 1);
  assert.match(directDeploymentSource, /<InfoRow label="상태"/);
  assert.match(directDeploymentSource, /<InfoRow label="현재 작업"/);
  assert.match(directDeploymentSource, /<h3>최종 실행 대상<\/h3>/);
  assert.match(directDeploymentSource, /approvedAwsAccountId/);
  assert.match(directDeploymentSource, /approvedAwsRegion/);
  assert.match(
    directDeploymentSource,
    /승인된 Plan과 프로젝트 스냅샷이 일치할 때만 실행됩니다/
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
  const retryStart = directDeploymentSource.indexOf("async function startTerraformPlan", reviewStart);
  const reviewSource = directDeploymentSource.slice(reviewStart, retryStart);
  const planIndex = reviewSource.indexOf("await runDeploymentPlan(preparedDeployment.id)");
  const detailsIndex = reviewSource.indexOf("refreshDeploymentDetails", planIndex);

  assert.ok(planIndex > -1);
  assert.ok(detailsIndex > planIndex);
  assert.doesNotMatch(reviewSource.slice(planIndex, detailsIndex), /listDeploymentLogs|listDeploymentResources|listTerraformOutputs/);
  assert.match(directDeploymentSource, /actionInFlightRef/);
});

test("Direct Deployment validation removes duplicated executive and readiness summaries", () => {
  const contentStart = directDeploymentSource.indexOf("function renderDirectStepContent");
  const validationStart = directDeploymentSource.indexOf(
    'if (stepId === "validation")',
    contentStart
  );
  const approvalStart = directDeploymentSource.indexOf(
    'if (stepId === "approval")',
    validationStart
  );
  const validationSource = directDeploymentSource.slice(validationStart, approvalStart);

  assert.doesNotMatch(directDeploymentSource, /deploymentExecutiveHeader/);
  assert.doesNotMatch(directDeploymentSource, /deploymentExecutiveMetrics/);
  assert.doesNotMatch(directDeploymentSource, /function DeploymentMetric/);
  assert.doesNotMatch(validationSource, /deploymentPlanSnapshot/);
  assert.doesNotMatch(validationSource, /label="변경 내용"/);
  assert.doesNotMatch(validationSource, /label="실행 준비"/);
  assert.doesNotMatch(validationSource, /<PlanSummaryRows/);
  assert.equal(validationSource.match(/<DeploymentValidationSummaryCard/g)?.length, 2);
  assert.match(validationSource, /label="설정 상태"/);
  assert.match(validationSource, /label="빌드 환경"/);
  assert.match(deploymentProgressSource, /deploymentExecutionPanel/);
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

test("durable Plan polling refreshes Repository verification after worker completion", () => {
  const runtimeLoadStart = directDeploymentSource.indexOf(
    "const loadDeploymentRuntimeSnapshot"
  );
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
  const retryStart = directDeploymentSource.indexOf("async function startTerraformPlan", reviewStart);
  const approveStart = directDeploymentSource.indexOf("async function approveCurrentPlan", retryStart);
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

test("full-stack validation checks the confirmed target and opens its setup surface", () => {
  const targetCheckIndex = directDeploymentSource.indexOf("getProjectDeploymentTarget(projectId)");
  const artifactPreparationIndex = directDeploymentSource.indexOf(
    "onPrepareDeploymentArtifacts()",
    targetCheckIndex
  );

  assert.ok(targetCheckIndex > -1);
  assert.ok(artifactPreparationIndex > targetCheckIndex);
  assert.match(directDeploymentSource, /getDeploymentTargetPrerequisite/);
  assert.match(directDeploymentSource, /CI\/CD 설정으로 이동/);
  assert.match(directDeploymentSource, /onOpenDeliverySetup/);
  assert.match(directDeploymentSource, /deploymentTargetSavedRevision/);
  assert.match(
    deploymentShellSource,
    /deploymentTargetSavedRevision=\{deploymentTargetSavedRevision\}/
  );
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

test("setup removes the duplicate recent result card", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const historyStart = directDeploymentSource.indexOf("const renderResultsSection", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, historyStart);

  assert.doesNotMatch(setupSource, /deploymentRecentResultCard/);
  assert.doesNotMatch(setupSource, /최근 실행 결과|마지막 완료 단계/);
});

test("the stepper is the only heading before workspace actions", () => {
  const setupStart = directDeploymentSource.indexOf("const renderSetupSection");
  const historyStart = directDeploymentSource.indexOf("const renderResultsSection", setupStart);
  const setupSource = directDeploymentSource.slice(setupStart, historyStart);
  const stepperIndex = setupSource.lastIndexOf("styles.deploymentStepNavigation");
  const actionsIndex = setupSource.lastIndexOf("renderDirectStepActions(selectedStep.id)");
  const workspaceIndex = setupSource.lastIndexOf("styles.deploymentStepWorkspace");

  assert.ok(stepperIndex > -1);
  assert.ok(actionsIndex > stepperIndex);
  assert.ok(workspaceIndex > actionsIndex);
  assert.doesNotMatch(setupSource, /styles\.deploymentStepHeading/);
  assert.match(workspaceStyles, /"steps"\s*"workspace"\s*"actions"/s);
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
    /\.deploymentConsoleGrid > \.deploymentStepActionBar > button,[\s\S]*?font-size:\s*calc\(14px \+ var\(--presentation-font-size-increase\)\);[\s\S]*?height:\s*44px;[\s\S]*?justify-content:\s*center;[\s\S]*?justify-self:\s*start;[\s\S]*?min-width:\s*152px;[\s\S]*?width:\s*152px;/
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
  assert.match(historySource, /<table className=\{styles\.deploymentHistoryTable\}>/);
  assert.match(historySource, /filteredDeploymentHistoryEntries\.map/);
  assert.match(
    historySource,
    /onClick=\{\(\) => setSelectedHistoryDeploymentId\(deployment\.id\)\}/
  );
  assert.match(historySource, /deploymentHistoryHeader/);
  assert.match(historySource, /deploymentHistoryTableRegion/);
  assert.match(historySource, /deploymentHistoryDetailPanel/);
  assert.match(historySource, /기술 정보/);
  assert.doesNotMatch(historySource, /deploymentHistoryPicker|deploymentHistorySnapshot/);
  assert.doesNotMatch(historySource, /Deployment history/);
  assert.match(historySource, /성공한 배포의 변경 내용과 실행 결과를 확인합니다/);
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
    /\.deploymentHistorySection\s*\{[^}]*border:\s*1px solid var\(--workspace-line-strong[^}]*border-radius:\s*20px;[^}]*box-shadow:/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentHistoryHeader h3\s*\{[^}]*font-size:\s*calc\(22px \+ var\(--presentation-font-size-increase\)\);/s
  );
  assert.match(
    workspaceStyles,
    /\.deploymentHistoryTable td\s*\{[^}]*font-size:\s*calc\(17px \+ var\(--presentation-font-size-increase\)\);[^}]*height:\s*88px;/s
  );
});

test("Deployment History uses KPI filters and the approved master-detail hierarchy", () => {
  const historyStart = directDeploymentSource.indexOf("const renderDeploymentHistory");
  const historyEnd = directDeploymentSource.indexOf("const renderHistoryView", historyStart);
  const historySource = directDeploymentSource.slice(historyStart, historyEnd);

  assert.match(historySource, /deploymentHistoryMetrics/);
  assert.match(historySource, /전체 배포/);
  assert.match(historySource, /평균 실행 시간/);
  assert.match(historySource, /deploymentHistoryFilters/);
  assert.match(historySource, /변경 없음/);
  assert.match(historySource, /filteredDeploymentHistoryEntries\.map/);
  assert.match(historySource, /deploymentHistoryDetailHero/);
  assert.match(historySource, /getDeploymentDurationLabel/);
  assert.match(
    workspaceStyles,
    /\.deploymentHistoryDetailHero\s*\{[^}]*background:\s*var\(--deployment-navy\)/s
  );
});

test("Deployment History hides inactive controls when no successful version exists", () => {
  const historyStart = directDeploymentSource.indexOf("const renderDeploymentHistory");
  const historyEnd = directDeploymentSource.indexOf("const renderHistoryView", historyStart);
  const historySource = directDeploymentSource.slice(historyStart, historyEnd);
  const viewStart = directDeploymentSource.indexOf("const renderHistoryView", historyEnd);
  const viewEnd = directDeploymentSource.indexOf("const deploymentContent", viewStart);
  const viewSource = directDeploymentSource.slice(viewStart, viewEnd);

  assert.match(
    directDeploymentSource,
    /const hasDeploymentHistory = deploymentHistoryEntries\.length > 0/
  );
  assert.match(
    historySource,
    /!hasDeploymentHistory[\s\S]*deploymentHistoryEmpty[\s\S]*hasDeploymentHistory[\s\S]*deploymentHistoryMetrics/
  );
  assert.match(viewSource, /\{hasDeploymentHistory \? \([\s\S]*deploymentHistorySecondary/);
});

test("selected history detail does not repeat scope and change columns", () => {
  assert.doesNotMatch(directDeploymentSource, /<dt>실행 범위<\/dt>/);
  assert.doesNotMatch(directDeploymentSource, /<dt>변경 내용<\/dt>/);
  assert.match(directDeploymentSource, /<dt>버전 ID<\/dt>/);
  assert.match(directDeploymentSource, /<dt>실행 시간<\/dt>/);
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
