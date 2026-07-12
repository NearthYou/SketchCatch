export type WorkspaceAiPromptMessage = {
  readonly content: string;
  readonly role: "assistant" | "user";
};

const WORKSPACE_AI_CHAT_STORAGE_KEY_PREFIX = "sketchcatch.workspaceAiChat";

export function createWorkspaceAiChatStorageKey(projectId: string): string {
  return `${WORKSPACE_AI_CHAT_STORAGE_KEY_PREFIX}.${projectId}`;
}

// 새 프로젝트 대화가 복원되기 전에는 이전 프로젝트 메시지를 저장하지 않습니다.
export function shouldPersistWorkspaceAiChatMessages({
  loadedStorageKey,
  messageCount,
  storageKey
}: {
  readonly loadedStorageKey: string;
  readonly messageCount: number;
  readonly storageKey: string;
}): boolean {
  return messageCount > 0 && loadedStorageKey === storageKey;
}

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
