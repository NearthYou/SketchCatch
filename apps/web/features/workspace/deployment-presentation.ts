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
  init:
    "Terraform backend 설정, state S3 접근 권한, provider 초기화 로그와 lockfile을 확인하세요.",
  mock_run:
    "실행 점검 로그와 승인 snapshot, 대상 AWS 연결 및 worker 실행 환경을 확인하세요.",
  plan:
    "Terraform plan stderr, 변수 snapshot, state refresh 결과와 AWS 읽기 권한을 확인하세요.",
  preflight:
    "사전 검증 CodeBuild 로그와 checkout commit SHA, Dockerfile·frontend build 명령 및 생성 Artifact manifest를 확인하세요.",
  rollback:
    "직전 succeeded ApplicationRelease와 Task Definition ARN·image digest, ECS rollback 이벤트 및 health 결과를 확인하세요.",
  validate:
    "Terraform validate stderr의 파일·행 번호와 생성 코드, provider schema 및 승인 전 수정 내역을 확인하세요."
};

export function getDeploymentFailureDeveloperCheck(
  failureStage: Deployment["failureStage"],
  nodeEnv: string | undefined = process.env.NODE_ENV
): string | null {
  if (nodeEnv !== "development" || !failureStage) return null;
  return DEPLOYMENT_FAILURE_DEVELOPER_CHECKS[failureStage];
}
