import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const componentSource = readWorkspaceFile("WorkspaceRightPanel.tsx");
const aiChatDockSource = readWorkspaceFile("WorkspaceAiChatDock.tsx");
const aiPanelSource = readWorkspaceFile("WorkspaceAiPanel.tsx");
const deploymentPanelSource = readWorkspaceFile("DeploymentPanel.tsx");
const diagramEditorSource = readFeatureFile("../diagram-editor/DiagramEditor.tsx");
const resourceWorkspaceSource = readWorkspaceFile("ResourceWorkspacePanel.tsx");
const diagramEditorTypesSource = readFeatureFile("../diagram-editor/types.ts");
const terraformLeaveDialogSource = readWorkspaceFile("TerraformLeaveDialog.tsx");
const terraformPanelSource = readWorkspaceFile("TerraformCodePanel.tsx");
const projectDraftManagerSource = readWorkspaceFile("ProjectWorkspaceDraftManager.tsx");
const workspaceDraftManagerSource = readWorkspaceFile("WorkspaceDraftManager.tsx");
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

test("workspace rails use the Brainboard panel widths", () => {
  const editorShellRule = getCssRule(diagramEditorStylesSource, "editorShell");
  const leftRailRule = getCssRule(diagramEditorStylesSource, "leftRail");

  assert.match(diagramEditorSource, /const DEFAULT_LEFT_PANEL_WIDTH = 346;/);
  assert.match(diagramEditorSource, /const DEFAULT_RIGHT_PANEL_WIDTH = 440;/);
  assert.match(diagramEditorSource, /leftPanelWidth\.brainboardV1/);
  assert.match(diagramEditorSource, /rightPanelWidth\.brainboardV1/);
  assert.match(editorShellRule, /--left-panel-width:\s*346px;/);
  assert.match(editorShellRule, /--right-panel-width:\s*440px;/);
  assert.match(leftRailRule, /\bleft:\s*12px;/);
  assert.match(leftRailRule, /\btop:\s*72px;/);
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

test("right panel exposes Brainboard-style Issues, Deploy, and Plan actions", () => {
  const utilityBarIndex = componentSource.indexOf("className={styles.rightPanelUtilityBar}");
  const modeBarIndex = componentSource.indexOf("className={styles.rightPanelModeBar}");
  const toolbarContentEndIndex = componentSource.indexOf(
    "<div className={styles.rightPanelView}",
    modeBarIndex
  );
  const modeBarSource = componentSource.slice(modeBarIndex, toolbarContentEndIndex);
  const resourcesButtonIndex = modeBarSource.indexOf('title="Resources"');
  const codeButtonIndex = modeBarSource.indexOf('title="Terraform code"');
  const issuesButtonIndex = modeBarSource.indexOf("<span>Issues</span>");
  const deployButtonIndex = modeBarSource.indexOf("<span>Deploy</span>");
  const planButtonIndex = modeBarSource.indexOf("<span>Plan</span>");
  const codeButtonSource = modeBarSource.slice(
    modeBarSource.lastIndexOf("<button", codeButtonIndex),
    modeBarSource.indexOf("</button>", codeButtonIndex)
  );
  const planButtonSource = modeBarSource.slice(
    modeBarSource.lastIndexOf("<button", planButtonIndex),
    modeBarSource.indexOf("</button>", planButtonIndex)
  );

  assert.ok(utilityBarIndex > -1);
  assert.ok(modeBarIndex > utilityBarIndex);
  assert.ok(resourcesButtonIndex > -1);
  assert.ok(codeButtonIndex > resourcesButtonIndex);
  assert.ok(issuesButtonIndex > codeButtonIndex);
  assert.ok(deployButtonIndex > issuesButtonIndex);
  assert.ok(planButtonIndex > deployButtonIndex);
  assert.match(codeButtonSource, /data-terraform-editor-navigation/);
  assert.match(codeButtonSource, /onClick=\{\(\) => requestView\("terraform"\)\}/);
  assert.match(planButtonSource, /onClick=\{openDeploymentFromPlan\}/);
  assert.doesNotMatch(planButtonSource, /data-terraform-editor-navigation/);
  assert.doesNotMatch(planButtonSource, /requestView\("terraform"\)/);
  assert.match(componentSource, /title="Terraform code"/);
  assert.match(componentSource, /title="Plan actions"/);
  assert.match(componentSource, /styles\.panelPlanSplitButton/);
  assert.match(componentSource, /styles\.panelPlanMainButton/);
  assert.match(componentSource, /styles\.panelModeTextButton/);
  assert.match(componentSource, /styles\.panelModeIconGroup/);
  assert.match(stylesSource, /\.rightPanelModeBar\s*\{/);
  assert.match(stylesSource, /\.panelPlanSplitButton\s*\{/);
  assert.match(stylesSource, /\.panelPlanMainButton\s*\{/);
  assert.doesNotMatch(componentSource, /title="AI"/);
  assert.doesNotMatch(componentSource, /activeView === "ai"/);
  assert.doesNotMatch(componentSource, /WorkspaceAiPanel/);
  assert.doesNotMatch(componentSource, /panelDeployButton/);
  assert.doesNotMatch(stylesSource, /\.panelDeployButton\s*\{/);
});

test("Plan action strip is UI-only and routes only to the Deploy view", () => {
  const planActionStripIndex = componentSource.indexOf("className={styles.panelPlanActionStrip}");
  const planActionStripSource = componentSource.slice(
    planActionStripIndex,
    componentSource.indexOf("</div>", planActionStripIndex)
  );
  const planMainIndex = componentSource.indexOf("className={styles.panelPlanMainButton}");
  const planMainSource = componentSource.slice(
    componentSource.lastIndexOf("<button", planMainIndex),
    componentSource.indexOf("</button>", planMainIndex)
  );

  assert.ok(planActionStripIndex > -1);
  assert.match(componentSource, /const \[isPlanActionStripOpen, setIsPlanActionStripOpen\] = useState\(false\);/);
  assert.match(planMainSource, /onClick=\{openDeploymentFromPlan\}/);
  assert.doesNotMatch(planMainSource, /requestView\("terraform"\)/);
  assert.match(planActionStripSource, />\s*Plan\s*</);
  assert.match(planActionStripSource, />\s*Validate\s*</);
  assert.match(planActionStripSource, />\s*Apply\s*</);
  assert.match(planActionStripSource, />\s*Destroy\s*</);
  assert.equal(countMatches(planActionStripSource, /onClick=\{openDeploymentFromPlan\}/g), 4);
  assert.doesNotMatch(planActionStripSource, /runDeploymentPlan|runDeploymentApply|runDeploymentDestroy/);
  assert.doesNotMatch(planActionStripSource, /requestView\("terraform"\)/);
});

test("right panel redesign does not add deployment shortcut or focus plumbing", () => {
  assert.doesNotMatch(componentSource, /deploymentShortcutRequest/);
  assert.doesNotMatch(deploymentPanelSource, /deploymentShortcutRequest/);
  assert.doesNotMatch(deploymentPanelSource, /scrollIntoView/);
  assert.doesNotMatch(deploymentPanelSource, /focus\(\)/);
});

test("workspace AI opens from a floating chat dock instead of the right panel", () => {
  const floatingPanelSlotRule = getCssRule(diagramEditorStylesSource, "floatingPanelSlot");

  assert.match(diagramEditorSource, /floatingPanel\?\.\(panelContext\)/);
  assert.match(projectDraftManagerSource, /floatingPanel=\{\(context\) => \(/);
  assert.match(workspaceDraftManagerSource, /floatingPanel=\{\(context\) => \(/);
  assert.match(projectDraftManagerSource, /<WorkspaceAiChatDock/);
  assert.match(workspaceDraftManagerSource, /<WorkspaceAiChatDock/);
  assert.match(aiChatDockSource, /className=\{styles\.aiChatLauncher/);
  assert.match(aiChatDockSource, /className=\{styles\.aiChatDock/);
  assert.match(aiChatDockSource, /data-terraform-leave-guard-ignore/);
  assert.match(stylesSource, /\.aiChatLauncher\s*\{/);
  assert.match(stylesSource, /\.aiChatDock\s*\{/);
  assert.match(floatingPanelSlotRule, /pointer-events:\s*none/);
  assert.match(floatingPanelSlotRule, /z-index:\s*90/);
});

test("resource workspace omits the decorative list toolbar", () => {
  const resourceWorkspacePanelRule = getCssRule(stylesSource, "resourceWorkspacePanel");
  const resourceListPanelRule = getCssRule(stylesSource, "resourceListPanel");

  assert.doesNotMatch(resourceWorkspaceSource, /className=\{styles\.resourceSectionToolbar\}/);
  assert.doesNotMatch(resourceWorkspaceSource, /aria-label="Resource list"/);
  assert.match(resourceWorkspacePanelRule, /\bgrid-template-rows:\s*minmax\(0,\s*1fr\);/);
  assert.match(resourceListPanelRule, /\bpadding:\s*24px 12px 12px;/);
});

test("resource detail back action sits inside the detail view", () => {
  const settingsBranchIndex = resourceWorkspaceSource.indexOf('visibleView === "settings"');
  const settingsPanelIndex = resourceWorkspaceSource.indexOf(
    "className={styles.resourceSettingsPanel}",
    settingsBranchIndex
  );
  const backButtonIndex = resourceWorkspaceSource.indexOf(
    'aria-label="Back to resource list"',
    settingsPanelIndex
  );
  const parameterPanelIndex = resourceWorkspaceSource.indexOf("<ParameterInputPanel", settingsPanelIndex);
  const settingsPanelRule = getCssRule(stylesSource, "resourceSettingsPanel");
  const settingsHeaderRule = getCssRule(stylesSource, "resourceSettingsHeader");

  assert.ok(settingsBranchIndex > -1);
  assert.ok(settingsPanelIndex > settingsBranchIndex);
  assert.ok(backButtonIndex > settingsPanelIndex);
  assert.ok(parameterPanelIndex > backButtonIndex);
  assert.match(settingsPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(settingsHeaderRule, /\bpadding:\s*16px 12px 8px;/);
});

test("resource list identity starts with the service icon", () => {
  const serviceIconRule = getCssRule(stylesSource, "resourceListServiceIcon");

  assert.doesNotMatch(resourceWorkspaceSource, /resourceListCubeIcon/);
  assert.doesNotMatch(stylesSource, /\.resourceListCubeIcon\s*\{/);
  assert.doesNotMatch(serviceIconRule, /\bborder-left:/);
  assert.match(serviceIconRule, /\bwidth:\s*36px;/);
});

test("resource card menu omits data source switch and maximize actions", () => {
  const menuStartIndex = resourceWorkspaceSource.indexOf("function ResourceCardMenu");
  const menuEndIndex = resourceWorkspaceSource.indexOf("function selectNode", menuStartIndex);
  const menuSource = resourceWorkspaceSource.slice(menuStartIndex, menuEndIndex);

  assert.ok(menuStartIndex > -1);
  assert.ok(menuEndIndex > menuStartIndex);
  assert.doesNotMatch(menuSource, /Switch to data source|Switch to resource/);
  assert.doesNotMatch(menuSource, /switchTerraformBlockType/);
  assert.doesNotMatch(menuSource, /onToggleSize/);
  assert.doesNotMatch(menuSource, /Maximize2|Minimize2/);
  assert.match(menuSource, /Edit config/);
  assert.match(menuSource, /Duplicate/);
  assert.match(menuSource, /Delete/);
});

test("workspace AI has a dedicated error tab for Terraform issue resolution", () => {
  assert.match(aiChatDockSource, /type WorkspaceAiChatScope = "draft" \| "errors" \| "preview" \| "simulation"/);
  assert.match(aiChatDockSource, /setActiveChatTab\("errors"\)/);
  assert.match(aiChatDockSource, /activeChatTab === "errors" && terraformIssueResolution !== null/);
  assert.match(aiChatDockSource, /AI 오류/);
  assert.match(stylesSource, /\.aiChatDock\[data-chat-tab="errors"\] \.aiChatComposer/);
});

test("terraform issue fix cards omit procedural apply steps", () => {
  assert.doesNotMatch(aiChatDockSource, /fixPlan\.steps\.map/);
  assert.doesNotMatch(aiChatDockSource, /<ol>/);
});

test("workspace AI saves accepted generated and patched diagrams immediately", () => {
  assert.match(projectDraftManagerSource, /onDiagramSaveRequest=\{\(\) => flushDraftToServer\("manual"\)\}/);
  assert.match(workspaceDraftManagerSource, /onDiagramSaveRequest=\{saveCurrentDraftLocally\}/);
  assert.match(diagramEditorSource, /saveDiagramNow:\s*onDiagramSaveRequest/);
  assert.match(aiChatDockSource, /context\.saveDiagramNow\?\.\(\)/);
});

test("accepted AI drafts apply the current draft instead of a stale preview diagram", () => {
  const stalePreviewFallbackPattern =
    /context\.previewDiagram\s*\?\?\s*convertArchitectureJsonToDiagramJson\(draft\.architectureJson\)/;

  assert.doesNotMatch(aiChatDockSource, stalePreviewFallbackPattern);
  assert.doesNotMatch(aiPanelSource, stalePreviewFallbackPattern);
  assert.match(
    aiChatDockSource,
    /context\.applyDiagramJson\(\s*convertArchitectureJsonToDiagramJson\(draft\.architectureJson\)\s*\)/s
  );
  assert.match(
    aiPanelSource,
    /context\.applyDiagramJson\(\s*convertArchitectureJsonToDiagramJson\(draft\.architectureJson\)\s*\)/s
  );
});

test("workspace AI refines a pending draft preview instead of replacing it from an empty board", () => {
  assert.match(aiChatDockSource, /convertDiagramJsonToArchitectureJson/);
  assert.match(aiChatDockSource, /resolvePendingPreviewChatAction/);
  assert.match(aiChatDockSource, /pendingPreviewAction === "patch"/);
  assert.match(aiChatDockSource, /pendingPreviewAction === "draft"/);
  assert.match(aiChatDockSource, /draft !== null/);
  assert.match(aiChatDockSource, /context\.previewDiagram !== null/);
  assert.match(
    aiChatDockSource,
    /baseArchitectureJson:\s*convertDiagramJsonToArchitectureJson\(context\.previewDiagram\)/
  );
  assert.doesNotMatch(aiChatDockSource, /createArchitectureClarificationSession/);
  assert.doesNotMatch(aiChatDockSource, /createClarifiedDraftRequest/);
});

test("accepted AI diagrams explicitly request terraform code regeneration", () => {
  assert.match(diagramEditorTypesSource, /terraformRefreshRequestId:\s*number/);
  assert.match(diagramEditorTypesSource, /requestTerraformRefresh:\s*\(\) => void/);
  assert.match(diagramEditorSource, /terraformRefreshRequestId/);
  assert.match(diagramEditorSource, /requestTerraformRefresh/);
  assert.match(aiChatDockSource, /context\.requestTerraformRefresh\(\)/);
  assert.match(terraformPanelSource, /context\.terraformRefreshRequestId/);
  assert.match(terraformPanelSource, /latestTerraformRefreshRequestIdRef/);
});

test("workspace AI chat keeps the floating dock width without prompt guide chips", () => {
  const dockRule = getCssRule(stylesSource, "aiChatDock");
  const composerRule = getCssRule(stylesSource, "aiChatComposer");

  assert.doesNotMatch(aiChatDockSource, /styles\.aiChatPromptGuide/);
  assert.match(dockRule, /right:\s*24px/);
  assert.match(dockRule, /width:\s*min\(860px,\s*calc\(100vw - 48px\)\)/);
  assert.match(composerRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*auto/);
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

test("terraform issues navigation stays reachable while diagnostics are visible", () => {
  assert.match(componentSource, /canOpenTerraformIssuesDuringEdit/);
  assert.match(componentSource, /nextView === "issues" && canOpenTerraformIssuesDuringEdit/);
  assert.match(componentSource, /data-terraform-issues-navigation/);
  assert.match(componentSource, /isTerraformIssuesNavigationTarget/);
  assert.match(componentSource, /canOpenTerraformIssuesDuringEdit && isTerraformIssuesNavigationTarget\(target\)/);
  assert.match(componentSource, /openCollapsedView\("issues"\)/);
});

test("terraform issue AI resolution bypasses the leave guard while editing", () => {
  const issuesPanelSource = readWorkspaceFile("TerraformIssuesPanel.tsx");

  assert.match(issuesPanelSource, /data-terraform-issue-ai-resolution/);
  assert.match(componentSource, /isTerraformIssueAiResolutionTarget/);
  assert.match(componentSource, /isTerraformIssueAiResolutionTarget\(target\)/);
  assert.match(componentSource, /isTerraformLeaveGuardIgnoredTarget/);
  assert.match(aiChatDockSource, /data-terraform-leave-guard-ignore/);
  assert.match(issuesPanelSource, /onResolveWithAi\(issue\)/);
});

test("terraform code navigation stays reachable from issues after a blocked save", () => {
  const requestViewIndex = componentSource.indexOf("const requestView = useCallback");
  const requestViewEditorBypassIndex = componentSource.indexOf('if (nextView === "terraform")', requestViewIndex);
  const requestViewLeaveGuardIndex = componentSource.indexOf(
    'requestTerraformLeave({ kind: "view", view: nextView })',
    requestViewIndex
  );
  const collapsedViewIndex = componentSource.indexOf("function openCollapsedView");
  const collapsedViewEditorBypassIndex = componentSource.indexOf('if (nextView === "terraform")', collapsedViewIndex);
  const collapsedViewLeaveGuardIndex = componentSource.indexOf(
    'requestTerraformLeave({ kind: "view", view: nextView })',
    collapsedViewIndex
  );
  const documentClickIndex = componentSource.indexOf("function handleDocumentClick");
  const editorNavigationTargetIndex = componentSource.indexOf(
    "isTerraformEditorNavigationTarget(target)",
    documentClickIndex
  );
  const replayTargetIndex = componentSource.indexOf("getTerraformLeaveReplayTarget(target)", documentClickIndex);

  assert.ok(requestViewIndex > -1);
  assert.ok(requestViewEditorBypassIndex > requestViewIndex);
  assert.ok(requestViewEditorBypassIndex < requestViewLeaveGuardIndex);
  assert.ok(collapsedViewIndex > -1);
  assert.ok(collapsedViewEditorBypassIndex > collapsedViewIndex);
  assert.ok(collapsedViewEditorBypassIndex < collapsedViewLeaveGuardIndex);
  assert.ok(editorNavigationTargetIndex > documentClickIndex);
  assert.ok(editorNavigationTargetIndex < replayTargetIndex);
  assert.match(componentSource, /data-terraform-editor-navigation/);
  assert.match(componentSource, /isTerraformEditorNavigationTarget/);
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

test("terraform preview failures mark previous files stale instead of synced", () => {
  assert.match(terraformPanelSource, /latestSuccessfulTerraformPreviewFingerprintRef/);
  assert.match(terraformPanelSource, /isTerraformPreviewStale/);
  assert.match(terraformPanelSource, /Terraform Preview 생성 실패/);
  assert.match(terraformPanelSource, /이전 Preview 표시 중/);
  assert.match(terraformPanelSource, /setIsTerraformPreviewStale\(true\)/);
  assert.doesNotMatch(terraformPanelSource, /setStatusMessage\("그래프 기준으로 동기화됨"\);\s*latestDiagramFingerprintRef\.current = diagramFingerprint;\s*[\s\S]*catch/);
});

test("terraform status counts only the synced preview snapshot", () => {
  assert.match(terraformPanelSource, /previewSnapshotSummary/);
  assert.match(terraformPanelSource, /isTerraformPreviewSynced/);
  assert.match(terraformPanelSource, /다이어그램 변경 미반영/);
  assert.match(terraformPanelSource, /previewSnapshotSummary/);
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

test("blocked terraform leave save reveals the terraform panel when diagnostics explain the failure", () => {
  assert.match(componentSource, /latestTerraformDiagnosticsRef/);
  assert.match(componentSource, /handleTerraformDiagnosticsChange/);
  assert.match(componentSource, /latestTerraformDiagnosticsRef\.current = diagnostics/);
  assert.match(componentSource, /onDiagnosticsChange=\{handleTerraformDiagnosticsChange\}/);
  assert.match(componentSource, /hasBlockingDiagnostics/);
  assert.match(componentSource, /shouldRevealTerraformPanel/);
  assert.match(componentSource, /pendingTerraformLeaveActionRef\.current = null/);
  assert.match(componentSource, /context\.setRightPanelOpen\(true\)/);
  assert.match(componentSource, /setActiveView\("terraform"\)/);
  assert.match(componentSource, /setShowTerraformLeaveDialog\(false\)/);
});

test("terraform leave save ignores stale external save completions", () => {
  assert.match(componentSource, /latestTerraformSaveRequestIdRef/);
  assert.match(componentSource, /latestTerraformSaveRequestIdRef\.current = nextRequestId/);
  assert.match(componentSource, /handleTerraformExternalSaveComplete\(saved: boolean, requestId: number\)/);
  assert.match(componentSource, /requestId !== latestTerraformSaveRequestIdRef\.current/);
  assert.match(terraformPanelSource, /onExternalSaveComplete\(saved, externalSaveRequestId\)/);
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

test("GitHub connection opens the in-app repository chooser before install handoff", () => {
  const startGitHubConnectionIndex = deploymentPanelSource.indexOf(
    "function startGitHubConnection"
  );
  const createHandoffIndex = deploymentPanelSource.indexOf(
    "async function createGitCicdAutoDeployHandoff",
    startGitHubConnectionIndex
  );
  const startGitHubConnectionSource = deploymentPanelSource.slice(
    startGitHubConnectionIndex,
    createHandoffIndex
  );

  assert.ok(startGitHubConnectionIndex > -1);
  assert.match(startGitHubConnectionSource, /setShowGitHubRepositoryChooser\(true\)/);
  assert.match(startGitHubConnectionSource, /listGitHubInstalledRepositories\(projectId\)/);
  assert.doesNotMatch(startGitHubConnectionSource, /createGitHubSourceRepositoryInstallUrl/);
  assert.match(deploymentPanelSource, /showGitHubRepositoryChooser/);
  assert.match(deploymentPanelSource, /connectInstalledGitHubRepository/);
  assert.match(deploymentPanelSource, /installedGitHubRepositorySelection/);
  assert.match(deploymentPanelSource, /knownGitHubSourceRepositories/);
  assert.match(deploymentPanelSource, /GitHub App 설치\/권한 추가/);
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
  assert.doesNotMatch(aiChatDockSource, /runAiPreDeploymentCheck/);
  assert.doesNotMatch(aiChatDockSource, /WorkspaceAiPreDeploymentResult/);
  assert.match(preflightSummaryRule, /\bgap:\s*8px;/);
});

test("pre-deployment check renders per-finding explanations without the blue summary block", () => {
  assert.doesNotMatch(deploymentPanelSource, /DeploymentPreDeploymentAiExplanation/);
  assert.doesNotMatch(deploymentPanelSource, /deploymentPreflightAiExplanation/);
  assert.doesNotMatch(stylesSource, /\.deploymentPreflightAiExplanation\s*\{/);
  assert.match(deploymentPanelSource, /DeploymentFindingAiExplanation/);
  assert.match(deploymentPanelSource, /finding\.aiSafetyExplanation/);
  assert.match(deploymentPanelSource, /className=\{styles\.deploymentFindingAiExplanation\}/);
  assert.doesNotMatch(deploymentPanelSource, /deploymentFindingAiButton/);
  assert.doesNotMatch(aiChatDockSource, /preDeploymentAnalysis/);
});

test("pre-deployment finding fix buttons open the existing terraform source location handler", () => {
  assert.match(deploymentPanelSource, /onOpenFindingTerraformSource/);
  assert.match(deploymentPanelSource, /className=\{styles\.deploymentFindingFixButton\}/);
  assert.match(deploymentPanelSource, /<Code2 size=\{13\} aria-hidden="true" \/>/);
  assert.match(componentSource, /getPreDeploymentFindingTerraformSourceLocation/);
  assert.match(componentSource, /openPreDeploymentFindingTerraformSource/);
  assert.match(componentSource, /terraformPanelRef\.current\?\.getTerraformFiles\(\)/);
  assert.match(componentSource, /setActiveView\("terraform"\)/);
  assert.match(componentSource, /terraformPanelRef\.current\?\.openTerraformSourceLocation\(sourceLocation\)/);
  assert.match(componentSource, /onOpenFindingTerraformSource=\{openPreDeploymentFindingTerraformSource\}/);
});

test("terraform errors surface as an issues banner and AI resolution lives in the chat dock", () => {
  const issueBannerRule = getCssRule(stylesSource, "terraformIssueBanner");
  const aiButtonRule = getCssRule(stylesSource, "terraformDiagnosticAiButton");

  assert.match(terraformPanelSource, /runAiTerraformErrorExplanation/);
  assert.match(terraformPanelSource, /terraformErrorExplanationsByKey/);
  assert.match(terraformPanelSource, /className=\{styles\.terraformErrorExplanationPanel\}/);
  assert.match(terraformPanelSource, /오류를 해석하는 중입니다/);
  assert.match(terraformPanelSource, /className=\{styles\.terraformIssueBanner\}/);
  assert.match(terraformPanelSource, /Issues 탭으로 이동/);
  assert.match(componentSource, /readStoredTerraformIssues/);
  assert.match(componentSource, /markTerraformIssuesStale/);
  assert.match(componentSource, /mergeTerraformValidationDiagnostics/);
  assert.match(componentSource, /storeTerraformIssues/);
  assert.match(componentSource, /loadedTerraformIssuesProjectId/);
  assert.match(componentSource, /storeTerraformIssues\(window\.localStorage, projectId, terraformIssues\)/);
  assert.match(componentSource, /<TerraformIssuesPanel issues=\{terraformIssues\}/);
  assert.match(aiChatDockSource, /runAiTerraformErrorExplanation/);
  assert.match(aiChatDockSource, /terraform_issue/);
  assert.doesNotMatch(aiChatDockSource, /selectTerraformIssueWellArchitectedConclusion/);
  assert.doesNotMatch(aiChatDockSource, /Well-Architected/);
  assert.match(aiChatDockSource, /onApplyTerraformIssueFix/);
  assert.match(issueBannerRule, /\bbackground:\s*#fff7ed;/);
  assert.match(aiButtonRule, /\bbackground:\s*var\(--bp-blue\);/);
});

test("terraform issue AI resolution shows a fix plan before apply", () => {
  assert.match(aiChatDockSource, /createTerraformIssueFixPlan/);
  assert.match(aiChatDockSource, /terraformIssueFixPlan/);
  assert.match(aiChatDockSource, /수정 계획/);
  assert.match(aiChatDockSource, /fixPlan\.canApply/);
  assert.match(aiChatDockSource, /fixPlan\.providerNotice/);
  assert.match(aiChatDockSource, /terraformIssueFixPlanNotice/);
  assert.match(aiChatDockSource, /fixPlan\.codeFrame/);
  assert.match(aiChatDockSource, /fixPlan\.plainExplanation/);
  assert.match(aiChatDockSource, /fixPlan\.fixExplanation/);
  assert.match(aiChatDockSource, /terraformIssueCodeFrame/);
  assert.match(aiChatDockSource, /fixPlan\.codePreview/);
  assert.match(aiChatDockSource, /현재 코드/);
  assert.match(aiChatDockSource, /수정할 코드/);
  assert.match(aiChatDockSource, /수정 중/);
  assert.match(componentSource, /getCurrentTerraformCode/);
  assert.match(terraformPanelSource, /codePreview\.source === "safe_fix"/);
});

test("terraform issue AI fix keeps remaining diagnostics visible after a partial repair", () => {
  const safeFixIndex = terraformPanelSource.indexOf("const applyTerraformSafeFixToCode");
  const originalDiagnosticIndex = terraformPanelSource.indexOf(
    "stillHasOriginalDiagnostic",
    safeFixIndex
  );
  const remainingDiagnosticsIndex = terraformPanelSource.indexOf(
    "if (hasBlockingTerraformDiagnostic(validationDiagnostics))",
    originalDiagnosticIndex
  );
  const syncIndex = terraformPanelSource.indexOf("const syncResult = await syncTerraformToDiagram", remainingDiagnosticsIndex);

  assert.ok(safeFixIndex > -1);
  assert.ok(originalDiagnosticIndex > safeFixIndex);
  assert.ok(remainingDiagnosticsIndex > originalDiagnosticIndex);
  assert.ok(syncIndex > remainingDiagnosticsIndex);
  assert.match(terraformPanelSource, /combineTerraformDiagnostics\(validationDiagnostics, syncResult\.diagnostics\)/);
});

test("terraform issue AI resolution can close the chat dock without trapping the issue card", () => {
  assert.match(aiChatDockSource, /function closeChatDock/);
  assert.match(aiChatDockSource, /setTerraformIssueResolution\(null\)/);
  assert.match(aiChatDockSource, /setApplyingTerraformFixRequestId\(null\)/);
  assert.match(aiChatDockSource, /onClick=\{closeChatDock\}/);
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

  assert.match(terraformPanelSource, /createTerraformDiagnosticLineNumbers/);
  assert.match(terraformPanelSource, /createTerraformHighlightedLines/);
  assert.match(terraformPanelSource, /diagnosticLineNumbers/);
  assert.match(terraformPanelSource, /terraformSyntaxHighlightLayer/);
  assert.match(terraformPanelSource, /terraformHighlightedLineError/);
  assert.match(terraformPanelSource, /terraformTokenKeyword/);
  assert.match(terraformPanelSource, /terraformLineNumberError/);
  assert.match(terraformPanelSource, /diagnosticLineNumberSet\.has\(lineNumber\)/);
  assert.doesNotMatch(terraformPanelSource, /lineHeight:\s*TERRAFORM_EDITOR_LINE_HEIGHT/);
  assert.doesNotMatch(terraformPanelSource, /verticalPadding:\s*TERRAFORM_EDITOR_VERTICAL_PADDING/);
  assert.doesNotMatch(terraformPanelSource, /terraformDiagnosticLineLayer/);
  assert.match(syntaxHighlightLayerRule, /\bpointer-events:\s*none;/);
  assert.match(syntaxHighlightLayerRule, /\bposition:\s*absolute;/);
  assert.match(highlightedLineErrorRule, /\btext-decoration-style:\s*wavy;/);
  assert.match(highlightedLineErrorRule, /\btext-decoration-color:\s*#ef4444;/);
  assert.match(textareaRule, /\bcolor:\s*transparent;/);
  assert.match(textareaRule, /\bcaret-color:\s*#d7e4f7;/);
  assert.match(keywordRule, /\bcolor:\s*#f6c85f;/);
  assert.match(identifierRule, /\bcolor:\s*#7fd2ff;/);
  assert.match(referenceRule, /\bcolor:\s*#5fe0c1;/);
  assert.match(stringRule, /\bcolor:\s*#f0a77d;/);
  assert.match(braceRule, /\bcolor:\s*#9bd7ff;/);
  assert.match(lineNumberErrorRule, /\bcolor:\s*#fca5a5;/);
});

test("terraform preview explanation is triggered from the terraform code panel", () => {
  assert.match(terraformPanelSource, /highlightedBlock\.code/);
  assert.match(terraformPanelSource, /displayedTerraformCode/);
  assert.match(terraformPanelSource, /onTerraformPreviewAiRequest/);
  assert.match(componentSource, /onTerraformPreviewAiRequest/);
  assert.match(workspaceDraftManagerSource, /terraformPreviewAiRequest/);
  assert.match(aiChatDockSource, /runAiTerraformPreviewExplanation/);
  assert.match(aiChatDockSource, /WorkspaceAiTerraformPreviewResult/);
  assert.match(aiChatDockSource, /activeChatTab === "preview"/);
  assert.match(aiChatDockSource, /Preview 설명/);
  assert.doesNotMatch(aiChatDockSource, /WorkspaceAiTerraformPanel/);
  assert.doesNotMatch(terraformPanelSource, /className=\{styles\.terraformPreviewExplanationPanel\}/);
  assert.doesNotMatch(terraformPanelSource, /closeTerraformPreviewExplanation/);
  assert.doesNotMatch(terraformPanelSource, /setTerraformPreviewExplanation/);
  assert.doesNotMatch(terraformPanelSource, /checklist\.length\} Checks/);
});

test("terraform resource code mode keeps explanation but omits validation and deployment actions", () => {
  assert.match(terraformPanelSource, /renderTerraformPreviewExplanationButton\(\)/);
  assert.doesNotMatch(terraformPanelSource, /<span>Validate<\/span>/);
  assert.doesNotMatch(terraformPanelSource, />\s*Validate\s*<\/button>/);
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

test("terraform editor labels inline validation as fast Terraform error checking without progress UI", () => {
  const topBarRule = getCssRule(stylesSource, "terraformTopBar");
  const topActionsRule = getCssRule(stylesSource, "terraformTopActions");

  assert.doesNotMatch(terraformPanelSource, /terraformValidationProgressBar/);
  assert.doesNotMatch(terraformPanelSource, /TerraformValidationProgress/);
  assert.doesNotMatch(terraformPanelSource, /기본 문법 확인 중/);
  assert.match(terraformPanelSource, /Terraform 오류 확인 중/);
  assert.doesNotMatch(terraformPanelSource, /Terraform 검증 준비 중/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressBar\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressWorking\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressDone\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressError\s*\{/);
  assert.match(topBarRule, /\bflex-wrap:\s*wrap;/);
  assert.match(topActionsRule, /\bflex-wrap:\s*wrap;/);
});

test("terraform panel does not warm provider validation when the panel becomes visible", () => {
  assert.doesNotMatch(terraformPanelSource, /prepareTerraformValidationWorkspace/);
  assert.doesNotMatch(terraformPanelSource, /preparedValidationProjectIdsRef/);
  assert.doesNotMatch(terraformPanelSource, /Terraform 검증 준비 중/);
});

test("terraform save and manual validate send the whole virtual file set", () => {
  assert.doesNotMatch(terraformPanelSource, /mode: "full"/);
  assert.doesNotMatch(terraformPanelSource, /mode: "static"/);
  assert.doesNotMatch(terraformPanelSource, /TerraformValidationMode/);
  assert.match(terraformPanelSource, /terraformFiles:\s*toTerraformValidationFiles\(terraformFiles\)/);
  assert.match(terraformPanelSource, /terraformCode:\s*terraformFiles\.length > 0 \? "" : combinedTerraformCode/);
  assert.doesNotMatch(terraformPanelSource, /validateTerraformCode\(displayedTerraformCode\)/);
});

test("terraform save modal invalidates stale external save completions when user continues or discards", () => {
  const continueIndex = componentSource.indexOf("function continueTerraformEditing");
  const discardIndex = componentSource.indexOf("function discardTerraformChanges");
  const saveCompleteIndex = componentSource.indexOf("function handleTerraformExternalSaveComplete");

  assert.ok(continueIndex > -1);
  assert.ok(discardIndex > -1);
  assert.ok(saveCompleteIndex > -1);
  assert.ok(
    componentSource.indexOf("invalidatePendingTerraformSaveCompletion()", continueIndex) >
      continueIndex
  );
  assert.ok(
    componentSource.indexOf("invalidatePendingTerraformSaveCompletion()", discardIndex) >
      discardIndex
  );
  assert.match(componentSource, /requestId !== latestTerraformSaveRequestIdRef\.current/);
});

test("terraform sync proposals are auto-applied on explicit save without asking again", () => {
  assert.match(terraformPanelSource, /terraformFiles:\s*toTerraformValidationFiles\(terraformFiles\)/);
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

test("terraform virtual file validation avoids request bursts and combined-code empty checks", () => {
  assert.doesNotMatch(terraformPanelSource, /Promise\.all\(\s*files/);
  assert.match(terraformPanelSource, /nextFiles\.some\(\(file\) => file\.code\.trim\(\)\.length > 0\)/);
  assert.doesNotMatch(terraformPanelSource, /combineTerraformFiles\(nextFiles\)\.trim\(\)\.length > 0/);
});

test("terraform editor keeps diagnostics visible after local edits", () => {
  const handleCodeChangeIndex = terraformPanelSource.indexOf("function handleCodeChange");
  const handleCodeChangeEndIndex = terraformPanelSource.indexOf("function handleCodeKeyDown", handleCodeChangeIndex);
  const handleCodeChangeSource = terraformPanelSource.slice(handleCodeChangeIndex, handleCodeChangeEndIndex);

  assert.ok(handleCodeChangeIndex > -1);
  assert.ok(handleCodeChangeEndIndex > handleCodeChangeIndex);
  assert.match(handleCodeChangeSource, /codeVersionRef\.current \+= 1/);
  assert.doesNotMatch(handleCodeChangeSource, /setDiagnostics\(\[\]\)/);
  assert.doesNotMatch(handleCodeChangeSource, /onDiagnosticsChange\(\[\]\)/);
  assert.match(componentSource, /markTerraformIssuesStale/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function readFeatureFile(filePath: string): string {
  return readFileSync(fileURLToPath(new URL(filePath, import.meta.url)), "utf8");
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
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
