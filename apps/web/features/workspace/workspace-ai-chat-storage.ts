const WORKSPACE_AI_CHAT_STORAGE_KEY_PREFIX = "sketchcatch.workspaceAiChat";

export function createWorkspaceAiChatStorageKey(projectId: string): string {
  return `${WORKSPACE_AI_CHAT_STORAGE_KEY_PREFIX}.${projectId}`;
}
