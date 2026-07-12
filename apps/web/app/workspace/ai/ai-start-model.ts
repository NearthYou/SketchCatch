import type {
  AiArchitectureDraftResult,
  ArchitectureDraftClarification,
  ArchitecturePatchClarification,
  ArchitecturePatchClarificationCandidate,
  ArchitecturePatchPreview,
  DiagramJson
} from "@sketchcatch/types";
import { getDiagramJsonForArchitectureDraft } from "../../../features/workspace/workspace-ai-diagram-adapter";
import { createWorkspaceAiChatStorageKey } from "../../../features/workspace/workspace-ai-chat-history";

const AI_START_DRAFT_STORAGE_KEY = "sketchcatch.newProjectDraft";
const MAX_CHAT_MESSAGES = 80;

export type AiStartProjectDraft = {
  readonly projectName: string;
  readonly startMode: "ai";
  readonly updatedAt: string;
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
  const candidates = clarification.candidates.map(formatPatchCandidate);
  return [...candidates, ...(clarification.suggestions ?? [])];
}

export function findPatchClarificationCandidate(
  clarification: ArchitecturePatchClarification,
  answer: string
): ArchitecturePatchClarificationCandidate | undefined {
  const normalizedAnswer = normalizeAnswer(answer);

  return clarification.candidates.find((candidate) => {
    const candidateLabel = normalizeAnswer(formatPatchCandidate(candidate));
    return (
      normalizedAnswer === normalizeAnswer(candidate.resourceId) ||
      normalizedAnswer === normalizeAnswer(candidate.label) ||
      normalizedAnswer === candidateLabel ||
      normalizedAnswer.includes(normalizeAnswer(candidate.resourceId))
    );
  });
}

export function findPatchClarificationSuggestion(
  clarification: ArchitecturePatchClarification,
  answer: string
): string | undefined {
  const normalizedAnswer = normalizeAnswer(answer);
  return clarification.suggestions?.find(
    (suggestion) => normalizeAnswer(suggestion) === normalizedAnswer
  );
}

export function createDraftFromPatch(
  preview: ArchitecturePatchPreview,
  previousDraft: AiArchitectureDraftResult | null
): AiArchitectureDraftResult {
  const nextDraft: AiArchitectureDraftResult = {
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

  return {
    ...nextDraft,
    diagramJson: getDiagramJsonForArchitectureDraft(nextDraft)
  };
}

export function createPatchSummary(preview: ArchitecturePatchPreview): string {
  if (preview.changes.length === 0) {
    return "변경 없이 현재 PREVIEW를 유지합니다.";
  }

  if (preview.changes.length === 1) {
    return preview.changes[0]?.summary ?? "수정 PREVIEW를 만들었습니다.";
  }

  return `${preview.changes.length}개 변경 사항을 PREVIEW에 반영했습니다.`;
}

export function hasDraftResources(diagram: DiagramJson | null): boolean {
  return diagram !== null && diagram.nodes.length > 0;
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

function formatPatchCandidate(candidate: ArchitecturePatchClarificationCandidate): string {
  return `${candidate.label} (${candidate.resourceType})`;
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}
