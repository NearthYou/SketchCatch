import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DeleteObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";
import {
  assertDeploymentPlanArtifactObjectKey,
  assertDeploymentStateObjectKey,
  createDeploymentArtifactMetadata,
  createDeploymentArtifactTagging,
  createS3ChecksumSha256
} from "./deployment-artifact-security.js";
import type { DeploymentPlanOptimizationEvidence } from "./deployment-optimization.js";
import {
  createS3DeploymentTerraformLockFileStorage,
  type DeploymentTerraformLockFileStorage
} from "./terraform-lock-file-storage.js";
import { downloadTerraformArtifactFromS3 } from "./terraform-workspace.js";

const deploymentPlanOptimizationEvidenceMaxBytes = 256 * 1024;

export type UploadDeploymentPlanArtifactInput = {
  deploymentId: string;
  planArtifactId: string;
  planFilePath: string;
};

export type UploadedDeploymentPlanArtifact = {
  objectKey: string;
  sha256: string;
};

export type DeploymentPlanArtifactStorage = Partial<DeploymentTerraformLockFileStorage> & {
  uploadDeploymentPlanArtifact(
    input: UploadDeploymentPlanArtifactInput
  ): Promise<UploadedDeploymentPlanArtifact>;
  deleteDeploymentPlanArtifact(objectKey: string): Promise<void>;
  downloadDeploymentPlanArtifact?(input: {
    deploymentId: string;
    planArtifactId: string;
    objectKey: string;
  }): Promise<Buffer>;
  downloadDeploymentState?(input: {
    deploymentId: string;
    objectKey: string;
  }): Promise<Buffer>;
  uploadDeploymentPlanOptimizationEvidence?(input: {
    deploymentId: string;
    planArtifactId: string;
    evidence: DeploymentPlanOptimizationEvidence;
  }): Promise<{ objectKey: string }>;
  downloadDeploymentPlanOptimizationEvidence?(input: {
    deploymentId: string;
    planArtifactId: string;
  }): Promise<Buffer | undefined>;
};

export type CreateS3DeploymentPlanArtifactStorageOptions = {
  bucketName?: string;
  s3Client?: S3Client;
};

export function createS3DeploymentPlanArtifactStorage(
  options: CreateS3DeploymentPlanArtifactStorageOptions = {}
): DeploymentPlanArtifactStorage {
  const bucketName = options.bucketName ?? requireS3BucketName();
  const s3Client = options.s3Client ?? getS3Client();
  const terraformLockFileStorage = createS3DeploymentTerraformLockFileStorage({
    bucketName,
    s3Client
  });

  return {
    ...terraformLockFileStorage,

    async uploadDeploymentPlanArtifact(input) {
      const body = await readFile(input.planFilePath);
      const objectKey = buildDeploymentPlanArtifactObjectKey(input);
      const sha256 = createSha256(body);

      assertDeploymentPlanArtifactObjectKey({
        deploymentId: input.deploymentId,
        planArtifactId: input.planArtifactId,
        objectKey
      });

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
          Body: body,
          ContentType: "application/octet-stream",
          CacheControl: "no-store",
          ServerSideEncryption: "AES256",
          Metadata: createDeploymentArtifactMetadata({
            deploymentId: input.deploymentId,
            kind: "tfplan",
            sha256
          }),
          Tagging: createDeploymentArtifactTagging("tfplan"),
          ChecksumSHA256: createS3ChecksumSha256(body)
        })
      );

      return {
        objectKey,
        sha256
      };
    },

    async downloadDeploymentPlanArtifact(input) {
      assertDeploymentPlanArtifactObjectKey(input);

      return downloadTerraformArtifactFromS3(input.objectKey, {
        bucketName,
        s3Client
      });
    },

    async downloadDeploymentState(input) {
      assertDeploymentStateObjectKey(input);

      return downloadTerraformArtifactFromS3(input.objectKey, {
        bucketName,
        s3Client
      });
    },

    async uploadDeploymentPlanOptimizationEvidence(input) {
      if (
        input.evidence.deploymentId !== input.deploymentId ||
        input.evidence.planArtifactId !== input.planArtifactId
      ) {
        throw new Error("Deployment Plan optimization evidence does not match artifact scope");
      }

      const body = Buffer.from(JSON.stringify(input.evidence));
      const objectKey = buildDeploymentPlanOptimizationEvidenceObjectKey(input);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
          Body: body,
          ContentType: "application/json",
          CacheControl: "no-store",
          ServerSideEncryption: "AES256",
          Metadata: createDeploymentArtifactMetadata({
            deploymentId: input.deploymentId,
            kind: "plan-optimization",
            sha256: createSha256(body)
          }),
          Tagging: createDeploymentArtifactTagging("plan-optimization"),
          ChecksumSHA256: createS3ChecksumSha256(body)
        })
      );

      return { objectKey };
    },

    async downloadDeploymentPlanOptimizationEvidence(input) {
      const objectKey = buildDeploymentPlanOptimizationEvidenceObjectKey(input);

      try {
        return await downloadTerraformArtifactFromS3(objectKey, {
          bucketName,
          maxBytes: deploymentPlanOptimizationEvidenceMaxBytes,
          s3Client
        });
      } catch (error) {
        if (isS3NotFound(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async deleteDeploymentPlanArtifact(objectKey) {
      const planIdentity = parseDeploymentPlanArtifactObjectKey(objectKey);

      await Promise.all([
        s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: objectKey
          })
        ),
        s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: buildDeploymentPlanOptimizationEvidenceObjectKey(planIdentity)
          })
        )
      ]);
    }
  };
}

export function buildDeploymentPlanArtifactObjectKey(input: {
  deploymentId: string;
  planArtifactId: string;
}): string {
  return `deployments/${input.deploymentId}/plans/${input.planArtifactId}.tfplan`;
}

export function buildDeploymentPlanOptimizationEvidenceObjectKey(input: {
  deploymentId: string;
  planArtifactId: string;
}): string {
  return `deployments/${input.deploymentId}/plans/${input.planArtifactId}.optimization.json`;
}

function parseDeploymentPlanArtifactObjectKey(objectKey: string): {
  deploymentId: string;
  planArtifactId: string;
} {
  const match = /^deployments\/([^/]+)\/plans\/([^/]+)\.tfplan$/u.exec(objectKey);

  if (!match?.[1] || !match[2]) {
    throw new Error("Deployment Plan artifact object key is invalid");
  }

  const identity = {
    deploymentId: match[1],
    planArtifactId: match[2]
  };
  assertDeploymentPlanArtifactObjectKey({ ...identity, objectKey });

  return identity;
}

function isS3NotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };

  return (
    value.name === "NoSuchKey" ||
    value.name === "NotFound" ||
    value.$metadata?.httpStatusCode === 404
  );
}

function createSha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
