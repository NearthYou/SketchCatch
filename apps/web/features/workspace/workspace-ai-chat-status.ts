export type WorkspaceAiChatDockRequestState = "idle" | "loading" | "error";

export type WorkspaceAiChatDockStatus = {
  readonly description: string;
  readonly label: string;
};

export function getWorkspaceAiChatDockStatus({
  draftState,
  hasCompletedResponse,
  hasPendingApproval,
  hasTerraformError,
  hasTerraformLoading
}: {
  readonly draftState: WorkspaceAiChatDockRequestState;
  readonly hasCompletedResponse: boolean;
  readonly hasPendingApproval: boolean;
  readonly hasTerraformError: boolean;
  readonly hasTerraformLoading: boolean;
}): WorkspaceAiChatDockStatus {
  if (draftState === "loading" || hasTerraformLoading) {
    return {
      description: "요청을 처리하고 있습니다.",
      label: "처리 중"
    };
  }

  if (draftState === "error" || hasTerraformError) {
    return {
      description: "오류를 확인하고 다시 시도할 수 있습니다.",
      label: "요청 오류"
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

  return {
    description: "Architecture와 Terraform에 대해 물어보세요.",
    label: "입력 가능"
  };
}
