import type { Deployment, ProjectDeleteAction, ProjectDeletePreview } from "@sketchcatch/types";

export type ProjectDeleteWorkflowStatus =
  | "ready"
  | "planning"
  | "approval"
  | "destroying"
  | "deleting";

export function shouldShowProjectOnlyDeleteFallback(input: {
  readonly errorMessage?: string | undefined;
  readonly preview: ProjectDeletePreview;
  readonly selectedAction?: ProjectDeleteAction | undefined;
  readonly status: ProjectDeleteWorkflowStatus;
}): boolean {
  return (
    input.selectedAction === "destroy_then_delete" &&
    input.preview.availableActions.includes("delete_project_only") &&
    (input.status === "ready" || input.status === "approval") &&
    input.errorMessage !== undefined &&
    input.errorMessage.trim().length > 0
  );
}

export function getDestroyDeleteAcknowledgedWarningIds(
  deployment: Pick<Deployment, "planSummary"> | undefined
): string[] {
  return (
    deployment?.planSummary?.warnings
      ?.filter((warning) => warning.requiresAcknowledgement && !warning.blocksApproval)
      .map((warning) => warning.id) ?? []
  );
}

export function isDestroyPlanReadyForApproval(deployment: Deployment): boolean {
  return (
    deployment.status !== "RUNNING" &&
    deployment.activeStage === null &&
    deployment.currentPlanArtifactId !== null &&
    deployment.currentPlanOperation === "destroy" &&
    deployment.planSummary !== null
  );
}
