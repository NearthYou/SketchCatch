import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspaceAiDockFocusTarget,
  getWorkspaceAiDockStatus,
  getWorkspaceAiDockUnread,
  resolveWorkspaceAiDockPhase
} from "./workspace-ai-dock-state";

const readyInput = {
  errorMessage: "",
  hasApproval: false,
  hasProjectContext: true,
  isOnline: true,
  lastMessageState: null,
  messageCount: 1,
  requestState: "idle"
} as const;

test("AI Dock은 열기와 닫기 전환에서만 focus를 이동한다", () => {
  assert.equal(getWorkspaceAiDockFocusTarget(false, true), "composer");
  assert.equal(getWorkspaceAiDockFocusTarget(true, false), "launcher");
  assert.equal(getWorkspaceAiDockFocusTarget(true, true), null);
  assert.equal(getWorkspaceAiDockFocusTarget(false, false), null);
});

test("AI Dock은 요청, 미리보기, 승인, 완료 상태를 구분한다", () => {
  assert.equal(resolveWorkspaceAiDockPhase({ ...readyInput, requestState: "sending" }), "sending");
  assert.equal(resolveWorkspaceAiDockPhase({ ...readyInput, requestState: "generating" }), "generating");
  assert.equal(resolveWorkspaceAiDockPhase({ ...readyInput, hasApproval: true }), "approval");
  assert.equal(
    resolveWorkspaceAiDockPhase({ ...readyInput, lastMessageState: "preview" }),
    "preview"
  );
  assert.equal(
    resolveWorkspaceAiDockPhase({ ...readyInput, lastMessageState: "completed" }),
    "completed"
  );
});

test("AI Dock은 프로젝트와 network가 없을 때 실행 불가 이유를 표시한다", () => {
  const disabled = resolveWorkspaceAiDockPhase({ ...readyInput, hasProjectContext: false });
  const offline = resolveWorkspaceAiDockPhase({ ...readyInput, isOnline: false });

  assert.deepEqual(getWorkspaceAiDockStatus(disabled), {
    description: "프로젝트를 연 뒤 AI를 사용할 수 있습니다.",
    label: "프로젝트가 필요함",
    tone: "muted"
  });
  assert.deepEqual(getWorkspaceAiDockStatus(offline), {
    description: "네트워크 연결을 확인한 뒤 다시 시도하세요.",
    label: "연결 확인 필요",
    tone: "warning"
  });
});

test("새 완료 응답은 닫힌 런처에만 unread 상태를 남긴다", () => {
  assert.equal(getWorkspaceAiDockUnread({ isOpen: false, responseCompleted: true }), true);
  assert.equal(getWorkspaceAiDockUnread({ isOpen: true, responseCompleted: true }), false);
});
