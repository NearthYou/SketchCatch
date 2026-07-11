import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const assistantSource = readWorkspaceFile("ai-assistant/WorkspaceAiAssistant.tsx");
const assistantHookSource = readWorkspaceFile("ai-assistant/use-workspace-ai-assistant.ts");
const assistantStyles = readWorkspaceFile("ai-assistant/workspace-ai-assistant.module.css");
const gitCicdHookSource = readWorkspaceFile("operations/use-workspace-git-cicd.ts");
const gitCicdPanelSource = readWorkspaceFile("operations/GitCicdOperationsPanel.tsx");
const operationsDockSource = readWorkspaceFile("operations/WorkspaceOperationsDock.tsx");
const operationsDockStyles = readWorkspaceFile("operations/workspace-operations.module.css");

test("AI 런처와 panel은 keyboard 접근성 계약을 제공한다", () => {
  assert.match(assistantSource, /aria-label="AI 채팅 열기"/);
  assert.match(assistantSource, /role="tooltip"/);
  assert.match(assistantSource, /event\.key === "Escape"/);
  assert.match(assistantSource, /launcherRef\.current\?\.focus\(\)/);
  assert.match(assistantSource, /aria-live="polite"/);
});

test("AI 제안은 사용자 승인 함수에서만 실제 상태에 적용한다", () => {
  const applyBoardStart = assistantHookSource.indexOf("const applyBoardPreview");
  const applyTerraformStart = assistantHookSource.indexOf("const applyTerraformFix");
  const cancelPreviewStart = assistantHookSource.indexOf("const cancelPreview");

  assert.notEqual(applyBoardStart, -1);
  assert.notEqual(applyTerraformStart, -1);
  assert.notEqual(cancelPreviewStart, -1);
  assert.match(assistantHookSource.slice(applyBoardStart, applyTerraformStart), /context\.applyDiagramJson/);
  assert.match(assistantHookSource.slice(applyTerraformStart, cancelPreviewStart), /terraform\.setFileCode/);
  assert.doesNotMatch(assistantHookSource.slice(0, applyBoardStart), /context\.applyDiagramJson/);
  assert.doesNotMatch(assistantHookSource.slice(0, applyTerraformStart), /terraform\.setFileCode\(/);
});

test("AI Board 제안은 요청 중 또는 승인 전에 Board가 바뀌면 적용하지 않는다", () => {
  const draftRequestStart = assistantHookSource.indexOf("if (mode === \"draft\")");
  const patchRequestStart = assistantHookSource.indexOf("const response = await createAiArchitecturePatchPreview");
  const applyBoardStart = assistantHookSource.indexOf("const applyBoardPreview");
  const applyDiagramStart = assistantHookSource.indexOf(
    "context.applyDiagramJson",
    applyBoardStart
  );

  assert.notEqual(draftRequestStart, -1);
  assert.notEqual(patchRequestStart, -1);
  assert.notEqual(applyBoardStart, -1);
  assert.notEqual(applyDiagramStart, -1);
  assert.match(
    assistantHookSource.slice(draftRequestStart, patchRequestStart),
    /rejectStaleBoardResult\(boardSnapshot\.fingerprint\)/
  );
  assert.match(
    assistantHookSource.slice(patchRequestStart, applyBoardStart),
    /rejectStaleBoardResult\(boardSnapshot\.fingerprint\)/
  );
  assert.match(
    assistantHookSource.slice(applyBoardStart, applyDiagramStart),
    /rejectStaleBoardResult\(pendingBoardPreview\.baseFingerprint\)/
  );
});

test("Terraform 수정안은 현재 코드와 제안 코드를 비교한 뒤에만 적용한다", () => {
  const explainStart = assistantHookSource.indexOf("const explainTerraform");
  const simulationStart = assistantHookSource.indexOf("const runSimulation");

  assert.notEqual(explainStart, -1);
  assert.notEqual(simulationStart, -1);
  assert.doesNotMatch(assistantHookSource.slice(explainStart, simulationStart), /terraform\.generate\(\)/);
  assert.match(assistantHookSource, /readonly currentCode: string/);
  assert.match(assistantHookSource, /applyTerraformCodeReplacement/);
  assert.doesNotMatch(assistantHookSource, /result\.safeFix\?\.applicable \? result\.safeFix\.code/);
  assert.match(assistantSource, /현재 코드/);
  assert.match(assistantSource, /제안 코드/);
  assert.match(assistantSource, /비교 확인/);
  assert.match(assistantSource, /disabled=\{assistant\.pendingTerraformFix !== null && !isTerraformFixReviewed\}/);
});

test("Git/CI/CD 준비는 AWS Role 변경을 미리 승인하지 않는다", () => {
  assert.doesNotMatch(gitCicdHookSource, /approveAwsRoleDiff: true/);
  assert.doesNotMatch(gitCicdHookSource, /approveAwsRoleDiff:/);
  assert.doesNotMatch(gitCicdHookSource, /userAcceptedChangeId: `git-cicd-/);
  assert.match(gitCicdPanelSource, /approvedPlanArtifactId/);
  assert.match(gitCicdPanelSource, /Plan과 선택한 Repository로 PR을 만드는 변경을 확인했습니다/);
});

test("AI 런처와 panel은 desktop과 mobile 크기를 따로 가진다", () => {
  assert.match(assistantStyles, /\.launcher\s*\{[^}]*height:\s*44px;[^}]*width:\s*44px;/s);
  assert.match(assistantStyles, /--assistant-panel-width:\s*clamp\(360px, 31vw, 420px\);/);
  assert.match(assistantStyles, /@media \(max-width: 768px\)/);
  assert.match(assistantStyles, /width:\s*100vw;/);
  assert.match(assistantStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(assistantStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("AI panel이 열리면 다른 Workspace 작업 도구를 화면에서 숨긴다", () => {
  assert.match(operationsDockSource, /hidden=\{isAssistantOpen\}/);
  assert.match(operationsDockStyles, /\.dock\[hidden\]\s*\{[^}]*display:\s*none;/s);
});

test("배포 전 검사는 합친 코드가 아니라 원래 Terraform 파일 목록을 사용한다", () => {
  const safetyHookSource = readWorkspaceFile("operations/use-workspace-safety.ts");

  assert.match(operationsDockSource, /terraformFiles:\s*terraform\.files/);
  assert.match(safetyHookSource, /const populatedTerraformFiles = terraformFiles/);
  assert.match(safetyHookSource, /\.map\(\(file\) => \(\{/);
  assert.match(safetyHookSource, /fileName:\s*file\.fileName/);
  assert.match(safetyHookSource, /terraformCode:\s*file\.code/);
  assert.doesNotMatch(safetyHookSource, /fileName:\s*"main\.tf",\s*terraformCode/);
});

// Workspace app 경로의 새 AI 파일을 test에서 같은 방식으로 읽습니다.
function readWorkspaceFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../app/workspace/${relativePath}`, import.meta.url)),
    "utf8"
  );
}
