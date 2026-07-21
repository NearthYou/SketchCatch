import type { GitCicdPipelineRun } from "@sketchcatch/types";
import type { GitCicdHandoffReadinessItem } from "./cicd-handoff";
import { formatPipelineExecutionKind } from "./cicd-deployment-command";

export type DeploymentTargetPresentation = {
  readonly status: "saved" | "recommended" | "dirty" | "required";
  readonly statusLabel: string;
  readonly readinessHint: string | null;
  readonly saveLabel: string;
};

export function getDeploymentTargetPresentation(input: {
  readonly draftAwsConnectionId: string | null;
  readonly savedAwsConnectionId: string | null;
  readonly isDirty: boolean;
}): DeploymentTargetPresentation {
  if (input.isDirty) {
    return {
      status: "dirty",
      statusLabel: "미저장 변경",
      readinessHint: "변경 내용을 저장해야 배포 준비 상태에 반영됩니다.",
      saveLabel: "변경 저장"
    };
  }
  if (
    input.savedAwsConnectionId &&
    input.savedAwsConnectionId === input.draftAwsConnectionId
  ) {
    return {
      status: "saved",
      statusLabel: "저장됨",
      readinessHint: null,
      saveLabel: "저장됨"
    };
  }
  if (input.draftAwsConnectionId) {
    return {
      status: "recommended",
      statusLabel: "저장 전 추천값",
      readinessHint: "추천 AWS 연결이 선택되어 있지만 아직 저장되지 않았습니다.",
      saveLabel: "추천값 저장"
    };
  }
  return {
    status: "required",
    statusLabel: "설정 필요",
    readinessHint: "PR을 만들려면 AWS 연결을 선택하고 저장해야 합니다.",
    saveLabel: "AWS 연결 저장"
  };
}

export function groupGitCicdReadiness(
  items: readonly GitCicdHandoffReadinessItem[]
): {
  readonly required: GitCicdHandoffReadinessItem[];
  readonly completed: GitCicdHandoffReadinessItem[];
  readonly completedCount: number;
  readonly remainingLabel: string;
} {
  const required = items.filter((item) => item.status !== "ready");
  const completed = items.filter((item) => item.status === "ready");
  return {
    required,
    completed,
    completedCount: completed.length,
    remainingLabel:
      required.length === 0
        ? "배포 PR 준비 완료"
        : `배포 PR까지 ${required.length}개 남음`
  };
}

export function getPipelinePresentation(
  runs: readonly GitCicdPipelineRun[]
): {
  readonly hasRuns: boolean;
  readonly showRunControls: boolean;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
} {
  const hasRuns = (runs ?? []).length > 0;
  return {
    hasRuns,
    showRunControls: hasRuns,
    emptyTitle: "아직 실행된 Pipeline이 없습니다",
    emptyDescription: "배포 PR을 준비한 뒤 GitHub Actions 실행을 새로고침해 확인합니다."
  };
}

export function formatPipelineRunOption(run: GitCicdPipelineRun): string {
  return [
    formatPipelineExecutionKind(run.executionKind),
    run.commitSha.slice(0, 8),
    formatPipelineRunStatus(run.status)
  ].join(" · ");
}

export function formatPipelineRunStatus(status: GitCicdPipelineRun["status"]): string {
  return ({
    detected: "감지됨",
    queued: "대기 중",
    running: "실행 중",
    succeeded: "성공",
    failed: "실패",
    cancelled: "취소됨"
  } as const)[status];
}
