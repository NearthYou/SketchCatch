export type WorkspaceAiChatDockRequestState = "idle" | "loading" | "error";

export type WorkspaceAiChatDockStatus = {
  readonly description: string;
  readonly label: string;
};

export type TerraformPreviewReviewStep = {
  readonly description: string;
  readonly label: string;
};

export const TERRAFORM_PREVIEW_REVIEW_STEP_DURATION_MS = 3_500;

export const terraformPreviewReviewSteps: readonly TerraformPreviewReviewStep[] = [
  {
    label: "Terraform 코드 구조 분석",
    description: "리소스와 참조 관계를 확인하고 있습니다."
  },
  {
    label: "리소스 및 위험 점검",
    description: "보안·비용·운영 위험 신호를 찾고 있습니다."
  },
  {
    label: "Amazon Q Well-Architected 검토",
    description: "Amazon Q가 6개 설계 기준으로 구성을 검토하고 있습니다."
  },
  {
    label: "검토 결과 정리",
    description: "검토 요약과 다음 행동을 정리하고 있습니다."
  }
];

export function getTerraformPreviewReviewProgressStep(elapsedMs: number): number {
  return Math.min(
    Math.max(0, Math.floor(elapsedMs / TERRAFORM_PREVIEW_REVIEW_STEP_DURATION_MS)),
    terraformPreviewReviewSteps.length - 1
  );
}

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

  return null;
}
