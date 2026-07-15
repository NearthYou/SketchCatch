import type { AiPreDeploymentAnalysisResult, CheckFinding, Deployment } from "@sketchcatch/types";
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

export type DirectDeploymentActionState = {
  readonly canApply: boolean;
  readonly canApprovePlan: boolean;
  readonly canRunApplyPlan: boolean;
  readonly shouldShowApplyButton: boolean;
  readonly shouldShowApprovePlanButton: boolean;
  readonly shouldShowApplyPlanButton: boolean;
};

export type DirectDeploymentSummary = Pick<
  Deployment,
  "approvedAt" | "currentPlanArtifactId" | "currentPlanOperation" | "status"
>;

export type DirectDeploymentFlowInput = {
  readonly actions: DirectDeploymentActionState;
  readonly deployment: DirectDeploymentSummary | null;
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

export type QueuedApplyPlanInput = {
  readonly deployment: Pick<Deployment, "currentPlanArtifactId" | "id" | "status"> | null;
  readonly queuedDeploymentId: string;
  readonly requestState: RequestState;
};

export type DirectDeploymentPreflightInput = {
  readonly analysis: AiPreDeploymentAnalysisResult | null;
  readonly errorMessage: string;
  readonly hasStaleAnalysis: boolean;
  readonly requestState: RequestState;
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

function isBlockingPreDeploymentFinding(finding: CheckFinding | undefined): boolean {
  if (!finding) {
    return true;
  }

  return finding.category === "configuration";
}

export function getDirectDeploymentFlow(input: DirectDeploymentFlowInput): DirectDeploymentFlow {
  const validation = getValidationStep(input);
  if (
    input.hasUnsavedBaseline ||
    input.preflightState === "idle" ||
    input.preflightState === "loading" ||
    input.preflightState === "blocked" ||
    input.preflightState === "error" ||
    !input.deployment ||
    !input.deployment.currentPlanArtifactId
  ) {
    return createFlow("validation", validation, idleApproval(), idleDeployment());
  }

  const completedValidation =
    input.preflightState === "warning"
      ? step("validation", "warning", "주의 항목 있음")
      : step("validation", "done", "검증 완료");

  if (!input.deployment.approvedAt) {
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

  const finalState = getDeploymentState(input.deployment.status, input.requestState);
  return createFlow(
    "deployment",
    completedValidation,
    step("approval", "done", "승인됨"),
    step(
      "deployment",
      finalState,
      getDeploymentStatusLabel(input.deployment.status, input.deployment.currentPlanOperation),
      input.actions.canApply || finalState !== "active"
        ? null
        : "승인 snapshot과 실행 대상을 확인하세요."
    )
  );
}

export function shouldStartQueuedApplyPlan(input: QueuedApplyPlanInput): boolean {
  return Boolean(
    input.deployment &&
      input.queuedDeploymentId === input.deployment.id &&
      input.deployment.status === "PENDING" &&
      !input.deployment.currentPlanArtifactId &&
      input.requestState === "idle"
  );
}

function getValidationStep(input: DirectDeploymentFlowInput): DirectDeploymentStep {
  if (input.hasUnsavedBaseline) {
    return step("validation", "active", "저장 필요");
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
  if (status === "SUCCESS") return "배포 완료";
  if (status === "DESTROYED") return "정리 완료";
  return `${action} 실행 가능`;
}
