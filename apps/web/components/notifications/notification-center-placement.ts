export type DeploymentNotificationCenterPlacement = "floating" | "workspace";

export function getDeploymentNotificationCenterPlacement(
  pathname: string
): DeploymentNotificationCenterPlacement {
  return pathname === "/workspace" || pathname === "/workspace/reverse"
    ? "workspace"
    : "floating";
}
