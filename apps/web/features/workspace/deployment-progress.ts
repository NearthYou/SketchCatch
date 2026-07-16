import type { Deployment, DeploymentLog, DeploymentStage } from "@sketchcatch/types";

export type DeploymentProgressOperation = "apply" | "destroy" | "destroy-plan" | "plan";

type ProgressDeployment = Pick<
  Deployment,
  | "activeStage"
  | "currentPlanOperation"
  | "id"
  | "planSummary"
  | "startedAt"
  | "status"
>;

type ProgressLog = Pick<DeploymentLog, "createdAt" | "message" | "stage">;

export type DeploymentProgress = {
  readonly detail: string;
  readonly operation: DeploymentProgressOperation;
  readonly percent: number;
  readonly title: string;
};

export type DeploymentProgressInput = {
  readonly deployment: ProgressDeployment | null;
  readonly isStarting: boolean;
  readonly logs: readonly ProgressLog[];
  readonly nowMs?: number;
  readonly operationHint: DeploymentProgressOperation | null;
  readonly requestedAtMs?: number | null;
};

type ProgressWindow = {
  readonly expectedSeconds: number;
  readonly maximum: number;
  readonly minimum: number;
};

const OPERATION_TITLES: Readonly<Record<DeploymentProgressOperation, string>> = {
  apply: "Terraform Apply 실행 중",
  destroy: "Terraform Destroy 실행 중",
  "destroy-plan": "Terraform Destroy Plan 생성 중",
  plan: "Terraform Plan 생성 중"
};

const STAGE_WINDOWS: Readonly<Record<DeploymentStage, ProgressWindow>> = {
  init: { expectedSeconds: 35, maximum: 29, minimum: 12 },
  validate: { expectedSeconds: 25, maximum: 46, minimum: 31 },
  plan: { expectedSeconds: 90, maximum: 94, minimum: 48 },
  apply: { expectedSeconds: 210, maximum: 94, minimum: 16 },
  destroy: { expectedSeconds: 210, maximum: 94, minimum: 16 }
};

const RESOURCE_COMPLETION_PATTERN =
  /([\w.-]+(?:\[[^\]]+\])?):\s+(?:Creation|Modifications|Destruction) complete/i;

export function getDeploymentProgress(
  input: DeploymentProgressInput
): DeploymentProgress | null {
  const isRunning = input.deployment?.status === "RUNNING";

  if (!input.isStarting && !isRunning) {
    return null;
  }

  const nowMs = input.nowMs ?? Date.now();
  const operation = resolveDeploymentProgressOperation(
    input.deployment,
    input.logs,
    input.operationHint
  );
  const activeStage = input.deployment?.activeStage ?? null;

  if (!activeStage) {
    const requestedAtMs = input.requestedAtMs ?? nowMs;
    const elapsedSeconds = Math.max(0, (nowMs - requestedAtMs) / 1_000);
    const percent = Math.min(10, 4 + Math.floor(elapsedSeconds / 2));

    return {
      detail: "실행 요청을 전달하고 Terraform 작업 환경을 준비하고 있습니다.",
      operation,
      percent,
      title: OPERATION_TITLES[operation]
    };
  }

  const stageLogs = input.logs.filter((log) => log.stage === activeStage);
  const stageStartedAtMs = getStageStartedAtMs(
    stageLogs,
    input.deployment?.startedAt ?? null,
    input.requestedAtMs ?? null,
    nowMs
  );
  const elapsedSeconds = Math.max(0, (nowMs - stageStartedAtMs) / 1_000);
  const progressWindow = STAGE_WINDOWS[activeStage];
  const timeRatio = 1 - Math.exp(-elapsedSeconds / progressWindow.expectedSeconds);
  const logRatio = 1 - Math.exp(-stageLogs.length / 10);
  let activityRatio = Math.max(timeRatio * 0.9, logRatio);
  const resourceProgress = getResourceProgress(input.deployment, input.logs, activeStage);

  if (resourceProgress) {
    activityRatio = Math.max(
      activityRatio,
      resourceProgress.completedCount / resourceProgress.expectedCount
    );
  }

  let percent = Math.floor(
    progressWindow.minimum +
      (progressWindow.maximum - progressWindow.minimum) * Math.min(1, activityRatio)
  );

  if (hasTerraformCompletionLog(input.logs, activeStage)) {
    percent = Math.max(percent, 98);
  }

  const detail = getStageDetail(operation, activeStage, resourceProgress);

  return {
    detail,
    operation,
    percent: Math.min(98, Math.max(progressWindow.minimum, percent)),
    title: OPERATION_TITLES[operation]
  };
}

export function resolveDeploymentProgressOperation(
  deployment: ProgressDeployment | null,
  logs: readonly ProgressLog[],
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

  const hasDestroyPlanEvidence = logs.some((log) =>
    /terraform\s+(?:destroy plan|plan\s+-destroy)/i.test(log.message)
  );

  if (
    hasDestroyPlanEvidence ||
    (deployment?.activeStage === "plan" && deployment.currentPlanOperation === "destroy")
  ) {
    return "destroy-plan";
  }

  return "plan";
}

function getStageStartedAtMs(
  stageLogs: readonly ProgressLog[],
  deploymentStartedAt: string | null,
  requestedAtMs: number | null,
  nowMs: number
): number {
  const firstStageLogAt = stageLogs
    .map((log) => Date.parse(log.createdAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0];

  if (firstStageLogAt !== undefined) {
    return firstStageLogAt;
  }

  const deploymentStartedAtMs = deploymentStartedAt ? Date.parse(deploymentStartedAt) : Number.NaN;

  if (Number.isFinite(deploymentStartedAtMs)) {
    return deploymentStartedAtMs;
  }

  return requestedAtMs ?? nowMs;
}

function getResourceProgress(
  deployment: ProgressDeployment | null,
  logs: readonly ProgressLog[],
  activeStage: DeploymentStage
): { readonly completedCount: number; readonly expectedCount: number } | null {
  if ((activeStage !== "apply" && activeStage !== "destroy") || !deployment?.planSummary) {
    return null;
  }

  const expectedCount =
    deployment.planSummary.createCount +
    deployment.planSummary.updateCount +
    deployment.planSummary.deleteCount +
    deployment.planSummary.replaceCount;

  if (expectedCount <= 0) {
    return null;
  }

  const completedResources = new Set<string>();

  for (const log of logs) {
    if (log.stage !== activeStage) continue;
    const match = RESOURCE_COMPLETION_PATTERN.exec(log.message);
    if (match?.[1]) completedResources.add(match[1]);
  }

  return {
    completedCount: Math.min(expectedCount, completedResources.size),
    expectedCount
  };
}

function hasTerraformCompletionLog(
  logs: readonly ProgressLog[],
  activeStage: DeploymentStage
): boolean {
  return logs.some(
    (log) =>
      log.stage === activeStage && /(?:Apply|Destroy) complete!?/i.test(log.message)
  );
}

function getStageDetail(
  operation: DeploymentProgressOperation,
  activeStage: DeploymentStage,
  resourceProgress: { readonly completedCount: number; readonly expectedCount: number } | null
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

  const baseDetail =
    activeStage === "destroy"
      ? "승인된 리소스를 안전하게 정리하고 있습니다."
      : "승인된 변경사항을 클라우드에 적용하고 있습니다.";

  if (!resourceProgress || resourceProgress.completedCount === 0) {
    return baseDetail;
  }

  return `${baseDetail} ${resourceProgress.completedCount}/${resourceProgress.expectedCount}개 완료`;
}
