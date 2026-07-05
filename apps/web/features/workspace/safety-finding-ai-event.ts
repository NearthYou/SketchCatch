import type { CheckFinding } from "@sketchcatch/types";

export const WORKSPACE_SAFETY_FINDING_AI_EVENT = "sketchcatch:safety-finding-ai-open";

export type WorkspaceSafetyFindingAiEventDetail = {
  readonly finding: CheckFinding;
  readonly requestedAt: string;
};

export function createWorkspaceSafetyFindingAiEventDetail(
  finding: CheckFinding,
  requestedAt = new Date().toISOString()
): WorkspaceSafetyFindingAiEventDetail {
  return {
    finding,
    requestedAt
  };
}

export function dispatchWorkspaceSafetyFindingAiEvent(
  finding: CheckFinding,
  target: Window = window
): void {
  target.dispatchEvent(
    new CustomEvent<WorkspaceSafetyFindingAiEventDetail>(WORKSPACE_SAFETY_FINDING_AI_EVENT, {
      detail: createWorkspaceSafetyFindingAiEventDetail(finding)
    })
  );
}
