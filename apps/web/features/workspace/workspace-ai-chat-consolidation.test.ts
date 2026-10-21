import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { requireSuccessfulWorkspaceDiagramSave } from "./project-deployment-preparation";

const chatSource = read("WorkspaceAiChatDock.tsx");
const localDraftManagerSource = read("WorkspaceDraftManager.tsx");
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
    /className=\{styles\.approvalTray\}[\s\S]*onClick=\{\(\) => void applyPatchPreviewToBoard\(\)\}[\s\S]*onClick=\{cancelPatchPreview\}[\s\S]*regeneratePatchPreview/
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


test("Board patch success is shown only after Project Draft save succeeds", () => {
  const start = chatSource.indexOf("async function applyPatchPreviewToBoard");
  const end = chatSource.indexOf("function requestImmediateDiagramSave", start);
  const applySection = chatSource.slice(start, end);
  const applyIndex = applySection.indexOf("context.applyDiagramJson");
  const saveGuardIndex = applySection.indexOf("saveDiagramNow === undefined");
  const saveIndex = applySection.indexOf("const saveResult = await saveDiagramNow()");
  const validationIndex = applySection.indexOf("requireSuccessfulWorkspaceDiagramSave(saveResult)");
  const successIndex = applySection.indexOf("수정 사항을 보드에 적용하고 저장했습니다.");

  assert.ok(start > -1);
  assert.ok(end > start);
  assert.ok(applyIndex > -1);
  assert.ok(saveGuardIndex > -1 && saveGuardIndex < applyIndex);
  assert.ok(saveIndex > applyIndex);
  assert.ok(validationIndex > saveIndex);
  assert.ok(successIndex > validationIndex);
  assert.equal(applySection.includes("await context.saveDiagramNow?.()"), false);
  assert.match(applySection, /catch \{[\s\S]*프로젝트 저장에 실패했습니다/);
});

test("resolved Project Draft save failures are rejected before success feedback", () => {
  assert.throws(
    () => requireSuccessfulWorkspaceDiagramSave({ ok: false }),
    /프로젝트 저장이 완료되지 않아/
  );
});

test("local Workspace saves return explicit success and failure results", () => {
  assert.doesNotThrow(() =>
    requireSuccessfulWorkspaceDiagramSave({ ok: true, persistence: "local" })
  );
  assert.ok(localDraftManagerSource.includes('persistence: "local"'));
  assert.ok(localDraftManagerSource.includes("ok: false"));
});

test("Board patch application uses a synchronous lock around apply and save", () => {
  const start = chatSource.indexOf("async function applyPatchPreviewToBoard");
  const end = chatSource.indexOf("function requestImmediateDiagramSave", start);
  const applySection = chatSource.slice(start, end);
  const lockGuardIndex = applySection.indexOf("if (patchApplicationInFlightRef.current)");
  const lockStartIndex = applySection.indexOf("patchApplicationInFlightRef.current = true");
  const applyIndex = applySection.indexOf("context.applyDiagramJson");
  const saveIndex = applySection.indexOf("await saveDiagramNow()");
  const finallyIndex = applySection.indexOf("finally");
  const lockReleaseIndex = applySection.indexOf(
    "patchApplicationInFlightRef.current = false",
    lockStartIndex
  );

  assert.ok(chatSource.includes("patchApplicationInFlightRef = useRef(false)"));
  assert.ok(lockGuardIndex > -1 && lockGuardIndex < lockStartIndex);
  assert.ok(lockStartIndex < applyIndex);
  assert.ok(applyIndex < saveIndex);
  assert.ok(saveIndex < finallyIndex);
  assert.ok(finallyIndex < lockReleaseIndex);
});

test("chat submission uses a synchronous lock before awaiting AI", () => {
  const start = chatSource.indexOf("async function submitUserMessage");
  const end = chatSource.indexOf("async function handleUserMessage", start);
  const submitSection = chatSource.slice(start, end);

  assert.match(submitSection, /messageSubmissionInFlightRef\.current/);
  assert.match(
    submitSection,
    /messageSubmissionInFlightRef\.current = true;[\s\S]*await handleUserMessage[\s\S]*finally \{[\s\S]*messageSubmissionInFlightRef\.current = false;/
  );
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
