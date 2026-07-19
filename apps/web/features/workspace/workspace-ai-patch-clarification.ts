import type {
  ArchitecturePatchClarification,
  ArchitecturePatchClarificationCandidate
} from "@sketchcatch/types";

export const NO_RESOURCE_ADDITION_SUGGESTION = "추가 안 함";
export const NO_RESOURCE_ADDITION_MESSAGE = "추가 없이 지금까지의 요청으로 새 초안을 생성합니다.";

export function findPatchClarificationCandidate(
  clarification: ArchitecturePatchClarification,
  answer: string
): ArchitecturePatchClarificationCandidate | undefined {
  const normalizedAnswer = normalizePatchClarificationAnswer(answer);

  return clarification.candidates.find((candidate) => {
    const normalizedResourceId = normalizePatchClarificationAnswer(candidate.resourceId);
    const normalizedLabel = normalizePatchClarificationAnswer(candidate.label);
    const normalizedSuggestion = normalizePatchClarificationAnswer(
      formatPatchCandidateSuggestion(candidate)
    );

    return (
      normalizedAnswer === normalizedResourceId ||
      normalizedAnswer === normalizedLabel ||
      normalizedAnswer === normalizedSuggestion ||
      normalizedAnswer.includes(normalizedResourceId) ||
      normalizedAnswer.includes(normalizedLabel)
    );
  });
}

export function findPatchClarificationSuggestion(
  clarification: ArchitecturePatchClarification,
  answer: string
): string | undefined {
  const normalizedAnswer = normalizePatchClarificationAnswer(answer);

  return clarification.suggestions?.find((suggestion) => {
    const normalizedSuggestion = normalizePatchClarificationAnswer(suggestion);

    return (
      normalizedAnswer === normalizedSuggestion ||
      normalizedAnswer.includes(normalizedSuggestion) ||
      (normalizedAnswer.length > 1 && normalizedSuggestion.includes(normalizedAnswer))
    );
  });
}

export function isAddResourceConnectionClarification(
  clarification: ArchitecturePatchClarification
): boolean {
  return (
    clarification.intent.requestedAction === "add_resource" &&
    clarification.intent.resourceType !== undefined &&
    clarification.candidates.length > 0
  );
}

export function isServicePurposePatchClarification(
  clarification: ArchitecturePatchClarification
): boolean {
  return (
    clarification.intent.requestedAction === "manual_review" &&
    clarification.candidates.length === 0
  );
}

export function isSkipConnectionSuggestion(suggestion: string): boolean {
  return (
    normalizePatchClarificationAnswer(suggestion) ===
    normalizePatchClarificationAnswer("연결하지 않기")
  );
}

export function isNoResourceAdditionSuggestion(suggestion: string): boolean {
  return (
    normalizePatchClarificationAnswer(suggestion) ===
    normalizePatchClarificationAnswer(NO_RESOURCE_ADDITION_SUGGESTION)
  );
}

export function getPatchClarificationSuggestions(
  clarification: ArchitecturePatchClarification
): readonly string[] {
  if (isAddResourceConnectionClarification(clarification)) {
    return [
      ...clarification.candidates.map(formatPatchCandidateSuggestion),
      ...(clarification.suggestions ?? [])
    ];
  }

  return clarification.suggestions && clarification.suggestions.length > 0
    ? clarification.suggestions
    : clarification.candidates.map(formatPatchCandidateSuggestion);
}

function normalizePatchClarificationAnswer(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function formatPatchCandidateSuggestion(
  candidate: ArchitecturePatchClarificationCandidate
): string {
  return `${candidate.label} (${candidate.resourceType})`;
}
