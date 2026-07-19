import type {
  AiArchitectureDraftResult,
  ArchitectureDraftClarification,
  ArchitecturePatchClarification,
  ArchitecturePatchClarificationCandidate,
  ArchitecturePatchPreview
} from "@sketchcatch/types";
import { createWorkspaceAiChatStorageKey } from "../../../features/workspace/workspace-ai-chat-storage";
import {
  findPatchClarificationCandidate as findSharedPatchClarificationCandidate,
  findPatchClarificationSuggestion as findSharedPatchClarificationSuggestion,
  getPatchClarificationSuggestions as getSharedPatchClarificationSuggestions
} from "../../../features/workspace/workspace-ai-patch-clarification";

const AI_START_DRAFT_STORAGE_KEY = "sketchcatch.newProjectDraft";
const MAX_CHAT_MESSAGES = 80;

export type AiStartProjectDraft = {
  readonly projectName: string;
  readonly startMode: "ai";
  readonly updatedAt: string;
};

export type AiStartExistingProject = {
  readonly projectId: string;
  readonly projectName: string;
  readonly returnHref: string;
};

export type AiStartMessage = {
  readonly content: string;
  readonly createdAt: string;
  readonly id: string;
  readonly kind: "draft" | "error" | "question" | "status";
  readonly role: "assistant" | "user";
  readonly scope: "draft";
  readonly selectionMode: "single";
  readonly suggestions?: readonly string[] | undefined;
};

export function readAiStartProjectDraft(): AiStartProjectDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(AI_START_DRAFT_STORAGE_KEY);
    const parsedValue: unknown = rawValue ? JSON.parse(rawValue) : null;

    return isAiStartProjectDraft(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
}

export function clearAiStartProjectDraft(): void {
  window.sessionStorage.removeItem(AI_START_DRAFT_STORAGE_KEY);
}

export function createAiStartMessage(
  role: AiStartMessage["role"],
  kind: AiStartMessage["kind"],
  content: string,
  suggestions: readonly string[] = []
): AiStartMessage {
  return {
    content,
    createdAt: new Date().toISOString(),
    id: createMessageId(),
    kind,
    role,
    scope: "draft",
    selectionMode: "single",
    ...(suggestions.length > 0 ? { suggestions } : {})
  };
}

export function trimAiStartMessages(messages: readonly AiStartMessage[]): AiStartMessage[] {
  return messages.slice(-MAX_CHAT_MESSAGES);
}

export function storeApprovedAiStartMessages(
  projectId: string,
  messages: readonly AiStartMessage[]
): void {
  try {
    window.localStorage.setItem(
      createWorkspaceAiChatStorageKey(projectId),
      JSON.stringify(trimAiStartMessages(messages))
    );
  } catch (error) {
    console.error("Failed to store approved AI conversation:", error);
  }
}

export function isArchitectureDraftClarification(
  response: AiArchitectureDraftResult | ArchitectureDraftClarification
): response is ArchitectureDraftClarification {
  return "status" in response && response.status === "needs_clarification";
}

export function isArchitecturePatchClarification(
  response: ArchitecturePatchPreview | ArchitecturePatchClarification
): response is ArchitecturePatchClarification {
  return "status" in response && response.status === "needs_clarification";
}

export function getPatchClarificationSuggestions(
  clarification: ArchitecturePatchClarification
): readonly string[] {
  return getSharedPatchClarificationSuggestions(clarification);
}

export function findPatchClarificationCandidate(
  clarification: ArchitecturePatchClarification,
  answer: string
): ArchitecturePatchClarificationCandidate | undefined {
  return findSharedPatchClarificationCandidate(clarification, answer);
}

export function findPatchClarificationSuggestion(
  clarification: ArchitecturePatchClarification,
  answer: string
): string | undefined {
  return findSharedPatchClarificationSuggestion(clarification, answer);
}

export function createDraftFromPatch(
  preview: ArchitecturePatchPreview,
  previousDraft: AiArchitectureDraftResult | null
): AiArchitectureDraftResult {
  return {
    architectureJson: preview.proposedArchitectureJson,
    title: previousDraft?.title ?? "Practice Architecture",
    metadata: previousDraft?.metadata ?? {
      assumptions: [],
      confidence: "low",
      explanations: [],
      guardrailWarnings: [],
      source: "prompt"
    },
    ...(preview.llmExplanation ? { llmExplanation: preview.llmExplanation } : {})
  };
}

export function createPatchSummary(preview: ArchitecturePatchPreview): string {
  if (preview.changes.length === 0) {
    return "변경 없이 현재 초안을 유지합니다.";
  }

  if (preview.changes.length === 1) {
    return preview.changes[0]?.summary ?? "수정한 초안을 만들었습니다.";
  }

  return `${preview.changes.length}개 변경 사항을 초안에 반영했습니다.`;
}

function isAiStartProjectDraft(value: unknown): value is AiStartProjectDraft {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return (
    "startMode" in value &&
    value.startMode === "ai" &&
    "projectName" in value &&
    typeof value.projectName === "string" &&
    value.projectName.trim().length > 0 &&
    "updatedAt" in value &&
    typeof value.updatedAt === "string"
  );
}

function createMessageId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
