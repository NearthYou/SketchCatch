import type { DiagramJson, TerraformSyncFileInput } from "@sketchcatch/types";
import { toDeploymentBaselineFingerprint } from "./terraform-panel-utils";

export type DeploymentBaseline = {
  readonly diagram: DiagramJson;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
  readonly fingerprint: string;
  readonly createdAt: string;
};

export function createDeploymentBaseline(input: {
  readonly diagram: DiagramJson;
  readonly terraformFiles: readonly TerraformSyncFileInput[];
  readonly hasUnsavedTerraformChanges: boolean;
}): DeploymentBaseline {
  if (input.hasUnsavedTerraformChanges) {
    throw new Error("TERRAFORM_NOT_CURRENT");
  }

  const diagram = structuredClone(input.diagram);
  const terraformFiles = structuredClone(input.terraformFiles);

  return {
    diagram,
    terraformFiles,
    fingerprint: toDeploymentBaselineFingerprint(diagram),
    createdAt: new Date().toISOString()
  };
}

export function combineDeploymentBaselineTerraformFiles(
  files: readonly TerraformSyncFileInput[]
): string {
  return files
    .map((file) => file.terraformCode.trim())
    .filter(Boolean)
    .join("\n\n");
}
