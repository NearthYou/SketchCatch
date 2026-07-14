import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const componentSource = readWorkspaceFile("WorkspaceRightPanel.tsx");
const aiChatDockSource = readWorkspaceFile("WorkspaceAiChatDock.tsx");
const aiPanelSource = readWorkspaceFile("WorkspaceAiPanel.tsx");
const deploymentShellSource = readWorkspaceFile("DeploymentConsoleShell.tsx");
const directDeploymentSource = readWorkspaceFile("DirectDeploymentScreen.tsx");
const cicdConsoleSource = readWorkspaceFile("CicdConsoleScreen.tsx");
const deploymentPanelSource = [
  readWorkspaceFile("DeploymentPanel.tsx"),
  deploymentShellSource,
  directDeploymentSource,
  cicdConsoleSource,
  readWorkspaceFile("CicdMonitoringSettings.tsx")
].join("\n");
const diagramEditorSource = readFeatureFile("../diagram-editor/DiagramEditor.tsx");
const flowMappersSource = readFeatureFile("../diagram-editor/flow-mappers.ts");
const resourceWorkspaceSource = readWorkspaceFile("ResourceWorkspacePanel.tsx");
const resourceListSource = readWorkspaceFile("ResourceListPanel.tsx");
const resourceCardMenuSource = readWorkspaceFile("ResourceCardMenu.tsx");
const resourceWorkspaceStylesSource = readWorkspaceFile("resource-workspace.module.css");
const diagramEditorTypesSource = readFeatureFile("../diagram-editor/types.ts");
const terraformLeaveDialogSource = readWorkspaceFile("TerraformLeaveDialog.tsx");
const terraformEditorSource = readWorkspaceFile("TerraformCodeEditorSurface.tsx");
const terraformEditorStylesSource = readWorkspaceFile("TerraformCodeEditorSurface.module.css");
const terraformPanelSource = readWorkspaceFile("TerraformCodePanel.tsx");
const terraformPanelUtilsSource = readWorkspaceFile("terraform-panel-utils.ts");
const terraformStatusSource = readWorkspaceFile("TerraformCodeStatus.tsx");
const terraformStatusStylesSource = readWorkspaceFile("TerraformCodeStatus.module.css");
const terraformToolbarSource = readWorkspaceFile("TerraformCodeToolbar.tsx");
const terraformToolbarStylesSource = readWorkspaceFile("TerraformCodeToolbar.module.css");
const terraformIssuesPanelSource = readWorkspaceFile("TerraformIssuesPanel.tsx");
const terraformIssuesStylesSource = readWorkspaceFile("TerraformIssuesPanel.module.css");
const architectureIssuesPanelSource = readWorkspaceFile("ArchitectureIssuesPanel.tsx");
const workspaceIssuesPanelSource = readWorkspaceFile("WorkspaceIssuesPanel.tsx");
const workspaceIssuesStylesSource = readWorkspaceFile("WorkspaceIssuesPanel.module.css");
const workspaceRightPanelTypesSource = readWorkspaceFile("workspace-right-panel.types.ts");
const projectDraftManagerSource = readWorkspaceFile("ProjectWorkspaceDraftManager.tsx");
const workspaceDraftManagerSource = readWorkspaceFile("WorkspaceDraftManager.tsx");
const workspaceStartSource = readFeatureFile("../../app/workspace/new/workspace-start-client.tsx");
const stylesSource = readWorkspaceFile("workspace.module.css");
const diagramEditorStylesSource = readFeatureFile("../diagram-editor/diagram-editor.module.css");

