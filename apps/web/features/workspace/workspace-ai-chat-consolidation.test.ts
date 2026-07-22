import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatSource = read("WorkspaceAiChatDock.tsx");
const toolbarSource = read("TerraformCodeToolbar.tsx");
const issuesSource = read("TerraformIssuesPanel.tsx");
const stylesSource = read("workspace-ai-workbench.module.css");

test("Terraform analysis and review actions live only in the AI chat dock", () => {
  assert.doesNotMatch(toolbarSource, /TerraformAgentReviewButton/);
  assert.doesNotMatch(issuesSource, /TerraformIssueAnalysisButton/);
  assert.match(chatSource, /analyzeSelectedTerraformIssue/);
  assert.match(chatSource, /analyzeAllTerraformIssues/);
  assert.match(chatSource, /runTerraformAgentReview/);
  assert.match(chatSource, /applyAllTerraformIssueFixes/);
});

test("the desktop AI chat overlay does not block Board interactions outside the work window", () => {
  assert.doesNotMatch(chatSource, /event\.target === event\.currentTarget[\s\S]*closeChatDock/);
  assert.match(stylesSource, /\.overlay\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(stylesSource, /\.workWindow\s*\{[^}]*pointer-events:\s*auto;/s);
  assert.match(
    stylesSource,
    /@media \(max-width:\s*768px\)[\s\S]*\.overlay\s*\{[^}]*pointer-events:\s*auto;/s
  );
});

test("analysis and review actions stay in their corresponding workbench task rows", () => {
  const errorActionsSection = readSection("workspace-ai-error-actions-title");
  const selectedErrorSection = readSection("workspace-ai-selected-error-title");
  const reviewSection = readSection("workspace-ai-review-title");
  const draftSection = readSection("workspace-ai-draft-result-title");
  const patchSection = readSection("workspace-ai-patch-result-title");

  assert.match(
    errorActionsSection,
    /className=\{styles\.taskActions\}[\s\S]*onClick=\{\(\) => void analyzeSelectedTerraformIssue\(\)\}[\s\S]*onClick=\{\(\) => void analyzeAllTerraformIssues\(\)\}/
  );
  assert.match(errorActionsSection, /onClick=\{applyAllTerraformIssueFixes\}/);
  assert.match(
    reviewSection,
    /className=\{styles\.taskActions\}[\s\S]*onClick=\{\(\) => void runTerraformAgentReview\(\)\}/
  );
  assert.match(
    selectedErrorSection,
    /className=\{styles\.approvalTray\}[\s\S]*onClick=\{applySelectedTerraformIssueFix\}/
  );
  assert.match(
    draftSection,
    /className=\{styles\.approvalTray\}[\s\S]*onClick=\{applyDraftToBoard\}[\s\S]*onClick=\{cancelDraftPreview\}[\s\S]*regenerateDraft/
  );
  assert.match(
    patchSection,
    /className=\{styles\.approvalTray\}[\s\S]*onClick=\{applyPatchPreviewToBoard\}[\s\S]*onClick=\{cancelPatchPreview\}[\s\S]*regeneratePatchPreview/
  );
});

test("right-panel interactions change tabs without forcing the floating chat open", () => {
  assert.doesNotMatch(chatSource, /terraformIssueRequest|terraformPreviewRequest/);
  assert.match(
    chatSource,
    /latestTerraformAiInteractionIdRef\.current = terraformAiInteraction\.id;\s*setActiveChatTab\(terraformAiInteraction\.scope\);/
  );
  assert.match(chatSource, /onOpen=\{\(\) => onOpenChange\(true\)\}/);
  assert.doesNotMatch(chatSource, /const \[isOpen, setOpen\] = useState/);
});

test("follow-up draft generation preserves the chosen Board proposal source", () => {
  assert.match(
    chatSource,
    /setDraftFollowUpSession\(\{\s*proposalSource,\s*session: previewDecision\.session\s*\}\)/
  );
  assert.match(chatSource, /showDraftPreview\(pendingDraft, draftFollowUpSession\.proposalSource\)/);
});

test("Terraform analysis runs sequentially by file and code fingerprint and stores results", () => {
  assert.match(chatSource, /resolveTerraformIssueCode\(\{/);
  assert.match(
    chatSource,
    /for \(let index = 0; index < issues\.length; index \+= 1\)[\s\S]*await analyzeTerraformIssue/
  );
  assert.match(chatSource, /readStoredTerraformIssueAnalyses/);
  assert.match(chatSource, /storeTerraformIssueAnalyses/);
  assert.match(
    chatSource,
    /terraformAiContextRef\.current\.fingerprint !== contextSnapshot\.fingerprint/
  );
  assert.match(chatSource, /requestRegistryRef\.current\.cancel\("errors"\)/);
});

test("safe fixes require a current analysis and the current Terraform fingerprint", () => {
  assert.match(chatSource, /analysis\?\.state !== "idle" \|\| !analysis\.explanation/);
  assert.match(chatSource, /expectedTerraformFingerprint: terraformAiContext\.fingerprint/);
  assert.match(chatSource, /mode: "single"/);
  assert.match(chatSource, /mode: "all"/);
});

test("draft failures keep diagnostics out of the transcript and render one user-facing error", () => {
  const start = chatSource.indexOf("async function createDraftFromRequest(");
  const end = chatSource.indexOf("function showDraftPreview(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const draftRequestSection = chatSource.slice(start, end);

  assert.match(draftRequestSection, /console\.error\("Workspace AI draft request failed", error\)/);
  assert.match(draftRequestSection, /setDraftState\("idle"\)/);
  assert.match(draftRequestSection, /setDraftErrorMessage\(""\)/);
  assert.match(draftRequestSection, /appendAssistantMessage\("error",/);
  assert.doesNotMatch(draftRequestSection, /getApiErrorMessage/);
  assert.doesNotMatch(draftRequestSection, /setDraftState\("error"\)/);
});

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readSection(labelledBy: string): string {
  const labelIndex = chatSource.indexOf(`aria-labelledby="${labelledBy}"`);
  assert.notEqual(labelIndex, -1, `${labelledBy} section must exist`);
  const sectionStart = chatSource.lastIndexOf("<section", labelIndex);
  const sectionEnd = chatSource.indexOf("</section>", labelIndex);
  assert.notEqual(sectionStart, -1, `${labelledBy} section start must exist`);
  assert.notEqual(sectionEnd, -1, `${labelledBy} section end must exist`);
  return chatSource.slice(sectionStart, sectionEnd + "</section>".length);
}
