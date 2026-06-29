import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  terraformLockFileName,
  type DeploymentTerraformLockFileStorage
} from "./terraform-lock-file-storage.js";
import type { PreparedTerraformWorkspace } from "./terraform-workspace.js";

export type TerraformLockFileCapableStorage = Partial<DeploymentTerraformLockFileStorage>;

export async function restoreTerraformLockFile(input: {
  deploymentId: string;
  workspace: PreparedTerraformWorkspace;
  storage: TerraformLockFileCapableStorage;
  writeTerraformLockFile?: (filePath: string, content: Buffer) => Promise<void>;
}): Promise<boolean> {
  try {
    const content = await input.storage.downloadDeploymentTerraformLockFile?.({
      deploymentId: input.deploymentId
    });

    if (!content) {
      return false;
    }

    const writeLockFile = input.writeTerraformLockFile ?? writeFile;
    await writeLockFile(join(input.workspace.workdir, terraformLockFileName), content);

    return true;
  } catch {
    return false;
  }
}

export async function uploadTerraformLockFile(input: {
  deploymentId: string;
  workspace: PreparedTerraformWorkspace;
  storage: TerraformLockFileCapableStorage;
}): Promise<boolean> {
  try {
    await input.storage.uploadDeploymentTerraformLockFile?.({
      deploymentId: input.deploymentId,
      lockFilePath: join(input.workspace.workdir, terraformLockFileName)
    });

    return Boolean(input.storage.uploadDeploymentTerraformLockFile);
  } catch {
    return false;
  }
}
