import type { WorkspaceRightPanelView } from "../../features/workspace/workspace-right-panel.types";

export function resolveInitialWorkspaceRightPanelView(
  startMode: string | undefined
): WorkspaceRightPanelView | undefined {
  return startMode === "delivery" ? "delivery" : undefined;
}
