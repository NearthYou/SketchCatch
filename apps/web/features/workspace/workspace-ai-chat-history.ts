export type WorkspaceAiPromptMessage = {
  readonly content: string;
  readonly role: "assistant" | "user";
};

export function createLatestUserRequirementPrompt(
  messages: readonly WorkspaceAiPromptMessage[]
): string {
  return findLatestUserPrompt(messages, () => true);
}

export function createLatestUserRequirementPromptExcluding(
  messages: readonly WorkspaceAiPromptMessage[],
  excludedPrompt: string
): string {
  return findLatestUserPrompt(messages, (content) => content !== excludedPrompt);
}

function findLatestUserPrompt(
  messages: readonly WorkspaceAiPromptMessage[],
  canUsePrompt: (content: string) => boolean
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const content = message?.content.trim() ?? "";

    if (message?.role === "user" && content.length > 0 && canUsePrompt(content)) {
      return content;
    }
  }

  return "";
}
