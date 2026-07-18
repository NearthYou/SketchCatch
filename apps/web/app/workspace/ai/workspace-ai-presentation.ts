import type {
  AiArchitectureDraftResult,
  ArchitectureBoardCompilationProposal,
  DiagramJson
} from "@sketchcatch/types";
import {
  hasSelectedAssistantQuestion,
  type SelectedAssistantOption
} from "./selected-option-model";

export type WorkspaceAiRequestState = "idle" | "loading" | "error" | "cancelled";
export type WorkspaceAiStagePhase = "orbit" | "orbit-exiting" | "preview";
export type WorkspaceAiOrbitPhase = "exploring" | "converging" | "hidden";
export type WorkspaceAiMobileView = "conversation" | "preview";
export type WorkspaceAiErrorStage = "apply" | "draft" | "load" | "patch";

export type WorkspaceAiOrbitPresentation = {
  readonly convergenceLevel: 0 | 1 | 2 | 3;
  readonly phase: WorkspaceAiOrbitPhase;
  readonly visibleRingCount: 0 | 1 | 2 | 3;
};

export const ORBIT_EXIT_DURATION_MS = 440;

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
  currentPhase,
  hasFinalPreview,
  prefersReducedMotion
}: {
  readonly currentPhase: WorkspaceAiStagePhase;
  readonly hasFinalPreview: boolean;
  readonly prefersReducedMotion: boolean;
}): { readonly delayMs: number; readonly phase: WorkspaceAiStagePhase } {
  if (!hasFinalPreview) return { delayMs: 0, phase: "orbit" };
  if (currentPhase === "preview") return { delayMs: 0, phase: "preview" };
  if (prefersReducedMotion) return { delayMs: 0, phase: "preview" };
  return { delayMs: ORBIT_EXIT_DURATION_MS, phase: "orbit-exiting" };
}

export function getWorkspaceAiOrbitPresentation({
  answerCount,
  stagePhase
}: {
  readonly answerCount: number;
  readonly stagePhase: WorkspaceAiStagePhase;
}): WorkspaceAiOrbitPresentation {
  if (stagePhase === "preview") {
    return { convergenceLevel: 3, phase: "hidden", visibleRingCount: 0 };
  }

  if (stagePhase === "orbit-exiting") {
    return { convergenceLevel: 3, phase: "converging", visibleRingCount: 0 };
  }

  if (answerCount <= 3) {
    return { convergenceLevel: 0, phase: "exploring", visibleRingCount: 3 };
  }

  if (answerCount <= 8) {
    return { convergenceLevel: 1, phase: "exploring", visibleRingCount: 2 };
  }

  return { convergenceLevel: 2, phase: "exploring", visibleRingCount: 1 };
}

export function createWorkspaceAiOrbitReactionKey({
  lastMessageId,
  selectionCount
}: {
  readonly lastMessageId: string | null;
  readonly selectionCount: number;
}): string {
  return `${lastMessageId ?? "empty"}:${Math.max(0, selectionCount)}`;
}

export function resolveWorkspaceAiMobileView({
  hasFinalPreview,
  previewRequested
}: {
  readonly hasFinalPreview: boolean;
  readonly previewRequested: boolean;
}): WorkspaceAiMobileView {
  return hasFinalPreview && previewRequested ? "preview" : "conversation";
}

export function shouldShowMobilePreviewTrigger({
  hasFinalPreview,
  mobileView
}: {
  readonly hasFinalPreview: boolean;
  readonly mobileView: WorkspaceAiMobileView;
}): boolean {
  return hasFinalPreview && mobileView === "conversation";
}

export function getWorkspaceAiErrorMessage(stage: WorkspaceAiErrorStage): string {
  switch (stage) {
    case "load":
      return "최신 초안을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
    case "patch":
      return "초안을 수정하지 못했어요. 잠시 후 다시 시도해 주세요.";
    case "apply":
      return "보드에 적용하지 못했어요. 잠시 후 다시 시도해 주세요.";
    case "draft":
      return "AI 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
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

export function shouldAutoFollowTranscript(
  input:
    | {
        readonly source: "assistant-option-selection";
      }
    | {
        readonly clientHeight: number;
        readonly scrollHeight: number;
        readonly scrollTop: number;
        readonly source: "scroll";
      }
): boolean {
  if (input.source === "assistant-option-selection") return true;

  const { clientHeight, scrollHeight, scrollTop } = input;
  return scrollHeight - scrollTop - clientHeight <= 48;
}

export function shouldReleaseForcedTranscriptFollow({
  clientHeight,
  scrollHeight,
  scrollTop
}: {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
}): boolean {
  return !shouldAutoFollowTranscript({
    clientHeight,
    scrollHeight,
    scrollTop,
    source: "scroll"
  });
}

export function resolveFinalArchitectureDiagram(
  draft: AiArchitectureDraftResult | null,
  proposal: ArchitectureBoardCompilationProposal | null
): DiagramJson | null {
  return draft !== null && proposal !== null ? proposal.diagram : null;
}
