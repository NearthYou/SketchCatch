import type { Deployment, ProjectDeleteAction, ProjectDeletePreview } from "@sketchcatch/types";

export type ProjectDeleteWorkflowStatus =
  | "ready"
  | "planning"
  | "approving"
  | "destroying"
  | "deleting";

export type ProjectDeleteProgress = {
  readonly detail: string;
  readonly label: string;
  readonly maxPercent: number;
  readonly percent: number;
};

const PROJECT_DELETE_PROGRESS: Partial<
  Record<ProjectDeleteWorkflowStatus, ProjectDeleteProgress>
> = {
  planning: {
    detail: "삭제 범위를 계산하고 실행 가능한 Destroy Plan을 준비하고 있습니다.",
    label: "Destroy Plan 생성 중",
    percent: 20,
    maxPercent: 40,
  },
  approving: {
    detail: "생성된 Plan을 프로젝트 삭제 요청에 연결하고 승인하고 있습니다.",
    label: "Destroy Plan 승인 중",
    percent: 45,
    maxPercent: 65,
  },
  destroying: {
    detail: "Terraform이 추적 중인 클라우드 리소스를 안전한 순서로 삭제하고 있습니다.",
    label: "클라우드 리소스 삭제 중",
    percent: 70,
    maxPercent: 90,
  },
  deleting: {
    detail: "S3 내부 산출물과 프로젝트 기록을 마지막으로 정리하고 있습니다.",
    label: "프로젝트 정리 중",
    percent: 92,
    maxPercent: 99,
  }
};

export function getProjectDeleteProgress(
  status: ProjectDeleteWorkflowStatus,
  elapsedMs = 0
): ProjectDeleteProgress | null {
  const progress = PROJECT_DELETE_PROGRESS[status];
  if (!progress) {
    return null;
  }

  return {
    ...progress,
    percent: Math.min(
      progress.maxPercent,
      progress.percent + Math.floor(Math.max(0, elapsedMs) / 1_000)
    )
  };
}

export function shouldShowProjectOnlyDeleteFallback(input: {
  readonly errorMessage?: string | undefined;
  readonly preview: ProjectDeletePreview;
  readonly selectedAction?: ProjectDeleteAction | undefined;
  readonly status: ProjectDeleteWorkflowStatus;
}): boolean {
  return (
    input.selectedAction === "destroy_then_delete" &&
    input.preview.availableActions.includes("delete_project_only") &&
    input.status === "ready" &&
    input.errorMessage !== undefined &&
    input.errorMessage.trim().length > 0
  );
}

export function getDestroyDeleteAcknowledgedWarningIds(
  deployment: Pick<Deployment, "planSummary"> | undefined
): string[] {
  return (
    deployment?.planSummary?.warnings
      ?.filter((warning) => warning.requiresAcknowledgement && !warning.blocksApproval)
      .map((warning) => warning.id) ?? []
  );
}

export function isDestroyPlanReadyForApproval(deployment: Deployment): boolean {
  return (
    deployment.status !== "RUNNING" &&
    deployment.activeStage === null &&
    deployment.currentPlanArtifactId !== null &&
    deployment.currentPlanOperation === "destroy" &&
    deployment.planSummary !== null
  );
}
