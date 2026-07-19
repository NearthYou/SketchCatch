export type WorkspaceAiChatDockRequestState = "idle" | "loading" | "error";

export type WorkspaceAiChatDockStatus = {
  readonly description: string;
  readonly label: string;
};

export type WorkspaceAiProgressStep = {
  readonly description: string;
  readonly label: string;
};

export type TerraformPreviewReviewStep = WorkspaceAiProgressStep;

export const ARCHITECTURE_DRAFT_GENERATION_STEP_DURATION_MS = 1_500;

export const architectureDraftGenerationSteps: readonly WorkspaceAiProgressStep[] = [
  {
    label: "요청 의도 정리",
    description: "입력한 요구사항과 선택 답변을 아키텍처 조건으로 정리하고 있습니다."
  },
  {
    label: "리소스 후보 구성",
    description: "조건에 맞는 클라우드 리소스와 구성 패턴을 고르고 있습니다."
  },
  {
    label: "연결 구조 설계",
    description: "리소스 사이의 흐름과 의존 관계를 구성하고 있습니다."
  },
  {
    label: "아키텍처 결과 검증",
    description: "요구사항 누락과 구조 오류를 확인하고 초안을 정리하고 있습니다."
  },
  {
    label: "최종 초안 정리",
    description: "검증 결과를 반영해 다이어그램 초안을 마무리하고 있습니다."
  }
];

export const TERRAFORM_PREVIEW_REVIEW_STEP_DURATION_MS = 3_500;

export const terraformPreviewReviewSteps: readonly TerraformPreviewReviewStep[] = [
  {
    label: "Terraform 코드 구조 분석",
    description: "리소스와 참조 관계를 확인하고 있습니다."
  },
  {
    label: "배포 전 위험 신호 점검",
    description: "보안·비용·운영 위험과 누락된 설정을 찾고 있습니다."
  },
  {
    label: "Amazon Q 6가지 기준 검토",
    description: "Amazon Q가 전체 Terraform 구성을 검토하고 있습니다."
  },
  {
    label: "검토 결과 정리",
    description: "판단과 확인할 내용을 읽기 쉽게 정리하고 있습니다."
  }
];

export function getArchitectureDraftGenerationProgressStep(elapsedMs: number): number {
  return Math.min(
    Math.max(0, Math.floor(elapsedMs / ARCHITECTURE_DRAFT_GENERATION_STEP_DURATION_MS)),
    architectureDraftGenerationSteps.length - 1
  );
}

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
