import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspaceAssistantUnreadState,
  selectWorkspaceUtilitySurface
} from "./workspace-ai-assistant-state";

test("AI를 열면 다른 Workspace 작업 패널을 닫는다", () => {
  // Given: Terraform 작업 패널이 열려 있습니다.
  const currentSurface = "operations" as const;

  // When: 사용자가 AI 런처를 누릅니다.
  const nextSurface = selectWorkspaceUtilitySurface(currentSurface, "assistant");

  // Then: AI만 열린 상태가 됩니다.
  assert.equal(nextSurface, "assistant");
});

test("완료 응답은 닫힌 런처에만 읽지 않은 상태로 표시한다", () => {
  // Given: AI 패널을 닫은 뒤 새 응답이 완료됐습니다.
  const unreadWhileClosed = getWorkspaceAssistantUnreadState({
    isOpen: false,
    responseCompleted: true
  });

  // When: 같은 응답을 열린 패널에서 확인합니다.
  const unreadWhileOpen = getWorkspaceAssistantUnreadState({
    isOpen: true,
    responseCompleted: true
  });

  // Then: 닫힌 런처에만 상태점이 표시됩니다.
  assert.equal(unreadWhileClosed, true);
  assert.equal(unreadWhileOpen, false);
});
