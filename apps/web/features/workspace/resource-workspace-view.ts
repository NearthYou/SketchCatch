import type { ResourceWorkspaceView } from "./workspace-right-panel.types";

export const defaultResourceWorkspaceView: ResourceWorkspaceView = "list";

export function getVisibleResourceWorkspaceView(
  requestedView: ResourceWorkspaceView,
  selectedNodeId: string | null
): ResourceWorkspaceView {
  return selectedNodeId ? requestedView : "list";
}
