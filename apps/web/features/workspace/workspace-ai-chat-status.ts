export type WorkspaceAiChatDockRequestState = "idle" | "loading" | "error";

export type WorkspaceAiChatDockStatus = {
  readonly description: string;
  readonly label: string;
};

export function getWorkspaceAiChatDockStatus({
  hasPendingApproval,
  isStale,
  requestState
}: {
  readonly hasPendingApproval: boolean;
  readonly isStale: boolean;
  readonly requestState: WorkspaceAiChatDockRequestState;
}): WorkspaceAiChatDockStatus | null {
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
      description: "작업 기준이 바뀌어 적용할 수 없습니다. 최신 기준으로 다시 실행하세요.",
      label: "오래된 제안"
    };
  }

  if (hasPendingApproval) {
    return {
      description: "제안을 확인한 뒤 적용하거나 취소하세요.",
      label: "적용 대기"
    };
  }

  return null;
}
