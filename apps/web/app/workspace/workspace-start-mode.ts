import type { WorkspaceRightPanelView } from "../../features/workspace/workspace-right-panel.types";

// URL의 시작 방식 값을 오른쪽 패널 기본 탭으로 바꿉니다.
export function resolveInitialWorkspaceRightPanelView(
  startMode: string | undefined
): WorkspaceRightPanelView | undefined {
  return startMode === "reverse" ? "reverse" : undefined;
}
