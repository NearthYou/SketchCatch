export const workspaceAiChatScopes = ["draft", "errors", "preview"] as const;

export type WorkspaceAiChatScope = (typeof workspaceAiChatScopes)[number];

export type WorkspaceAiChatComposerState = {
  readonly value: string;
  readonly voiceStatusMessage: string;
};

export type WorkspaceAiChatScopeDefinition = {
  readonly emptyDescription: string;
  readonly inputAvailable: boolean;
  readonly label: string;
};

const scopeDefinitions: Record<WorkspaceAiChatScope, WorkspaceAiChatScopeDefinition> = {
  draft: {
    emptyDescription: "새 설계 요구사항을 입력하면 제안을 만들 수 있습니다.",
    inputAvailable: true,
    label: "설계 제안"
  },
  errors: {
    emptyDescription: "Terraform Issue에서 분석을 요청하면 결과가 여기에 쌓입니다.",
    inputAvailable: false,
    label: "오류 분석"
  },
  preview: {
    emptyDescription: "Terraform Preview에서 리뷰를 요청하면 결과가 여기에 쌓입니다.",
    inputAvailable: false,
    label: "에이전트 리뷰"
  }
};

export function createWorkspaceAiChatComposerStates(): Record<
  WorkspaceAiChatScope,
  WorkspaceAiChatComposerState
> {
  return {
    draft: { value: "", voiceStatusMessage: "" },
    errors: { value: "", voiceStatusMessage: "" },
    preview: { value: "", voiceStatusMessage: "" }
  };
}

export function getWorkspaceAiChatScopeDefinition(
  scope: WorkspaceAiChatScope
): WorkspaceAiChatScopeDefinition {
  return scopeDefinitions[scope];
}

export function getAdjacentWorkspaceAiChatScope(
  scope: WorkspaceAiChatScope,
  offset: number
): WorkspaceAiChatScope {
  const currentIndex = workspaceAiChatScopes.indexOf(scope);
  const nextIndex = (currentIndex + offset + workspaceAiChatScopes.length) % workspaceAiChatScopes.length;

  return workspaceAiChatScopes[nextIndex] ?? "draft";
}

export function isWorkspaceAiChatScope(value: unknown): value is WorkspaceAiChatScope {
  return typeof value === "string" && workspaceAiChatScopes.includes(value as WorkspaceAiChatScope);
}
