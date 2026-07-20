import type { Deployment } from "@sketchcatch/types";
import { getDeploymentDurationMs } from "./deployment-duration";

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

export type DeploymentHistoryFilter = "all" | "complete" | "unchanged";

type DeploymentHistoryMetricSource = Pick<
  Deployment,
  "cancelledAt" | "completedAt" | "failedAt" | "planSummary" | "startedAt" | "status" | "updatedAt"
>;

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

export function getDeploymentHistoryEntries<T extends DeploymentHistorySummary>(
  deployments: readonly T[]
): DeploymentHistoryEntry<T>[] {
  const ascendingDeployments = deployments
    .filter(isSuccessfulDeploymentVersion)
    .sort(compareDeploymentHistoryAscending);

  return ascendingDeployments
    .map((deployment) => ({
      deployment,
      versionLabel: createStableDeploymentVersionLabel(deployment)
    }))
    .reverse();
}

export function filterDeploymentHistoryEntries<
  T extends DeploymentHistorySummary & Pick<Deployment, "planSummary">
>(
  entries: readonly DeploymentHistoryEntry<T>[],
  filter: DeploymentHistoryFilter
): DeploymentHistoryEntry<T>[] {
  if (filter === "all" || filter === "complete") {
    return [...entries];
  }

  return entries.filter(
    ({ deployment }) =>
      deployment.planSummary !== null && getDeploymentPlanChangeCount(deployment.planSummary) === 0
  );
}

export function getDeploymentHistoryMetrics<
  T extends DeploymentHistorySummary & DeploymentHistoryMetricSource
>(
  entries: readonly DeploymentHistoryEntry<T>[]
): {
  readonly averageDurationMs: number | null;
  readonly completedCount: number;
  readonly totalChangeCount: number;
  readonly totalCount: number;
} {
  const durations = entries
    .map(({ deployment }) => getDeploymentDurationMs(deployment))
    .filter((duration): duration is number => duration !== null);

  return {
    averageDurationMs:
      durations.length === 0
        ? null
        : Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length),
    completedCount: entries.length,
    totalChangeCount: entries.reduce(
      (total, { deployment }) => total + getDeploymentPlanChangeCount(deployment.planSummary),
      0
    ),
    totalCount: entries.length
  };
}

function getDeploymentPlanChangeCount(summary: Deployment["planSummary"]): number {
  if (!summary) {
    return 0;
  }

  return summary.createCount + summary.updateCount + summary.deleteCount + summary.replaceCount;
}

export function resolveDeploymentHistorySelection<T extends DeploymentHistorySummary>(input: {
  readonly currentSelectionId: string;
  readonly deployments: readonly T[];
  readonly previousLatestDeploymentId: string;
  readonly visibleDeploymentIds?: readonly string[];
}): { readonly latestDeploymentId: string; readonly selectedDeploymentId: string } {
  const entries = getDeploymentHistoryEntries(input.deployments);
  const latestDeploymentId = entries[0]?.deployment.id ?? "";
  const visibleDeploymentIdSet = input.visibleDeploymentIds
    ? new Set(input.visibleDeploymentIds)
    : null;
  const visibleEntries = visibleDeploymentIdSet
    ? entries.filter(({ deployment }) => visibleDeploymentIdSet.has(deployment.id))
    : entries;
  const latestVisibleDeploymentId = visibleEntries[0]?.deployment.id ?? "";
  const currentSelectionIsAvailable = visibleEntries.some(
    ({ deployment }) => deployment.id === input.currentSelectionId
  );
  const hasNewSuccessfulDeployment = latestDeploymentId !== input.previousLatestDeploymentId;
  const newestSuccessfulDeploymentIsVisible = latestDeploymentId === latestVisibleDeploymentId;

  return {
    latestDeploymentId,
    selectedDeploymentId:
      !currentSelectionIsAvailable ||
      (hasNewSuccessfulDeployment && newestSuccessfulDeploymentIsVisible)
        ? latestVisibleDeploymentId
        : input.currentSelectionId
  };
}

