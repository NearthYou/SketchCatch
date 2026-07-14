import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceAiChatDockStatus } from "./workspace-ai-chat-status";

const readyState = {
  draftState: "idle" as const,
  hasCompletedResponse: false,
  hasPendingApproval: false,
  hasTerraformError: false,
  hasTerraformLoading: false
};

test("AI Chat 상태는 요청 처리 중을 최우선으로 표시한다", () => {
  assert.deepEqual(
    getWorkspaceAiChatDockStatus({
      ...readyState,
      hasTerraformLoading: true
    }),
    {
      description: "요청을 처리하고 있습니다.",
      label: "처리 중"
    }
  );
});

test("AI Chat 상태는 승인 전 제안을 적용 대기로 표시한다", () => {
  assert.deepEqual(
    getWorkspaceAiChatDockStatus({
      ...readyState,
      hasPendingApproval: true
    }),
    {
      description: "제안을 확인한 뒤 적용하거나 취소하세요.",
      label: "적용 대기"
    }
  );
});

test("AI Chat 상태는 응답이 없을 때 입력 가능으로 표시한다", () => {
  assert.deepEqual(getWorkspaceAiChatDockStatus(readyState), {
    description: "Architecture와 Terraform에 대해 물어보세요.",
    label: "입력 가능"
  });
});
