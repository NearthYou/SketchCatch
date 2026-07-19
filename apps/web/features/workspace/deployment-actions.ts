import type {
  Deployment,
  DeploymentLog,
  GitCicdHandoff
} from "@sketchcatch/types";

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
  const hasCompleteApprovalSnapshot = deployment
    ? hasCompleteDeploymentApprovalSnapshot(deployment)
    : false;
  const isDestroyable = Boolean(deployment && isCleanupDestroyCandidate(deployment));
  const isDestroyPlan = deployment?.currentPlanOperation === "destroy";
  const isApplyPlan = deployment?.currentPlanOperation === "apply";
  const isFailedDestroyAttempt = Boolean(
    deployment && isDestroyPlan && deployment.status === "FAILED" && deployment.failedAt
  );
  const canStartFreshApplyPlan = Boolean(deployment && !hasCurrentPlan && !isDestroyPlan);
  const canShowApplyPlanAction = Boolean(
    deployment &&
    canStartFreshApplyPlan &&
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
      !isFailedDestroyAttempt &&
      deployment.status !== "RUNNING"
  );
  const canShowDestroyPlanAction = Boolean(
    deployment &&
      isDestroyable &&
      (!isDestroyPlan || isFailedDestroyAttempt) &&
      deployment.status !== "RUNNING"
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
    hasCompleteApprovalSnapshot &&
    !isLoading
  );
  const canRunDestroyPlan = canShowDestroyPlanAction && !isLoading;
  const canDestroy = Boolean(
    deployment &&
    isDestroyable &&
    isDestroyPlan &&
    isPlanApproved &&
    !isFailedDestroyAttempt &&
    deployment.status !== "RUNNING" &&
    deployment.isBlocked === false &&
    hasCompleteApprovalSnapshot &&
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
    shouldShowDestroyButton: Boolean(
      deployment && isDestroyPlan && isPlanApproved && !isFailedDestroyAttempt
    ),
    approvePlanLabel: isDestroyPlan ? "삭제 Plan 승인" : "Plan 승인"
  };
}

export function selectDeploymentCleanupTarget(
  deployments: readonly Deployment[]
): Deployment | null {
  return selectDeploymentCleanupTargets(deployments)[0] ?? null;
}

export function selectDeploymentCleanupTargets(
  deployments: readonly Deployment[]
): Deployment[] {
  const lifecycleHeads = new Map<"application" | "terraform", Deployment>();

  for (const deployment of [...deployments]
    .filter(isDeploymentLifecycleHeadCandidate)
    .sort(compareDeploymentCreatedAtDescending)) {
    const lineage = deployment.scope === "application" ? "application" : "terraform";

    if (!lifecycleHeads.has(lineage)) {
      lifecycleHeads.set(lineage, deployment);
    }
  }

  return [...lifecycleHeads.values()]
    .filter(isCleanupDestroyCandidate)
    .sort(compareDeploymentCreatedAtDescending);
}

export function hasCompleteDeploymentApprovalSnapshot(deployment: Deployment): boolean {
  return Boolean(
    deployment.approvedAt &&
    deployment.approvedByUserId &&
    deployment.approvedTerraformArtifactId &&
    deployment.approvedPlanArtifactId &&
    deployment.approvedTerraformArtifactHash &&
    deployment.approvedTfplanHash &&
    deployment.approvedAwsAccountId &&
    deployment.approvedAwsRegion
  );
}

export function shouldAutoRefreshDeployment(deployment: Deployment | null): boolean {
  return deployment?.status === "RUNNING";
}

export function getInfrastructureRollbackTarget(
  source: Deployment | null,
  deployments: readonly Deployment[]
): Deployment | null {
  if (
    !source ||
    source.scope === "application" ||
    !source.stateObjectKey ||
    !(
      source.status === "SUCCESS" ||
      (source.status === "FAILED" &&
        (source.failureStage === "apply" || source.failureStage === "destroy"))
    ) ||
    !source.awsConnectionId ||
    !source.awsAccountIdSnapshot ||
    !source.awsRegionSnapshot
  ) {
    return null;
  }

  const sourceCreatedAt = Date.parse(source.createdAt);
  const hasNewerState = deployments.some(
    (candidate) =>
      candidate.id !== source.id &&
      candidate.status !== "DESTROYED" &&
      candidate.stateObjectKey !== null &&
      candidate.awsAccountIdSnapshot === source.awsAccountIdSnapshot &&
      candidate.awsRegionSnapshot === source.awsRegionSnapshot &&
      Date.parse(candidate.createdAt) > sourceCreatedAt
  );
  if (hasNewerState) return null;

  return (
    deployments
      .filter(
        (candidate) =>
          candidate.id !== source.id &&
          candidate.projectId === source.projectId &&
          candidate.status === "SUCCESS" &&
          candidate.scope !== "application" &&
          candidate.stateObjectKey !== null &&
          candidate.awsAccountIdSnapshot === source.awsAccountIdSnapshot &&
          candidate.awsRegionSnapshot === source.awsRegionSnapshot &&
          Date.parse(candidate.createdAt) < sourceCreatedAt
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null
  );
}

export function shouldAutoRefreshGitCicdHandoff(handoff: GitCicdHandoff | null): boolean {
  return handoff?.status === "pr_created" || handoff?.status === "pipeline_running";
}

export function getGitCicdHandoffStatusLabel(handoff: GitCicdHandoff | null): string {
  if (!handoff) {
    return "No Git/CI/CD handoff";
  }

  switch (handoff.status) {
    case "draft":
      return "Handoff draft";
    case "pr_created":
      return "PR created";
    case "pipeline_running":
      return "Pipeline running";
    case "pipeline_success":
      return "Pipeline success";
    case "pipeline_failed":
      return "Pipeline failed";
    case "cancelled":
      return "Handoff cancelled";
  }
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

function getNextDeploymentLogMessageToken(text: string): DeploymentLogMessageToken | null {
  const patterns: readonly {
    readonly tone: DeploymentLogMessageTokenTone;
    readonly pattern: RegExp;
  }[] = [
    { tone: "metadata", pattern: /^\[[^\]]+\]/ },
    { tone: "string", pattern: /^"[^"]*"/ },
    {
      tone: "resource",
      pattern: /^(?:data\.)?[a-z][a-z0-9_]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/
    },
    {
      tone: "operation",
      pattern:
        /^(?:Creation complete|Destruction complete|Still creating|Still destroying|Creating|Destroying|Apply complete|Destroy complete|Outputs)/
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
  if (deployment.scope === "application") {
    if (!deployment.releaseId) {
      return false;
    }

    return (
      deployment.status === "SUCCESS" ||
      (deployment.status === "FAILED" &&
        (deployment.failureStage === "apply" || deployment.failureStage === "destroy"))
    );
  }

  if (!deployment.stateObjectKey) {
    return false;
  }

  if (deployment.status === "SUCCESS") {
    return true;
  }

  return (
    deployment.status === "FAILED" &&
    (deployment.failureStage === "plan" ||
      deployment.failureStage === "apply" ||
      deployment.failureStage === "destroy")
  );
}

function isDeploymentLifecycleHeadCandidate(deployment: Deployment): boolean {
  return (
    deployment.status === "SUCCESS" ||
    deployment.status === "DESTROYED" ||
    (deployment.status === "FAILED" &&
      (deployment.stateObjectKey !== null ||
        (deployment.scope === "application" && deployment.releaseId !== null)))
  );
}

function compareDeploymentCreatedAtDescending(left: Deployment, right: Deployment): number {
  return (
    Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id)
  );
}
