import type {
  AiPreDeploymentAnalysisResult,
  CheckFinding,
  Deployment,
  ProjectBuildEnvironmentStatus
} from "@sketchcatch/types";
import type { RequestState } from "./workspace-right-panel.types";

export type DirectDeploymentStepId = "validation" | "approval" | "deployment";
export type DirectDeploymentStepState =
  | "active"
  | "blocked"
  | "done"
  | "error"
  | "idle"
  | "running"
  | "warning";
export type DirectDeploymentPreflightState =
  | "blocked"
  | "error"
  | "idle"
  | "loading"
  | "passed"
  | "warning";

export function createResetPreDeploymentCheckState(
  requestState: "error" | "loading",
  errorMessage = ""
) {
  return {
    analysis: null,
    errorMessage,
    fingerprint: null,
    requestState
  } as const;
}

export type DirectDeploymentActionState = {
  readonly canApply: boolean;
  readonly canApprovePlan: boolean;
  readonly canRunApplyPlan: boolean;
  readonly canRunDestroyPlan: boolean;
  readonly shouldShowApplyButton: boolean;
  readonly shouldShowApprovePlanButton: boolean;
  readonly shouldShowApplyPlanButton: boolean;
  readonly shouldShowDestroyButton: boolean;
  readonly shouldShowDestroyPlanButton: boolean;
};

export type DirectDeploymentSummary = Pick<
  Deployment,
  "approvedAt" | "currentPlanArtifactId" | "currentPlanOperation" | "status"
>;

export type DirectDeploymentFlowInput = {
  readonly actions: DirectDeploymentActionState;
  readonly deployment: DirectDeploymentSummary | null;
  readonly failedStepId: DirectDeploymentStepId | null;
  readonly hasUnsavedBaseline: boolean;
  readonly preflightState: DirectDeploymentPreflightState;
  readonly requestState: RequestState;
};

export type DirectDeploymentStep = {
  readonly description: string;
  readonly disabledReason: string | null;
  readonly id: DirectDeploymentStepId;
  readonly label: string;
  readonly state: DirectDeploymentStepState;
  readonly statusLabel: string;
};

export type DirectDeploymentFlow = {
  readonly activeStepId: DirectDeploymentStepId;
  readonly steps: readonly DirectDeploymentStep[];
};

export type DirectDeploymentPreflightInput = {
  readonly analysis: AiPreDeploymentAnalysisResult | null;
  readonly errorMessage: string;
  readonly hasStaleAnalysis: boolean;
  readonly requestState: RequestState;
};

export type DeploymentValidationActionInput = {
  readonly deploymentStatus: Deployment["status"] | null;
  readonly hasUnsavedBaseline: boolean;
  readonly preflightState: DirectDeploymentPreflightState;
};

export type DeploymentDraftChangeInput = {
  readonly currentDraftRevision: number | null;
  readonly hasUnsavedWorkspaceChanges: boolean;
  readonly preparedDraftRevision: number | null;
};
export type DeploymentBuildEnvironmentTarget = Pick<Deployment, "scope" | "targetKind">;

export type DeploymentPlanActionLabelInput = {
  readonly buildEnvironmentStatus: ProjectBuildEnvironmentStatus | null;
  readonly deployment: DeploymentBuildEnvironmentTarget | null;
  readonly isLoading: boolean;
};

const STEP_META: Readonly<
  Record<DirectDeploymentStepId, Pick<DirectDeploymentStep, "description" | "label">>
> = {
  validation: { description: "저장·안전검사·Plan", label: "검증" },
  approval: { description: "scope·변경·비용 검토", label: "승인" },
  deployment: { description: "실행·health·Output", label: "배포" }
};

