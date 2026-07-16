import type { Deployment } from "@sketchcatch/types";

export type DeploymentStatusTone = "error" | "neutral" | "running" | "success";

export type DeploymentStatusPresentation = {
  readonly label: string;
  readonly tone: DeploymentStatusTone;
};

export type DeploymentHistorySummary = Pick<Deployment, "createdAt" | "id" | "status">;

export type DeploymentHistoryEntry<T extends DeploymentHistorySummary = DeploymentHistorySummary> =
  {
    readonly deployment: T;
    readonly versionLabel: string;
  };

const DEPLOYMENT_STATUS_PRESENTATIONS: Readonly<
  Record<Deployment["status"], DeploymentStatusPresentation>
> = {
  CANCELLED: { label: "취소됨", tone: "neutral" },
  DESTROYED: { label: "정리 완료", tone: "success" },
  FAILED: { label: "실패", tone: "error" },
  PENDING: { label: "대기 중", tone: "neutral" },
  RUNNING: { label: "실행 중", tone: "running" },
  SUCCESS: { label: "성공", tone: "success" }
};

export function getDeploymentStatusPresentation(
  status: Deployment["status"]
): DeploymentStatusPresentation {
  return DEPLOYMENT_STATUS_PRESENTATIONS[status];
}

export function getDeploymentHistoryEntries<T extends DeploymentHistorySummary>(
  deployments: readonly T[]
): DeploymentHistoryEntry<T>[] {
  const ascendingDeployments = [...deployments].sort(compareDeploymentHistoryAscending);

  return ascendingDeployments
    .map((deployment) => ({
      deployment,
      versionLabel:
        deployment.status === "SUCCESS" || deployment.status === "DESTROYED"
          ? createStableDeploymentVersionLabel(deployment)
          : "배포 시도"
    }))
    .reverse();
}

function createStableDeploymentVersionLabel(deployment: DeploymentHistorySummary): string {
  const timestamp = deployment.createdAt
    .replace(/[-:TZ.]/gu, "")
    .replace(/^(\d{8})(\d{6})(\d{3})$/u, "$1-$2-$3");
  const identitySuffix = deployment.id.replace(/[^a-zA-Z0-9]/gu, "").slice(-6);

  return `v${timestamp}-${identitySuffix}`;
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

function compareDeploymentHistoryAscending(
  left: DeploymentHistorySummary,
  right: DeploymentHistorySummary
): number {
  const createdAtDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);

  return createdAtDifference !== 0 ? createdAtDifference : left.id.localeCompare(right.id);
}
