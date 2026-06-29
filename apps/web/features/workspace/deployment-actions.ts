import type { Deployment } from "@sketchcatch/types";

type DeploymentRequestState = "idle" | "loading" | "error";

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
  const isApplyPlan = deployment?.currentPlanOperation !== "destroy";

  const canRunApplyPlan = Boolean(
    deployment &&
      deployment.status !== "RUNNING" &&
      deployment.status !== "SUCCESS" &&
      deployment.status !== "DESTROYED" &&
      !isDestroyable &&
      !isPlanApproved &&
      !isLoading
  );
  const canApprovePlan = Boolean(
    deployment &&
      hasCurrentPlan &&
      !isPlanApproved &&
      deployment.status !== "RUNNING" &&
      deployment.isBlocked === true &&
      deployment.blockedBy === "missing_approval" &&
      !isLoading
  );
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
  const canRunDestroyPlan = Boolean(
    deployment &&
      isDestroyable &&
      deployment.status !== "RUNNING" &&
      !(isDestroyPlan && isPlanApproved) &&
      !isLoading
  );
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
    shouldShowApplyPlanButton: Boolean(deployment && !isDestroyable && !isPlanApproved),
    shouldShowApprovePlanButton: Boolean(deployment && hasCurrentPlan && !isPlanApproved),
    shouldShowApplyButton: Boolean(
      deployment &&
        isApplyPlan &&
        isPlanApproved &&
        deployment.status !== "SUCCESS" &&
        deployment.status !== "DESTROYED"
    ),
    shouldShowDestroyPlanButton: Boolean(deployment && isDestroyable && !(isDestroyPlan && isPlanApproved)),
    shouldShowDestroyButton: Boolean(deployment && isDestroyPlan && isPlanApproved),
    approvePlanLabel: isDestroyPlan ? "Destroy Plan 승인" : "Plan 승인"
  };
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
