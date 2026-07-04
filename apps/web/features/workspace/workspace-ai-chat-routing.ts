export type WorkspaceAiChatMode = "draft" | "patch";
export type WorkspaceAiChatAction = "draft" | "draft_clarification" | "patch";

export function resolveWorkspaceAiChatMode(input: {
  readonly boardHasResources: boolean;
  readonly prompt: string;
}): WorkspaceAiChatMode {
  if (!input.boardHasResources) {
    return "draft";
  }

  return isFreshArchitectureRequest(input.prompt) ? "draft" : "patch";
}

export function resolveWorkspaceAiChatAction(input: {
  readonly boardHasResources: boolean;
  readonly needsDraftClarification: boolean;
  readonly prompt: string;
}): WorkspaceAiChatAction {
  const mode = resolveWorkspaceAiChatMode(input);

  if (mode === "patch") {
    return "patch";
  }

  return input.needsDraftClarification ? "draft_clarification" : "draft";
}

function isFreshArchitectureRequest(prompt: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();

  return [
    "from scratch",
    "start over",
    "ignore existing",
    "replace all",
    "new diagram",
    "새로",
    "처음부터",
    "기존 무시",
    "다시 만들어",
    "전체 교체"
  ].some((keyword) => normalizedPrompt.includes(keyword));
}
