export type WorkspaceUtilitySurface = "assistant" | "operations" | null;

// Workspace에서 AI와 배포 작업 패널 중 하나만 펼쳐지게 선택합니다.
export function selectWorkspaceUtilitySurface(
  currentSurface: WorkspaceUtilitySurface,
  requestedSurface: Exclude<WorkspaceUtilitySurface, null>
): WorkspaceUtilitySurface {
  return currentSurface === requestedSurface ? null : requestedSurface;
}

// 사용자가 보지 못한 완료 응답이 있을 때만 런처 상태점을 표시합니다.
export function getWorkspaceAssistantUnreadState({
  isOpen,
  responseCompleted
}: {
  readonly isOpen: boolean;
  readonly responseCompleted: boolean;
}): boolean {
  return responseCompleted && !isOpen;
}
