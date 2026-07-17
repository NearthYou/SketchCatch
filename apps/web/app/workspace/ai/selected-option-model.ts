export type SelectedAssistantOption = {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly questionMessageId: string;
  readonly selectedAt: string;
};

export type SelectedAssistantOptionInput = {
  readonly label: string;
  readonly questionMessageId: string;
  readonly selectedAt: string;
};

export type AppendSelectedAssistantOptionResult = {
  readonly didAppend: boolean;
  readonly selection: SelectedAssistantOption | null;
  readonly selections: readonly SelectedAssistantOption[];
};

export function appendSelectedAssistantOption(
  current: readonly SelectedAssistantOption[],
  input: SelectedAssistantOptionInput
): AppendSelectedAssistantOptionResult {
  if (hasSelectedAssistantQuestion(current, input.questionMessageId)) {
    return { didAppend: false, selection: null, selections: current };
  }

  const label = input.label.trim();
  const questionMessageId = input.questionMessageId.trim();

  if (
    label.length === 0 ||
    questionMessageId.length === 0 ||
    input.selectedAt.trim().length === 0
  ) {
    throw new Error("Assistant option selection requires a question, label, and timestamp.");
  }

  const selection: SelectedAssistantOption = {
    id: createSelectedAssistantOptionId(questionMessageId, label),
    label,
    order: current.length + 1,
    questionMessageId,
    selectedAt: input.selectedAt
  };

  return {
    didAppend: true,
    selection,
    selections: [...current, selection]
  };
}

export function hasSelectedAssistantQuestion(
  selections: readonly SelectedAssistantOption[],
  questionMessageId: string
): boolean {
  return selections.some((selection) => selection.questionMessageId === questionMessageId);
}

function createSelectedAssistantOptionId(questionMessageId: string, label: string): string {
  const questionSlug =
    questionMessageId
      .replace(/[^a-zA-Z0-9_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40) || "question";

  return `selected-option-${questionSlug}-${stableHash(`${questionMessageId}\0${label}`)}`;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }

  return hash.toString(36);
}
