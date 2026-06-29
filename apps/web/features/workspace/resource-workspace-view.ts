import type { ResourceWorkspaceView } from "./workspace-right-panel.types";

export const defaultResourceWorkspaceView: ResourceWorkspaceView = "list";

export type ResourceWorkspaceToolbarState =
  | {
      readonly action: "back-to-list";
      readonly icon: "back";
    }
  | {
      readonly action: "show-resource-list";
      readonly icon: "resource";
    };

export function getVisibleResourceWorkspaceView(
  requestedView: ResourceWorkspaceView,
  selectedNodeId: string | null
): ResourceWorkspaceView {
  return selectedNodeId ? requestedView : "list";
}

export function getResourceWorkspaceToolbarState(
  visibleView: ResourceWorkspaceView
): ResourceWorkspaceToolbarState {
  return visibleView === "settings"
    ? {
        action: "back-to-list",
        icon: "back"
      }
    : {
        action: "show-resource-list",
        icon: "resource"
      };
}
