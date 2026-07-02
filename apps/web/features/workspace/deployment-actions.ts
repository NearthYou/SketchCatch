import type { Deployment, DeploymentLog, DeploymentPlanWarning } from "@sketchcatch/types";

type DeploymentRequestState = "idle" | "loading" | "error";
export type DeploymentPanelMode = "setup" | "records";
export type DeploymentLogTone = "default" | "warning" | "error";
export type DeploymentLogMessageTokenTone =
  | "plain"
  | "resource"
  | "string"
  | "metadata"
  | "operation"
  | "output";

export type DeploymentLogMessageToken = {
  readonly text: string;
  readonly tone: DeploymentLogMessageTokenTone;
};

export type DeploymentActionState = {
  readonly canRunApplyPlan: boolean;
  readonly canApprovePlan: boolean;
  readonly canApply: boolean;
  readonly canRunDestroyPlan: boolean;
  readonly canDestroy: boolean;
  readonly canCancelDeployment: boolean;
  readonly shouldShowApplyPlanButton: boolean;
  readonly shouldShowApprovePlanButton: boolean;
  readonly shouldShowApplyButton: boolean;
  readonly shouldShowDestroyPlanButton: boolean;
  readonly shouldShowDestroyButton: boolean;
  readonly approvePlanLabel: string;
};

export function getDeploymentActionState(
  deployment: Deployment | null,
  requestState: DeploymentRequestState
): DeploymentActionState {
  const isLoading = requestState === "loading";
  const hasCurrentPlan = Boolean(deployment?.currentPlanArtifactId);
  const isPlanApproved = Boolean(deployment?.approvedAt && deployment.approvedPlanArtifactId);
  const isDestroyable = Boolean(deployment && isCleanupDestroyCandidate(deployment));
  const isDestroyPlan = deployment?.currentPlanOperation === "destroy";
  const isApplyPlan = deployment?.currentPlanOperation === "apply";
  const canStartFreshApplyPlan = Boolean(deployment && !hasCurrentPlan && !isDestroyPlan);
  const canShowApplyPlanAction = Boolean(
    deployment &&
      (isApplyPlan || canStartFreshApplyPlan) &&
      deployment.status !== "RUNNING" &&
      deployment.status !== "SUCCESS" &&
      deployment.status !== "DESTROYED" &&
      !isDestroyable &&
      !isPlanApproved
  );
  const canShowApprovePlanAction = Boolean(
    deployment &&
      hasCurrentPlan &&
      !isPlanApproved &&
      deployment.status !== "RUNNING" &&
      deployment.isBlocked === true &&
      deployment.blockedBy === "missing_approval"
  );
  const canShowDestroyPlanAction = Boolean(
    deployment &&
      isDestroyable &&
      deployment.status !== "RUNNING" &&
      !(isDestroyPlan && isPlanApproved)
  );

  const canRunApplyPlan = canShowApplyPlanAction && !isLoading;
  const canApprovePlan = canShowApprovePlanAction && !isLoading;
  const canApply = Boolean(
    deployment &&
      isApplyPlan &&
      isPlanApproved &&
      deployment.status !== "RUNNING" &&
      deployment.status !== "SUCCESS" &&
      deployment.status !== "DESTROYED" &&
      deployment.isBlocked === false &&
      !isLoading
  );
  const canRunDestroyPlan = canShowDestroyPlanAction && !isLoading;
  const canDestroy = Boolean(
    deployment &&
      isDestroyable &&
      isDestroyPlan &&
      isPlanApproved &&
      deployment.status !== "RUNNING" &&
      deployment.isBlocked === false &&
      !isLoading
  );
  const canCancelDeployment = Boolean(
    deployment?.status === "RUNNING" && !deployment.cancelRequestedAt && !isLoading
  );

  return {
    canRunApplyPlan,
    canApprovePlan,
    canApply,
    canRunDestroyPlan,
    canDestroy,
    canCancelDeployment,
    shouldShowApplyPlanButton: canShowApplyPlanAction,
    shouldShowApprovePlanButton: canShowApprovePlanAction,
    shouldShowApplyButton: Boolean(
      deployment &&
        isApplyPlan &&
        isPlanApproved &&
        deployment.status !== "SUCCESS" &&
        deployment.status !== "DESTROYED"
    ),
    shouldShowDestroyPlanButton: canShowDestroyPlanAction,
    shouldShowDestroyButton: Boolean(deployment && isDestroyPlan && isPlanApproved),
    approvePlanLabel: isDestroyPlan ? "Destroy Plan 승인" : "Plan 승인"
  };
}

