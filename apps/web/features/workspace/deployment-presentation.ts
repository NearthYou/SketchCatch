import type { Deployment } from "@sketchcatch/types";

export type DeploymentStatusTone = "error" | "neutral" | "running" | "success";

export type DeploymentStatusPresentation = {
  readonly label: string;
  readonly tone: DeploymentStatusTone;
};

const DEPLOYMENT_STATUS_PRESENTATIONS: Readonly<
  Record<Deployment["status"], DeploymentStatusPresentation>
> = {
  CANCELLED: { label: "취소됨", tone: "neutral" },
  DESTROYED: { label: "정리 완료", tone: "success" },
  FAILED: { label: "실패", tone: "error" },
  PARTIALLY_CANCELED: { label: "부분 취소", tone: "neutral" },
  PARTIALLY_FAILED: { label: "부분 실패", tone: "error" },
  PENDING: { label: "대기 중", tone: "neutral" },
  RUNNING: { label: "실행 중", tone: "running" },
  SUCCESS: { label: "성공", tone: "success" }
};

export function getDeploymentStatusPresentation(
  status: Deployment["status"]
): DeploymentStatusPresentation {
  return DEPLOYMENT_STATUS_PRESENTATIONS[status];
}

export function getRecentDeploymentResultTitle(
  deployment: Pick<Deployment, "approvedAt" | "status"> | null
): "최근 검증 결과" | "최근 배포 결과" | "최근 실행 결과" {
  if (!deployment) {
    return "최근 실행 결과";
  }

  if (deployment.status === "FAILED" && !deployment.approvedAt) {
    return "최근 검증 결과";
  }

  if (!deployment.approvedAt) {
    return "최근 실행 결과";
  }

  return "최근 배포 결과";
}
