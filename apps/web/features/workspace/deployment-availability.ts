export type DeploymentAvailability = "enabled" | "project_required";

export function canLoadDeploymentData(availability: DeploymentAvailability): boolean {
  return availability === "enabled";
}
