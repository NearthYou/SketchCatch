import type { Deployment } from "@sketchcatch/types";
import type { RequestState } from "./workspace-right-panel.types";
import type {
  DeploymentDirectApplyStatus,
  DeploymentPlanState,
  DeploymentPreparationState
} from "./deployment-wizard-state";

export type DirectDeploymentStepId = "save" | "preflight" | "plan" | "approve" | "apply";
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

export type DirectDeploymentWizardCompatibility = {
  readonly approved: boolean;
  readonly directApplyStatus: DeploymentDirectApplyStatus;
  readonly plan: DeploymentPlanState;
  readonly preparation: DeploymentPreparationState;
};

const STEP_META: Readonly<Record<DirectDeploymentStepId, Pick<DirectDeploymentStep, "description" | "label">>> = {
  save: { description: "Board와 Terraform artifact 동기화", label: "변경사항 저장" },
  preflight: { description: "보안·비용·Terraform 확인", label: "배포 전 검사" },
  plan: { description: "변경 영향 확인", label: "Plan 생성" },
  approve: { description: "사용자 승인 필요", label: "Plan 승인" },
  apply: { description: "AWS 리소스 변경", label: "Apply 실행" }
};

export function getDirectDeploymentFlow(input: DirectDeploymentFlowInput): DirectDeploymentFlow {
  if (input.hasUnsavedBaseline) {
    return createFlow("save", {
      save: step("save", "active", "변경사항 저장 필요"),
      preflight: step("preflight", "idle", "저장 후 실행", "변경사항을 먼저 저장하세요."),
      plan: step("plan", "idle", "검사 후 실행", "배포 전 검사가 필요합니다."),
      approve: step("approve", "idle", "Plan 후 실행", "Plan을 먼저 생성하세요."),
      apply: step("apply", "idle", "승인 후 실행", "Plan 승인이 필요합니다.")
    });
  }

  const saveStep = step("save", "done", "저장됨");
  const preflightStep = getPreflightStep(input.preflightState);

  if (input.preflightState === "idle" || input.preflightState === "loading" || input.preflightState === "blocked" || input.preflightState === "error") {
    return createFlow("preflight", {
      save: saveStep,
      preflight: preflightStep,
      plan: step("plan", "idle", "검사 후 실행", "배포 전 검사를 완료하세요."),
      approve: step("approve", "idle", "Plan 후 실행", "Plan을 먼저 생성하세요."),
      apply: step("apply", "idle", "승인 후 실행", "Plan 승인이 필요합니다.")
    });
  }

  if (!input.deployment) {
    return createFlow("preflight", {
      save: saveStep,
      preflight: { ...preflightStep, state: "active" },
      plan: step("plan", "idle", "검사 결과 저장 후 실행", "검사 결과를 저장하세요."),
      approve: step("approve", "idle", "Plan 후 실행", "Plan을 먼저 생성하세요."),
      apply: step("apply", "idle", "승인 후 실행", "Plan 승인이 필요합니다.")
    });
  }

  if (input.deployment.currentPlanOperation === "destroy") {
    return createFlow("plan", {
      save: saveStep,
      preflight: preflightDone(preflightStep),
      plan: step("plan", "blocked", "Cleanup은 배포 기록에서 진행", "배포 기록에서 Destroy 흐름을 여세요."),
      approve: step("approve", "idle", "배포 기록에서 진행", "Destroy 승인은 배포 기록에서 진행합니다."),
      apply: step("apply", "idle", "Direct Apply 사용 불가", "Destroy Plan에는 Apply를 실행할 수 없습니다.")
    });
  }

  const planExists = Boolean(input.deployment.currentPlanArtifactId);
  if (!planExists || input.actions.shouldShowApplyPlanButton) {
    return createFlow("plan", {
      save: saveStep,
      preflight: preflightDone(preflightStep),
      plan: step(
        "plan",
        input.requestState === "loading" ? "running" : "active",
        input.requestState === "loading" ? "Plan 생성 중" : "Plan 생성 필요",
        input.actions.canRunApplyPlan ? null : "현재 Deployment 상태를 확인하세요."
      ),
      approve: step("approve", "idle", "Plan 후 실행", "Plan을 먼저 생성하세요."),
      apply: step("apply", "idle", "승인 후 실행", "Plan 승인이 필요합니다.")
    });
  }

  const planStep = step("plan", "done", "Plan 생성됨");
  if (!input.deployment.approvedAt || input.actions.shouldShowApprovePlanButton) {
    return createFlow("approve", {
      save: saveStep,
      preflight: preflightDone(preflightStep),
      plan: planStep,
      approve: step(
        "approve",
        input.requestState === "loading" ? "running" : "active",
        input.requestState === "loading" ? "승인 처리 중" : "승인 필요",
        input.actions.canApprovePlan ? null : "Plan 승인 조건을 확인하세요."
      ),
      apply: step("apply", "idle", "승인 후 실행", "Plan 승인이 필요합니다.")
    });
  }

  const finalState = getApplyState(input.deployment.status, input.requestState);
  return createFlow("apply", {
    save: saveStep,
    preflight: preflightDone(preflightStep),
    plan: planStep,
    approve: step("approve", "done", "승인됨"),
    apply: step(
      "apply",
      finalState,
      getApplyStatusLabel(input.deployment.status),
      input.actions.canApply || finalState !== "active" ? null : "승인 snapshot과 대상 계정을 확인하세요."
    )
  });
}

