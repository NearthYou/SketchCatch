import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeploymentTerraformLockFileObjectKey,
  createS3DeploymentTerraformLockFileStorage
} from "./terraform-lock-file-storage.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";

class FakeS3Client {
  readonly commands: unknown[] = [];
  nextResult: unknown = {};
  nextError: unknown;

  async send(command: unknown): Promise<unknown> {
    this.commands.push(command);

    if (this.nextError) {
      throw this.nextError;
    }

    return this.nextResult;
  }
}

test("buildDeploymentTerraformLockFileObjectKey scopes the provider lock file by deployment", () => {
  assert.equal(
    buildDeploymentTerraformLockFileObjectKey({ deploymentId }),
    `deployments/${deploymentId}/terraform/.terraform.lock.hcl`
  );
});

test("createS3DeploymentTerraformLockFileStorage uploads lock files with encryption metadata tags and checksum", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "sketchcatch-lock-storage-test-"));
  const lockFilePath = join(tempDir, ".terraform.lock.hcl");
  const s3Client = new FakeS3Client();

  try {
    await writeFile(lockFilePath, "provider lock");

    const storage = createS3DeploymentTerraformLockFileStorage({
      bucketName: "sketchcatch-test-bucket",
      s3Client: s3Client as never
    });
    const result = await storage.uploadDeploymentTerraformLockFile({
      deploymentId,
      lockFilePath
    });

    assert.equal(
      result.objectKey,
      `deployments/${deploymentId}/terraform/.terraform.lock.hcl`
    );
    assert.deepEqual(getCommandInput(s3Client.commands[0]), {
      Bucket: "sketchcatch-test-bucket",
      Key: `deployments/${deploymentId}/terraform/.terraform.lock.hcl`,
      Body: Buffer.from("provider lock"),
      ContentType: "text/plain; charset=utf-8",
      ServerSideEncryption: "AES256",
      Metadata: {
        "sketchcatch-deployment-id": deploymentId,
        "sketchcatch-artifact-kind": "terraform-lock"
      },
      Tagging: "sketchcatch-artifact=terraform-lock&sketchcatch-lifecycle=deployment-artifact",
      ChecksumSHA256: "J8cq1Jy9LNgNi89Z7R5RTQ0RTGggCn+mERBR0cBCFtQ="
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createS3DeploymentTerraformLockFileStorage downloads existing lock files", async () => {
  const s3Client = new FakeS3Client();
  s3Client.nextResult = {
    Body: Buffer.from("provider lock"),
    ContentLength: Buffer.byteLength("provider lock")
  };
  const storage = createS3DeploymentTerraformLockFileStorage({
    bucketName: "sketchcatch-test-bucket",
    s3Client: s3Client as never
  });

  const result = await storage.downloadDeploymentTerraformLockFile({ deploymentId });

  assert.deepEqual(result, Buffer.from("provider lock"));
  assert.deepEqual(getCommandInput(s3Client.commands[0]), {
    Bucket: "sketchcatch-test-bucket",
    Key: `deployments/${deploymentId}/terraform/.terraform.lock.hcl`
  });
});

test("createS3DeploymentTerraformLockFileStorage treats missing lock files as cache misses", async () => {
  const s3Client = new FakeS3Client();
  s3Client.nextError = Object.assign(new Error("missing"), {
    name: "NoSuchKey"
  });
  const storage = createS3DeploymentTerraformLockFileStorage({
    bucketName: "sketchcatch-test-bucket",
    s3Client: s3Client as never
  });

  await assert.doesNotReject(async () => {
    assert.equal(
      await storage.downloadDeploymentTerraformLockFile({ deploymentId }),
      undefined
    );
  });
});

function getCommandInput(command: unknown): unknown {
  return command && typeof command === "object" && "input" in command ? command.input : undefined;
}
