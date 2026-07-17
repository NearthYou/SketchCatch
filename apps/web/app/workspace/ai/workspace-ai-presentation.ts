import type {
  AiArchitectureDraftResult,
  ArchitectureBoardCompilationProposal,
  ArchitectureDraftProgressSnapshot,
  DiagramJson
} from "@sketchcatch/types";
import {
  hasSelectedAssistantQuestion,
  type SelectedAssistantOption
} from "./selected-option-model";

export type WorkspaceAiRequestState = "idle" | "loading" | "error" | "cancelled";
export type WorkspaceAiStagePhase = "orbit" | "orbit-exiting" | "preview";

export const ORBIT_EXIT_DURATION_MS = 440;

export type ProgressCandidateAction = {
  readonly candidateId: string;
  readonly label: string;
  readonly resourceType: string;
};

export function isSuggestionDisabled(
  selections: readonly SelectedAssistantOption[],
  questionMessageId: string,
  requestState: WorkspaceAiRequestState,
  isInputBlocked = false
): boolean {
  return (
    requestState === "loading" ||
    isInputBlocked ||
    hasSelectedAssistantQuestion(selections, questionMessageId)
  );
}

export function getRetryRequestLabel(requestState: WorkspaceAiRequestState): string | null {
  if (requestState === "cancelled") return "취소한 요청 다시 시도";
  if (requestState === "error") return "마지막 요청 다시 시도";
  return null;
}

export function getWorkspaceAiStageTransition({
  hasFinalPreview,
  prefersReducedMotion
}: {
  readonly hasFinalPreview: boolean;
  readonly prefersReducedMotion: boolean;
}): { readonly delayMs: number; readonly phase: WorkspaceAiStagePhase } {
  if (!hasFinalPreview) return { delayMs: 0, phase: "orbit" };
  if (prefersReducedMotion) return { delayMs: 0, phase: "preview" };
  return { delayMs: ORBIT_EXIT_DURATION_MS, phase: "orbit-exiting" };
}

export function getComposerEnterAction({
  isComposing,
  key,
  shiftKey
}: {
  readonly isComposing: boolean;
  readonly key: string;
  readonly shiftKey: boolean;
}): "ignore" | "newline" | "submit" {
  if (key !== "Enter" || isComposing) return "ignore";
  return shiftKey ? "newline" : "submit";
}

export function shouldAutoFollowTranscript({
  clientHeight,
  scrollHeight,
  scrollTop
}: {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}): boolean {
  return scrollHeight - scrollTop - clientHeight <= 48;
}

export function getProgressCandidateActions(
  snapshot: ArchitectureDraftProgressSnapshot | null
): readonly ProgressCandidateAction[] {
  if (snapshot === null) return [];

  const nodeById = new Map(
    snapshot.provisionalArchitectureJson.nodes.map((node) => [node.id, node])
  );

  return snapshot.excludableCandidateIds.flatMap((candidateId) => {
    const candidate = nodeById.get(candidateId);
    if (!candidate) return [];

    return [
      {
        candidateId,
        label: candidate.label?.trim() || candidate.type,
        resourceType: candidate.type
      }
    ];
  });
}

export function resolveFinalArchitectureDiagram(
  draft: AiArchitectureDraftResult | null,
  proposal: ArchitectureBoardCompilationProposal | null
): DiagramJson | null {
  return draft !== null && proposal !== null ? proposal.diagram : null;
}
