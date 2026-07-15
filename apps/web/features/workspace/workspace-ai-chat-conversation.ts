export const workspaceAiChatScopes = ["draft", "errors", "preview"] as const;
const WORKSPACE_AI_CHAT_STORAGE_KEY_PREFIX = "sketchcatch.workspaceAiChat";
const ACTIVE_SCOPE_STORAGE_KEY_SUFFIX = "activeScope";

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
    emptyDescription: "오른쪽 검증 문제에서 ‘오류 분석’을 누르면 원인과 해결 방법을 보여드려요.",
    inputAvailable: false,
    label: "오류 분석"
  },
  preview: {
    emptyDescription: "아래 ‘에이전트 리뷰’를 누르면 최신 Terraform 구성과 확인할 점을 보여드려요.",
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

export function shouldShowWorkspaceAiChatMessage({
  content,
  kind
}: {
  readonly content: string;
  readonly kind: string;
}): boolean {
  if (kind === "preview") {
    return !(
      content.startsWith("에이전트 리뷰를 요청했습니다.") ||
      content.startsWith("에이전트 리뷰 완료:") ||
      content.endsWith("검토를 시작했습니다.") ||
      content === "검토가 끝났습니다. 아래에서 요약과 확인할 점을 확인하세요."
    );
  }

  if (kind === "terraform_issue") {
    return !(
      content.startsWith("Terraform 이슈를 분석합니다:") ||
      content.startsWith("Terraform 이슈 원인:") ||
      content === "오류 분석을 시작했습니다." ||
      content === "분석이 끝났습니다. 아래에서 문제와 해결 방법을 확인하세요."
    );
  }

  return true;
}

export function isWorkspaceAiChatScope(value: unknown): value is WorkspaceAiChatScope {
  return typeof value === "string" && workspaceAiChatScopes.includes(value as WorkspaceAiChatScope);
}

export function createWorkspaceAiChatActiveScopeStorageKey(projectId: string): string {
  return `${WORKSPACE_AI_CHAT_STORAGE_KEY_PREFIX}.${projectId}.${ACTIVE_SCOPE_STORAGE_KEY_SUFFIX}`;
}

export function readStoredActiveChatScope(
  projectId: string,
  storage: Pick<Storage, "getItem"> | null = getBrowserLocalStorage()
): WorkspaceAiChatScope {
  if (storage === null) return "draft";

  try {
    const storedScope = storage.getItem(createWorkspaceAiChatActiveScopeStorageKey(projectId));
    return isWorkspaceAiChatScope(storedScope) ? storedScope : "draft";
  } catch {
    return "draft";
  }
}

export function storeActiveChatScope(
  projectId: string,
  scope: WorkspaceAiChatScope,
  storage: Pick<Storage, "setItem"> | null = getBrowserLocalStorage()
): void {
  if (storage === null) return;

  try {
    storage.setItem(createWorkspaceAiChatActiveScopeStorageKey(projectId), scope);
  } catch {
    // localStorage가 막혀도 현재 session의 대화 전환은 계속 동작합니다.
  }
}

function getBrowserLocalStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
