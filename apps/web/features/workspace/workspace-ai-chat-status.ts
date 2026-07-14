import type { WorkspaceAiChatScope } from "./workspace-ai-chat-conversation";

export type WorkspaceAiChatDockRequestState = "idle" | "loading" | "error";

export type WorkspaceAiChatDockStatus = {
  readonly description: string;
  readonly label: string;
};

export function getWorkspaceAiChatDockStatus({
  hasCompletedResponse,
  hasPendingApproval,
  isStale,
  requestState,
  scope
}: {
  readonly hasCompletedResponse: boolean;
  readonly hasPendingApproval: boolean;
  readonly isStale: boolean;
  readonly requestState: WorkspaceAiChatDockRequestState;
  readonly scope: WorkspaceAiChatScope;
}): WorkspaceAiChatDockStatus {
  if (requestState === "loading") {
    return {
      description: "요청을 처리하고 있습니다.",
      label: "처리 중"
    };
  }

  if (requestState === "error") {
    return {
      description: "오류를 확인하고 다시 시도할 수 있습니다.",
      label: "요청 오류"
    };
  }

  if (isStale) {
    return {
      description: "보드 기준이 바뀌어 적용할 수 없습니다. 최신 기준으로 다시 생성하세요.",
      label: "오래된 제안"
    };
  }

  if (hasPendingApproval) {
    return {
      description: "제안을 확인한 뒤 적용하거나 취소하세요.",
      label: "적용 대기"
    };
  }

  if (hasCompletedResponse) {
    return {
      description: "새 요청을 입력할 수 있습니다.",
      label: "응답 완료"
    };
  }

  if (scope === "errors") {
    return {
      description: "Terraform Issue에서 분석을 요청하면 결과가 여기에 표시됩니다.",
      label: "입력 가능"
    };
  }

  if (scope === "preview") {
    return {
      description: "Terraform Preview에서 리뷰를 요청하면 결과가 여기에 표시됩니다.",
      label: "입력 가능"
    };
  }

  return {
    description: "Architecture와 Terraform에 대해 물어보세요.",
    label: "입력 가능"
  };
}
