import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createWorkspaceOverlayNotifications } from "./workspace-overlay-notifications";

const controllerSource = read("WorkspaceAiChatDock.tsx");
const conversationSource = read("workspace-ai-chat-conversation.ts");
const diagramEditorSource = read("../diagram-editor/DiagramEditor.tsx");
const launcherSource = read("WorkspaceAiChatLauncher.tsx");
const launcherStyles = read("workspace-ai-chat-launcher.module.css");
const projectManagerSource = read("ProjectWorkspaceDraftManager.tsx");
const resultSource = read("WorkspaceAiWorkbenchResults.tsx");
const rightPanelSource = read("WorkspaceRightPanel.tsx");
const workbenchSource = read("WorkspaceAiWorkbench.tsx");
const workbenchStyles = read("workspace-ai-workbench.module.css");
const workspaceManagerSource = read("WorkspaceDraftManager.tsx");
const workspaceStyles = read("workspace.module.css");

test("AI chat controller delegates its outer surface to the AI Workbench", () => {
  assert.match(
    controllerSource,
    /import \{ WorkspaceAiWorkbench \} from "\.\/WorkspaceAiWorkbench";/
  );
  assert.match(controllerSource, /<WorkspaceAiWorkbench/);
  assert.doesNotMatch(controllerSource, /styles\.aiChatDock|styles\.aiChatChrome/);
  assert.doesNotMatch(readProductionSources(), /styles\.aiChat[A-Z]/);
});

