import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const componentSource = readWorkspaceFile("WorkspaceRightPanel.tsx");
const aiPanelSource = readWorkspaceFile("WorkspaceAiPanel.tsx");
const deploymentPanelSource = readWorkspaceFile("DeploymentPanel.tsx");
const terraformLeaveDialogSource = readWorkspaceFile("TerraformLeaveDialog.tsx");
const terraformPanelSource = readWorkspaceFile("TerraformCodePanel.tsx");
const stylesSource = readWorkspaceFile("workspace.module.css");
const diagramEditorStylesSource = readFeatureFile(
  "../diagram-editor/diagram-editor.module.css"
);

test("deployment panel uses the right panel body scroll area", () => {
  const deploymentPanelIndex = componentSource.indexOf("<DeploymentPanel");
  const previousViewOpenIndex = componentSource.lastIndexOf(
    "<div className={styles.rightPanelView}",
    deploymentPanelIndex
  );
  const previousDivCloseIndex = componentSource.lastIndexOf("</div>", deploymentPanelIndex);

  assert.notEqual(deploymentPanelIndex, -1);
  assert.ok(
    previousViewOpenIndex > previousDivCloseIndex,
    "DeploymentPanel should be rendered inside a rightPanelView body wrapper"
  );

  const deploymentPanelRule = getCssRule(stylesSource, "deploymentPanel");
  const deploymentPanelContentRule = getCssRule(stylesSource, "deploymentPanelContent");

  assert.match(deploymentPanelRule, /\bheight:\s*100%;/);
  assert.match(deploymentPanelRule, /\bmin-height:\s*0;/);
  assert.match(deploymentPanelRule, /\boverflow:\s*hidden;/);
  assert.match(deploymentPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/);
  assert.match(deploymentPanelContentRule, /\bmin-height:\s*0;/);
  assert.match(deploymentPanelContentRule, /\boverflow-y:\s*auto;/);
});

test("right panel width is locked against long deployment content", () => {
  const rightRailRule = getCssRule(diagramEditorStylesSource, "rightRail");
  const rightPanelShellRule = getCssRule(stylesSource, "rightPanelShell");
  const rightPanelViewRule = getCssRule(stylesSource, "rightPanelView");
  const deploymentPanelRule = getCssRule(stylesSource, "deploymentPanel");
  const deploymentPanelContentRule = getCssRule(stylesSource, "deploymentPanelContent");

  assert.match(rightRailRule, /\bmin-width:\s*0;/);
  assert.match(rightRailRule, /\bmax-width:\s*100%;/);
  assert.match(rightPanelShellRule, /\bmin-width:\s*0;/);
  assert.match(rightPanelShellRule, /\bmax-width:\s*100%;/);
  assert.match(rightPanelShellRule, /\bwidth:\s*100%;/);
  assert.match(rightPanelViewRule, /\bmin-width:\s*0;/);
  assert.match(rightPanelViewRule, /\bmax-width:\s*100%;/);
  assert.match(deploymentPanelRule, /\bmin-width:\s*0;/);
  assert.match(deploymentPanelRule, /\bmax-width:\s*100%;/);
  assert.match(deploymentPanelContentRule, /\bmin-width:\s*0;/);
  assert.match(deploymentPanelContentRule, /\bmax-width:\s*100%;/);
});

test("deployment mode switch keeps tabs the same size across modes", () => {
  const deploymentPanelRule = getCssRule(stylesSource, "deploymentPanel");
  const modeSwitchRule = getCssRule(stylesSource, "deploymentModeSwitch");
  const modeButtonRule = getCssRule(stylesSource, "deploymentModeButton");

  assert.match(deploymentPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/);
  assert.match(modeSwitchRule, /\bgrid-auto-rows:\s*32px;/);
  assert.match(modeSwitchRule, /\balign-items:\s*center;/);
  assert.match(modeButtonRule, /\bheight:\s*32px;/);
});

test("deployment mode switch is pinned after the scrollable content area", () => {
  const contentIndex = deploymentPanelSource.indexOf("className={styles.deploymentPanelContent}");
  const modeSwitchIndex = deploymentPanelSource.indexOf("className={styles.deploymentModeSwitch}");

  assert.notEqual(contentIndex, -1);
  assert.notEqual(modeSwitchIndex, -1);
  assert.ok(contentIndex < modeSwitchIndex);
});

