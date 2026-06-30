import { test } from "node:test";
import assert from "node:assert/strict";
import {
  restoreTerraformLockFile,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";
import type { PreparedTerraformWorkspace } from "./terraform-workspace.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";

const workspace: PreparedTerraformWorkspace = {
  workdir: "C:\\terraform-workspace",
  mainFilePath: "C:\\terraform-workspace\\main.tf",
  cleanup: async () => undefined
};

test("restoreTerraformLockFile writes a downloaded lock file into the workspace", async () => {
  let writtenPath: string | undefined;
  let writtenContent: Buffer | undefined;

  const restored = await restoreTerraformLockFile({
    deploymentId,
    workspace,
    storage: {
      downloadDeploymentTerraformLockFile: async () => Buffer.from("provider lock")
    },
    writeTerraformLockFile: async (filePath, content) => {
      writtenPath = filePath;
      writtenContent = content;
    }
  });

  assert.equal(restored, true);
  assert.equal(writtenPath, "C:\\terraform-workspace\\.terraform.lock.hcl");
  assert.deepEqual(writtenContent, Buffer.from("provider lock"));
});

test("restoreTerraformLockFile ignores missing lock files", async () => {
  const restored = await restoreTerraformLockFile({
    deploymentId,
    workspace,
    storage: {
      downloadDeploymentTerraformLockFile: async () => undefined
    },
    writeTerraformLockFile: async () => {
      throw new Error("should not write");
    }
  });

  assert.equal(restored, false);
});

test("uploadTerraformLockFile uploads the workspace lock file when storage supports it", async () => {
  const uploadedInputs: unknown[] = [];

  const uploaded = await uploadTerraformLockFile({
    deploymentId,
    workspace,
    storage: {
      uploadDeploymentTerraformLockFile: async (input) => {
        uploadedInputs.push(input);

        return { objectKey: "lock-object" };
      }
    }
  });

  assert.equal(uploaded, true);
  assert.deepEqual(uploadedInputs, [
    {
      deploymentId,
      lockFilePath: "C:\\terraform-workspace\\.terraform.lock.hcl"
    }
  ]);
});