export function getDirectDeploymentWizardCompatibility(
  input: DirectDeploymentFlowInput
): DirectDeploymentWizardCompatibility {
  const hasPlan = Boolean(input.deployment?.currentPlanArtifactId);
  const approved = Boolean(input.deployment?.approvedAt && hasPlan);

  return {
    approved,
    directApplyStatus: getDirectApplyStatus(input.deployment),
    plan: approved ? "approved" : hasPlan ? "ready" : "missing",
    preparation: !input.hasUnsavedBaseline && input.deployment ? "ready" : "pending"
  };
}

function createFlow(
  activeStepId: DirectDeploymentStepId,
  steps: Readonly<Record<DirectDeploymentStepId, DirectDeploymentStep>>
): DirectDeploymentFlow {
  return {
    activeStepId,
    steps: [steps.save, steps.preflight, steps.plan, steps.approve, steps.apply]
  };
}

function step(
  id: DirectDeploymentStepId,
  state: DirectDeploymentStepState,
  statusLabel: string,
  disabledReason: string | null = null
): DirectDeploymentStep {
  return { id, state, statusLabel, disabledReason, ...STEP_META[id] };
}

function getPreflightStep(state: DirectDeploymentPreflightState): DirectDeploymentStep {
  const mapped = {
    blocked: ["blocked", "차단 항목 확인"],
    error: ["error", "검사 실패"],
    idle: ["active", "검사 필요"],
    loading: ["running", "검사 중"],
    passed: ["done", "검사 통과"],
    warning: ["warning", "주의 항목 있음"]
  } as const;
  const [stepState, label] = mapped[state];
  return step("preflight", stepState, label);
}

function preflightDone(current: DirectDeploymentStep): DirectDeploymentStep {
  return current.state === "warning" ? current : { ...current, state: "done" };
}

function getApplyState(
  status: DirectDeploymentSummary["status"],
  requestState: RequestState
): DirectDeploymentStepState {
  if (status === "RUNNING" || requestState === "loading") return "running";
  if (status === "FAILED" || status === "CANCELLED") return "error";
  if (status === "SUCCESS" || status === "DESTROYED") return "done";
  return "active";
}

function getApplyStatusLabel(status: DirectDeploymentSummary["status"]): string {
  if (status === "RUNNING") return "Apply 실행 중";
  if (status === "FAILED") return "Apply 실패";
  if (status === "CANCELLED") return "Apply 취소됨";
  if (status === "SUCCESS") return "Apply 완료";
  if (status === "DESTROYED") return "정리 완료";
  return "Apply 실행 가능";
}

function getDirectApplyStatus(
  deployment: DirectDeploymentSummary | null
): DeploymentDirectApplyStatus {
  if (deployment?.status === "RUNNING") return "running";
  if (deployment?.status === "SUCCESS") return "success";
  if (deployment?.status === "FAILED" || deployment?.status === "CANCELLED") return "failed";
  return "not-started";
}