function isSuccessfulDeploymentVersion(deployment: DeploymentHistorySummary): boolean {
  return deployment.status === "SUCCESS" || deployment.status === "DESTROYED";
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

export function getLatestCompletedDeploymentStep(
  deployment: Pick<
    Deployment,
    "approvedAt" | "currentPlanArtifactId" | "currentPlanOperation" | "status"
  >
): string {
  if (deployment.status === "DESTROYED") return "정리 실행";
  if (deployment.status === "SUCCESS") return "배포 실행";
  if (deployment.approvedAt) return "Plan 승인";
  if (deployment.currentPlanArtifactId) {
    return deployment.currentPlanOperation === "destroy" ? "Destroy Plan 생성" : "Plan 생성";
  }

  return "검증 완료";
}

function compareDeploymentHistoryAscending(
  left: DeploymentHistorySummary,
  right: DeploymentHistorySummary
): number {
  const createdAtDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);

  return createdAtDifference !== 0 ? createdAtDifference : left.id.localeCompare(right.id);
}

const DEPLOYMENT_FAILURE_DEVELOPER_CHECKS: Readonly<
  Record<NonNullable<Deployment["failureStage"]>, string>
> = {
  apply:
    "worker의 Terraform apply stderr와 state object, 승인된 tfplan hash, AWS 권한 및 실패 Resource를 확인하세요.",
  application_release:
    "ApplicationRelease의 failureStage와 CodeBuild 로그, ECR image digest, ECS task health, S3·CloudFront 배포 증거를 확인하세요.",
  approval:
    "승인된 Terraform artifact·Plan ID·hash와 현재 프로젝트 snapshot이 동일한지 확인하세요.",
  aws_connection:
    "Deployment의 AWS account·region snapshot과 연결 Role ARN, AssumeRole trust policy 및 session policy를 확인하세요.",
  build_environment:
    "CodeBuild project와 service role, Permissions Boundary, CodeConnections 상태 및 runtime fingerprint를 확인하세요.",
  destroy:
    "worker의 Terraform destroy stderr와 state, 삭제 차단 Resource 및 AWS 권한을 확인하세요.",
  init: "Terraform backend 설정, state S3 접근 권한, provider 초기화 로그와 lockfile을 확인하세요.",
  mock_run: "실행 점검 로그와 승인 snapshot, 대상 AWS 연결 및 worker 실행 환경을 확인하세요.",
  plan: "Terraform plan stderr, 변수 snapshot, state refresh 결과와 AWS 읽기 권한을 확인하세요.",
  preflight:
    "사전 검증 CodeBuild 로그와 checkout commit SHA, Dockerfile·frontend build 명령 및 생성 Artifact manifest를 확인하세요.",
  rollback:
    "직전 succeeded ApplicationRelease와 Task Definition ARN·image digest, ECS rollback 이벤트 및 health 결과를 확인하세요.",
  validate:
    "Terraform validate stderr의 파일·행 번호와 생성 코드, provider schema 및 승인 전 수정 내역을 확인하세요."
};

export function getDeploymentFailureDeveloperCheck(
  failureStage: Deployment["failureStage"],
  nodeEnv: string | undefined = process.env.NODE_ENV,
  errorSummary?: string | null | undefined
): string | null {
  if (nodeEnv !== "development" || !failureStage) return null;
  if (
    /Application output reconciliation failed|DEPLOYMENT_OUTPUT_URL_CONFLICT/iu.test(
      errorSummary ?? ""
    )
  ) {
    return "준비된 runtimeConfig의 ecrRepositoryName, clusterName, serviceName, containerName, containerPort와 Terraform Output을 비교하고, 새 관리 Resource가 승인된 Terraform state inventory에 포함됐는지 확인하세요.";
  }
  if (/deployment target fingerprint/iu.test(errorSummary ?? "")) {
    return "project_deployment_targets의 runtimeConfig, runtimeTarget, deploymentTargetFingerprint를 AWS account·region 기준으로 다시 계산하고 같은 트랜잭션에서 저장했는지 확인하세요.";
  }
  return DEPLOYMENT_FAILURE_DEVELOPER_CHECKS[failureStage];
}
