import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeploymentPlanArtifactObjectKey,
  createS3DeploymentPlanArtifactStorage
} from "./deployment-plan-artifact-storage.js";

const deploymentId = "44444444-4444-4444-8444-444444444444";
const planArtifactId = "99999999-9999-4999-8999-999999999999";

class FakeS3Client {
  readonly commands: unknown[] = [];

  async send(command: unknown): Promise<Record<string, never>> {
    this.commands.push(command);

    return {};
  }
}

test("buildDeploymentPlanArtifactObjectKey scopes tfplan files by deployment and plan artifact", () => {
  assert.equal(
    buildDeploymentPlanArtifactObjectKey({
      deploymentId,
      planArtifactId
    }),
    `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`
  );
});

test("createS3DeploymentPlanArtifactStorage uploads tfplan bytes with hash and server-side encryption", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "sketchcatch-plan-storage-test-"));
  const planFilePath = join(tempDir, "tfplan");
  const s3Client = new FakeS3Client();

  try {
    await writeFile(planFilePath, "tfplan-bytes");

    const storage = createS3DeploymentPlanArtifactStorage({
      bucketName: "sketchcatch-test-bucket",
      s3Client: s3Client as never
    });
    const result = await storage.uploadDeploymentPlanArtifact({
      deploymentId,
      planArtifactId,
      planFilePath
    });

    assert.equal(result.objectKey, `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`);
    assert.equal(
      result.sha256,
      "14d9d62b8ece2d1aefffce8c325225b4fcfb63b1a2e1436326fe62f3947daa0f"
    );
    assert.equal(s3Client.commands.length, 1);
    assert.deepEqual(getCommandInput(s3Client.commands[0]), {
      Bucket: "sketchcatch-test-bucket",
      Key: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
      Body: Buffer.from("tfplan-bytes"),
      ContentType: "application/octet-stream",
      ServerSideEncryption: "AES256",
      Metadata: {
        "sketchcatch-deployment-id": deploymentId,
        "sketchcatch-artifact-kind": "tfplan",
        "sketchcatch-sha256":
          "14d9d62b8ece2d1aefffce8c325225b4fcfb63b1a2e1436326fe62f3947daa0f"
      },
      Tagging: "sketchcatch-artifact=tfplan&sketchcatch-lifecycle=deployment-artifact",
      ChecksumSHA256: "FNnWK47OLRrv/86MMlIltPz7Y7Gi4UNjJv5i85R9qg8="
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("createS3DeploymentPlanArtifactStorage deletes plan artifacts by object key", async () => {
  const s3Client = new FakeS3Client();
  const storage = createS3DeploymentPlanArtifactStorage({
    bucketName: "sketchcatch-test-bucket",
    s3Client: s3Client as never
  });

  await storage.deleteDeploymentPlanArtifact("deployments/deployment-id/plans/plan-id.tfplan");

  assert.deepEqual(getCommandInput(s3Client.commands[0]), {
    Bucket: "sketchcatch-test-bucket",
    Key: "deployments/deployment-id/plans/plan-id.tfplan"
  });
});

function getCommandInput(command: unknown): unknown {
  return command && typeof command === "object" && "input" in command ? command.input : undefined;
}