export function getDirectDeploymentPreflightState(
  input: DirectDeploymentPreflightInput
): DirectDeploymentPreflightState {
  if (input.requestState === "loading") {
    return "loading";
  }

  if (input.requestState === "error" || input.errorMessage) {
    return "error";
  }

  if (!input.analysis || input.hasStaleAnalysis) {
    return "idle";
  }

  const findingById = new Map(input.analysis.findings.map((finding) => [finding.id, finding]));
  const hasBlockingChecklistFailure = input.analysis.checklist.some(
    (item) =>
      item.status === "fail" &&
      (item.relatedFindingIds.length === 0 ||
        item.relatedFindingIds.some((findingId) =>
          isBlockingPreDeploymentFinding(findingById.get(findingId))
        ))
  );

  if (hasBlockingChecklistFailure) {
    return "blocked";
  }

  if (
    input.analysis.findings.length > 0 ||
    input.analysis.checklist.some((item) => item.status === "fail" || item.status === "warning")
  ) {
    return "warning";
  }

  return "passed";
}

export function requiresProjectBuildEnvironment(
  deployment: DeploymentBuildEnvironmentTarget | null
): boolean {
  return Boolean(
    deployment &&
      deployment.scope !== "infrastructure" &&
      deployment.targetKind === "ecs_fargate"
  );
}

export function getDeploymentPlanActionLabel(input: DeploymentPlanActionLabelInput): string {
  const needsPreparation =
    requiresProjectBuildEnvironment(input.deployment) &&
    input.buildEnvironmentStatus !== "ready";

  if (input.isLoading) {
    return needsPreparation ? "빌드 환경 준비 및 Plan 생성 중" : "Plan 생성 중";
  }

  return needsPreparation ? "빌드 환경 준비 후 Plan 생성" : "Plan 생성";
}

function isBlockingPreDeploymentFinding(finding: CheckFinding | undefined): boolean {
  if (!finding) {
    return true;
  }

  return finding.category === "configuration";
}

export function getDirectDeploymentFlow(input: DirectDeploymentFlowInput): DirectDeploymentFlow {
  const deployment = input.deployment;
  const usesSavedCleanupSnapshot =
    input.actions.shouldShowDestroyPlanButton || input.actions.shouldShowDestroyButton;
  const validation = getValidationStep(input);
  if (input.requestState === "error" && input.failedStepId) {
    return createFailedFlow(input.failedStepId, validation);
  }
  const hasUnsavedApplyBaseline =
    input.hasUnsavedBaseline && input.deployment?.currentPlanOperation !== "destroy";
  if (
    !deployment ||
    (!usesSavedCleanupSnapshot &&
      (hasUnsavedApplyBaseline ||
        input.preflightState === "loading" ||
        input.preflightState === "blocked" ||
        input.preflightState === "error" ||
        !deployment.currentPlanArtifactId))
  ) {
    return createFlow("validation", validation, idleApproval(), idleDeployment());
  }

  const completedValidation = usesSavedCleanupSnapshot
    ? step("validation", "done", "저장된 배포 사용")
    : input.preflightState === "warning"
      ? step("validation", "warning", "주의 항목 있음")
      : step("validation", "done", "검증 완료");

  if (usesSavedCleanupSnapshot && deployment.currentPlanOperation !== "destroy") {
    return createFlow(
      "deployment",
      completedValidation,
      step("approval", "idle", "Destroy Plan 후 진행", "Destroy Plan을 먼저 생성하세요."),
      step(
        "deployment",
        input.requestState === "loading" ? "running" : "active",
        input.requestState === "loading" ? "Destroy Plan 생성 중" : "Destroy Plan 필요",
        input.actions.canRunDestroyPlan || input.requestState === "loading"
          ? null
          : "저장된 배포 state를 확인하세요."
      )
    );
  }

  if (!deployment.approvedAt) {
    return createFlow(
      "approval",
      completedValidation,
      step(
        "approval",
        input.requestState === "loading" ? "running" : "active",
        input.requestState === "loading" ? "승인 처리 중" : "승인 필요",
        input.actions.canApprovePlan ? null : "Plan과 승인 조건을 확인하세요."
      ),
      idleDeployment()
    );
  }

  const finalState = getDeploymentState(deployment.status, input.requestState);
  return createFlow(
    "deployment",
    completedValidation,
    step("approval", "done", "승인됨"),
    step(
      "deployment",
      finalState,
      getDeploymentStatusLabel(deployment.status, deployment.currentPlanOperation),
      input.actions.canApply || finalState !== "active"
        ? null
        : "승인 snapshot과 실행 대상을 확인하세요."
    )
  );
}