export function shouldAutoRefreshDeployment(deployment: Deployment | null): boolean {
  return deployment?.status === "RUNNING";
}

export function getDefaultDeploymentPanelMode(
  deployments: readonly Deployment[]
): DeploymentPanelMode {
  return deployments.length > 0 ? "records" : "setup";
}

export function getDeploymentLogTone(
  log: Pick<DeploymentLog, "level" | "stage">
): DeploymentLogTone {
  if (log.level === "ERROR") {
    return "error";
  }

  if (log.level === "WARN") {
    return "warning";
  }

  return "default";
}

export function getDeploymentLogMessageTokens(message: string): DeploymentLogMessageToken[] {
  const tokens: DeploymentLogMessageToken[] = [];
  let cursor = 0;

  while (cursor < message.length) {
    const rest = message.slice(cursor);
    const highlightedToken = getNextDeploymentLogMessageToken(rest);

    if (highlightedToken) {
      tokens.push(highlightedToken);
      cursor += highlightedToken.text.length;
      continue;
    }

    appendDeploymentLogMessageToken(tokens, message[cursor] ?? "", "plain");
    cursor += 1;
  }

  return tokens;
}

export function shouldShowDeploymentInfoValue(value: string | null | undefined): value is string {
  return Boolean(value && value !== "없음");
}

export function getDeploymentPlanWarningReviewLabel(
  warning: DeploymentPlanWarning
): string {
  if (warning.blocksApproval) {
    return "승인 불가";
  }

  if (warning.approvalRequired || warning.level === "medium" || warning.level === "low") {
    return "승인 후 진행";
  }

  return "검토 필요";
}

export function getDeploymentPlanWarningSourceLabel(
  warning: DeploymentPlanWarning
): string {
  switch (warning.source) {
    case "architecture_check":
      return "Architecture Check";
    case "terraform_plan":
      return "Terraform Plan";
    case "mvp_scope":
      return "MVP Scope";
    case "approval_policy":
      return "Approval Policy";
    default:
      return "Plan Summary";
  }
}

function getNextDeploymentLogMessageToken(
  text: string
): DeploymentLogMessageToken | null {
  const patterns: readonly {
    readonly tone: DeploymentLogMessageTokenTone;
    readonly pattern: RegExp;
  }[] = [
    { tone: "metadata", pattern: /^\[[^\]]+\]/ },
    { tone: "string", pattern: /^"[^"]*"/ },
    { tone: "resource", pattern: /^(?:data\.)?[a-z][a-z0-9_]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/ },
    {
      tone: "operation",
      pattern: /^(?:Creation complete|Destruction complete|Still creating|Still destroying|Creating|Destroying|Apply complete|Destroy complete|Outputs)/
    },
    { tone: "output", pattern: /^[A-Za-z_][A-Za-z0-9_]*(?=\s*=)/ }
  ];

  for (const { pattern, tone } of patterns) {
    const match = pattern.exec(text);

    if (match?.[0]) {
      return {
        text: match[0],
        tone
      };
    }
  }

  return null;
}

function appendDeploymentLogMessageToken(
  tokens: DeploymentLogMessageToken[],
  text: string,
  tone: DeploymentLogMessageTokenTone
): void {
  const previousToken = tokens.at(-1);

  if (previousToken?.tone === tone) {
    tokens[tokens.length - 1] = {
      text: `${previousToken.text}${text}`,
      tone
    };
    return;
  }

  tokens.push({ text, tone });
}

function isCleanupDestroyCandidate(deployment: Deployment): boolean {
  if (!deployment.stateObjectKey) {
    return false;
  }

  if (deployment.status === "SUCCESS") {
    return true;
  }

  return (
    deployment.status === "FAILED" &&
    (deployment.failureStage === "apply" || deployment.failureStage === "destroy")
  );
}