test("deployment toolbar action is grouped with the other panel mode buttons", () => {
  const toolbarIndex = componentSource.indexOf("className={styles.rightPanelToolbar}");
  const modeToggleIndex = componentSource.indexOf("className={styles.panelModeToggle}", toolbarIndex);
  const aiButtonIndex = componentSource.indexOf('title="AI"', modeToggleIndex);
  const deployButtonIndex = componentSource.indexOf('title="Deploy"', aiButtonIndex);
  const toolbarContentEndIndex = componentSource.indexOf(
    "<div className={styles.rightPanelView}",
    modeToggleIndex
  );

  assert.ok(modeToggleIndex > toolbarIndex);
  assert.ok(deployButtonIndex > aiButtonIndex);
  assert.ok(deployButtonIndex < toolbarContentEndIndex);
  assert.match(componentSource, /activeView === "deployment" \? styles\.panelModeButtonActive : styles\.panelModeButton/);
  assert.doesNotMatch(componentSource, /panelDeployButton/);
  assert.doesNotMatch(stylesSource, /\.panelDeployButton\s*\{/);
});

test("terraform leave guard covers workspace escape actions while editing", () => {
  assert.match(componentSource, /PendingTerraformLeaveAction/);
  assert.match(componentSource, /pendingTerraformLeaveActionRef/);
  assert.match(componentSource, /requestTerraformLeave/);
  assert.match(componentSource, /runPendingTerraformLeaveAction/);
  assert.match(componentSource, /terraformViewRef/);
  assert.match(componentSource, /document\.addEventListener\("click", handleDocumentClick, true\)/);
  assert.match(componentSource, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/);
  assert.match(componentSource, /onClick=\{requestRightPanelClose\}/);
  assert.match(componentSource, /requestTerraformLeave\(\{ kind: "view", view: nextView \}\)/);
  assert.match(componentSource, /requestTerraformLeave\(\{ kind: "resource-settings" \}\)/);
  assert.match(componentSource, /kind: "replay-click"/);
  assert.doesNotMatch(componentSource, /activeView === "terraform" \|\| activeView === "issues"/);
});

test("discarding terraform edits resets the terraform code panel dirty state", () => {
  assert.match(componentSource, /terraformDiscardRequestId/);
  assert.match(componentSource, /setTerraformDiscardRequestId\(\(requestId\) => requestId \+ 1\)/);
  assert.match(componentSource, /externalDiscardRequestId=\{terraformDiscardRequestId\}/);
  assert.match(terraformPanelSource, /externalDiscardRequestId/);
  assert.match(terraformPanelSource, /latestExternalDiscardRequestIdRef/);
  assert.match(terraformPanelSource, /latestExternalDiscardRequestIdRef\.current === externalDiscardRequestId/);
  assert.match(terraformPanelSource, /void refreshTerraformCode\(currentDiagramFingerprint\)/);
});

test("terraform preview refreshes when the last diagram icon is deleted", () => {
  assert.match(terraformPanelSource, /void refreshTerraformCode\(currentDiagramFingerprint\)/);
  assert.doesNotMatch(terraformPanelSource, /context\.nodes\.length === 0/);
});

test("terraform leave dialog uses Korean copy", () => {
  assert.match(terraformLeaveDialogSource, /나가기 전에 변경사항을 저장할까요\?/);
  assert.match(terraformLeaveDialogSource, /저장하지 않은 Terraform 변경사항이 있습니다/);
  assert.match(terraformLeaveDialogSource, /변경사항을 저장하시겠습니까\?/);
  assert.match(terraformLeaveDialogSource, /저장하지 않고 나가기/);
  assert.match(terraformLeaveDialogSource, /계속 편집하기/);
  assert.match(terraformLeaveDialogSource, /저장하고 나가기/);
  assert.doesNotMatch(terraformLeaveDialogSource, /Save changes before leaving\?/);
  assert.doesNotMatch(terraformLeaveDialogSource, /Discard Changes/);
});

test("terraform leave dialog exposes blocked save feedback instead of ignoring failed saves", () => {
  assert.match(componentSource, /terraformLeaveSaveState/);
  assert.match(componentSource, /terraformLeaveSaveMessage/);
  assert.match(componentSource, /createTerraformLeaveSaveStartFeedback/);
  assert.match(componentSource, /resolveTerraformLeaveSaveCompletion/);
  assert.match(componentSource, /setTerraformLeaveSaveState\(feedback\.state\)/);
  assert.match(componentSource, /setTerraformLeaveSaveMessage\(feedback\.message\)/);
  assert.match(componentSource, /saveState=\{terraformLeaveSaveState\}/);
  assert.match(componentSource, /saveMessage=\{terraformLeaveSaveMessage\}/);
  assert.match(terraformLeaveDialogSource, /saveState === "saving"/);
  assert.match(terraformLeaveDialogSource, /saveState === "blocked"/);
  assert.match(terraformLeaveDialogSource, /role=\{saveState === "blocked" \? "alert" : "status"\}/);
  assert.match(terraformLeaveDialogSource, /저장 중/);
  assert.match(terraformLeaveDialogSource, /disabled=\{isSaving\}/);
});

test("deployment expanded logs use a single terminal scrollbar", () => {
  const expandedLogsRule = getCssRule(stylesSource, "deploymentExpandedLogs");
  const expandedLogSectionRule = getDescendantCssRule(
    stylesSource,
    "deploymentExpandedLogs",
    "deploymentSection"
  );
  const logListRule = getCssRule(stylesSource, "deploymentLogList");

  assert.match(expandedLogsRule, /\boverflow:\s*hidden;/);
  assert.match(expandedLogSectionRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(logListRule, /\boverflow:\s*auto;/);
  assert.doesNotMatch(logListRule, /\bmax-height:/);
});

test("deployment expanded panel has a resizable split handle", () => {
  const expandedGridRule = getCssRule(stylesSource, "deploymentExpandedGrid");
  const resizeHandleRule = getCssRule(stylesSource, "deploymentExpandedResizeHandle");

  assert.match(deploymentPanelSource, /deploymentExpandedGridRef/);
  assert.match(deploymentPanelSource, /"--deployment-details-width"/);
  assert.match(deploymentPanelSource, /className=\{styles\.deploymentExpandedResizeHandle\}/);
  assert.match(deploymentPanelSource, /role="separator"/);
  assert.match(deploymentPanelSource, /onPointerDown=\{startDeploymentPanelResize\}/);
  assert.match(deploymentPanelSource, /onKeyDown=\{handleDeploymentPanelResizeKeyDown\}/);
  assert.match(
    expandedGridRule,
    /grid-template-columns:\s*minmax\(0,\s*calc\(var\(--deployment-details-width\) - 6px\)\)\s*12px\s*minmax\(0,\s*calc\(100% - var\(--deployment-details-width\) - 6px\)\);/
  );
  assert.match(resizeHandleRule, /\bcursor:\s*col-resize;/);
  assert.match(resizeHandleRule, /\btouch-action:\s*none;/);
});

test("deployment expanded details use larger action and record text", () => {
  assert.match(
    stylesSource,
    /\.deploymentExpandedDetails\s+\.deploymentField\s*\{[\s\S]*?\bfont-size:\s*13px;/
  );
  assert.match(
    deploymentPanelSource,
    /size=\{isDeploymentExpanded \? "large" : "regular"\}/
  );
  assert.match(
    stylesSource,
    /\.deploymentExpandedDetails\s+\.deploymentPrimaryButton,\s*\.deploymentExpandedDetails\s+\.deploymentSecondaryButton,\s*\.deploymentExpandedDetails\s+\.deploymentDangerButton\s*\{[\s\S]*?\bfont-size:\s*14px;[\s\S]*?\bmin-height:\s*40px;/
  );
  assert.match(
    stylesSource,
    /\.deploymentExpandedDetails\s+\.deploymentSummary\s+strong\s*\{[\s\S]*?\bfont-size:\s*13px;/
  );
});

test("deployment log prefix omits the level label because color carries severity", () => {
  assert.doesNotMatch(deploymentPanelSource, /log\.level\.padEnd/);
});

test("deployment results render as compact rows instead of cards", () => {
  const resultRowsRule = getCssRule(stylesSource, "deploymentResultRows");
  const resultRowRule = getCssRule(stylesSource, "deploymentResultRow");

  assert.match(deploymentPanelSource, /className=\{styles\.deploymentResultRows\}/);
  assert.doesNotMatch(stylesSource, /\.deploymentResultList\s+div\s*\{/);
  assert.match(resultRowsRule, /\bgap:\s*0;/);
  assert.match(resultRowRule, /\bgrid-template-columns:\s*minmax\(0,\s*1\.15fr\) minmax\(88px,\s*0\.45fr\) minmax\(0,\s*1fr\);/);
  assert.match(resultRowRule, /\bmin-height:\s*32px;/);
});

test("deployment creation prepares fresh snapshot and terraform artifact before creating the deployment", () => {
  const prepareIndex = deploymentPanelSource.indexOf(
    "const savedArtifacts = await onPrepareDeploymentArtifacts();"
  );
  const createDeploymentIndex = deploymentPanelSource.indexOf(
    "const deployment = await createDeployment",
    prepareIndex
  );

  assert.ok(prepareIndex > -1);
  assert.ok(createDeploymentIndex > prepareIndex);
  assert.match(deploymentPanelSource, /architectureId:\s*savedArtifacts\.architecture\.id/);
  assert.match(deploymentPanelSource, /terraformArtifactId:\s*savedArtifacts\.terraformArtifact\.id/);
  assert.match(componentSource, /ref=\{terraformPanelRef\}/);
  assert.match(componentSource, /onPrepareDeploymentArtifacts=\{prepareDeploymentArtifacts\}/);
});

test("deployment setup exposes only baseline save, AWS connection, and review start controls", () => {
  const saveIndex = deploymentPanelSource.indexOf("배포 기준 저장");
  const awsConnectionIndex = deploymentPanelSource.indexOf("AWS 연결", saveIndex);
  const reviewStartIndex = deploymentPanelSource.indexOf("배포 검토 시작", awsConnectionIndex);

  assert.ok(saveIndex > -1);
  assert.ok(awsConnectionIndex > saveIndex);
  assert.ok(reviewStartIndex > awsConnectionIndex);
  assert.doesNotMatch(deploymentPanelSource, /설계 버전 저장/);
  assert.doesNotMatch(deploymentPanelSource, /저장된 설계 기준/);
  assert.doesNotMatch(deploymentPanelSource, /저장된 Terraform 파일/);
  assert.doesNotMatch(deploymentPanelSource, /Deployment 생성/);
  assert.doesNotMatch(deploymentPanelSource, /현재 설계와 Terraform 코드를 함께 저장합니다/);
  assert.doesNotMatch(deploymentPanelSource, /onSaveArchitectureSnapshot/);
  assert.doesNotMatch(stylesSource, /\.deploymentBaselinePanel\s*\{/);
});

test("deployment baseline save button shows pending and saved icons", () => {
  assert.match(deploymentPanelSource, /import \{ Clipboard, ClipboardCheck,/);
  assert.match(
    deploymentPanelSource,
    /const DeploymentBaselineIcon = hasUnsavedDeploymentBaseline \? Clipboard : ClipboardCheck;/
  );
  assert.match(deploymentPanelSource, /<DeploymentBaselineIcon size=\{16\} aria-hidden="true" \/>/);
  assert.match(componentSource, /lastSavedDeploymentBaselineFingerprint/);
  assert.match(componentSource, /isDeploymentBaselineDirty/);
  assert.match(componentSource, /toDeploymentBaselineFingerprint\(preparedSource\.diagramJson\)/);
  assert.match(componentSource, /setIsDeploymentBaselineDirty\(false\)/);
  assert.match(
    componentSource,
    /hasUnsavedDeploymentBaseline=\{hasUnsavedDeploymentBaseline\}/
  );
});

test("pre-deployment check is owned by the deployment tab", () => {
  const preflightSummaryRule = getCssRule(stylesSource, "deploymentPreflightSummary");

  assert.match(deploymentPanelSource, /runAiPreDeploymentCheck/);
  assert.match(deploymentPanelSource, /addTerraformDiagnosticsToPreDeploymentAnalysis/);
  assert.match(deploymentPanelSource, /onValidateTerraformDiagnostics/);
  assert.match(deploymentPanelSource, /await onValidateTerraformDiagnostics\(\)/);
  assert.match(deploymentPanelSource, /currentTerraformDiagnostics/);
  assert.match(deploymentPanelSource, /createWorkspaceAiBoardSnapshot/);
  assert.match(componentSource, /diagramJson=\{context\.diagram\}/);
  assert.match(componentSource, /validateTerraformForPreDeployment/);
  assert.match(componentSource, /validateCurrentTerraform/);
  assert.match(terraformPanelSource, /validateCurrentTerraform/);
  assert.doesNotMatch(aiPanelSource, /runAiPreDeploymentCheck/);
  assert.doesNotMatch(aiPanelSource, /WorkspaceAiPreDeploymentResult/);
  assert.match(preflightSummaryRule, /\bgap:\s*8px;/);
});

test("terraform error explanation lives in the terraform code panel only when errors exist", () => {
  const errorExplanationRule = getCssRule(stylesSource, "terraformErrorExplanationPanel");
  const errorExplanationListRule = getCssRule(stylesSource, "terraformErrorExplanationList");
  const errorExplanationResultRule = getCssRule(stylesSource, "terraformErrorExplanationResult");

  assert.match(terraformPanelSource, /runAiTerraformErrorExplanation/);
  assert.match(terraformPanelSource, /errorDiagnostics\.length > 0 \? \(/);
  assert.match(terraformPanelSource, /errorDiagnostics\.map/);
  assert.match(terraformPanelSource, /terraformErrorExplanationsByKey/);
  assert.match(terraformPanelSource, /diagnosticExplanation = explanationEntry\?\.explanation/);
  assert.match(terraformPanelSource, /disabled=\{isExplanationLoading \|\| requestState === "loading"\}/);
  assert.doesNotMatch(terraformPanelSource, /explainedTerraformErrorKey/);
  assert.match(terraformPanelSource, /오류를 해석하는 중입니다/);
  assert.match(terraformPanelSource, /className=\{styles\.terraformErrorExplanationPanel\}/);
  assert.match(terraformPanelSource, /className=\{styles\.terraformErrorExplanationList\}/);
  assert.doesNotMatch(terraformPanelSource, /diagnosticToast/);
  assert.doesNotMatch(terraformPanelSource, /showDiagnosticToast/);
  assert.doesNotMatch(aiPanelSource, /runAiTerraformErrorExplanation/);
  assert.doesNotMatch(aiPanelSource, /Terraform 오류 설명/);
  assert.doesNotMatch(stylesSource, /\.terraformDiagnosticToast\s*\{/);
  assert.match(errorExplanationRule, /\bmax-height:\s*240px;/);
  assert.match(errorExplanationRule, /\boverflow:\s*auto;/);
  assert.match(errorExplanationListRule, /\blist-style:\s*none;/);
  assert.match(errorExplanationResultRule, /\bgrid-column:\s*1 \/ -1;/);
});

test("terraform editor renders syntax colors and squiggly error underlines", () => {
  const syntaxHighlightLayerRule = getCssRule(stylesSource, "terraformSyntaxHighlightLayer");
  const highlightedLineErrorRule = getCssRule(stylesSource, "terraformHighlightedLineError");
  const lineNumberErrorRule = getCssRule(stylesSource, "terraformLineNumberError");
  const textareaRule = getCssRule(stylesSource, "terraformTextarea");
  const keywordRule = getCssRule(stylesSource, "terraformTokenKeyword");
  const identifierRule = getCssRule(stylesSource, "terraformTokenIdentifier");
  const referenceRule = getCssRule(stylesSource, "terraformTokenReference");
  const stringRule = getCssRule(stylesSource, "terraformTokenString");
  const braceRule = getCssRule(stylesSource, "terraformTokenBrace");

  assert.match(terraformPanelSource, /createTerraformDiagnosticLineHighlights/);
  assert.match(terraformPanelSource, /createTerraformHighlightedLines/);
  assert.match(terraformPanelSource, /diagnosticLineHighlights/);
  assert.match(terraformPanelSource, /terraformSyntaxHighlightLayer/);
  assert.match(terraformPanelSource, /terraformHighlightedLineError/);
  assert.match(terraformPanelSource, /terraformTokenKeyword/);
  assert.match(terraformPanelSource, /terraformLineNumberError/);
  assert.match(terraformPanelSource, /diagnosticLineNumberSet\.has\(lineNumber\)/);
  assert.doesNotMatch(terraformPanelSource, /terraformDiagnosticLineLayer/);
  assert.match(syntaxHighlightLayerRule, /\bpointer-events:\s*none;/);
  assert.match(syntaxHighlightLayerRule, /\bposition:\s*absolute;/);
  assert.match(highlightedLineErrorRule, /\btext-decoration-style:\s*wavy;/);
  assert.match(highlightedLineErrorRule, /\btext-decoration-color:\s*#ef4444;/);
  assert.match(textareaRule, /\bcolor:\s*transparent;/);
  assert.match(textareaRule, /\bcaret-color:\s*#d7e4f7;/);
  assert.match(keywordRule, /\bcolor:\s*#2dd4bf;/);
  assert.match(identifierRule, /\bcolor:\s*#74bdf8;/);
  assert.match(referenceRule, /\bcolor:\s*#74bdf8;/);
  assert.match(stringRule, /\bcolor:\s*#d99a7b;/);
  assert.match(braceRule, /\bcolor:\s*#facc15;/);
  assert.match(lineNumberErrorRule, /\bcolor:\s*#fca5a5;/);
});

test("terraform preview explanation is triggered from the terraform code panel", () => {
  const previewExplanationRule = getCssRule(stylesSource, "terraformPreviewExplanationPanel");

  assert.match(terraformPanelSource, /runAiTerraformPreviewExplanation/);
  assert.match(terraformPanelSource, /highlightedBlock\.code/);
  assert.match(terraformPanelSource, /displayedTerraformCode/);
  assert.match(terraformPanelSource, /resource\.explanation/);
  assert.match(terraformPanelSource, /closeTerraformPreviewExplanation/);
  assert.match(terraformPanelSource, /Terraform Preview 설명 닫기/);
  assert.match(terraformPanelSource, /className=\{styles\.terraformPreviewExplanationPanel\}/);
  assert.match(terraformPanelSource, /className=\{styles\.terraformPreviewExplanationActions\}/);
  assert.doesNotMatch(aiPanelSource, /WorkspaceAiTerraformPanel/);
  assert.doesNotMatch(aiPanelSource, /Terraform Preview 설명/);
  assert.doesNotMatch(terraformPanelSource, /checklist\.length\} Checks/);
  assert.match(previewExplanationRule, /\bmax-height:\s*180px;/);
  assert.match(previewExplanationRule, /\boverflow:\s*auto;/);
});

test("terraform resource code mode keeps validation and explanation but omits deployment actions", () => {
  assert.match(terraformPanelSource, /renderTerraformPreviewExplanationButton\(\)/);
  assert.match(terraformPanelSource, /Validate/);
  assert.doesNotMatch(terraformPanelSource, /리소스 단위 plan API 연결 예정/);
  assert.doesNotMatch(terraformPanelSource, /리소스 단위 apply API 연결 예정/);
  assert.doesNotMatch(terraformPanelSource, /리소스 단위 destroy API 연결 예정/);
  assert.doesNotMatch(terraformPanelSource, /className=\{styles\.resourceActionPrimary\}/);
  assert.doesNotMatch(terraformPanelSource, /className=\{styles\.resourceActionDanger\}/);
  assert.doesNotMatch(stylesSource, /\.resourceActionPrimary\s*\{/);
  assert.doesNotMatch(stylesSource, /\.resourceActionDanger\s*\{/);
  assert.match(deploymentPanelSource, /Terraform Plan 실행/);
  assert.match(deploymentPanelSource, /Terraform Apply 실행/);
  assert.match(deploymentPanelSource, /Terraform Destroy 실행/);
});

test("terraform panel does not expose a detached artifact save action", () => {
  assert.doesNotMatch(terraformPanelSource, /onSaveTerraformArtifact/);
  assert.doesNotMatch(terraformPanelSource, /Artifact 저장/);
  assert.match(terraformPanelSource, /syncTerraformCodeToDiagram/);
  assert.doesNotMatch(stylesSource, /\.terraformArtifactButton\s*\{/);
});

test("terraform artifact preparation marks the terraform panel as loading", () => {
  const prepareIndex = terraformPanelSource.indexOf("prepareTerraformArtifact: async () =>");

  assert.ok(prepareIndex > -1);
  assert.ok(terraformPanelSource.indexOf('setRequestState("loading")', prepareIndex) > prepareIndex);
  assert.ok(terraformPanelSource.indexOf('setRequestState("idle")', prepareIndex) > prepareIndex);
  assert.ok(terraformPanelSource.indexOf('setRequestState("error")', prepareIndex) > prepareIndex);
  assert.match(terraformPanelSource, /isPreparingTerraformArtifactRef/);
});

test("terraform sync proposals are auto-applied on explicit save without asking again", () => {
  assert.match(terraformPanelSource, /terraformFiles:\s*terraformFiles\.map/);
  assert.match(terraformPanelSource, /applyAllTerraformSyncProposals/);
  assert.match(terraformPanelSource, /syncResult\.proposals && syncResult\.proposals\.length > 0/);
  assert.match(terraformPanelSource, /context\.applyDiagramJson\(nextDiagramJson\)/);
  assert.doesNotMatch(terraformPanelSource, /pendingTerraformSync/);
  assert.doesNotMatch(terraformPanelSource, /Terraform 변경 제안/);
  assert.doesNotMatch(terraformPanelSource, /선택 반영/);
  assert.doesNotMatch(terraformPanelSource, /제안 무시/);
  assert.doesNotMatch(stylesSource, /\.terraformSyncProposalPanel\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformSyncProposalList\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformSyncProposalActions/);
});

test("terraform editor save allows intentionally empty terraform code", () => {
  const saveStartIndex = terraformPanelSource.indexOf("const saveCodeToDiagram = useCallback");
  const saveEndIndex = terraformPanelSource.indexOf("const validateCurrentTerraform", saveStartIndex);
  const saveSource = terraformPanelSource.slice(saveStartIndex, saveEndIndex);

  assert.ok(saveStartIndex > -1);
  assert.ok(saveEndIndex > saveStartIndex);
  assert.match(saveSource, /syncTerraformCodeToDiagram/);
  assert.doesNotMatch(saveSource, /!hasTerraformCode/);
});

test("terraform editor clears stale diagnostics after local edits", () => {
  const handleCodeChangeIndex = terraformPanelSource.indexOf("function handleCodeChange");

  assert.ok(handleCodeChangeIndex > -1);
  assert.ok(terraformPanelSource.indexOf("codeVersionRef.current += 1", handleCodeChangeIndex) > handleCodeChangeIndex);
  assert.ok(terraformPanelSource.indexOf("setDiagnostics([])", handleCodeChangeIndex) > handleCodeChangeIndex);
  assert.ok(terraformPanelSource.indexOf("onDiagnosticsChange([])", handleCodeChangeIndex) > handleCodeChangeIndex);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function readFeatureFile(filePath: string): string {
  return readFileSync(fileURLToPath(new URL(filePath, import.meta.url)), "utf8");
}

function getCssRule(source: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`).exec(source);

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}

function getDescendantCssRule(source: string, parentClassName: string, childClassName: string): string {
  const match = new RegExp(
    `\\.${parentClassName}\\s+\\.${childClassName}\\s*\\{(?<body>[^}]*)\\}`
  ).exec(source);

  assert.ok(
    match?.groups?.body,
    `Expected .${parentClassName} .${childClassName} CSS rule to exist`
  );

  return match.groups.body;
}