function createFailedFlow(
  failedStepId: DirectDeploymentStepId,
  validation: DirectDeploymentStep
): DirectDeploymentFlow {
  if (failedStepId === "validation") {
    return createFlow(
      "validation",
      step("validation", "error", "검증 요청 실패"),
      idleApproval(),
      idleDeployment()
    );
  }
  if (failedStepId === "approval") {
    return createFlow(
      "approval",
      step("validation", "done", "검증 완료"),
      step("approval", "error", "승인 요청 실패"),
      idleDeployment()
    );
  }
  return createFlow(
    "deployment",
    validation.state === "done" ? validation : step("validation", "done", "검증 완료"),
    step("approval", "done", "승인됨"),
    step("deployment", "error", "실행 요청 실패")
  );
}

export function shouldShowDeploymentValidationActions(
  input: DeploymentValidationActionInput
): boolean {
  return (
    input.deploymentStatus === null ||
    input.hasUnsavedBaseline ||
    (input.preflightState === "idle" && input.deploymentStatus !== "SUCCESS")
  );
}

export function hasDeploymentDraftChanges(input: DeploymentDraftChangeInput): boolean {
  if (input.hasUnsavedWorkspaceChanges) {
    return true;
  }

  return (
    input.currentDraftRevision !== null &&
    input.preparedDraftRevision !== null &&
    input.currentDraftRevision !== input.preparedDraftRevision
  );
}

function getValidationStep(input: DirectDeploymentFlowInput): DirectDeploymentStep {
  if (input.hasUnsavedBaseline) {
    return step(
      "validation",
      "active",
      input.deployment?.approvedAt ? "변경 후 재검증 필요" : "저장 필요"
    );
  }
  const mapped = {
    blocked: ["blocked", "차단 항목 확인"],
    error: ["error", "검증 실패"],
    idle: ["active", "검증 필요"],
    loading: ["running", "검증 중"],
    passed: [input.requestState === "loading" ? "running" : "active", "Plan 준비"],
    warning: ["warning", "주의 항목 있음"]
  } as const;
  const [state, statusLabel] = mapped[input.preflightState];
  return step("validation", state, statusLabel);
}

function idleApproval(): DirectDeploymentStep {
  return step("approval", "idle", "검증 후 진행", "검증과 Plan을 먼저 완료하세요.");
}

function idleDeployment(): DirectDeploymentStep {
  return step("deployment", "idle", "승인 후 진행", "승인된 snapshot이 필요합니다.");
}

function createFlow(
  activeStepId: DirectDeploymentStepId,
  validation: DirectDeploymentStep,
  approval: DirectDeploymentStep,
  deployment: DirectDeploymentStep
): DirectDeploymentFlow {
  return { activeStepId, steps: [validation, approval, deployment] };
}

function step(
  id: DirectDeploymentStepId,
  state: DirectDeploymentStepState,
  statusLabel: string,
  disabledReason: string | null = null
): DirectDeploymentStep {
  return { id, state, statusLabel, disabledReason, ...STEP_META[id] };
}

function getDeploymentState(
  status: DirectDeploymentSummary["status"],
  requestState: RequestState
): DirectDeploymentStepState {
  if (status === "RUNNING" || requestState === "loading") return "running";
  if (status === "FAILED" || status === "CANCELLED") return "error";
  if (status === "PARTIALLY_FAILED" || status === "PARTIALLY_CANCELED") return "warning";
  if (status === "SUCCESS" || status === "DESTROYED") return "done";
  return "active";
}

function getDeploymentStatusLabel(
  status: DirectDeploymentSummary["status"],
  operation: DirectDeploymentSummary["currentPlanOperation"]
): string {
  const action = operation === "destroy" ? "정리" : "배포";
  if (status === "RUNNING") return `${action} 중`;
  if (status === "FAILED") return `${action} 실패`;
  if (status === "CANCELLED") return `${action} 취소됨`;
  if (status === "PARTIALLY_FAILED") return "웹 배포 부분 실패";
  if (status === "PARTIALLY_CANCELED") return "웹 배포 부분 취소";
  if (status === "SUCCESS") return "배포 완료";
  if (status === "DESTROYED") return "정리 완료";
  return `${action} 실행 가능`;
}
