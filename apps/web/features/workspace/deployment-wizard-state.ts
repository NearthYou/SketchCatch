import type { DirectDeploymentPreflightState } from "./deployment-console-state";

export type DeploymentWizardStepId =
  | "preflight"
  | "prepare"
  | "plan"
  | "approve"
  | "route"
  | "result";

export type DeploymentExecutionRoute = "direct" | "git-cicd";
export type DeploymentWizardStepState = "active" | "complete" | "locked" | "error";
export type DeploymentPreparationState = "pending" | "ready";
export type DeploymentPlanState = "missing" | "ready" | "approved";
export type DeploymentDirectApplyStatus =
  | "not-started"
  | "running"
  | "success"
  | "failed";
export type DeploymentGitCicdHandoffStatus =
  | "not-created"
  | "pending"
  | "success"
  | "failed";

export type DeploymentWizardStateInput = {
  readonly approved: boolean;
  readonly directApplyStatus: DeploymentDirectApplyStatus;
  readonly gitCicdHandoffStatus: DeploymentGitCicdHandoffStatus;
  readonly plan: DeploymentPlanState;
  readonly preparation: DeploymentPreparationState;
  readonly preflight: DirectDeploymentPreflightState;
  readonly route: DeploymentExecutionRoute | null;
};

export type DeploymentWizardStep = {
  readonly description: string;
  readonly id: DeploymentWizardStepId;
  readonly label: string;
  readonly lockedReason: string | null;
  readonly state: DeploymentWizardStepState;
};

export type DeploymentWizardState = {
  readonly activeStepId: DeploymentWizardStepId;
  readonly canChooseRoute: boolean;
  readonly canCreateGitCicdHandoff: boolean;
  readonly canRunDirectApply: boolean;
  readonly steps: readonly DeploymentWizardStep[];
};

const STEP_META: Readonly<
  Record<DeploymentWizardStepId, Pick<DeploymentWizardStep, "description" | "label">>
> = {
  preflight: { description: "보안·비용·Terraform 확인", label: "1. 배포 전 검사" },
  prepare: { description: "고정된 기준과 AWS 대상을 준비", label: "2. 배포 기준과 대상" },
  plan: { description: "실행 전 변경 영향 확인", label: "3. Plan" },
  approve: { description: "정확한 Plan snapshot 사용자 승인", label: "4. 승인" },
  route: { description: "Direct 또는 Git/CI/CD 선택", label: "5. 실행 방식" },
  result: { description: "선택한 실행 경로의 결과 확인", label: "6. 결과" }
};

export function getDeploymentWizardState(
  input: DeploymentWizardStateInput
): DeploymentWizardState {
  const approved = input.approved || input.plan === "approved";
  const canChooseRoute = approved;
  const canRunDirectApply =
    approved && input.route === "direct" && input.directApplyStatus === "not-started";
  const canCreateGitCicdHandoff =
    approved && input.route === "git-cicd" && input.gitCicdHandoffStatus === "not-created";

  if (!isPreflightComplete(input.preflight)) {
    const preflightState = input.preflight === "blocked" || input.preflight === "error"
      ? "error"
      : "active";
    return state("preflight", {
      preflight: step("preflight", preflightState),
      prepare: locked("prepare", "배포 전 검사를 먼저 완료하세요."),
      plan: locked("plan", "배포 기준과 대상을 먼저 준비하세요."),
      approve: locked("approve", "Plan을 먼저 생성하세요."),
      route: locked("route", "Plan 승인이 필요합니다."),
      result: locked("result", "실행 방식을 먼저 선택하세요.")
    }, { canChooseRoute, canCreateGitCicdHandoff, canRunDirectApply });
  }

  const preflightStep = step("preflight", "complete");
  if (input.preparation !== "ready") {
    return state("prepare", {
      preflight: preflightStep,
      prepare: step("prepare", "active"),
      plan: locked("plan", "배포 기준과 대상을 먼저 준비하세요."),
      approve: locked("approve", "Plan을 먼저 생성하세요."),
      route: locked("route", "Plan 승인이 필요합니다."),
      result: locked("result", "실행 방식을 먼저 선택하세요.")
    }, { canChooseRoute, canCreateGitCicdHandoff, canRunDirectApply });
  }

  const prepareStep = step("prepare", "complete");
  if (input.plan === "missing") {
    return state("plan", {
      preflight: preflightStep,
      prepare: prepareStep,
      plan: step("plan", "active"),
      approve: locked("approve", "Plan을 먼저 생성하세요."),
      route: locked("route", "Plan 승인이 필요합니다."),
      result: locked("result", "실행 방식을 먼저 선택하세요.")
    }, { canChooseRoute, canCreateGitCicdHandoff, canRunDirectApply });
  }

  const planStep = step("plan", "complete");
  if (!approved) {
    return state("approve", {
      preflight: preflightStep,
      prepare: prepareStep,
      plan: planStep,
      approve: step("approve", "active"),
      route: locked("route", "Plan 승인이 필요합니다."),
      result: locked("result", "실행 방식을 먼저 선택하세요.")
    }, { canChooseRoute, canCreateGitCicdHandoff, canRunDirectApply });
  }

  const approveStep = step("approve", "complete");
  if (!hasExecutionStarted(input)) {
    return state("route", {
      preflight: preflightStep,
      prepare: prepareStep,
      plan: planStep,
      approve: approveStep,
      route: step("route", "active"),
      result: locked("result", "실행 방식을 선택하고 명시적으로 시작하세요.")
    }, { canChooseRoute, canCreateGitCicdHandoff, canRunDirectApply });
  }

  return state("result", {
    preflight: preflightStep,
    prepare: prepareStep,
    plan: planStep,
    approve: approveStep,
    route: step("route", "complete"),
    result: step("result", getResultState(input))
  }, { canChooseRoute, canCreateGitCicdHandoff, canRunDirectApply });
}

function isPreflightComplete(preflight: DirectDeploymentPreflightState): boolean {
  return preflight === "passed" || preflight === "warning";
}

function hasExecutionStarted(input: DeploymentWizardStateInput): boolean {
  if (input.route === "direct") {
    return input.directApplyStatus !== "not-started";
  }

  if (input.route === "git-cicd") {
    return input.gitCicdHandoffStatus !== "not-created";
  }

  return false;
}

function getResultState(input: DeploymentWizardStateInput): DeploymentWizardStepState {
  const status = input.route === "direct"
    ? input.directApplyStatus
    : input.gitCicdHandoffStatus;

  if (status === "failed") return "error";
  if (status === "success") return "complete";
  return "active";
}

function state(
  activeStepId: DeploymentWizardStepId,
  steps: Readonly<Record<DeploymentWizardStepId, DeploymentWizardStep>>,
  actions: Pick<
    DeploymentWizardState,
    "canChooseRoute" | "canCreateGitCicdHandoff" | "canRunDirectApply"
  >
): DeploymentWizardState {
  return {
    activeStepId,
    ...actions,
    steps: [
      steps.preflight,
      steps.prepare,
      steps.plan,
      steps.approve,
      steps.route,
      steps.result
    ]
  };
}

function step(
  id: DeploymentWizardStepId,
  stepState: DeploymentWizardStepState
): DeploymentWizardStep {
  return { id, state: stepState, lockedReason: null, ...STEP_META[id] };
}

function locked(id: DeploymentWizardStepId, lockedReason: string): DeploymentWizardStep {
  return { id, state: "locked", lockedReason, ...STEP_META[id] };
}
