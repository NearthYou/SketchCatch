import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dockSource = readWorkspaceAppFile("ai-dock/WorkspaceAiDock.tsx");
const dockStyles = readWorkspaceAppFile("ai-dock/workspace-ai-dock.module.css");
const hookSource = readWorkspaceAppFile("ai-assistant/use-workspace-ai-assistant.ts");
const operationsSource = readWorkspaceAppFile("operations/WorkspaceOperationsDock.tsx");
const apiSource = readWorkspaceFeatureFile("api.ts");

test("새 AI Dock은 실제 Workspace route에서 렌더링된다", () => {
  assert.match(operationsSource, /WorkspaceAiDock/);
  assert.match(operationsSource, /setRightPanelOpen\(false\)/);
});

test("새 런처는 tooltip과 keyboard 접근성 계약을 가진다", () => {
  assert.match(dockSource, /aria-label=.*AI 채팅 열기/);
  assert.match(dockSource, /aria-controls="workspace-ai-dock-panel"/);
  assert.match(dockSource, /role="tooltip"/);
  assert.match(dockSource, /event\.key === "Escape"/);
  assert.match(dockSource, /launcherRef\.current\?\.focus\(\)/);
});

test("새 AI panel은 승인 전 상태 변경을 금지한다", () => {
  const applyBoardStart = hookSource.indexOf("const applyBoardPreview");
  const applyTerraformStart = hookSource.indexOf("const applyTerraformFix");
  const cancelPreviewStart = hookSource.indexOf("const cancelPreview");

  assert.notEqual(applyBoardStart, -1);
  assert.notEqual(applyTerraformStart, -1);
  assert.notEqual(cancelPreviewStart, -1);
  assert.match(hookSource.slice(applyBoardStart, applyTerraformStart), /context\.applyDiagramJson/);
  assert.match(hookSource.slice(applyTerraformStart, cancelPreviewStart), /terraform\.setFileCode/);
  assert.doesNotMatch(hookSource.slice(0, applyBoardStart), /context\.applyDiagramJson/);
  assert.doesNotMatch(hookSource.slice(0, applyTerraformStart), /terraform\.setFileCode\(/);
});

test("새 AI Dock은 DESIGN token과 desktop/mobile 규격을 사용한다", () => {
  assert.match(dockStyles, /height:\s*44px/);
  assert.match(dockStyles, /width:\s*44px/);
  assert.match(dockStyles, /clamp\(376px, 30vw, 416px\)/);
  assert.match(dockStyles, /@media \(max-width: 768px\)/);
  assert.match(dockStyles, /100dvh/);
  assert.match(dockStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(dockStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(dockStyles, /#[0-9a-f]{3,8}\b/i);
});

test("작업 panel이 열리면 AI 런처가 그 위를 가리지 않는다", () => {
  assert.match(dockSource, /data-operations-open/);
  assert.match(dockStyles, /data-operations-open="true"/);
  assert.match(dockStyles, /min\(45vw, 680px\)/);
});

test("닫힌 동안 도착한 확인 질문도 unread 응답으로 표시한다", () => {
  assert.match(dockSource, /lastMessage\?\.role === "assistant"/);
  assert.doesNotMatch(dockSource, /lastMessage\.state !== "question"/);
});

test("AI 생성 중지는 모든 network 요청에 signal을 전달한다", () => {
  assert.match(apiSource, /runAiDesignSimulation\([\s\S]*?signal\?: AbortSignal/);
  assert.match(apiSource, /runAiTerraformPreviewExplanation\([\s\S]*?signal\?: AbortSignal/);
  assert.match(apiSource, /runAiTerraformErrorExplanation\([\s\S]*?signal\?: AbortSignal/);
  assert.match(hookSource, /runAiDesignSimulation\([\s\S]*?controller\.signal/);
  assert.match(hookSource, /runAiTerraformPreviewExplanation\([\s\S]*?controller\.signal/);
  assert.match(hookSource, /runAiTerraformErrorExplanation\([\s\S]*?controller\.signal/);
});

function readWorkspaceAppFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../app/workspace/${relativePath}`, import.meta.url)),
    "utf8"
  );
}

function readWorkspaceFeatureFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