test("deploy opens a full-screen console instead of rendering deployment inside the right panel", () => {
  const deploymentConsoleIndex = componentSource.search(
    /const deploymentConsoleContent =\s*isDeploymentConsoleOpen && canRenderDeploymentPortal \? \(/
  );
  const deploymentPanelIndex = componentSource.indexOf("<DeploymentPanel", deploymentConsoleIndex);
  const nextRightPanelViewIndex = componentSource.indexOf(
    "<div className={styles.rightPanelView}",
    deploymentPanelIndex
  );
  const fullscreenHostRule = getCssRule(stylesSource, "deploymentPanelFullscreenHost");
  const pendingDeploymentConsoleBranch = componentSource.slice(
    componentSource.indexOf('if (pendingAction.kind === "deployment-console")'),
    componentSource.indexOf('if (pendingAction.kind === "right-panel-close")')
  );

  assert.notEqual(deploymentConsoleIndex, -1);
  assert.notEqual(deploymentPanelIndex, -1);
  assert.ok(deploymentPanelIndex < nextRightPanelViewIndex);
  assert.match(
    componentSource,
    /const \[isDeploymentConsoleOpen, setIsDeploymentConsoleOpen\] = useState\(\s*initialView === "deployment"\s*\);/
  );
  assert.match(componentSource, /fullScreenOnly/);
  assert.match(componentSource, /initialExpanded/);
  assert.match(componentSource, /import \{ createPortal \} from "react-dom";/);
  assert.match(componentSource, /isDeploymentConsoleOpen && canRenderDeploymentPortal/);
  assert.match(componentSource, /createPortal\(deploymentConsoleContent, document\.body\)/);
  assert.match(componentSource, /onExpandedClose=\{\(\) => setIsDeploymentConsoleOpen\(false\)\}/);
  assert.match(componentSource, /openDeploymentConsole/);
  assert.match(componentSource, /setIsDeploymentConsoleOpen\(true\);/);
  assert.match(pendingDeploymentConsoleBranch, /setIsDeploymentConsoleOpen\(true\);/);
  assert.doesNotMatch(pendingDeploymentConsoleBranch, /context\.setRightPanelOpen\(false\);/);
  assert.match(
    deploymentPanelSource,
    /const isDeploymentOverlayOpen = fullScreenOnly \|\| isDeploymentExpanded;/
  );
  assert.match(deploymentPanelSource, /\{isDeploymentOverlayOpen \? \(/);
  assert.match(deploymentPanelSource, /size=\{isDeploymentOverlayOpen \? "large" : "regular"\}/);
  assert.match(fullscreenHostRule, /\bdisplay:\s*contents;/);
  assert.doesNotMatch(componentSource, /hidden=\{activeView !== "deployment"\}/);
  assert.doesNotMatch(componentSource, /aria-pressed=\{activeView === "deployment"\}/);
  assert.doesNotMatch(componentSource, /onClick=\{\(\) => requestView\("deployment"\)\}/);

  const rightPanelBodySource = componentSource.slice(
    componentSource.indexOf("<div className={styles.rightPanelView}"),
    componentSource.lastIndexOf("{showTerraformLeaveDialog ? (")
  );
  assert.doesNotMatch(rightPanelBodySource, /<DeploymentPanel/);

  const deploymentPanelRule = getCssRule(stylesSource, "deploymentPanel");
  const deploymentPanelContentRule = getCssRule(stylesSource, "deploymentPanelContent");

  assert.match(deploymentPanelRule, /\bheight:\s*100%;/);
  assert.match(deploymentPanelRule, /\bmin-height:\s*0;/);
  assert.match(deploymentPanelRule, /\boverflow:\s*hidden;/);
  assert.match(deploymentPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(deploymentPanelContentRule, /\bmin-height:\s*0;/);
  assert.match(deploymentPanelContentRule, /\boverflow-y:\s*auto;/);
});

test("workspace owners explicitly gate Deployment availability", () => {
  assert.match(workspaceDraftManagerSource, /deploymentAvailability="project_required"/);
  assert.match(projectDraftManagerSource, /deploymentAvailability="enabled"/);
  assert.match(componentSource, /deploymentAvailability=\{deploymentAvailability\}/);
  assert.match(deploymentPanelSource, /canLoadDeploymentData\(deploymentAvailability\)/);
});

test("Deployment context labels only Terraform-deployable board nodes as resources", () => {
  assert.match(componentSource, /isTerraformDeployableNode/);
  assert.match(componentSource, /deployableResourceCount=\{deployableResourceCount\}/);
  assert.doesNotMatch(componentSource, /currentNodeCount=\{context\.nodes\.length\}/);
  assert.match(deploymentPanelSource, /\{deployableResourceCount\} resources/);
  assert.doesNotMatch(deploymentPanelSource, /currentNodeCount|board nodes/);
});

test("right panel width stays locked after deployment leaves the panel", () => {
  const rightRailRule = getCssRule(diagramEditorStylesSource, "rightRail");
  const rightPanelShellRule = getCssRule(stylesSource, "rightPanelShell");
  const rightPanelViewRule = getCssRule(stylesSource, "rightPanelView");

  assert.match(rightRailRule, /\bmin-width:\s*0;/);
  assert.match(rightRailRule, /\bmax-width:\s*100%;/);
  assert.match(rightPanelShellRule, /\bmin-width:\s*0;/);
  assert.match(rightPanelShellRule, /\bmax-width:\s*100%;/);
  assert.match(rightPanelShellRule, /\bwidth:\s*100%;/);
  assert.match(rightPanelViewRule, /\bmin-width:\s*0;/);
  assert.match(rightPanelViewRule, /\bmax-width:\s*100%;/);
});

test("workspace managers restore the saved DiagramJson through one identity-preserving boundary", () => {
  assert.match(
    projectDraftManagerSource,
    /restoreSavedDiagram\(loadedDraft\.diagramJson, EMPTY_DIAGRAM\)/
  );
  assert.match(
    workspaceDraftManagerSource,
    /restoreSavedDiagram\(storedLocalDraft\?\.diagramJson, EMPTY_DIAGRAM\)/
  );
});

test("workspace rails keep stable widths while docking beside the canvas", () => {
  const editorShellRule = getCssRule(diagramEditorStylesSource, "editorShell");

  assert.match(diagramEditorSource, /const DEFAULT_LEFT_PANEL_WIDTH = 346;/);
  assert.match(diagramEditorSource, /const DEFAULT_RIGHT_PANEL_WIDTH = 440;/);
  assert.match(diagramEditorSource, /leftPanelWidth\.brainboardV1/);
  assert.match(diagramEditorSource, /rightPanelWidth\.brainboardV1/);
  assert.match(editorShellRule, /--left-panel-width:\s*346px;/);
  assert.match(editorShellRule, /--right-panel-width:\s*440px;/);
  assert.match(
    diagramEditorStylesSource,
    /\.leftRail\s*\{[^}]*\bgrid-row:\s*2;[^}]*\bposition:\s*relative;/s
  );
  assert.match(
    diagramEditorStylesSource,
    /\.rightRail\s*\{[^}]*\bgrid-row:\s*2;[^}]*\bposition:\s*relative;/s
  );
  assert.match(
    diagramEditorStylesSource,
    /@media \(max-width: 1120px\)\s*\{[\s\S]*?\.leftRail\s*\{[^}]*\bposition:\s*fixed;/s
  );
});

test("workspace shell follows DESIGN.md neutral surface and typography tokens", () => {
  const editorShellRule = getCssRule(diagramEditorStylesSource, "editorShell");
  const workspaceRule = getCssRule(diagramEditorStylesSource, "workspace");
  const canvasPanelRule = getCssRule(diagramEditorStylesSource, "canvasPanel");
  const canvasToolbarRule = getCssRule(diagramEditorStylesSource, "canvasToolbar");
  const projectBarRule = getCssRule(diagramEditorStylesSource, "projectBar");
  const projectBarBrandRule = getCssRule(diagramEditorStylesSource, "projectBarBrand");
  const projectShellRule = getCssRule(stylesSource, "projectShell");
  const primaryButtonRule = getCssRule(stylesSource, "primaryButton");
  const rightPanelShellRule = getCssRule(stylesSource, "rightPanelShell");
  const rightPanelModeBarRule = getCssRule(stylesSource, "rightPanelModeBar");
  const rightPanelViewRule = getCssRule(stylesSource, "rightPanelView");
  const panelModeTextButtonRuleIndex = stylesSource.indexOf(".panelModeTextButton {");
  const panelModeTextButtonActiveRule = getCssRuleAfter(
    stylesSource,
    "panelModeTextButtonActive",
    panelModeTextButtonRuleIndex
  );

  assert.match(
    editorShellRule,
    /--workspace-font:\s*"Pretendard", "Noto Sans KR", Inter, Geist, sans-serif;/
  );
  assert.match(editorShellRule, /--workspace-page:\s*#ffffff;/);
  assert.match(editorShellRule, /--workspace-surface-muted:\s*#fafafa;/);
  assert.match(editorShellRule, /--workspace-line:\s*#f0f0f3;/);
  assert.match(editorShellRule, /--workspace-line-strong:\s*#dcdee0;/);
  assert.match(editorShellRule, /--workspace-text:\s*#171717;/);
  assert.match(editorShellRule, /--workspace-muted:\s*#60646c;/);
  assert.match(editorShellRule, /--workspace-accent:\s*#000000;/);
  assert.match(editorShellRule, /--workspace-link:\s*#0d74ce;/);
  assert.match(editorShellRule, /--board-canvas:\s*#f6f8fc;/);
  assert.match(editorShellRule, /\bfont-family:\s*var\(--workspace-font\);/);

  assert.match(workspaceRule, /\bbackground:\s*var\(--workspace-page\);/);
  assert.doesNotMatch(workspaceRule, /linear-gradient|#f6f8fc/);
  assert.match(canvasPanelRule, /\bbackground:\s*var\(--board-canvas\);/);
  assert.doesNotMatch(canvasPanelRule, /#f8faff/);
  assert.match(canvasToolbarRule, /\bborder:\s*1px solid var\(--workspace-line\);/);
  assert.match(projectBarRule, /\bbackground:\s*var\(--workspace-surface\);/);
  assert.match(projectBarRule, /\bborder-bottom:\s*1px solid var\(--workspace-line\);/);
  assert.match(projectBarBrandRule, /\bbackground:\s*transparent;/);
  assert.match(projectBarBrandRule, /\bcolor:\s*var\(--workspace-text\);/);

  assert.match(projectShellRule, /\bbackground:\s*#ffffff;/);
  assert.match(projectShellRule, /\bcolor:\s*#171717;/);
  assert.match(primaryButtonRule, /\bbackground:\s*#000000;/);
  assert.match(primaryButtonRule, /\bborder:\s*1px solid #000000;/);
  assert.match(primaryButtonRule, /\bborder-radius:\s*8px;/);
  assert.match(rightPanelShellRule, /\bfont-family:\s*var\(--workspace-font,/);
  assert.match(rightPanelShellRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(rightPanelModeBarRule, /\bborder-bottom:\s*1px solid var\(--workspace-line,/);
  assert.match(rightPanelViewRule, /\bbackground:\s*var\(--workspace-surface-muted,/);
  assert.match(panelModeTextButtonActiveRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(panelModeTextButtonActiveRule, /\bborder-color:\s*var\(--workspace-accent,/);
  assert.match(panelModeTextButtonActiveRule, /\bcolor:\s*#ffffff;/);

  const oldLandingAccentTokens =
    /#7357ff|#5f3de8|#6f4cf6|#f4f1ff|#d8ceff|#1f6feb|#f6f7fb|#f4f7fb|#fafbfe/i;

  for (const shellRule of [
    workspaceRule,
    canvasPanelRule,
    canvasToolbarRule,
    projectBarRule,
    projectBarBrandRule,
    projectShellRule,
    primaryButtonRule,
    rightPanelShellRule,
    rightPanelModeBarRule,
    rightPanelViewRule,
    panelModeTextButtonActiveRule
  ]) {
    assert.doesNotMatch(shellRule, oldLandingAccentTokens);
  }
});

test("save confirmation stays inside compact workspace viewports", () => {
  assert.match(stylesSource, /\.serverSaveToast\s*{[\s\S]*?box-sizing:\s*border-box;/);
  assert.match(
    stylesSource,
    /@media\s*\(max-width:\s*900px\)[\s\S]*?\.serverSaveToast\s*{[\s\S]*?max-width:\s*calc\(100vw\s*-\s*24px\);[\s\S]*?right:\s*12px;/
  );
});

test("mobile AI launcher and canvas toolbar keep their compact placements", () => {
  assert.match(
    stylesSource,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.aiChatLauncher,[\s\S]*?bottom:\s*76px;/
  );
  assert.match(
    diagramEditorStylesSource,
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.canvasToolbar\s*{[^}]*left:\s*10px;[^}]*max-height:\s*calc\(100% - 20px\);/
  );
});

test("workspace internal panels keep only the DESIGN.md surface layer", () => {
  const finalPolishIndex = stylesSource.indexOf("/* DESIGN.md workspace internal panel pass */");
  const directDeploymentConsoleIndex = stylesSource.indexOf("/* Direct Deployment console */");

  assert.ok(finalPolishIndex > -1, "Expected the workspace panel polish block to exist");
  assert.doesNotMatch(stylesSource, /Legacy workspace panel compatibility layer/);
  assert.doesNotMatch(stylesSource, /Legacy right panel sizing compatibility layer/);
  assert.doesNotMatch(stylesSource, /var\(--bp-/);
  assert.doesNotMatch(stylesSource, /var\(--bb-/);
  assert.doesNotMatch(stylesSource, /\/\* Blueprint panel polish pass \*\//);
  assert.doesNotMatch(stylesSource, /\/\* Brainboard right panel reproduction \*\//);
  assert.doesNotMatch(flowMappersSource, /var\(--bp-head\)/);

  const polishedRightPanelShellRule = getLastCssRuleAfter(
    stylesSource,
    "rightPanelShell",
    finalPolishIndex
  );
  const polishedTerraformPanelRule = getLastCssRuleAfter(
    stylesSource,
    "terraformPanel",
    finalPolishIndex
  );
  const polishedIssuesPanelRule = getCssRule(terraformIssuesStylesSource, "issuesPanel");
  const polishedPanelModeTextButtonActiveRule = getLastCssRuleAfter(
    stylesSource,
    "panelModeTextButtonActive",
    finalPolishIndex
  );
  const polishedAiPanelHeaderRule = getLastCssRuleAfter(
    stylesSource,
    "aiPanelHeader",
    finalPolishIndex
  );
  const polishedDeploymentHeaderRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentHeader",
    finalPolishIndex
  );
  const polishedDeploymentExpandedShellRule = getCssRuleAfter(
    stylesSource,
    "deploymentExpandedShell",
    directDeploymentConsoleIndex
  );
  const polishedDeploymentExpandedBodyRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentExpandedBody",
    finalPolishIndex
  );
  const polishedDeploymentStageStepperRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentStageStepper",
    finalPolishIndex
  );
  const polishedDeploymentStageDotRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentStageDot",
    finalPolishIndex
  );
  const polishedDeploymentStageActionCardRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentStageActionCard",
    finalPolishIndex
  );
  const polishedDeploymentStageSummaryPanelRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentStageSummaryPanel",
    finalPolishIndex
  );
  const polishedTerraformPreviewButtonRule = getLastCssRuleAfter(
    stylesSource,
    "terraformPreviewButton",
    finalPolishIndex
  );
  const polishedAiPrimaryButtonRule = getLastCssRuleAfter(
    stylesSource,
    "aiPrimaryButton",
    finalPolishIndex
  );
  const polishedDeploymentPrimaryButtonRule = getLastCssRuleAfter(
    stylesSource,
    "deploymentPrimaryButton",
    finalPolishIndex
  );
  const polishedAiChatLauncherRule = getLastCssRuleAfter(
    stylesSource,
    "aiChatLauncher",
    finalPolishIndex
  );
  const polishedAiChatDockRule = getLastCssRuleAfter(stylesSource, "aiChatDock", finalPolishIndex);
  const polishedAiChatTranscriptRule = getLastCssRuleAfter(
    stylesSource,
    "aiChatTranscript",
    finalPolishIndex
  );
  const polishedAiChatSendButtonRule = getLastCssRuleAfter(
    stylesSource,
    "aiChatSendButton",
    finalPolishIndex
  );
  const polishedIconButtonActiveRule = getLastCssRuleContainingAfter(
    stylesSource,
    ".panelModeIconGroup .panelModeButtonActive",
    finalPolishIndex
  );
  const polishedTextButtonActiveHoverRule = getLastCssRuleContainingAfter(
    stylesSource,
    ".panelModeTextButtonActive:hover",
    finalPolishIndex
  );

  assert.match(polishedRightPanelShellRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(polishedRightPanelShellRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(polishedRightPanelShellRule, /\bfont-family:\s*var\(--workspace-font,/);
  assert.match(polishedTerraformPanelRule, /\bbackground:\s*var\(--workspace-surface-muted,/);
  assert.match(polishedIssuesPanelRule, /\bbackground:\s*var\(--workspace-surface-muted,/);
  assert.match(polishedPanelModeTextButtonActiveRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(polishedPanelModeTextButtonActiveRule, /\bcolor:\s*#ffffff;/);
  assert.match(polishedAiPanelHeaderRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(polishedAiPanelHeaderRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(polishedDeploymentHeaderRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(polishedDeploymentHeaderRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(polishedDeploymentExpandedShellRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(polishedDeploymentExpandedShellRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(polishedDeploymentExpandedShellRule, /\bfont-family:\s*var\(--workspace-font,/);
  assert.match(
    polishedDeploymentExpandedBodyRule,
    /\bbackground:\s*var\(--workspace-surface-muted,/
  );
  assert.match(polishedDeploymentStageStepperRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(polishedDeploymentStageStepperRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(polishedDeploymentStageDotRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(polishedDeploymentStageDotRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(polishedDeploymentStageActionCardRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(
    polishedDeploymentStageActionCardRule,
    /\bborder:\s*1px solid var\(--workspace-line,/
  );
  assert.match(
    polishedDeploymentStageSummaryPanelRule,
    /\bbackground:\s*var\(--workspace-surface-muted,/
  );
  assert.match(
    polishedDeploymentStageSummaryPanelRule,
    /\bborder:\s*1px solid var\(--workspace-line,/
  );
  assert.match(polishedTerraformPreviewButtonRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(polishedAiPrimaryButtonRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(polishedAiPrimaryButtonRule, /\bborder-color:\s*var\(--workspace-accent,/);
  assert.match(polishedDeploymentPrimaryButtonRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(polishedDeploymentPrimaryButtonRule, /\bborder-color:\s*var\(--workspace-accent,/);
  assert.match(polishedAiChatLauncherRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(polishedAiChatDockRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(polishedAiChatDockRule, /\bcolor:\s*var\(--workspace-text,/);
  assert.match(polishedAiChatTranscriptRule, /\bbackground:\s*var\(--workspace-surface-muted,/);
  assert.doesNotMatch(polishedAiChatTranscriptRule, /linear-gradient/);
  assert.match(polishedAiChatSendButtonRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(polishedIconButtonActiveRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(polishedIconButtonActiveRule, /\bborder-radius:\s*8px;/);
  assert.match(polishedIconButtonActiveRule, /\bcolor:\s*#ffffff;/);
  assert.match(polishedTextButtonActiveHoverRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(polishedTextButtonActiveHoverRule, /\bborder-color:\s*var\(--workspace-accent,/);
  assert.match(polishedTextButtonActiveHoverRule, /\bcolor:\s*#ffffff;/);

  const legacyPanelTokens =
    /var\(--bp-|var\(--bb-|#704dff|#5f3fe6|#f0f1ff|#f0edff|#f6f3ff|#6f4cf6|#5f3de8|#d8ceff|#1f6feb|#f7fbff|rgba\(111,\s*76,\s*246/i;

  assert.doesNotMatch(stylesSource, legacyPanelTokens);

  for (const polishedRule of [
    polishedRightPanelShellRule,
    polishedTerraformPanelRule,
    polishedIssuesPanelRule,
    polishedPanelModeTextButtonActiveRule,
    polishedAiPanelHeaderRule,
    polishedDeploymentHeaderRule,
    polishedDeploymentExpandedShellRule,
    polishedDeploymentExpandedBodyRule,
    polishedDeploymentStageStepperRule,
    polishedDeploymentStageDotRule,
    polishedDeploymentStageActionCardRule,
    polishedDeploymentStageSummaryPanelRule,
    polishedTerraformPreviewButtonRule,
    polishedAiPrimaryButtonRule,
    polishedDeploymentPrimaryButtonRule,
    polishedAiChatLauncherRule,
    polishedAiChatDockRule,
    polishedAiChatTranscriptRule,
    polishedAiChatSendButtonRule,
    polishedIconButtonActiveRule,
    polishedTextButtonActiveHoverRule
  ]) {
    assert.doesNotMatch(polishedRule, legacyPanelTokens);
  }
});

test("deployment panel uses one primary scroll area without a mode switch", () => {
  const deploymentPanelRule = getCssRule(stylesSource, "deploymentPanel");
  const panelContentRule = getCssRule(stylesSource, "deploymentPanelContent");

  assert.match(deploymentPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(panelContentRule, /\boverflow-y:\s*auto;/);
  assert.doesNotMatch(stylesSource, /\.deploymentModeSwitch\s*\{/);
  assert.doesNotMatch(stylesSource, /\.deploymentModeButton\s*\{/);
});

test("deployment panel gates remote content behind explicit availability", () => {
  const contentIndex = directDeploymentSource.indexOf("const deploymentContent =");
  const availabilityIndex = directDeploymentSource.indexOf(
    "canLoadDeploymentData(deploymentAvailability)",
    contentIndex
  );
  const setupIndex = directDeploymentSource.indexOf("{renderSetupSection()}", availabilityIndex);
  const historyIndex = directDeploymentSource.indexOf("{renderHistoryView()}", setupIndex);
  const projectGateIndex = directDeploymentSource.indexOf(
    "프로젝트로 저장 후 배포할 수 있습니다",
    historyIndex
  );

  assert.notEqual(contentIndex, -1);
  assert.ok(availabilityIndex > contentIndex);
  assert.ok(setupIndex > availabilityIndex);
  assert.ok(historyIndex > setupIndex);
  assert.ok(projectGateIndex > historyIndex);
  assert.match(
    deploymentShellSource,
    /className=\{styles\.deploymentPanelContent\}>\{screenContent\}/
  );
  assert.doesNotMatch(deploymentPanelSource, /className=\{styles\.deploymentModeSwitch\}/);
});

test("right panel exposes resources, terraform, and deploy while Issues live inside terraform", () => {
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
  const codeButtonSource = modeBarSource.slice(
    modeBarSource.lastIndexOf("<button", codeButtonIndex),
    modeBarSource.indexOf("</button>", codeButtonIndex)
  );

  assert.ok(utilityBarIndex > -1);
  assert.ok(modeBarIndex > utilityBarIndex);
  assert.ok(resourcesButtonIndex > -1);
  assert.ok(codeButtonIndex > resourcesButtonIndex);
  assert.equal(issuesButtonIndex, -1);
  assert.ok(deployButtonIndex > codeButtonIndex);
  assert.match(codeButtonSource, /data-terraform-editor-navigation/);
  assert.match(codeButtonSource, /onClick=\{\(\) => requestView\("terraform"\)\}/);
  assert.match(codeButtonSource, /aria-label=\{`\$\{issueCount\} issues`\}/);
  assert.match(modeBarSource, /onClick=\{openDeploymentConsole\}/);
  assert.match(componentSource, /title="Terraform code"/);
  assert.match(componentSource, /styles\.panelModeTextButton/);
  assert.match(componentSource, /styles\.panelModeIconGroup/);
  assert.match(stylesSource, /\.rightPanelModeBar\s*\{/);
  assert.doesNotMatch(modeBarSource, /<span>Plan<\/span>/);
  assert.doesNotMatch(modeBarSource, /title="Plan actions"/);
  assert.doesNotMatch(componentSource, /openDeploymentFromPlan/);
  assert.doesNotMatch(componentSource, /isPlanActionStripOpen/);
  assert.doesNotMatch(componentSource, /styles\.panelPlan/);
  assert.doesNotMatch(stylesSource, /\.panelPlan/);
  assert.doesNotMatch(componentSource, /title="AI"/);
  assert.doesNotMatch(componentSource, /activeView === "ai"/);
  assert.doesNotMatch(componentSource, /WorkspaceAiPanel/);
  assert.doesNotMatch(componentSource, /panelDeployButton/);
  assert.doesNotMatch(stylesSource, /\.panelDeployButton\s*\{/);
});

test("simulation opens beside Deploy and remains available in the collapsed shortcut rail", () => {
  const modeBarIndex = componentSource.indexOf("className={styles.rightPanelModeBar}");
  const modeBarEndIndex = componentSource.indexOf(
    "<div className={styles.rightPanelView}",
    modeBarIndex
  );
  const modeBarSource = componentSource.slice(modeBarIndex, modeBarEndIndex);
  const deployIndex = modeBarSource.indexOf("<span>Deploy</span>");
  const simulationIndex = modeBarSource.indexOf("<span>시뮬레이션</span>");
  const collapsedPanelIndex = componentSource.indexOf(
    "<aside className={styles.collapsedRightPanel}"
  );
  const collapsedPanelEndIndex = componentSource.indexOf("</aside>", collapsedPanelIndex);
  const collapsedPanelSource = componentSource.slice(collapsedPanelIndex, collapsedPanelEndIndex);

  assert.ok(deployIndex > -1);
  assert.ok(simulationIndex > deployIndex);
  assert.match(modeBarSource, /onClick=\{openLiveObservation\}/);
  assert.match(collapsedPanelSource, /title="시뮬레이션"/);
  assert.match(collapsedPanelSource, /onClick=\{openLiveObservation\}/);
  assert.match(componentSource, /<LiveObservationModal/);
  assert.match(componentSource, /diagramJson=\{context\.diagram\}/);
  assert.match(componentSource, /projectId=\{projectId\}/);
});

test("reverse engineering is not reachable from persistent right panel toggles", () => {
  const collapsedPanelIndex = componentSource.indexOf(
    "<aside className={styles.collapsedRightPanel}"
  );
  const collapsedPanelEndIndex = componentSource.indexOf("</aside>", collapsedPanelIndex);
  const modeToggleIndex = componentSource.indexOf("className={styles.rightPanelModeBar}");
  const rightPanelViewIndex = componentSource.indexOf(
    "<div className={styles.rightPanelView}",
    modeToggleIndex
  );
  const collapsedPanelSource = componentSource.slice(collapsedPanelIndex, collapsedPanelEndIndex);
  const modeToggleSource = componentSource.slice(modeToggleIndex, rightPanelViewIndex);

  assert.ok(collapsedPanelIndex > -1);
  assert.ok(modeToggleIndex > -1);
  assert.ok(rightPanelViewIndex > modeToggleIndex);
  assert.doesNotMatch(collapsedPanelSource, /title="Reverse Engineering"/);
  assert.doesNotMatch(collapsedPanelSource, /openCollapsedView\("reverse"\)/);
  assert.doesNotMatch(modeToggleSource, /title="Reverse Engineering"/);
  assert.doesNotMatch(modeToggleSource, /requestView\("reverse"\)/);
  assert.doesNotMatch(componentSource, /activeView !== "reverse"/);
  assert.doesNotMatch(componentSource, /<ReverseEngineeringPanel/);
  assert.doesNotMatch(componentSource, /reverseCreatesProjectOnApply/);
});

test("right panel redesign does not add legacy deployment shortcut plumbing", () => {
  assert.doesNotMatch(componentSource, /deploymentShortcutRequest/);
  assert.doesNotMatch(deploymentPanelSource, /deploymentShortcutRequest/);
  assert.doesNotMatch(deploymentPanelSource, /scrollIntoView/);
});

test("workspace AI opens from a floating chat dock instead of the right panel", () => {
  const floatingPanelSlotRule = getCssRule(diagramEditorStylesSource, "floatingPanelSlot");
  const aiChatOverlayRule = getCssRule(stylesSource, "aiChatOverlay");

  assert.match(diagramEditorSource, /floatingPanel\?\.\(panelContext\)/);
  assert.match(projectDraftManagerSource, /floatingPanel=\{\(context\) => \(/);
  assert.match(workspaceDraftManagerSource, /floatingPanel=\{\(context\) => \(/);
  assert.match(projectDraftManagerSource, /<WorkspaceAiChatDock/);
  assert.match(workspaceDraftManagerSource, /<WorkspaceAiChatDock/);
  assert.match(aiChatDockSource, /className=\{styles\.aiChatLauncher/);
  assert.match(aiChatDockSource, /className=\{styles\.aiChatOverlay\}\s+onClick=\{\(event\) => \{/);
  assert.match(aiChatDockSource, /event\.target === event\.currentTarget/);
  assert.match(aiChatDockSource, /closeChatDock\(\)/);
  assert.match(aiChatDockSource, /className=\{styles\.aiChatDock/);
  assert.match(aiChatDockSource, /data-terraform-leave-guard-ignore/);
  assert.doesNotMatch(aiChatDockSource, /event\.stopPropagation\(\)/);
  assert.match(stylesSource, /\.aiChatLauncher\s*\{/);
  assert.match(stylesSource, /\.aiChatOverlay\s*\{/);
  assert.match(stylesSource, /\.aiChatDock\s*\{/);
  assert.match(aiChatOverlayRule, /inset:\s*0/);
  assert.match(aiChatOverlayRule, /pointer-events:\s*auto/);
  assert.match(aiChatOverlayRule, /position:\s*fixed/);
  assert.match(floatingPanelSlotRule, /pointer-events:\s*none/);
  assert.match(floatingPanelSlotRule, /z-index:\s*90/);
});

test("resource workspace omits the decorative list toolbar", () => {
  const resourceWorkspacePanelRule = getCssRule(
    resourceWorkspaceStylesSource,
    "resourceWorkspacePanel"
  );
  const resourceListPanelRule = getCssRule(resourceWorkspaceStylesSource, "resourceListPanel");

  assert.doesNotMatch(resourceListSource, /className=\{styles\.resourceSectionToolbar\}/);
  assert.doesNotMatch(resourceListSource, /aria-label="Resource list"/);
  assert.match(resourceWorkspacePanelRule, /\bgrid-template-rows:\s*minmax\(0,\s*1fr\);/);
  assert.match(resourceListPanelRule, /\bgrid-template-rows:\s*auto minmax\(0, 1fr\);/);
});

test("resource detail back action sits inside the detail view", () => {
  const settingsBranchIndex = resourceWorkspaceSource.indexOf('visibleView === "settings"');
  const settingsPanelIndex = resourceWorkspaceSource.indexOf(
    "className={styles.resourceSettingsPanel}",
    settingsBranchIndex
  );
  const backButtonIndex = resourceWorkspaceSource.indexOf(
    'aria-label="Resource 목록으로 돌아가기"',
    settingsPanelIndex
  );
  const parameterPanelIndex = resourceWorkspaceSource.indexOf(
    "<ParameterInputPanel",
    settingsPanelIndex
  );
  const settingsPanelRule = getCssRule(resourceWorkspaceStylesSource, "resourceSettingsPanel");
  const settingsHeaderRule = getCssRule(resourceWorkspaceStylesSource, "resourceSettingsHeader");

  assert.ok(settingsBranchIndex > -1);
  assert.ok(settingsPanelIndex > settingsBranchIndex);
  assert.ok(backButtonIndex > settingsPanelIndex);
  assert.ok(parameterPanelIndex > backButtonIndex);
  assert.match(settingsPanelRule, /\bgrid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(settingsHeaderRule, /\bpadding:\s*8px 12px;/);
});

test("resource list identity starts with the service icon", () => {
  const serviceIconRule = getCssRule(resourceWorkspaceStylesSource, "resourceListServiceIcon");

  assert.doesNotMatch(resourceListSource, /resourceListCubeIcon/);
  assert.doesNotMatch(resourceWorkspaceStylesSource, /\.resourceListCubeIcon\s*\{/);
  assert.doesNotMatch(serviceIconRule, /\bborder-left:/);
  assert.match(serviceIconRule, /\bwidth:\s*32px;/);
});

test("selected resource list card uses the neutral DESIGN.md primary color", () => {
  const activeCardRule = getCssRuleAfter(
    resourceWorkspaceStylesSource,
    "resourceListItemActive",
    resourceWorkspaceStylesSource.indexOf(".resourceListItem:hover")
  );

  assert.match(activeCardRule, /\bborder-color:\s*var\(--workspace-accent, #000000\);/);
  assert.doesNotMatch(activeCardRule, /#2563eb|rgba\(37,\s*99,\s*235/i);
});

test("resource card menu omits data source switch and maximize actions", () => {
  assert.doesNotMatch(resourceCardMenuSource, /Switch to data source|Switch to resource/);
  assert.doesNotMatch(resourceCardMenuSource, /switchTerraformBlockType/);
  assert.doesNotMatch(resourceCardMenuSource, /onToggleSize/);
  assert.doesNotMatch(resourceCardMenuSource, /Maximize2|Minimize2/);
  assert.match(resourceCardMenuSource, /설정 수정/);
  assert.match(resourceCardMenuSource, /복제/);
  assert.match(resourceCardMenuSource, /삭제/);
});

test("workspace AI has a dedicated error tab for Terraform issue resolution", () => {
  assert.match(aiChatDockSource, /type WorkspaceAiChatScope = "draft" \| "errors" \| "preview"/);
  assert.match(aiChatDockSource, /setActiveChatTab\("errors"\)/);
  assert.match(aiChatDockSource, /activeChatTab === "errors" && terraformIssueResolution !== null/);
  assert.match(aiChatDockSource, /AI 오류/);
  assert.match(stylesSource, /\.aiChatDock\[data-chat-tab="errors"\] \.aiChatComposer/);
});

test("workspace AI chat no longer owns design simulation controls or results", () => {
  assert.doesNotMatch(aiChatDockSource, /runDesignSimulation/);
  assert.doesNotMatch(aiChatDockSource, /시뮬레이션 실행/);
  assert.doesNotMatch(aiChatDockSource, /WorkspaceAiDesignSimulationResult/);
  assert.doesNotMatch(aiChatDockSource, /activeChatTab === "simulation"/);
});

test("terraform issue fix cards omit procedural apply steps", () => {
  assert.doesNotMatch(aiChatDockSource, /fixPlan\.steps\.map/);
  assert.doesNotMatch(aiChatDockSource, /<ol>/);
});

test("workspace AI saves accepted generated and patched diagrams immediately", () => {
  assert.match(
    projectDraftManagerSource,
    /onDiagramSaveRequest=\{\(\) => flushDraftToServer\("manual"\)\}/
  );
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
    /context\.applyDiagramJson\(\s*getDiagramJsonForArchitectureDraft\(draft\)\s*\)/s
  );
  assert.match(
    aiPanelSource,
    /context\.applyDiagramJson\(\s*getDiagramJsonForArchitectureDraft\(draft\)\s*\)/s
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

test("workspace AI chat does not submit while Korean IME text is still composing", () => {
  assert.match(
    aiChatDockSource,
    /composerTextareaRef\s*=\s*useRef<HTMLTextAreaElement \| null>\(null\)/
  );
  assert.match(aiChatDockSource, /composerTextareaRef\.current\?\.value \?\? composerValue/);
  assert.match(aiChatDockSource, /event\.nativeEvent\.isComposing/);
  assert.match(aiChatDockSource, /ref=\{composerTextareaRef\}/);
});

test("workspace AI chat blocks empty draft requests at the final chat boundary", () => {
  assert.match(aiChatDockSource, /const prompt = draftRequest\.prompt\.trim\(\)/);
  assert.match(aiChatDockSource, /if \(prompt\.length === 0\)/);
  assert.match(aiChatDockSource, /appendAssistantMessage\(\s*"question"/s);
  assert.match(
    aiChatDockSource,
    /const normalizedDraftRequest: CreateArchitectureDraftRequest = \{[\s\S]*?\bprompt,/
  );
});

test("workspace AI chat disables previously submitted suggestion choices", () => {
  assert.match(aiChatDockSource, /readonly selectedSuggestions\?: readonly string\[\];/);
  assert.match(
    aiChatDockSource,
    /markChatMessageSuggestionsSelected\(messages, suggestionSelection\)/
  );
  assert.match(
    aiChatDockSource,
    /const hasSubmittedSuggestion = submittedSuggestions\.length > 0;/
  );
  assert.match(aiChatDockSource, /disabled=\{isSuggestionDisabled\}/);
  assert.match(aiChatDockSource, /hasSubmittedSuggestion \|\|/);
  assert.match(aiChatDockSource, /candidate\.selectedSuggestions === undefined/);
});

test("workspace AI chat gates free-form prompts before diagram generation or patching", () => {
  const handleUserMessageBody = aiChatDockSource.slice(
    aiChatDockSource.indexOf("async function handleUserMessage"),
    aiChatDockSource.indexOf("async function handlePatchClarificationMessage")
  );
  const gateIndex = handleUserMessageBody.indexOf("classifyWorkspaceAiChatPrompt(trimmedPrompt)");
  const pendingPreviewIndex = handleUserMessageBody.indexOf("const pendingPreviewAction");
  const chatActionIndex = handleUserMessageBody.indexOf("const chatAction");

  assert.match(aiChatDockSource, /classifyWorkspaceAiChatPrompt/);
  assert.match(
    handleUserMessageBody,
    /appendAssistantMessage\(\s*"question",\s*createWorkspaceAiPromptGateMessage/
  );
  assert.ok(gateIndex >= 0);
  assert.ok(gateIndex < pendingPreviewIndex);
  assert.ok(gateIndex < chatActionIndex);
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
  assert.doesNotMatch(componentSource, /requestTerraformLeave\(\{ kind: "resource-settings" \}\)/);
  assert.match(componentSource, /kind: "replay-click"/);
  assert.doesNotMatch(componentSource, /activeView === "terraform" \|\| activeView === "issues"/);
});

test("terraform code editor no longer opens resource parameter settings from highlighted blocks", () => {
  assert.doesNotMatch(terraformPanelSource, /Settings,/);
  assert.doesNotMatch(terraformPanelSource, /onOpenResourceSettings/);
  assert.doesNotMatch(terraformPanelSource, /Open resource settings/);
  assert.doesNotMatch(terraformPanelSource, /terraformBlockSettingsButton/);
  assert.doesNotMatch(componentSource, /onOpenResourceSettings=\{/);
  assert.doesNotMatch(componentSource, /kind: "resource-settings"/);
  assert.doesNotMatch(stylesSource, /\.terraformBlockSettingsButton\b/);
});

test("terraform view embeds issues below code with a resizable split instead of a separate Issues tab", () => {
  const modeBarStartIndex = componentSource.indexOf("className={styles.rightPanelModeBar}");
  const modeBarEndIndex = componentSource.indexOf(
    "<div className={styles.rightPanelView}",
    modeBarStartIndex
  );
  const modeBarSource = componentSource.slice(modeBarStartIndex, modeBarEndIndex);
  const terraformViewStartIndex = componentSource.indexOf('hidden={activeView !== "terraform"}');
  const terraformViewEndIndex = componentSource.indexOf(
    "{showTerraformLeaveDialog ? (",
    terraformViewStartIndex
  );
  const terraformViewSource = componentSource.slice(terraformViewStartIndex, terraformViewEndIndex);

  assert.ok(modeBarStartIndex > -1);
  assert.ok(modeBarEndIndex > modeBarStartIndex);
  assert.ok(terraformViewStartIndex > -1);
  assert.ok(terraformViewEndIndex > terraformViewStartIndex);
  assert.doesNotMatch(workspaceRightPanelTypesSource, /"issues"/);
  assert.doesNotMatch(modeBarSource, /<span>Issues<\/span>/);
  assert.doesNotMatch(modeBarSource, /requestView\("issues"\)/);
  assert.doesNotMatch(componentSource, /openCollapsedView\("issues"\)/);
  assert.doesNotMatch(componentSource, /hidden=\{activeView !== "issues"\}/);
  assert.doesNotMatch(componentSource, /isTerraformIssuesNavigationTarget/);
  assert.match(componentSource, /DEFAULT_TERRAFORM_CODE_PANE_RATIO = 62/);
  assert.match(componentSource, /MIN_TERRAFORM_CODE_PANE_RATIO = 32/);
  assert.match(componentSource, /MAX_TERRAFORM_CODE_PANE_RATIO = 78/);
  assert.match(componentSource, /clampTerraformCodePaneRatio/);
  assert.match(componentSource, /startTerraformSplitResize/);
  assert.match(componentSource, /if \(splitBounds\.height <= 0\) \{\s*return;\s*\}/);
  assert.match(componentSource, /handleTerraformSplitKeyDown/);
  assert.match(terraformViewSource, /className=\{styles\.terraformSplitLayout\}/);
  assert.match(terraformViewSource, /className=\{styles\.terraformCodePane\}/);
  assert.match(terraformViewSource, /className=\{styles\.terraformSplitResizeHandle\}/);
  assert.match(terraformViewSource, /role="separator"/);
  assert.match(terraformViewSource, /aria-orientation="horizontal"/);
  assert.match(terraformViewSource, /aria-valuemin=\{MIN_TERRAFORM_CODE_PANE_RATIO\}/);
  assert.match(terraformViewSource, /aria-valuemax=\{MAX_TERRAFORM_CODE_PANE_RATIO\}/);
  assert.match(terraformViewSource, /aria-valuenow=\{terraformCodePaneRatio\}/);
  assert.match(terraformViewSource, /onPointerDown=\{startTerraformSplitResize\}/);
  assert.match(terraformViewSource, /onKeyDown=\{handleTerraformSplitKeyDown\}/);
  assert.match(terraformViewSource, /className=\{styles\.terraformIssuesPane\}/);
  assert.match(terraformViewSource, /<WorkspaceIssuesPanel/);
  assert.match(terraformViewSource, /architectureDiagnostics=\{architectureDiagnostics\}/);
  assert.match(terraformViewSource, /terraformIssues=\{terraformIssues\}/);
  assert.match(
    getCssRule(stylesSource, "terraformSplitLayout"),
    /grid-template-rows:\s*var\(--terraform-code-pane-ratio\) 10px minmax\(0,\s*1fr\);/
  );
  assert.match(getCssRule(stylesSource, "terraformCodePane"), /\bmin-height:\s*0;/);
  assert.match(getCssRule(stylesSource, "terraformSplitResizeHandle"), /\bcursor:\s*row-resize;/);
  assert.match(getCssRule(stylesSource, "terraformIssuesPane"), /\bmin-height:\s*0;/);
});

test("combined architecture and terraform issues share one reachable vertical scroll", () => {
  const combinedIssuesRule = getCssRule(workspaceIssuesStylesSource, "issuesPanel");
  const terraformIssuesRule = getCssRule(workspaceIssuesStylesSource, "terraformIssues");
  const nestedIssuesRule = getCssRule(terraformIssuesStylesSource, "issuesPanel");
  const nestedDiagnosticsRule = getCssRule(terraformIssuesStylesSource, "terraformDiagnostics");
  const terraformPanelIndex = workspaceIssuesPanelSource.indexOf("<TerraformIssuesPanel");
  const architecturePanelIndex = workspaceIssuesPanelSource.indexOf("<ArchitectureIssuesPanel");

  assert.ok(terraformPanelIndex > -1);
  assert.ok(architecturePanelIndex > terraformPanelIndex);
  assert.match(combinedIssuesRule, /\bgrid-template-rows:\s*max-content max-content;/);
  assert.match(combinedIssuesRule, /\boverflow-y:\s*auto;/);
  assert.match(combinedIssuesRule, /\bscrollbar-gutter:\s*stable;/);
  assert.doesNotMatch(combinedIssuesRule, /\boverflow:\s*hidden;/);
  assert.doesNotMatch(terraformIssuesRule, /\boverflow:\s*hidden;/);
  assert.doesNotMatch(nestedIssuesRule, /\bheight:\s*100%;/);
  assert.doesNotMatch(nestedIssuesRule, /\boverflow:\s*hidden;/);
  assert.doesNotMatch(nestedDiagnosticsRule, /\boverflow-y:\s*auto;/);
  assert.doesNotMatch(nestedDiagnosticsRule, /\bscrollbar-gutter:\s*stable;/);
});

test("terraform issue banner focuses the embedded Issues panel instead of navigating to a tab", () => {
  assert.match(terraformStatusSource, /Issues 보기/);
  assert.doesNotMatch(terraformStatusSource, /Issues 탭으로 이동/);
  assert.match(componentSource, /focusTerraformIssuesPane/);
  assert.match(componentSource, /onOpenIssues=\{focusTerraformIssuesPane\}/);
});

test("terraform issue AI resolution bypasses the leave guard while editing", () => {
  assert.match(terraformIssuesPanelSource, /data-terraform-issue-ai-resolution/);
  assert.match(componentSource, /isTerraformIssueAiResolutionTarget/);
  assert.match(componentSource, /isTerraformIssueAiResolutionTarget\(target\)/);
  assert.match(componentSource, /isTerraformLeaveGuardIgnoredTarget/);
  assert.match(aiChatDockSource, /data-terraform-leave-guard-ignore/);
  assert.match(terraformIssuesPanelSource, /onResolveWithAi\(issue\)/);
});

test("terraform code navigation stays reachable after a blocked save", () => {
  const requestViewIndex = componentSource.indexOf("const requestView = useCallback");
  const requestViewEditorBypassIndex = componentSource.indexOf(
    'if (nextView === "terraform")',
    requestViewIndex
  );
  const requestViewLeaveGuardIndex = componentSource.indexOf(
    'requestTerraformLeave({ kind: "view", view: nextView })',
    requestViewIndex
  );
  const collapsedViewIndex = componentSource.indexOf("function openCollapsedView");
  const collapsedViewEditorBypassIndex = componentSource.indexOf(
    'if (nextView === "terraform")',
    collapsedViewIndex
  );
  const collapsedViewLeaveGuardIndex = componentSource.indexOf(
    'requestTerraformLeave({ kind: "view", view: nextView })',
    collapsedViewIndex
  );
  const documentClickIndex = componentSource.indexOf("function handleDocumentClick");
  const editorNavigationTargetIndex = componentSource.indexOf(
    "isTerraformEditorNavigationTarget(target)",
    documentClickIndex
  );
  const replayTargetIndex = componentSource.indexOf(
    "getTerraformLeaveReplayTarget(target)",
    documentClickIndex
  );

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
  assert.match(
    terraformPanelSource,
    /latestExternalDiscardRequestIdRef\.current === externalDiscardRequestId/
  );
  assert.match(terraformPanelSource, /void refreshTerraformCode\(currentDiagramFingerprint\)/);
  assert.match(terraformPanelSource, /terraformBaselineFilesRef/);
  assert.match(
    terraformPanelSource,
    /createTerraformFilesForRefresh\(\{[\s\S]*baselineFiles: terraformBaselineFilesRef\.current,[\s\S]*preserveExistingSource/
  );
});

test("terraform refresh and AI safe-fix reject completions made stale by editor changes", () => {
  const refreshSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const refreshTerraformCode = useCallback"),
    terraformPanelSource.indexOf("const runTerraformModuleValidation")
  );
  const safeFixStartIndex = terraformPanelSource.indexOf(
    "const applyTerraformSafeFixToCode = useCallback"
  );
  const safeFixSource = terraformPanelSource.slice(
    safeFixStartIndex,
    terraformPanelSource.indexOf("useImperativeHandle(ref", safeFixStartIndex)
  );

  assert.match(refreshSource, /const requestCodeVersion = codeVersionRef\.current/);
  assert.ok(
    (refreshSource.match(/requestCodeVersion !== codeVersionRef\.current/g) ?? []).length >= 2
  );
  assert.match(safeFixSource, /const requestCodeVersion = codeVersionRef\.current/);
  assert.ok(
    (safeFixSource.match(/requestCodeVersion !== codeVersionRef\.current/g) ?? []).length >= 2
  );
});

test("template application replaces Diagram and Terraform workspace as one source-authoritative seed", () => {
  const replacementEffectStart = terraformPanelSource.indexOf(
    "const replacement = externalTerraformFilesReplacement"
  );
  const replacementEffectEnd = terraformPanelSource.indexOf(
    "latestExternalSaveRequestIdRef.current === externalSaveRequestId",
    replacementEffectStart
  );
  const replacementEffect = terraformPanelSource.slice(
    replacementEffectStart,
    replacementEffectEnd
  );

  assert.match(diagramEditorTypesSource, /onTemplateWorkspaceApply/);
  assert.match(
    diagramEditorSource,
    /onTemplateWorkspaceApply\?\.\(\{[\s\S]*diagramJson: cloneDiagram\(authoritativeDiagram\),[\s\S]*terraformFiles: template\.terraformFiles\.map/
  );
  assert.match(diagramEditorSource, /shouldApplySourceViewportRef\.current = true;/);
  assert.match(diagramEditorSource, /markTerraformSourceAuthoritative\(nextDiagram\)/);
  assert.match(
    diagramEditorSource,
    /applyDiagramJson\(authoritativeDiagram\);[\s\S]*setHistory\(\{ past: \[\], future: \[\] \}\);/
  );
  assert.match(
    workspaceStartSource,
    /markTerraformSourceAuthoritative\(template\.diagramJson\)/
  );
  assert.match(projectDraftManagerSource, /handleTemplateWorkspaceApply/);
  assert.match(workspaceDraftManagerSource, /handleTemplateWorkspaceApply/);
  assert.match(componentSource, /externalTerraformFilesReplacement=\{terraformFilesReplacement\}/);
  assert.ok(replacementEffectStart > -1);
  assert.match(replacementEffect, /currentDiagramFingerprint !== replacement\.diagramFingerprint/);
  assert.match(replacementEffect, /codeRequestIdRef\.current \+= 1/);
  assert.match(replacementEffect, /codeVersionRef\.current \+= 1/);
  assert.match(
    terraformPanelSource,
    /useLayoutEffect\(\(\) => \{\s*const replacement = externalTerraformFilesReplacement/
  );
  assert.match(replacementEffect, /terraformBaselineFilesRef\.current = nextFiles\.map/);
  assert.match(
    replacementEffect,
    /onTerraformFilesChange\?\.\(toTerraformValidationFiles\(nextFiles\)\)/
  );
  assert.match(replacementEffect, /onTerraformFilesReplacementApplied\?\.\(replacement\.id\)/);
  assert.match(replacementEffect, /initialTerraformSourceClassifiedRef\.current = !hasSourceSeed/);
  assert.match(
    replacementEffect,
    /latestSuccessfulTerraformPreviewFingerprintRef\.current = hasSourceSeed/
  );
  assert.match(replacementEffect, /setIsTerraformPreviewStale\(!hasSourceSeed\)/);
  assert.match(projectDraftManagerSource, /latestDiagramRef\.current = diagramJson/);
  assert.match(workspaceDraftManagerSource, /latestDiagramRef\.current = diagramJson/);
  assert.match(
    projectDraftManagerSource,
    /setInitialTerraformFiles\(files\.map\(\(file\) => \(\{ \.\.\.file \}\)\)\)/
  );
  assert.match(
    workspaceDraftManagerSource,
    /setInitialTerraformFiles\(files\.map\(\(file\) => \(\{ \.\.\.file \}\)\)\)/
  );
  assert.match(projectDraftManagerSource, /handleTerraformFilesReplacementApplied/);
  assert.match(workspaceDraftManagerSource, /handleTerraformFilesReplacementApplied/);
  assert.match(componentSource, /onTerraformFilesReplacementApplied/);
});

test("source Terraform is current only with a matching persisted Diagram fingerprint", () => {
  assert.match(
    terraformPanelUtilsSource,
    /terraformSourceFingerprint: toTerraformRefreshFingerprint\(diagramJson\)/
  );
  assert.match(
    terraformPanelUtilsSource,
    /presentation\?\.terraformSourceFingerprint ===\s*toTerraformRefreshFingerprint\(diagramJson\)/
  );
  assert.match(
    terraformPanelSource,
    /initialTerraformFiles\?\.length && hasAuthoritativeTerraformSource\(context\.diagram\)/
  );
  assert.match(diagramEditorTypesSource, /commitTerraformSourceAuthority: \(\) => DiagramJson/);
  assert.match(
    diagramEditorSource,
    /const commitTerraformSourceAuthority = useCallback[\s\S]*markTerraformSourceAuthoritative\(diagramRef\.current\)[\s\S]*replaceDiagram\(authoritativeDiagram\)/
  );

  const refreshSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const refreshTerraformCode = useCallback"),
    terraformPanelSource.indexOf("const runTerraformModuleValidation")
  );
  assert.match(
    refreshSource,
    /onTerraformFilesChange\?\.\(toTerraformValidationFiles\(nextFiles\)\)/
  );
  assert.match(refreshSource, /context\.commitTerraformSourceAuthority\(\)/);

  const saveSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const syncTerraformCodeToDiagram"),
    terraformPanelSource.indexOf("const saveCodeToDiagram = useCallback")
  );
  assert.match(saveSource, /markTerraformSourceAuthoritative\(nextDiagramJson\)/);
  assert.match(saveSource, /context\.applyDiagramJson\(authoritativeDiagramJson\)/);
  assert.match(
    saveSource,
    /onTerraformFilesChange\?\.\(toTerraformValidationFiles\(savedTerraformFiles\)\)/
  );

  const safeFixSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const applyTerraformSafeFixToCode = useCallback"),
    terraformPanelSource.indexOf("useImperativeHandle(ref")
  );
  assert.match(safeFixSource, /markTerraformSourceAuthoritative\(nextDiagramJson\)/);
  assert.match(safeFixSource, /context\.applyDiagramJson\(authoritativeDiagramJson\)/);
  assert.match(
    safeFixSource,
    /onTerraformFilesChange\?\.\(toTerraformValidationFiles\(nextFiles\)\)/
  );
  assert.match(
    diagramEditorSource,
    /replaceDiagram\(clearTerraformSourceAuthority\(cloneDiagram\(previous\)\)\)/
  );
  assert.match(
    diagramEditorSource,
    /replaceDiagram\(clearTerraformSourceAuthority\(cloneDiagram\(next\)\)\)/
  );
});

test("a cancelled Terraform validation cannot overwrite a replacement seed state", () => {
  const validationSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const runTerraformModuleValidation"),
    terraformPanelSource.indexOf("const syncTerraformCodeToDiagram")
  );
  const staleBranchStart = validationSource.indexOf(
    "if (requestCodeVersion !== codeVersionRef.current)"
  );
  const staleBranchEnd = validationSource.indexOf(
    "setDiagnostics(validationDiagnostics)",
    staleBranchStart
  );
  const staleBranch = validationSource.slice(staleBranchStart, staleBranchEnd);

  assert.ok(staleBranchStart > -1);
  assert.match(staleBranch, /return \[createStaleTerraformValidationDiagnostic\(\)\];/);
  assert.doesNotMatch(staleBranch, /setDiagnostics|onDiagnosticsChange|setStatusMessage/);
});

test("multi-stage Terraform requests publish source classification only after the final guard", () => {
  const refreshSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const refreshTerraformCode = useCallback"),
    terraformPanelSource.indexOf("const runTerraformModuleValidation")
  );
  const refreshGenerationIndex = refreshSource.indexOf(
    "const generated = await generateTerraformCode"
  );
  const refreshClassificationCommitIndex = refreshSource.search(
    /classifiedPreservedResourceAddressesRef\.current =\s*nextClassifiedPreservedResourceAddresses/
  );

  assert.ok(refreshGenerationIndex > -1);
  assert.ok(refreshClassificationCommitIndex > refreshGenerationIndex);

  const saveSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const syncTerraformCodeToDiagram"),
    terraformPanelSource.indexOf("const saveCodeToDiagram = useCallback")
  );
  const finalDiagramIndex = saveSource.indexOf(
    "const authoritativeDiagramJson = markTerraformSourceAuthoritative"
  );
  const saveClassificationCommitIndex = saveSource.search(
    /classifiedPreservedResourceAddressesRef\.current =\s*nextClassifiedPreservedResourceAddresses/
  );

  assert.ok(finalDiagramIndex > -1);
  assert.ok(saveClassificationCommitIndex > finalDiagramIndex);
});

test("loaded source Terraform is treated as current and stale sync cannot mutate replacement classification", () => {
  assert.match(
    terraformPanelSource,
    /const initialTerraformFingerprint =\s*initialTerraformFiles\?\.length[\s\S]*toTerraformRefreshFingerprint\(context\.diagram\)/
  );
  assert.match(
    terraformPanelSource,
    /latestSuccessfulTerraformPreviewFingerprintRef = useRef\(initialTerraformFingerprint\)/
  );
  assert.match(terraformPanelSource, /useState\(\s*initialTerraformFingerprint\.length === 0\s*\)/);

  const saveSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const syncTerraformCodeToDiagram"),
    terraformPanelSource.indexOf("const saveCodeToDiagram = useCallback")
  );
  const firstSync = saveSource.indexOf("let syncResult = await syncTerraformToDiagram");
  const firstGuard = saveSource.indexOf("requestCodeVersion !== codeVersionRef.current", firstSync);
  const firstClassification = saveSource.indexOf(
    "let nextClassifiedPreservedResourceAddresses = new Set",
    firstSync
  );
  const secondSync = saveSource.indexOf("syncResult = await syncTerraformToDiagram", firstSync + 1);
  const secondGuard = saveSource.indexOf(
    "requestCodeVersion !== codeVersionRef.current",
    secondSync
  );
  const secondClassification = saveSource.indexOf(
    "nextClassifiedPreservedResourceAddresses = new Set",
    secondSync
  );

  assert.ok(firstSync > -1 && firstGuard > firstSync && firstGuard < firstClassification);
  assert.ok(
    secondSync > firstSync && secondGuard > secondSync && secondGuard < secondClassification
  );
});

test("Terraform async completions compare the editor revision synchronously", () => {
  assert.match(diagramEditorTypesSource, /getDiagramRevision: \(\) => number/);
  assert.match(
    diagramEditorSource,
    /diagramRevisionRef\.current \+= 1;\s*diagramRef\.current = nextDiagram/
  );
  assert.match(
    diagramEditorSource,
    /const getDiagramRevision = useCallback[\s\S]*\(\) => diagramRevisionRef\.current/
  );

  const requestRevisionCaptures =
    terraformPanelSource.match(/const requestDiagramRevision = context\.getDiagramRevision\(\)/g) ??
    [];
  const completionRevisionGuards =
    terraformPanelSource.match(/requestDiagramRevision !== context\.getDiagramRevision\(\)/g) ?? [];

  assert.equal(requestRevisionCaptures.length, 3);
  assert.ok(completionRevisionGuards.length >= 10);
});

test("unmounting a Terraform panel invalidates every in-flight completion", () => {
  assert.match(
    terraformPanelSource,
    /useLayoutEffect\(\s*\(\) => \(\) => \{\s*codeRequestIdRef\.current \+= 1;\s*codeVersionRef\.current \+= 1;\s*\},\s*\[\]\s*\)/
  );
});

test("Terraform reference rewrites mutate panel state only after the final save guard", () => {
  const saveSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const syncTerraformCodeToDiagram"),
    terraformPanelSource.indexOf("const saveCodeToDiagram = useCallback")
  );
  const finalGuardIndex = saveSource.lastIndexOf("requestCodeVersion !== codeVersionRef.current");
  const rewrittenVersionIndex = saveSource.indexOf("codeVersionRef.current += 1", finalGuardIndex);
  const rewrittenFilesIndex = saveSource.indexOf(
    "setTerraformFiles(rewrittenTerraformFiles)",
    finalGuardIndex
  );
  const applyIndex = saveSource.indexOf(
    "context.applyDiagramJson(authoritativeDiagramJson)",
    finalGuardIndex
  );

  assert.ok(finalGuardIndex > -1);
  assert.ok(rewrittenVersionIndex > finalGuardIndex);
  assert.ok(rewrittenFilesIndex > rewrittenVersionIndex);
  assert.ok(applyIndex > rewrittenFilesIndex);
});

test("AI Terraform sync publishes the final preserved-source classification", () => {
  const safeFixSource = terraformPanelSource.slice(
    terraformPanelSource.indexOf("const applyTerraformSafeFixToCode = useCallback"),
    terraformPanelSource.indexOf("useImperativeHandle(ref")
  );
  const syncIndex = safeFixSource.indexOf("const syncResult = await syncTerraformToDiagram");
  const classificationIndex = safeFixSource.indexOf(
    "classifiedPreservedResourceAddressesRef.current = new Set"
  );
  const applyIndex = safeFixSource.indexOf("context.applyDiagramJson(authoritativeDiagramJson)");

  assert.ok(syncIndex > -1);
  assert.ok(classificationIndex > syncIndex);
  assert.ok(applyIndex > classificationIndex);
  assert.match(safeFixSource, /initialTerraformSourceClassifiedRef\.current = true/);
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
  assert.doesNotMatch(
    terraformPanelSource,
    /setStatusMessage\("그래프 기준으로 동기화됨"\);\s*latestDiagramFingerprintRef\.current = diagramFingerprint;\s*[\s\S]*catch/
  );
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

test("terraform leave dialog continue action uses the neutral workspace tint", () => {
  const secondaryButtonRule = getCssRule(stylesSource, "terraformDialogSecondaryButton");

  assert.match(secondaryButtonRule, /background:\s*var\(--workspace-accent-soft, #f0f0f3\);/);
  assert.doesNotMatch(secondaryButtonRule, /background:\s*#ffffff;/);
  assert.doesNotMatch(secondaryButtonRule, /var\(--bp-/);
  assert.match(
    stylesSource,
    /\.terraformDialogSecondaryButton:hover,[\s\S]*?background:\s*color-mix\(in srgb, var\(--workspace-accent-soft, #f0f0f3\) 74%, var\(--workspace-accent, #000000\)\);/
  );
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
  assert.match(
    terraformLeaveDialogSource,
    /role=\{saveState === "blocked" \? "alert" : "status"\}/
  );
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
  assert.match(
    componentSource,
    /handleTerraformExternalSaveComplete\(saved: boolean, requestId: number\)/
  );
  assert.match(componentSource, /requestId !== latestTerraformSaveRequestIdRef\.current/);
  assert.match(terraformPanelSource, /onExternalSaveComplete\(saved, externalSaveRequestId\)/);
});

test("deployment screen separates Direct Deployment and CI/CD into focused screens", () => {
  const navigationRule = getCssRule(stylesSource, "deploymentConsoleScreenNavigation");
  const disclosureRule = getCssRule(stylesSource, "deploymentDisclosure");
  const logListRule = getCssRule(stylesSource, "deploymentLogList");

  assert.match(deploymentShellSource, /type DeploymentConsoleScreen = "deployment" \| "cicd";/);
  assert.match(deploymentShellSource, />\s*배포\s*</);
  assert.match(deploymentShellSource, />\s*CI\/CD\s*</);
  assert.match(deploymentShellSource, /aria-pressed=\{activeScreen === "deployment"\}/);
  assert.match(deploymentShellSource, /aria-pressed=\{activeScreen === "cicd"\}/);
  assert.match(directDeploymentSource, /Direct Deployment 기록/);
  assert.match(cicdConsoleSource, /"overview" \| "activity" \| "logs" \| "settings"/);
  assert.match(navigationRule, /\bborder:\s*1px solid var\(--workspace-line,/);
  assert.match(disclosureRule, /\bborder:\s*1px solid #dce3ee;/);
  assert.match(logListRule, /\boverflow:\s*visible;/);
  assert.doesNotMatch(logListRule, /\bmax-height:/);
});

test("deployment expanded panel uses one readable body instead of a split pane", () => {
  const expandedBodyRule = getCssRule(stylesSource, "deploymentExpandedBody");

  assert.match(deploymentPanelSource, /className=\{styles\.deploymentExpandedBody\}/);
  assert.match(expandedBodyRule, /\boverflow:\s*auto;/);
  assert.doesNotMatch(deploymentPanelSource, /deploymentExpandedGridRef/);
  assert.doesNotMatch(deploymentPanelSource, /"--deployment-details-width"/);
  assert.doesNotMatch(
    deploymentPanelSource,
    /className=\{styles\.deploymentExpandedResizeHandle\}/
  );
  assert.doesNotMatch(deploymentPanelSource, /role="separator"/);
  assert.doesNotMatch(deploymentPanelSource, /startDeploymentPanelResize/);
  assert.doesNotMatch(deploymentPanelSource, /handleDeploymentPanelResizeKeyDown/);
  assert.doesNotMatch(stylesSource, /\.deploymentExpandedGrid\s*\{/);
  assert.doesNotMatch(stylesSource, /\.deploymentExpandedResizeHandle\s*\{/);
});

test("deployment expanded overlay sits above the floating AI dock and blocks lower controls", () => {
  const expandedOverlayRule = getCssRule(stylesSource, "deploymentExpandedOverlay");
  const expandedShellRule = getCssRule(stylesSource, "deploymentExpandedShell");
  const expandedCloseButtonRule = getCssRule(stylesSource, "deploymentExpandedCloseButton");
  const expandedTitleRowRule = getCssRule(stylesSource, "deploymentExpandedTitleRow");
  const expandedTitleRule = getCssRule(stylesSource, "deploymentExpandedTitle");
  const floatingPanelSlotRule = getCssRule(diagramEditorStylesSource, "floatingPanelSlot");
  const expandedOverlayZIndex = readCssNumber(expandedOverlayRule, "z-index");
  const floatingPanelSlotZIndex = readCssNumber(floatingPanelSlotRule, "z-index");

  assert.ok(
    expandedOverlayZIndex > floatingPanelSlotZIndex,
    `Expected deployment overlay z-index ${expandedOverlayZIndex} to exceed floating AI slot ${floatingPanelSlotZIndex}`
  );
  assert.match(deploymentShellSource, /className=\{styles\.deploymentExpandedOverlay\}/);
  assert.match(deploymentShellSource, /event\.target === event\.currentTarget/);
  assert.match(deploymentShellSource, /className=\{styles\.deploymentExpandedShell\}/);
  assert.match(deploymentShellSource, /className=\{styles\.deploymentExpandedCloseButton\}/);
  assert.match(deploymentShellSource, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(deploymentShellSource, /event\.key === "Escape"/);
  assert.match(deploymentShellSource, /event\.key !== "Tab"/);
  assert.match(deploymentShellSource, /dialogRef\.current\?\.querySelectorAll/);
  assert.match(deploymentShellSource, /"\[data-deployment-console-trigger\]"/);
  assert.match(componentSource, /data-deployment-console-trigger/);
  assert.match(deploymentShellSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(deploymentShellSource, /className=\{styles\.deploymentExpandedTitleRow\}/);
  assert.match(
    deploymentShellSource,
    /<h2 className=\{styles\.deploymentExpandedTitle\}>배포 콘솔<\/h2>/
  );
  assert.doesNotMatch(deploymentShellSource, /className=\{styles\.deploymentExpandedHeader\}/);
  assert.match(expandedOverlayRule, /\bpointer-events:\s*auto;/);
  assert.match(expandedShellRule, /\bposition:\s*relative;/);
  assert.match(expandedCloseButtonRule, /\bposition:\s*absolute;/);
  assert.match(expandedCloseButtonRule, /\bright:\s*18px;/);
  assert.match(expandedTitleRowRule, /\bpadding-right:\s*56px;/);
  assert.match(expandedTitleRule, /\bfont-size:\s*18px;/);
  assert.match(expandedTitleRule, /\bfont-weight:\s*900;/);
});

test("deployment expanded body uses larger action and record text", () => {
  assert.match(
    stylesSource,
    /\.deploymentExpandedBody\s+\.deploymentField\s*\{[\s\S]*?\bfont-size:\s*13px;/
  );
  assert.match(deploymentPanelSource, /size=\{isDeploymentOverlayOpen \? "large" : "regular"\}/);
  assert.match(
    stylesSource,
    /\.deploymentExpandedBody\s+\.deploymentPrimaryButton,\s*\.deploymentExpandedBody\s+\.deploymentSecondaryButton,\s*\.deploymentExpandedBody\s+\.deploymentDangerButton\s*\{[\s\S]*?\bfont-size:\s*14px;[\s\S]*?\bmin-height:\s*40px;/
  );
  assert.match(
    stylesSource,
    /\.deploymentExpandedBody\s+\.deploymentSummary\s+strong\s*\{[\s\S]*?\bfont-size:\s*13px;/
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
  assert.match(
    resultRowRule,
    /\bgrid-template-columns:\s*minmax\(0,\s*1\.15fr\) minmax\(88px,\s*0\.45fr\) minmax\(0,\s*1fr\);/
  );
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
  assert.match(
    deploymentPanelSource,
    /terraformArtifactId:\s*savedArtifacts\.terraformArtifact\.id/
  );
  assert.match(componentSource, /ref=\{terraformPanelRef\}/);
  assert.match(componentSource, /onPrepareDeploymentArtifacts=\{prepareDeploymentArtifacts\}/);
});

test("GitHub repository setup is owned by project settings, not the deployment panel", () => {
  assert.match(cicdConsoleSource, /settingsHref/);
  assert.match(
    cicdConsoleSource,
    /\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/settings\?tab=github/
  );
  assert.doesNotMatch(directDeploymentSource, /createGitCicdAutoDeployHandoff/);
  assert.match(cicdConsoleSource, /item\.provider === "github"/);
  assert.doesNotMatch(deploymentPanelSource, /function startGitHubConnection/);
  assert.doesNotMatch(deploymentPanelSource, /renderGitHubRepositoryChooser/);
  assert.doesNotMatch(deploymentPanelSource, /listGitHubInstalledRepositories/);
  assert.doesNotMatch(deploymentPanelSource, /createGitHubSourceRepositoryInstallUrl/);
});

test("deployment setup exposes a five-step Direct Deployment console", () => {
  const consoleGridRule = getCssRule(stylesSource, "deploymentConsoleGrid");
  const stepNavigationRule = getCssRule(stylesSource, "deploymentStepNavigation");
  const stepWorkspaceRule = getCssRule(stylesSource, "deploymentStepWorkspace");
  const contextPanelRule = getCssRule(stylesSource, "deploymentContextPanel");
  const activeStepRule = getLastCssRuleContainingAfter(
    stylesSource,
    '.deploymentStepButton[data-state="active"] .deploymentStepIndex',
    0
  );
  const blockedStepRule = getLastCssRuleContainingAfter(
    stylesSource,
    '.deploymentStepButton[data-state="blocked"] .deploymentStepIndex',
    0
  );
  const saveIndex = directDeploymentSource.indexOf("<h3>변경사항 저장</h3>");
  const preflightIndex = directDeploymentSource.indexOf("<h3>배포 전 검사</h3>", saveIndex);
  const planIndex = directDeploymentSource.indexOf("<h3>Plan 생성</h3>", preflightIndex);
  const approvalIndex = directDeploymentSource.indexOf("<h3>Plan 승인</h3>", planIndex);
  const applyIndex = directDeploymentSource.indexOf("<h3>Apply 실행</h3>", approvalIndex);

  assert.ok(saveIndex > -1);
  assert.ok(preflightIndex > saveIndex);
  assert.ok(planIndex > preflightIndex);
  assert.ok(approvalIndex > planIndex);
  assert.ok(applyIndex > approvalIndex);
  assert.match(deploymentPanelSource, /getDirectDeploymentFlow/);
  assert.match(deploymentPanelSource, /directDeploymentFlow\.steps\.map/);
  assert.match(deploymentPanelSource, /setSelectedDirectStepId\(step\.id\)/);
  assert.match(
    deploymentPanelSource,
    /aria-current=\{step\.id === directDeploymentFlow\.activeStepId \? "step" : undefined\}/
  );
  assert.match(deploymentPanelSource, /disabled=\{step\.state === "idle"\}/);
  assert.match(deploymentPanelSource, /검사 전 상태는 실패가 아닙니다/);
  assert.match(deploymentPanelSource, /Plan은 AWS 리소스를 변경하지 않습니다/);
  assert.match(deploymentPanelSource, /승인 snapshot이 Apply 직전에 다시 검증됩니다/);
  assert.match(deploymentPanelSource, /Apply 실행 검토/);
  assert.match(deploymentPanelSource, /Destroy Plan 생성/);
  assert.match(deploymentPanelSource, /Destroy 실행 검토/);
  assert.match(deploymentPanelSource, /className=\{styles\.deploymentContextPanel\}/);
  assert.doesNotMatch(directDeploymentSource, /deploymentConsoleTab/);
  assert.match(deploymentPanelSource, /AWS account/);
  assert.match(deploymentPanelSource, /Terraform artifact/);
  assert.match(deploymentPanelSource, /Architecture/);
  assert.match(consoleGridRule, /grid-template-columns:\s*224px minmax\(420px,\s*1fr\) 294px;/);
  assert.match(stepNavigationRule, /\bborder-right:\s*1px solid var\(--workspace-line,/);
  assert.match(stepWorkspaceRule, /\bbackground:\s*var\(--workspace-surface,/);
  assert.match(contextPanelRule, /\bbackground:\s*var\(--workspace-surface-muted,/);
  assert.match(contextPanelRule, /\bborder-left:\s*1px solid var\(--workspace-line,/);
  assert.match(activeStepRule, /\bbackground:\s*var\(--workspace-accent,/);
  assert.match(activeStepRule, /\bcolor:\s*#ffffff;/);
  assert.match(blockedStepRule, /\bbackground:\s*#fff1f0;/);
  assert.match(blockedStepRule, /\bcolor:\s*#b42318;/);
  assert.match(
    stylesSource,
    /@media \(max-width: 1100px\)[\s\S]*?\.deploymentConsoleGrid\s*\{[\s\S]*?grid-template-columns:\s*200px minmax\(0,\s*1fr\);/
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 720px\)[\s\S]*?\.deploymentStepNavigation ol\s*\{[\s\S]*?display:\s*flex;/
  );
  assert.doesNotMatch(deploymentPanelSource, /DeploymentWizardStep/);
  assert.doesNotMatch(deploymentPanelSource, /startPrimaryDeploymentStep/);
});

test("deployment action icons stay compact inside their buttons", () => {
  assert.match(
    stylesSource,
    /\.deploymentPrimaryButton svg,[\s\S]*?\.deploymentDangerButton svg\s*\{[^}]*\bheight:\s*16px;[^}]*\bwidth:\s*16px;/
  );
});

test("deployment preflight keeps its heading and findings in one readable flow", () => {
  const stageSettingsRule = getCssRule(stylesSource, "deploymentStageSettings");
  const preflightSummaryRule = getCssRule(stylesSource, "deploymentPreflightSummary");
  const gateHeaderRule = getCssRule(stylesSource, "deploymentGateHeader");
  const findingHeaderRule = getCssRule(stylesSource, "deploymentFindingHeader");

  assert.doesNotMatch(stageSettingsRule, /\bgrid-column:/);
  assert.doesNotMatch(stageSettingsRule, /\bgrid-row:/);
  assert.match(preflightSummaryRule, /\bborder-radius:\s*var\(--radius-card\);/);
  assert.match(preflightSummaryRule, /\bpadding:\s*20px;/);
  assert.match(gateHeaderRule, /\bdisplay:\s*flex;/);
  assert.match(gateHeaderRule, /\bgap:\s*8px;/);
  assert.match(findingHeaderRule, /\bdisplay:\s*flex;/);
  assert.match(directDeploymentSource, /className=\{styles\.deploymentFindingHeader\}/);
  assert.match(directDeploymentSource, /className=\{styles\.deploymentFindingMeta\}/);
  assert.match(directDeploymentSource, /className=\{styles\.deploymentFindingActions\}/);
  assert.match(directDeploymentSource, /배포 안전성 검사 결과/);
  assert.match(directDeploymentSource, /발견 항목/);
});

test("CI/CD settings require explicit monitored paths and user acceptance", () => {
  const settingsSource = readWorkspaceFile("CicdMonitoringSettings.tsx");

  assert.match(settingsSource, /저장소 루트/);
  assert.match(settingsSource, /하위 디렉터리/);
  assert.match(settingsSource, /애플리케이션 경로/);
  assert.match(settingsSource, /인프라 경로/);
  assert.match(settingsSource, /isCicdMonitoringDraftComplete\(draft\)/);
  assert.match(
    settingsSource,
    /userAcceptedChangeId: `cicd-monitoring-\$\{crypto\.randomUUID\(\)\}`/
  );
  assert.match(cicdConsoleSource, /GitHub 권한을 확인해 주세요\./);
  assert.match(cicdConsoleSource, /프로젝트 GitHub 설정 열기/);
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
  assert.match(componentSource, /hasUnsavedDeploymentBaseline=\{hasUnsavedDeploymentBaseline\}/);
});

test("pre-deployment check is owned by the deployment tab", () => {
  const preflightSummaryRule = getCssRule(stylesSource, "deploymentPreflightSummary");
  const preflightFindingsRule = getCssRule(stylesSource, "deploymentPreflightFindings");

  assert.match(deploymentPanelSource, /runAiPreDeploymentCheck/);
  assert.match(deploymentPanelSource, /addTerraformDiagnosticsToPreDeploymentAnalysis/);
  assert.match(deploymentPanelSource, /createPreDeploymentAnalysisFromTerraformDiagnostics/);
  assert.match(deploymentPanelSource, /onValidateTerraformDiagnostics/);
  assert.match(deploymentPanelSource, /onGetTerraformFiles/);
  assert.match(deploymentPanelSource, /await onValidateTerraformDiagnostics\(\)/);
  assert.match(deploymentPanelSource, /currentTerraformDiagnostics/);
  assert.match(deploymentPanelSource, /diagnostic\.severity === "error"/);
  assert.match(deploymentPanelSource, /terraformFiles:\s*\[\.\.\.onGetTerraformFiles\(\)\]/);
  assert.match(deploymentPanelSource, /createWorkspaceAiBoardSnapshot/);
  assert.match(componentSource, /diagramJson=\{context\.diagram\}/);
  assert.match(componentSource, /validateTerraformForPreDeployment/);
  assert.match(componentSource, /getTerraformFilesForPreDeployment/);
  assert.match(componentSource, /onGetTerraformFiles=\{getTerraformFilesForPreDeployment\}/);
  assert.match(componentSource, /preDeploymentCheckState=\{preDeploymentCheckState\}/);
  assert.match(componentSource, /onPreDeploymentCheckStateChange=\{setPreDeploymentCheckState\}/);
  assert.match(componentSource, /validateCurrentTerraform/);
  assert.match(terraformPanelSource, /validateCurrentTerraform/);
  assert.doesNotMatch(aiChatDockSource, /runAiPreDeploymentCheck/);
  assert.doesNotMatch(aiChatDockSource, /WorkspaceAiPreDeploymentResult/);
  assert.match(preflightSummaryRule, /\bgap:\s*16px;/);
  assert.doesNotMatch(preflightFindingsRule, /\bmax-height:/);
  assert.doesNotMatch(preflightFindingsRule, /\boverflow-y:\s*auto;/);
  assert.doesNotMatch(preflightFindingsRule, /\bscrollbar-gutter:/);
  assert.match(deploymentPanelSource, /analysis\.findings\.map\(\(finding\) =>/);
  assert.doesNotMatch(deploymentPanelSource, /visibleFindings/);
  assert.doesNotMatch(deploymentPanelSource, /hiddenFindingCount/);
  assert.doesNotMatch(deploymentPanelSource, /\.slice\(0,\s*3\)/);
  assert.doesNotMatch(deploymentPanelSource, /deploymentPreflightMore/);
  assert.doesNotMatch(deploymentPanelSource, /외 \{hiddenFindingCount\}개 항목/);
});

test("pre-deployment check result is preserved above the deployment tab", () => {
  assert.match(
    componentSource,
    /useState<DeploymentPreDeploymentCheckState>\(initialPreDeploymentCheckState\)/
  );
  assert.match(componentSource, /setPreDeploymentCheckState\(initialPreDeploymentCheckState\);/);
  assert.match(deploymentPanelSource, /preDeploymentCheckState\.analysis/);
  assert.match(deploymentPanelSource, /preDeploymentCheckState\.requestState/);
  assert.match(deploymentPanelSource, /preDeploymentCheckState\.errorMessage/);
  assert.match(deploymentPanelSource, /preDeploymentCheckState\.fingerprint/);
  assert.doesNotMatch(
    deploymentPanelSource,
    /useState<AiPreDeploymentAnalysisResult \| null>\(null\)/
  );
});

test("pre-deployment check loads per-finding explanations only when a card is expanded", () => {
  assert.doesNotMatch(deploymentPanelSource, /DeploymentPreDeploymentAiExplanation/);
  assert.doesNotMatch(deploymentPanelSource, /deploymentPreflightAiExplanation/);
  assert.doesNotMatch(stylesSource, /\.deploymentPreflightAiExplanation\s*\{/);
  assert.match(deploymentPanelSource, /DeploymentFindingAiExplanation/);
  assert.match(deploymentPanelSource, /finding\.aiSafetyExplanation/);
  assert.match(deploymentPanelSource, /className=\{styles\.deploymentFindingAiExplanation\}/);
  assert.match(deploymentPanelSource, /finding\.trivyRuleIds/);
  assert.match(deploymentPanelSource, /Trivy rules · \{finding\.trivyRuleIds\.join\(", "\)\}/);
  assert.match(deploymentPanelSource, /deploymentFindingAiButton/);
  assert.match(deploymentPanelSource, /runAiSafetyFindingExplanation/);
  assert.match(deploymentPanelSource, /설명 접기/);
  assert.match(deploymentPanelSource, /설명 보기/);
  assert.doesNotMatch(aiChatDockSource, /preDeploymentAnalysis/);
});

test("pre-deployment check shows background Trivy state without blocking Plan creation", () => {
  assert.match(deploymentPanelSource, /getAiPreDeploymentDeepScan/);
  assert.match(deploymentPanelSource, /핵심 안전검사 완료 · Trivy 심층검사 진행 중/);
  assert.match(deploymentPanelSource, /핵심 안전검사 및 Trivy 심층검사 완료 · 결과 병합됨/);
  assert.match(deploymentPanelSource, /disabled=\{!canRunPlan\}/);
  assert.match(deploymentPanelSource, /return true;/);
  assert.doesNotMatch(deploymentPanelSource, /canRunPlanForCurrentPreflight/);
});

test("pre-deployment check only downgrades checklist failures backed exclusively by high findings", () => {
  assert.match(deploymentPanelSource, /const highFindingIds = new Set/);
  assert.match(
    deploymentPanelSource,
    /const hasIndependentChecklistFailure = analysis\.checklist\.some/
  );
  assert.match(deploymentPanelSource, /return "blocked"/);
});

test("pre-deployment finding fix buttons open the existing terraform source location handler", () => {
  assert.match(deploymentPanelSource, /onOpenFindingTerraformSource/);
  assert.match(deploymentPanelSource, /className=\{styles\.deploymentFindingFixButton\}/);
  assert.match(deploymentPanelSource, /<Code2 size=\{14\} aria-hidden="true" \/>/);
  assert.match(componentSource, /getPreDeploymentFindingTerraformSourceLocation/);
  assert.match(componentSource, /openPreDeploymentFindingTerraformSource/);
  assert.match(componentSource, /terraformPanelRef\.current\?\.getTerraformFiles\(\)/);
  assert.match(componentSource, /setActiveView\("terraform"\)/);
  assert.match(
    componentSource,
    /terraformPanelRef\.current\?\.openTerraformSourceLocation\(sourceLocation\)/
  );
  assert.match(componentSource, /onOpenFindingTerraformSource=\{\(finding\) => \{/);
  assert.match(
    componentSource,
    /const sourceLocation = openPreDeploymentFindingTerraformSource\(finding\);/
  );
  assert.match(componentSource, /setIsDeploymentConsoleOpen\(false\);/);
});

test("terraform errors surface as an issues banner and AI resolution lives in the chat dock", () => {
  const issueBannerRule = getCssRule(terraformStatusStylesSource, "terraformIssueBanner");
  const aiButtonRule = getCssRule(terraformIssuesStylesSource, "terraformDiagnosticAiButton");
  const issuesPanelRule = getCssRule(terraformIssuesStylesSource, "issuesPanel");
  const issuesDiagnosticsRule = getCssRule(terraformIssuesStylesSource, "terraformDiagnostics");

  assert.doesNotMatch(terraformPanelSource, /runAiTerraformErrorExplanation/);
  assert.doesNotMatch(terraformPanelSource, /terraformErrorExplanationsByKey/);
  assert.doesNotMatch(terraformPanelSource, /오류를 해석하는 중입니다/);
  assert.doesNotMatch(terraformPanelSource, /AI 설명/);
  assert.doesNotMatch(terraformPanelSource, /terraformErrorExplanationPanel/);
  assert.doesNotMatch(terraformPanelSource, /terraformErrorExplanationList/);
  assert.match(terraformStatusSource, /className=\{styles\.terraformIssueBanner\}/);
  assert.match(terraformStatusSource, /Issues 보기/);
  assert.doesNotMatch(terraformPanelSource, /Issues 탭으로 이동/);
  assert.match(componentSource, /readStoredTerraformIssues/);
  assert.match(componentSource, /markTerraformIssuesStale/);
  assert.match(componentSource, /mergeTerraformValidationDiagnostics/);
  assert.match(componentSource, /storeTerraformIssues/);
  assert.match(componentSource, /loadedTerraformIssuesProjectId/);
  assert.match(
    componentSource,
    /storeTerraformIssues\(window\.localStorage, projectId, terraformIssues\)/
  );
  assert.match(componentSource, /<WorkspaceIssuesPanel/);
  assert.match(componentSource, /architectureDiagnostics=\{architectureDiagnostics\}/);
  assert.match(aiChatDockSource, /runAiTerraformErrorExplanation/);
  assert.match(aiChatDockSource, /terraform_issue/);
  assert.doesNotMatch(aiChatDockSource, /selectTerraformIssueWellArchitectedConclusion/);
  assert.doesNotMatch(aiChatDockSource, /Well-Architected/);
  assert.match(aiChatDockSource, /onApplyTerraformIssueFix/);
  assert.match(issueBannerRule, /\bbackground:\s*#fff7ed;/);
  assert.match(aiButtonRule, /\bbackground:\s*var\(--workspace-surface, #ffffff\);/);
  assert.match(issuesPanelRule, /\bmin-height:\s*0;/);
  assert.match(issuesPanelRule, /\bgrid-template-rows:\s*auto;/);
  assert.doesNotMatch(issuesPanelRule, /\bheight:\s*100%;/);
  assert.doesNotMatch(issuesPanelRule, /\boverflow:\s*hidden;/);
  assert.match(issuesDiagnosticsRule, /\bmin-height:\s*0;/);
  assert.doesNotMatch(issuesDiagnosticsRule, /\boverflow-y:\s*auto;/);
  assert.doesNotMatch(issuesDiagnosticsRule, /\bscrollbar-gutter:\s*stable;/);
  assert.doesNotMatch(terraformIssuesStylesSource, /var\(--bb-|#2563eb|#3730a3|#1d4ed8/);
  assert.match(
    terraformIssuesStylesSource,
    /\.terraformDiagnosticList strong\s*\{[^}]*color:\s*var\(--workspace-text, #171717\);/s
  );
  assert.match(
    terraformIssuesStylesSource,
    /\.terraformDiagnosticList > li > span\s*\{[^}]*color:\s*var\(--workspace-muted, #60646c\);/s
  );
  assert.match(
    terraformIssuesStylesSource,
    /\.terraformDiagnosticSeverity\s*\{[^}]*color:\s*var\(--workspace-text, #171717\);/s
  );
  assert.match(
    terraformIssuesStylesSource,
    /\.terraformDiagnosticMeta span\s*\{[^}]*background:\s*var\(--workspace-surface-muted, #fafafa\);[^}]*border:\s*1px solid var\(--workspace-line, #f0f0f3\);/s
  );
  assert.match(terraformIssuesPanelSource, /AI로 해결/);
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

test("terraform issue AI resolution opens the issue source before the chat answer returns", () => {
  const aiClickIndex = componentSource.indexOf("const handleTerraformIssueAiClick");
  const requestIndex = componentSource.indexOf("onTerraformIssueAiRequest", aiClickIndex);

  assert.ok(aiClickIndex > -1);
  assert.ok(requestIndex > aiClickIndex);
  assert.match(
    componentSource.slice(aiClickIndex, requestIndex),
    /getTerraformIssueSourceLocation\(issue\)/
  );
  assert.match(
    componentSource.slice(aiClickIndex, requestIndex),
    /openTerraformIssueSourceLocation\(sourceLocation\)/
  );
  assert.match(
    componentSource,
    /function getTerraformIssueSourceLocation\(\s*issue: TerraformIssueRecord\s*\)/
  );
  assert.match(componentSource, /line: issue\.diagnostic\.line \?\? 1/);
  assert.match(componentSource, /const openTerraformIssueSourceLocation = useCallback/);
  assert.match(componentSource, /context\.setRightPanelOpen\(true\);/);
  assert.match(componentSource, /setActiveView\("terraform"\);/);
  assert.match(componentSource, /setPendingTerraformIssueFixSourceLocation\(sourceLocation\);/);
});

test("terraform issue AI fix opens the edited code and locks the apply button", () => {
  assert.match(componentSource, /getTerraformIssueFixSourceLocation/);
  assert.match(componentSource, /pendingTerraformIssueFixSourceLocation/);
  assert.match(
    componentSource,
    /request\.codePreview\?\.sourceLine \?\? request\.diagnostic\.line \?\? 1/
  );
  assert.match(componentSource, /context\.setRightPanelOpen\(true\);/);
  assert.match(componentSource, /setActiveView\("terraform"\);/);
  assert.match(componentSource, /setPendingTerraformIssueFixSourceLocation\(sourceLocation\)/);
  assert.match(
    componentSource,
    /terraformPanelRef\.current\?\.openTerraformSourceLocation\(pendingTerraformIssueFixSourceLocation\)/
  );
  assert.match(
    projectDraftManagerSource,
    /const requestTerraformSafeFixApply = useCallback\(\s*\(\s*request: TerraformSafeFixApplyRequest/
  );
  assert.match(
    workspaceDraftManagerSource,
    /const requestTerraformSafeFixApply = useCallback\(\s*\(\s*request: TerraformSafeFixApplyRequest/
  );
  assert.match(projectDraftManagerSource, /setTerraformSafeFixApplyRequest\(request\)/);
  assert.match(workspaceDraftManagerSource, /setTerraformSafeFixApplyRequest\(request\)/);
  assert.match(aiChatDockSource, /completedTerraformFixRequestIds/);
  assert.match(aiChatDockSource, /setCompletedTerraformFixRequestIds/);
  assert.match(aiChatDockSource, /const hasCompletedTerraformFix/);
  assert.match(aiChatDockSource, /id: terraformIssueResolution\.request\.id/);
  assert.match(
    aiChatDockSource,
    /disabled=\{hasCompletedTerraformFix \|\| applyingTerraformFixRequestId === terraformIssueResolution\.request\.id\}/
  );
  assert.match(aiChatDockSource, /수정완료/);
  assert.match(terraformPanelSource, /8000/);
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
  const syncIndex = terraformPanelSource.indexOf(
    "const syncResult = await syncTerraformToDiagram",
    remainingDiagnosticsIndex
  );

  assert.ok(safeFixIndex > -1);
  assert.ok(originalDiagnosticIndex > safeFixIndex);
  assert.ok(remainingDiagnosticsIndex > originalDiagnosticIndex);
  assert.ok(syncIndex > remainingDiagnosticsIndex);
  assert.match(
    terraformPanelSource,
    /combineTerraformDiagnostics\(\s*validationDiagnostics,\s*syncResult\.diagnostics\s*\)/
  );
});

test("terraform source navigation scrolls and focuses the target line deterministically", () => {
  assert.match(terraformPanelSource, /const scrollTerraformEditorToLine = useCallback/);
  assert.match(terraformPanelSource, /lastScrolledNodeIdRef/);
  assert.match(terraformPanelSource, /const code = textarea\.value/);
  assert.match(terraformPanelSource, /const lineCount = code\.split/);
  assert.match(terraformPanelSource, /textarea\.focus\(\{ preventScroll: true \}\)/);
  assert.match(terraformPanelSource, /textarea\.setSelectionRange\(cursorOffset, cursorOffset\)/);
  assert.match(terraformPanelSource, /textarea\.scrollTop = targetScrollTop/);
  assert.match(terraformPanelSource, /textarea\.scrollLeft = 0/);
  assert.match(terraformPanelSource, /setCodeScrollTop\(textarea\.scrollTop\)/);
  assert.match(terraformPanelSource, /setCodeScrollLeft\(textarea\.scrollLeft\)/);
  assert.match(terraformPanelSource, /lineNumberRef\.current\.scrollTop = textarea\.scrollTop/);
  assert.doesNotMatch(
    terraformPanelSource,
    /}, \[displayedTerraformCode, lineNumbers\.length\]\);/
  );
});

test("terraform issue AI resolution can close the chat dock without trapping the issue card", () => {
  assert.match(aiChatDockSource, /function closeChatDock/);
  assert.match(aiChatDockSource, /setTerraformIssueResolution\(null\)/);
  assert.match(aiChatDockSource, /setApplyingTerraformFixRequestId\(null\)/);
  assert.match(aiChatDockSource, /onClick=\{closeChatDock\}/);
});

test("terraform editor renders syntax colors and squiggly error underlines", () => {
  const syntaxHighlightLayerRule = getCssRule(
    terraformEditorStylesSource,
    "terraformSyntaxHighlightLayer"
  );
  const highlightedLineErrorRule = getCssRule(
    terraformEditorStylesSource,
    "terraformHighlightedLineError"
  );
  const lineNumberErrorRule = getCssRule(terraformEditorStylesSource, "terraformLineNumberError");
  const textareaRule = getCssRule(terraformEditorStylesSource, "terraformTextarea");
  const keywordRule = getCssRule(terraformEditorStylesSource, "terraformTokenKeyword");
  const identifierRule = getCssRule(terraformEditorStylesSource, "terraformTokenIdentifier");
  const referenceRule = getCssRule(terraformEditorStylesSource, "terraformTokenReference");
  const stringRule = getCssRule(terraformEditorStylesSource, "terraformTokenString");
  const braceRule = getCssRule(terraformEditorStylesSource, "terraformTokenBrace");

  assert.match(terraformPanelSource, /createTerraformDiagnosticLineNumbers/);
  assert.match(terraformPanelSource, /createTerraformHighlightedLines/);
  assert.match(terraformPanelSource, /diagnosticLineNumbers/);
  assert.match(terraformEditorSource, /terraformSyntaxHighlightLayer/);
  assert.match(terraformEditorSource, /terraformHighlightedLineError/);
  assert.match(terraformEditorSource, /terraformTokenKeyword/);
  assert.match(terraformEditorSource, /terraformLineNumberError/);
  assert.match(terraformEditorSource, /state\.diagnosticLineNumbers\.has\(lineNumber\)/);
  assert.doesNotMatch(terraformPanelSource, /lineHeight:\s*TERRAFORM_EDITOR_LINE_HEIGHT/);
  assert.doesNotMatch(terraformPanelSource, /verticalPadding:\s*TERRAFORM_EDITOR_VERTICAL_PADDING/);
  assert.doesNotMatch(terraformPanelSource, /terraformDiagnosticLineLayer/);
  assert.match(syntaxHighlightLayerRule, /\bpointer-events:\s*none;/);
  assert.match(syntaxHighlightLayerRule, /\bposition:\s*absolute;/);
  assert.match(highlightedLineErrorRule, /\btext-decoration-style:\s*wavy;/);
  assert.match(highlightedLineErrorRule, /\btext-decoration-color:\s*#ef4444;/);
  assert.match(textareaRule, /\bcolor:\s*transparent;/);
  assert.match(textareaRule, /\bcaret-color:\s*#ffffff;/);
  assert.match(keywordRule, /\bcolor:\s*#f6c85f;/);
  assert.match(identifierRule, /\bcolor:\s*#7fd2ff;/);
  assert.match(referenceRule, /\bcolor:\s*#5fe0c1;/);
  assert.match(stringRule, /\bcolor:\s*#f0a77d;/);
  assert.match(braceRule, /\bcolor:\s*#9bd7ff;/);
  assert.match(lineNumberErrorRule, /\bcolor:\s*#fca5a5;/);
});

test("terraform selected block scrolls to the editor center with a clamped target", () => {
  const selectedBlockEffectIndex = terraformPanelSource.indexOf(
    "if (!isVisible || isResourceCodeMode || !selectedBlock || !textareaRef.current)"
  );
  const sourceLocationEffectIndex = terraformPanelSource.indexOf(
    "if (!pendingSourceLocation || !isVisible || isResourceCodeMode)",
    selectedBlockEffectIndex
  );
  const selectedBlockEffectSource = terraformPanelSource.slice(
    selectedBlockEffectIndex,
    sourceLocationEffectIndex
  );

  assert.ok(selectedBlockEffectIndex > -1);
  assert.ok(sourceLocationEffectIndex > selectedBlockEffectIndex);
  assert.match(terraformPanelSource, /function clampTerraformEditorScrollTop/);
  assert.match(
    selectedBlockEffectSource,
    /const blockTop = TERRAFORM_EDITOR_VERTICAL_PADDING \+ \(selectedBlock\.startLine - 1\) \* lineHeight;/
  );
  assert.match(
    selectedBlockEffectSource,
    /const blockHeight =\s*Math\.max\(1, selectedBlock\.endLine - selectedBlock\.startLine \+ 1\) \* lineHeight;/
  );
  assert.match(
    selectedBlockEffectSource,
    /const targetScrollTop = blockTop \+ blockHeight \/ 2 - textarea\.clientHeight \/ 2;/
  );
  assert.match(
    selectedBlockEffectSource,
    /clampTerraformEditorScrollTop\(targetScrollTop, textarea\)/
  );
  assert.match(
    selectedBlockEffectSource,
    /lineNumberRef\.current\.scrollTop = textarea\.scrollTop;/
  );
  assert.doesNotMatch(selectedBlockEffectSource, /selectedBlock\.startLine - 2/);
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
  assert.doesNotMatch(
    terraformPanelSource,
    /className=\{styles\.terraformPreviewExplanationPanel\}/
  );
  assert.doesNotMatch(terraformPanelSource, /closeTerraformPreviewExplanation/);
  assert.doesNotMatch(terraformPanelSource, /setTerraformPreviewExplanation/);
  assert.doesNotMatch(terraformPanelSource, /checklist\.length\} Checks/);
});

test("terraform resource code mode keeps explanation but omits validation and deployment actions", () => {
  assert.match(
    terraformToolbarSource,
    /<TerraformExplanationButton actions=\{actions\} state=\{state\} \/>/
  );
  assert.match(terraformToolbarSource, /<span>Preview 설명<\/span>/);
  assert.doesNotMatch(terraformPanelSource, /<span>Validate<\/span>/);
  assert.doesNotMatch(terraformPanelSource, />\s*Validate\s*<\/button>/);
  assert.doesNotMatch(terraformPanelSource, /리소스 단위 plan API 연결 예정/);
  assert.doesNotMatch(terraformPanelSource, /리소스 단위 apply API 연결 예정/);
  assert.doesNotMatch(terraformPanelSource, /리소스 단위 destroy API 연결 예정/);
  assert.doesNotMatch(terraformPanelSource, /className=\{styles\.resourceActionPrimary\}/);
  assert.doesNotMatch(terraformPanelSource, /className=\{styles\.resourceActionDanger\}/);
  assert.doesNotMatch(stylesSource, /\.resourceActionPrimary\s*\{/);
  assert.doesNotMatch(stylesSource, /\.resourceActionDanger\s*\{/);
  assert.match(deploymentPanelSource, /Plan 생성/);
  assert.match(deploymentPanelSource, /Apply 실행/);
  assert.match(deploymentPanelSource, /Destroy 실행 검토/);
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
  assert.ok(
    terraformPanelSource.indexOf('setRequestState("loading")', prepareIndex) > prepareIndex
  );
  assert.ok(terraformPanelSource.indexOf('setRequestState("idle")', prepareIndex) > prepareIndex);
  assert.ok(terraformPanelSource.indexOf('setRequestState("error")', prepareIndex) > prepareIndex);
  assert.match(terraformPanelSource, /isPreparingTerraformArtifactRef/);
});

test("terraform editor labels inline validation as fast Terraform error checking without progress UI", () => {
  const topBarRule = getCssRule(terraformToolbarStylesSource, "terraformTopBar");
  const topActionsRule = getCssRule(terraformToolbarStylesSource, "terraformTopActions");

  assert.doesNotMatch(terraformPanelSource, /terraformValidationProgressBar/);
  assert.doesNotMatch(terraformPanelSource, /TerraformValidationProgress/);
  assert.doesNotMatch(terraformPanelSource, /기본 문법 확인 중/);
  assert.match(terraformPanelSource, /Terraform 오류 확인 중/);
  assert.doesNotMatch(terraformPanelSource, /Terraform 검증 준비 중/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressBar\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressWorking\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressDone\s*\{/);
  assert.doesNotMatch(stylesSource, /\.terraformValidationProgressError\s*\{/);
  assert.match(topBarRule, /\balign-items:\s*center;/);
  assert.match(topActionsRule, /\bmin-width:\s*0;/);
  assert.match(terraformToolbarStylesSource, /@media \(max-width:\s*520px\)/);
  assert.match(terraformToolbarStylesSource, /flex-direction:\s*column;/);
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
  assert.match(
    terraformPanelSource,
    /terraformFiles:\s*toTerraformValidationFiles\(terraformFiles\)/
  );
  assert.match(
    terraformPanelSource,
    /terraformCode:\s*terraformFiles\.length > 0 \? "" : combinedTerraformCode/
  );
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
  assert.match(
    terraformPanelSource,
    /terraformFiles:\s*toTerraformValidationFiles\(terraformFiles\)/
  );
  assert.match(terraformPanelSource, /applyAllTerraformSyncProposals/);
  assert.match(terraformPanelSource, /syncResult\.proposals && syncResult\.proposals\.length > 0/);
  assert.match(
    terraformPanelSource,
    /const authoritativeDiagramJson = markTerraformSourceAuthoritative\(nextDiagramJson\)[\s\S]*context\.applyDiagramJson\(authoritativeDiagramJson\)/
  );
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
  const saveEndIndex = terraformPanelSource.indexOf(
    "const validateCurrentTerraform",
    saveStartIndex
  );
  const saveSource = terraformPanelSource.slice(saveStartIndex, saveEndIndex);

  assert.ok(saveStartIndex > -1);
  assert.ok(saveEndIndex > saveStartIndex);
  assert.match(saveSource, /syncTerraformCodeToDiagram/);
  assert.doesNotMatch(saveSource, /!hasTerraformCode/);
});

test("terraform virtual file validation avoids request bursts and combined-code empty checks", () => {
  assert.doesNotMatch(terraformPanelSource, /Promise\.all\(\s*files/);
  assert.match(
    terraformPanelSource,
    /nextFiles\.some\(\(file\) => file\.code\.trim\(\)\.length > 0\)/
  );
  assert.doesNotMatch(
    terraformPanelSource,
    /combineTerraformFiles\(nextFiles\)\.trim\(\)\.length > 0/
  );
});

test("terraform editor keeps diagnostics visible after local edits", () => {
  const handleCodeChangeIndex = terraformPanelSource.indexOf("function handleCodeChange");
  const handleCodeChangeEndIndex = terraformPanelSource.indexOf(
    "function handleCodeKeyDown",
    handleCodeChangeIndex
  );
  const handleCodeChangeSource = terraformPanelSource.slice(
    handleCodeChangeIndex,
    handleCodeChangeEndIndex
  );

  assert.ok(handleCodeChangeIndex > -1);
  assert.ok(handleCodeChangeEndIndex > handleCodeChangeIndex);
  assert.match(handleCodeChangeSource, /codeVersionRef\.current \+= 1/);
  assert.doesNotMatch(handleCodeChangeSource, /setDiagnostics\(\[\]\)/);
  assert.doesNotMatch(handleCodeChangeSource, /onDiagnosticsChange\(\[\]\)/);
  assert.match(componentSource, /markTerraformIssuesStale/);
});

test("terraform Issues compose Board dependency diagnostics without storing them locally", () => {
  assert.match(componentSource, /<WorkspaceIssuesPanel/);
  assert.match(componentSource, /architectureDiagnostics=\{architectureDiagnostics\}/);
  assert.match(componentSource, /context\.selectResourceNode\(diagnostic\.resourceNodeId\)/);
  assert.match(workspaceIssuesPanelSource, /<ArchitectureIssuesPanel/);
  assert.match(workspaceIssuesPanelSource, /<TerraformIssuesPanel/);
  assert.match(architectureIssuesPanelSource, /보드에서 보기/);
  assert.doesNotMatch(componentSource, /storeTerraformIssues\([^\n]*architecture/);
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

function getCssRuleAfter(source: string, className: string, fromIndex: number): string {
  assert.ok(fromIndex > -1, `Expected a starting point before .${className} CSS rule`);

  const match = new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`).exec(source.slice(fromIndex));

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}

function getLastCssRuleAfter(source: string, className: string, fromIndex: number): string {
  assert.ok(fromIndex > -1, `Expected a starting point before .${className} CSS rule`);

  const matches = Array.from(
    source.slice(fromIndex).matchAll(new RegExp(`\\.${className}\\s*\\{(?<body>[^}]*)\\}`, "g"))
  );
  const match = matches.at(-1);

  assert.ok(match?.groups?.body, `Expected .${className} CSS rule to exist`);

  return match.groups.body;
}

function getLastCssRuleContainingAfter(
  source: string,
  selectorFragment: string,
  fromIndex: number
): string {
  assert.ok(fromIndex > -1, `Expected a starting point before ${selectorFragment} CSS rule`);

  const escapedSelectorFragment = selectorFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = Array.from(
    source
      .slice(fromIndex)
      .matchAll(new RegExp(`[^{}]*${escapedSelectorFragment}[^{}]*\\{(?<body>[^}]*)\\}`, "g"))
  );
  const match = matches.at(-1);

  assert.ok(match?.groups?.body, `Expected ${selectorFragment} CSS rule to exist`);

  return match.groups.body;
}

function readCssNumber(rule: string, propertyName: string): number {
  const escapedPropertyName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escapedPropertyName}:\\s*(?<value>\\d+);`).exec(rule);

  assert.ok(match?.groups?.value, `Expected ${propertyName} to exist in CSS rule`);

  return Number.parseInt(match.groups.value, 10);
}
