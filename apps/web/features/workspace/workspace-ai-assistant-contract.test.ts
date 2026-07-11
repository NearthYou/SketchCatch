import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const assistantSource = readWorkspaceFile("ai-assistant/WorkspaceAiAssistant.tsx");
const assistantHookSource = readWorkspaceFile("ai-assistant/use-workspace-ai-assistant.ts");
const assistantStyles = readWorkspaceFile("ai-assistant/workspace-ai-assistant.module.css");

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
  assert.match(assistantHookSource.slice(applyTerraformStart, cancelPreviewStart), /terraform\.setCode/);
  assert.doesNotMatch(assistantHookSource.slice(0, applyBoardStart), /context\.applyDiagramJson/);
});

test("AI 런처와 panel은 desktop과 mobile 크기를 따로 가진다", () => {
  assert.match(assistantStyles, /\.launcher\s*\{[^}]*height:\s*44px;[^}]*width:\s*44px;/s);
  assert.match(assistantStyles, /--assistant-panel-width:\s*clamp\(360px, 31vw, 420px\);/);
  assert.match(assistantStyles, /@media \(max-width: 768px\)/);
  assert.match(assistantStyles, /width:\s*100vw;/);
  assert.match(assistantStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(assistantStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

// Workspace app 경로의 새 AI 파일을 test에서 같은 방식으로 읽습니다.
function readWorkspaceFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../app/workspace/${relativePath}`, import.meta.url)),
    "utf8"
  );
}
