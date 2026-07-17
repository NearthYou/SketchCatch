type OverlayOpenChangeHandler = (isOpen: boolean) => void;

export type WorkspaceOverlayNotifications = {
  notifyBlockingPanel: OverlayOpenChangeHandler;
  notifyDeploymentConsole: OverlayOpenChangeHandler;
  reset: () => void;
  setCallbacks: (
    onBlockingPanelOpenChange: OverlayOpenChangeHandler,
    onDeploymentConsoleOpenChange: OverlayOpenChangeHandler
  ) => void;
};

export function createWorkspaceOverlayNotifications(
  onBlockingPanelOpenChange: OverlayOpenChangeHandler,
  onDeploymentConsoleOpenChange: OverlayOpenChangeHandler
): WorkspaceOverlayNotifications {
  let currentBlockingPanelOpenChange = onBlockingPanelOpenChange;
  let currentDeploymentConsoleOpenChange = onDeploymentConsoleOpenChange;

  return {
    notifyBlockingPanel(isOpen) {
      currentBlockingPanelOpenChange(isOpen);
    },
    notifyDeploymentConsole(isOpen) {
      currentDeploymentConsoleOpenChange(isOpen);
    },
    reset() {
      currentBlockingPanelOpenChange(false);
      currentDeploymentConsoleOpenChange(false);
    },
    setCallbacks(nextBlockingPanelOpenChange, nextDeploymentConsoleOpenChange) {
      currentBlockingPanelOpenChange = nextBlockingPanelOpenChange;
      currentDeploymentConsoleOpenChange = nextDeploymentConsoleOpenChange;
    }
  };
}
