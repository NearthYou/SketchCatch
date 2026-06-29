import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createS3DeploymentApplyArtifactStorage } from "./deployment-apply-artifact-storage.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";

class FakeS3Client {
  readonly commands: unknown[] = [];

  async send(command: unknown): Promise<Record<string, never>> {
    this.commands.push(command);

    return {};
  }
}

test("createS3DeploymentApplyArtifactStorage uploads terraform state with encryption metadata tags and checksum", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "sketchcatch-state-storage-test-"));
  const stateFilePath = join(tempDir, "terraform.tfstate");
  const s3Client = new FakeS3Client();

  try {
    await writeFile(stateFilePath, JSON.stringify({ version: 4 }));

    const storage = createS3DeploymentApplyArtifactStorage({
      bucketName: "sketchcatch-test-bucket",
      s3Client: s3Client as never
    });
    const result = await storage.uploadDeploymentState({
      deploymentId,
      stateFilePath
    });

    assert.equal(result.objectKey, `deployments/${deploymentId}/state/terraform.tfstate`);
    assert.equal(s3Client.commands.length, 1);
    assert.deepEqual(getCommandInput(s3Client.commands[0]), {
      Bucket: "sketchcatch-test-bucket",
      Key: `deployments/${deploymentId}/state/terraform.tfstate`,
      Body: Buffer.from(JSON.stringify({ version: 4 })),
      ContentType: "application/json",
      CacheControl: "no-store",
      ServerSideEncryption: "AES256",
      Metadata: {
        "sketchcatch-deployment-id": deploymentId,
        "sketchcatch-artifact-kind": "terraform-state"
      },
      Tagging: "sketchcatch-artifact=terraform-state&sketchcatch-lifecycle=deployment-artifact",
      ChecksumSHA256: "mf1nyJ2jfnyl9tYsjIFNuz2uG6fnYMPo/4BKRVkGgLI="
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function getCommandInput(command: unknown): unknown {
  return command && typeof command === "object" && "input" in command ? command.input : undefined;
}
