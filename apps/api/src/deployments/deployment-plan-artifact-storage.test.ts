import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client
} from "@aws-sdk/client-s3";
import {
  createS3DeploymentPlanArtifactStorage,
  buildDeploymentPlanArtifactObjectKey,
  buildDeploymentPlanOptimizationEvidenceObjectKey
} from "./deployment-plan-artifact-storage.js";
import {
  createDeploymentPlanOptimizationEvidence,
  createTerraformDesiredStateIdentity
} from "./deployment-optimization.js";

const deploymentId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const planArtifactId = "33333333-3333-4333-8333-333333333333";

class FakeS3Client {
  readonly objects = new Map<string, Buffer>();
  readonly deletedKeys: string[] = [];

  async send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand) {
    if (command instanceof PutObjectCommand) {
      const key = String(command.input.Key);
      this.objects.set(key, Buffer.from(command.input.Body as Uint8Array));
      return {};
    }

    if (command instanceof GetObjectCommand) {
      const body = this.objects.get(String(command.input.Key));

      if (!body) {
        const error = new Error("missing") as Error & { name: string };
        error.name = "NoSuchKey";
        throw error;
      }

      return {
        Body: new Uint8Array(body),
        ContentLength: body.byteLength
      };
    }

    const key = String(command.input.Key);
    this.deletedKeys.push(key);
    this.objects.delete(key);
    return {};
  }
}

test("S3 Plan optimization sidecars are scoped, round-trippable, and deleted with tfplan", async () => {
  const s3Client = new FakeS3Client();
  const storage = createS3DeploymentPlanArtifactStorage({
    bucketName: "test-bucket",
    s3Client: s3Client as unknown as S3Client
  });
  const desiredStateIdentity = createTerraformDesiredStateIdentity({
    projectId,
    canonicalTerraformBundle: "resource \"aws_s3_bucket\" \"assets\" {}",
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: "resource \"aws_s3_bucket\" \"assets\" {}"
      }
    ],
    providerLockContent: null,
    target: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    state: { lineage: null, serial: null }
  });
  const evidence = createDeploymentPlanOptimizationEvidence({
    projectId,
    deploymentId,
    planArtifactId,
    planArtifactSha256: "a".repeat(64),
    desiredStateIdentity,
    driftVerifiedAt: "2026-07-16T00:00:00.000Z",
    planSummary: {
      createCount: 1,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: false,
      warnings: []
    },
    preDeploymentResult: { findings: [] },
    resourceChanges: [{ resourceAddress: "aws_s3_bucket.assets", action: "create" }]
  });

  const uploaded = await storage.uploadDeploymentPlanOptimizationEvidence?.({
    deploymentId,
    planArtifactId,
    evidence
  });
  const evidenceObjectKey = buildDeploymentPlanOptimizationEvidenceObjectKey({
    deploymentId,
    planArtifactId
  });
  assert.equal(uploaded?.objectKey, evidenceObjectKey);
  assert.deepEqual(
    JSON.parse(
      (
        await storage.downloadDeploymentPlanOptimizationEvidence?.({
          deploymentId,
          planArtifactId
        })
      )?.toString("utf8") ?? "{}"
    ),
    evidence
  );

  const planObjectKey = buildDeploymentPlanArtifactObjectKey({ deploymentId, planArtifactId });
  await storage.deleteDeploymentPlanArtifact(planObjectKey);
  assert.deepEqual(new Set(s3Client.deletedKeys), new Set([planObjectKey, evidenceObjectKey]));
});

test("missing Plan optimization sidecars are safe cache misses", async () => {
  const storage = createS3DeploymentPlanArtifactStorage({
    bucketName: "test-bucket",
    s3Client: new FakeS3Client() as unknown as S3Client
  });

  assert.equal(
    await storage.downloadDeploymentPlanOptimizationEvidence?.({
      deploymentId,
      planArtifactId
    }),
    undefined
  );
});
