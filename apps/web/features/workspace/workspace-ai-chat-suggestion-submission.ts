export class WorkspaceAiChatSuggestionSubmissionRegistry {
  readonly #claimedMessageIds = new Set<string>();

  claim(messageId: string): boolean {
    const normalizedMessageId = messageId.trim();
    if (normalizedMessageId.length === 0 || this.#claimedMessageIds.has(normalizedMessageId)) {
      return false;
    }

    this.#claimedMessageIds.add(normalizedMessageId);
    return true;
  }

  clear(): void {
    this.#claimedMessageIds.clear();
  }
}

export function getWorkspaceAiChatSuggestionPresentation(input: {
  readonly hasSubmittedSuggestion: boolean;
  readonly isChatBusy: boolean;
  readonly isSelected: boolean;
}): { readonly disabled: boolean; readonly selectionState: string | null } {
  return {
    disabled: input.isChatBusy || input.hasSubmittedSuggestion,
    selectionState:
      input.isSelected && input.hasSubmittedSuggestion ? "\u2713 \uC120\uD0DD\uB428" : null
  };
}
