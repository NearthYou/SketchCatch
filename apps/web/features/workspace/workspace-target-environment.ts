export type WorkspaceTargetEnvironment = "aws" | "gcp" | "azure";

export type WorkspaceTargetEnvironmentOption = {
  readonly id: WorkspaceTargetEnvironment;
  readonly label: string;
};

export const DEFAULT_WORKSPACE_TARGET_ENVIRONMENT: WorkspaceTargetEnvironment = "aws";

const WORKSPACE_TARGET_ENVIRONMENT_OPTIONS: readonly WorkspaceTargetEnvironmentOption[] = [
  { id: "aws", label: "AWS" },
  { id: "gcp", label: "GCP" },
  { id: "azure", label: "Azure" }
];

export function createWorkspaceTargetEnvironmentOptions(): readonly WorkspaceTargetEnvironmentOption[] {
  return WORKSPACE_TARGET_ENVIRONMENT_OPTIONS;
}