test("AI Workbench exposes the desktop mode rail and active work panel accessibly", () => {
  assert.match(workbenchSource, /aria-label="AI 작업"/);
  assert.match(workbenchSource, /className=\{styles\.desktopModeRail\}/);
  assert.match(workbenchSource, /ariaOrientation="vertical"/);
  assert.match(workbenchSource, /aria-orientation=\{ariaOrientation\}/);
  assert.match(workbenchSource, /role="tablist"/);
  assert.match(workbenchSource, /role="tabpanel"/);
  assert.match(workbenchSource, /aria-labelledby=\{`workspace-ai-chat-tab-/);
});

test("AI Workbench owns status, transcript, footer, and nonmodal desktop pointer behavior", () => {
  assert.match(workbenchSource, /aria-live="polite"/);
  assert.match(workbenchSource, /role="status"/);
  assert.match(workbenchSource, /data-terraform-leave-guard-ignore/);
  assert.match(workbenchSource, /ref=\{transcriptRef\}/);
  assert.match(workbenchSource, /\{children\}/);
  assert.match(workbenchSource, /\{footer\}/);
  assert.match(workbenchStyles, /\.overlay\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(workbenchStyles, /\.workWindow\s*\{[^}]*pointer-events:\s*auto;/s);
});

test("AI Workbench shell uses only its dedicated visual token vocabulary", () => {
  assert.match(workbenchStyles, /--ai-workbench-/);
  assert.doesNotMatch(workbenchStyles, /--workspace-/);
  assert.doesNotMatch(workbenchStyles, /gradient\(/);
  assert.doesNotMatch(workbenchStyles, /(?:text-shadow|filter:\s*drop-shadow|--[^:]*glow)/i);

  const pixelFontSizes = [
    ...workbenchStyles.matchAll(
      /font-size:\s*calc\((\d+(?:\.\d+)?)px \+ var\(--presentation-font-size-increase\)\)/g
    )
  ].map(
    ([, size]) => Number(size)
  );
  assert.ok(pixelFontSizes.length > 0);
  assert.ok(pixelFontSizes.every((size) => size >= 11));
});

test("AI chat controller uses only the new Workbench transcript and workflow presentation", () => {
  assert.match(
    controllerSource,
    /import styles from "\.\/workspace-ai-workbench\.module\.css";/
  );
  assert.doesNotMatch(controllerSource, /from "\.\/workspace\.module\.css"/);
  assert.doesNotMatch(controllerSource, /WorkspaceAiPanelPieces/);
  assert.match(controllerSource, /styles\.message/);
  assert.match(controllerSource, /styles\.choiceGroup/);
  assert.match(controllerSource, /styles\.artifact/);
  assert.match(controllerSource, /styles\.taskActions/);
  assert.match(controllerSource, /styles\.approvalTray/);
  assert.match(controllerSource, /styles\.composer/);
});

test("AI Workbench owns dedicated result primitives and code-diff presentation", () => {
  assert.match(resultSource, /createTerraformPreviewPresentation/);
  assert.match(resultSource, /createTerraformIssuePresentation/);
  assert.match(resultSource, /styles\.result/);
  assert.match(resultSource, /styles\.technicalDetails/);
  assert.match(resultSource, /styles\.codeDiff/);
  assert.doesNotMatch(resultSource, /WorkspaceAiPanelPieces|workspace\.module\.css/);
});

test("에이전트 리뷰는 Amazon Q 응답 전에도 단계별 진행 상태를 표시한다", () => {
  assert.match(controllerSource, /WorkspaceAiWorkbenchReviewProgress/);
  assert.match(controllerSource, /terraformPreviewExplanation\?\.state === "loading"/);
  assert.match(resultSource, /Amazon Q 검토를 진행하고 있습니다/);
  assert.match(workbenchStyles, /\.reviewProgressSteps/);
  assert.match(workbenchStyles, /\.reviewProgressSpinner/);
});

test("draft composer grows to a six-line maximum and is absent from unsupported scopes", () => {
  assert.match(
    controllerSource,
    /footer=\{\s*activeScopeDefinition\.inputAvailable \? \([\s\S]*className=\{styles\.composer\}/
  );
  assert.match(controllerSource, /rows=\{1\}/);
  assert.match(workbenchStyles, /\.composerInput textarea\s*\{[^}]*field-sizing:\s*content;/s);
  assert.match(workbenchStyles, /\.composerInput textarea\s*\{[^}]*max-height:\s*calc\(/s);
  assert.match(workbenchStyles, /--ai-workbench-composer-max-lines:\s*6;/);
  assert.match(
    conversationSource,
    /errors:\s*\{[\s\S]*?inputAvailable:\s*false,[\s\S]*?label:\s*"오류 분석"/
  );
  assert.match(
    conversationSource,
    /preview:\s*\{[\s\S]*?inputAvailable:\s*false,[\s\S]*?label:\s*"에이전트 리뷰"/
  );
});

test("AI Workbench becomes an interactive full-screen surface on mobile", () => {
  assert.match(workbenchSource, /aria-modal=\{isMobileSurface \|\| undefined\}/);
  assert.match(
    workbenchStyles,
    /@media \(max-width:\s*768px\)[\s\S]*\.overlay\s*\{[^}]*pointer-events:\s*auto;/s
  );
  assert.match(
    workbenchStyles,
    /@media \(max-width:\s*768px\)[\s\S]*\.workWindow[^{}]*\{(?=[^}]*inset:\s*0;)(?=[^}]*height:\s*100dvh;)[^}]*\}/s
  );
  assert.match(workbenchStyles, /\.mobileTabList/);
  assert.match(workbenchStyles, /padding-bottom:\s*env\(safe-area-inset-bottom\);/);
  assert.match(launcherStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(workbenchStyles, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(launcherStyles, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("desktop Workbench and launcher stay left of the open right panel", () => {
  assert.match(
    workbenchStyles,
    /\.workWindow\[data-right-panel-open="true"\]\s*\{[^}]*right:\s*calc\(var\(--right-panel-width, 0px\) \+ 24px\);/s
  );
  assert.match(
    launcherStyles,
    /\.launcher\[data-right-panel-open="true"\]\s*\{[^}]*right:\s*calc\(var\(--right-panel-width, 0px\) \+ 20px\);/s
  );
});

test("launcher is a new labelled AI Workbench trigger instead of the legacy square badge", () => {
  assert.match(launcherSource, />AI 작업실<\/span>/);
  assert.match(launcherSource, /MessageSquareText/);
  assert.doesNotMatch(launcherSource, /className=\{styles\.mark\}|>\s*AI\s*<\/span>/);
  assert.match(launcherStyles, /--ai-workbench-launcher-/);
  assert.doesNotMatch(launcherStyles, /width:\s*44px|height:\s*44px|background:\s*#000000/);
});

test("selected Terraform issue result is inset inside the artifact body", () => {
  assert.match(
    controllerSource,
    /selectedTerraformIssueAnalysis\?\.explanation\s*\?\s*\(\s*<div className=\{styles\.artifactBody\}>\s*<WorkspaceAiWorkbenchTerraformIssueResult/
  );
});

test("legacy AI chat selectors are removed from the shared workspace stylesheet", () => {
  assert.doesNotMatch(workspaceStyles, /\.aiChat[A-Za-z0-9_-]*/);
});

test("closing the Workbench restores focus to its launcher", () => {
  assert.match(
    controllerSource,
    /const closeChatDock = useCallback\(\(\) => \{[\s\S]*?onOpenChange\(false\);[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?launcherButtonRef\.current\?\.focus\(\);/
  );
});

test("opening another workspace panel closes the controlled AI Workbench", () => {
  for (const managerSource of [projectManagerSource, workspaceManagerSource]) {
    assert.match(managerSource, /const \[isAiChatOpen, setAiChatOpen\] = useState\(false\);/);
    assert.match(
      managerSource,
      /<WorkspaceAiChatDock[\s\S]*?isBlockedByWorkspaceOverlay=\{isBlockingPanelOpen\}[\s\S]*?isOpen=\{isAiChatOpen\}[\s\S]*?onOpenChange=\{setAiChatOpen\}/
    );
    assert.match(managerSource, /onWorkspacePanelOpen=\{closeAiChat\}/);
    assert.match(
      managerSource,
      /<WorkspaceRightPanel[\s\S]*?onBlockingPanelOpenChange=\{setBlockingPanelOpen\}[\s\S]*?onPanelOpenRequest=\{closeAiChat\}/
    );
  }

  assert.match(controllerSource, /if \(isBlockedByWorkspaceOverlay\) \{\s*return null;\s*\}/);
  assert.match(
    rightPanelSource,
    /overlayNotificationsRef\.current\?\.notifyBlockingPanel\(\s*isDeploymentConsoleOpen \|\| isLiveObservationOpen\s*\);/
  );
  assert.match(rightPanelSource, /const openLiveObservation[\s\S]*?onPanelOpenRequest\(\);/);
  assert.match(
    diagramEditorSource,
    /const previewAutomaticOrganization = useCallback\(\(\) => \{\s*onWorkspacePanelOpen\?\.\(\);/
  );
});

test("workspace overlay notifications do not reset when parent callback identities change", () => {
  const firstBlockingCalls: boolean[] = [];
  const firstDeploymentCalls: boolean[] = [];
  const nextBlockingCalls: boolean[] = [];
  const nextDeploymentCalls: boolean[] = [];
  const notifications = createWorkspaceOverlayNotifications(
    (isOpen) => firstBlockingCalls.push(isOpen),
    (isOpen) => firstDeploymentCalls.push(isOpen)
  );

  notifications.notifyBlockingPanel(true);
  notifications.notifyDeploymentConsole(true);
  notifications.setCallbacks(
    (isOpen) => nextBlockingCalls.push(isOpen),
    (isOpen) => nextDeploymentCalls.push(isOpen)
  );

  assert.deepEqual(firstBlockingCalls, [true]);
  assert.deepEqual(firstDeploymentCalls, [true]);
  assert.deepEqual(nextBlockingCalls, []);
  assert.deepEqual(nextDeploymentCalls, []);

  notifications.notifyBlockingPanel(true);
  notifications.notifyDeploymentConsole(true);
  notifications.reset();

  assert.deepEqual(nextBlockingCalls, [true, false]);
  assert.deepEqual(nextDeploymentCalls, [true, false]);
  assert.match(
    rightPanelSource,
    /useEffect\(\s*\(\) => \(\) => \{\s*overlayNotificationsRef\.current\?\.reset\(\);\s*\},\s*\[\]\s*\);/
  );
});

test("mobile focus trap ignores roving tabs that are not keyboard focusable", () => {
  assert.match(
    controllerSource,
    /function trapFocusWithin[\s\S]*?\.filter\([\s\S]*?element\.tabIndex >= 0/
  );
  assert.match(
    controllerSource,
    /button:not\(:disabled\)[\s\S]*?summary[\s\S]*?\[tabindex\]/
  );
  assert.match(controllerSource, /element\.closest\("\[inert\]"\)/);
  assert.match(controllerSource, /element\.getClientRects\(\)\.length > 0/);
  assert.match(
    controllerSource,
    /!container\.contains\(document\.activeElement\)[\s\S]*?event\.shiftKey \? last : first/
  );
});

test("transcript follows new content only while the reader is near the bottom", () => {
  assert.match(workbenchSource, /onScroll=\{onTranscriptScroll\}/);
  assert.match(controllerSource, /transcriptShouldFollowRef/);
  assert.match(controllerSource, /isWorkspaceAiTranscriptNearBottom/);
  assert.match(controllerSource, /shouldForceTranscriptScroll/);
  assert.match(
    workbenchStyles,
    /\.transcript\s*\{[^}]*grid-auto-rows:\s*max-content;/s
  );
});

test("Errors scope exposes approval only for an applicable fresh fix plan", () => {
  assert.match(controllerSource, /const selectedTerraformFixPlan = useMemo/);
  assert.match(controllerSource, /selectedTerraformFixPlan\.canApply/);
  assert.match(
    controllerSource,
    /showSelectedTerraformApproval[\s\S]*?<div className=\{styles\.approvalTray\}/
  );
  assert.match(
    controllerSource,
    /disabled=\{[\s\S]*?!selectedTerraformFixPlan\.canApply[\s\S]*?applyingTerraformFixRequestId/
  );
});

test("clearing one scope preserves pending suggestion selections in other scopes", () => {
  assert.match(controllerSource, /removeWorkspaceAiSelectionEntries/);
  assert.match(
    controllerSource,
    /getChatMessageScope\(message\) === activeChatTab[\s\S]*?activeMessageIds/
  );
});

function read(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function readProductionSources(): string {
  const webRoot = new URL("../../", import.meta.url);
  const collected: string[] = [];

  visit(webRoot);
  return collected.join("\n");

  function visit(directory: URL): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".next" || entry.name === "node_modules") continue;

      const entryUrl = new URL(entry.name, ensureDirectoryUrl(directory));
      if (entry.isDirectory()) {
        visit(new URL(`${entry.name}/`, ensureDirectoryUrl(directory)));
        continue;
      }

      if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name) || entry.name.includes(".test.")) {
        continue;
      }

      collected.push(readFileSync(entryUrl, "utf8"));
    }
  }
}

function ensureDirectoryUrl(url: URL): URL {
  return url.pathname.endsWith("/") ? url : new URL(`${url.pathname}/`, url);
}
