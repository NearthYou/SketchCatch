import type {
  Deployment,
  DeploymentProgressSnapshot,
  DeploymentStage
} from "@sketchcatch/types";

export type DeploymentProgressOperation = "apply" | "destroy" | "destroy-plan" | "plan";

type ProgressDeployment = Pick<
  Deployment,
  "activeStage" | "currentPlanOperation" | "failureStage" | "id" | "status"
>;

export type DeploymentProgressPresentation = {
  readonly detail: string;
  readonly mode: "complete" | "determinate" | "estimated" | "status";
  readonly operation: DeploymentProgressOperation;
  readonly percent: number | null;
  readonly title: string;
  readonly valueLabel: string;
};

export type DeploymentProgressPresentationInput = {
  readonly deployment: ProgressDeployment | null;
  readonly isStarting: boolean;
  readonly operationHint: DeploymentProgressOperation | null;
  readonly snapshot: DeploymentProgressSnapshot | null;
};

const OPERATION_TITLES: Readonly<Record<DeploymentProgressOperation, string>> = {
  apply: "Terraform Apply 실행 중",
  destroy: "Terraform Destroy 실행 중",
  "destroy-plan": "Terraform Destroy Plan 생성 중",
  plan: "Terraform Plan 생성 중"
};

const STARTING_ESTIMATED_PERCENT = 5;

const STAGE_ESTIMATED_PERCENT: Readonly<Record<DeploymentStage, number>> = {
  init: 15,
  preflight: 30,
  validate: 45,
  plan: 75,
  apply: 15,
  application_release: 99,
  rollback: 70,
  destroy: 15
};

export function getDeploymentProgressPresentation(
  input: DeploymentProgressPresentationInput
): DeploymentProgressPresentation | null {
  const snapshot =
    input.snapshot &&
    (!input.deployment || input.snapshot.deploymentId === input.deployment.id)
      ? input.snapshot
      : null;
  const operation = resolveDeploymentProgressOperation(input.deployment, input.operationHint);

  if (snapshot?.measurement.kind === "complete") {
    const wasDestroyed = snapshot.status === "DESTROYED";

    return {
      detail: wasDestroyed
        ? "승인된 리소스 정리가 완료되었습니다."
        : "승인된 배포 작업이 완료되었습니다.",
      mode: "complete",
      operation,
      percent: 100,
      title: wasDestroyed ? "리소스 정리 완료" : "배포 완료",
      valueLabel: "100% 완료"
    };
  }

  if (snapshot && isFailureStatus(snapshot.status)) {
    return {
      detail: getTerminalStatusDetail(snapshot.status, snapshot.failureStage),
      mode: "status",
      operation,
      percent: null,
      title: snapshot.status === "PARTIALLY_FAILED" ? "배포 일부 실패" : "배포 실패",
      valueLabel: "실패"
    };
  }

  if (snapshot && isCancelledStatus(snapshot.status)) {
    return {
      detail: "배포 실행이 취소되었습니다.",
      mode: "status",
      operation,
      percent: null,
      title: snapshot.status === "PARTIALLY_CANCELED" ? "배포 일부 취소" : "배포 취소",
      valueLabel: "취소"
    };
  }

  const activeStage = snapshot?.activeStage ?? input.deployment?.activeStage ?? null;

  if (snapshot?.measurement.kind === "resource_count" && activeStage) {
    const { completedUnits, percent, totalUnits } = snapshot.measurement;

    return {
      detail: `${getStageDetail(operation, activeStage)} ${completedUnits}/${totalUnits}개 완료`,
      mode: "determinate",
      operation,
      percent,
      title: getStageTitle(operation, activeStage),
      valueLabel: `${percent}%`
    };
  }

  const isRunning = snapshot?.status === "RUNNING" || input.deployment?.status === "RUNNING";

  if (!input.isStarting && !isRunning) {
    return null;
  }

  if (!activeStage) {
    return {
      detail: "실행 요청을 전달하고 Terraform 작업 환경을 준비하고 있습니다.",
      mode: "estimated",
      operation,
      percent: STARTING_ESTIMATED_PERCENT,
      title: OPERATION_TITLES[operation],
      valueLabel: `약 ${STARTING_ESTIMATED_PERCENT}%`
    };
  }

  const estimatedPercent = STAGE_ESTIMATED_PERCENT[activeStage];

  return {
    detail: getStageDetail(operation, activeStage),
    mode: "estimated",
    operation,
    percent: estimatedPercent,
    title: getStageTitle(operation, activeStage),
    valueLabel: `약 ${estimatedPercent}%`
  };
}

export function resolveDeploymentProgressOperation(
  deployment: ProgressDeployment | null,
  operationHint: DeploymentProgressOperation | null
): DeploymentProgressOperation {
  if (deployment?.activeStage === "apply") {
    return "apply";
  }

  if (deployment?.activeStage === "destroy") {
    return "destroy";
  }

  if (operationHint) {
    return operationHint;
  }

  if (deployment?.activeStage === "plan" && deployment.currentPlanOperation === "destroy") {
    return "destroy-plan";
  }

  return "plan";
}

function getStageDetail(
  operation: DeploymentProgressOperation,
  activeStage: DeploymentStage
): string {
  if (activeStage === "init") {
    return "Terraform 실행 환경과 Provider를 초기화하고 있습니다.";
  }

  if (activeStage === "validate") {
    return "Terraform 구성과 실행 조건을 검증하고 있습니다.";
  }

  if (activeStage === "plan") {
    return operation === "destroy-plan"
      ? "정리될 리소스와 삭제 순서를 계산하고 있습니다."
      : "생성·수정·삭제될 리소스를 계산하고 있습니다.";
  }

  if (activeStage === "preflight") {
    return "배포 전 안전 검사와 Repository 실행 조건을 확인하고 있습니다.";
  }

  if (activeStage === "application_release") {
    return "애플리케이션 Artifact를 만들고 배포 상태를 확인하고 있습니다.";
  }

  if (activeStage === "rollback") {
    return "실패한 변경을 이전 상태로 되돌리고 있습니다.";
  }

  return activeStage === "destroy"
    ? "승인된 리소스를 안전하게 정리하고 있습니다."
    : "승인된 변경사항을 클라우드에 적용하고 있습니다.";
}

function getStageTitle(
  operation: DeploymentProgressOperation,
  activeStage: DeploymentStage
): string {
  if (activeStage === "preflight") return "배포 전 안전 검사 중";
  if (activeStage === "application_release") return "애플리케이션 릴리즈 중";
  if (activeStage === "rollback") return "배포 롤백 중";
  return OPERATION_TITLES[operation];
}

function isFailureStatus(status: Deployment["status"]): boolean {
  return status === "FAILED" || status === "PARTIALLY_FAILED";
}

function isCancelledStatus(status: Deployment["status"]): boolean {
  return status === "CANCELLED" || status === "PARTIALLY_CANCELED";
}

function getTerminalStatusDetail(
  status: Deployment["status"],
  failureStage: DeploymentProgressSnapshot["failureStage"]
): string {
  const stageLabel = failureStage ? ` (${failureStage})` : "";

  return status === "PARTIALLY_FAILED"
    ? `일부 배포 작업이 완료되지 않았습니다${stageLabel}.`
    : `배포 작업이 완료되지 않았습니다${stageLabel}.`;
}
