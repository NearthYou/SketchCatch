import { readFile } from "node:fs/promises";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";
import {
  assertDeploymentPlanArtifactObjectKey,
  assertDeploymentStateObjectKey,
  createDeploymentArtifactMetadata,
  createDeploymentArtifactTagging,
  createS3ChecksumSha256
} from "./deployment-artifact-security.js";
import {
  createS3DeploymentTerraformLockFileStorage,
  type DeploymentTerraformLockFileStorage
} from "./terraform-lock-file-storage.js";
import { buildDeploymentPlanOptimizationEvidenceObjectKey } from "./deployment-plan-artifact-storage.js";
import { downloadTerraformArtifactFromS3 } from "./terraform-workspace.js";

const deploymentPlanOptimizationEvidenceMaxBytes = 256 * 1024;

export type UploadDeploymentStateInput = {
  deploymentId: string;
  stateFilePath: string;
};

export type UploadedDeploymentState = {
  objectKey: string;
};

export type DeploymentApplyArtifactStorage = Partial<DeploymentTerraformLockFileStorage> & {
  downloadDeploymentArtifact(input: {
    deploymentId: string;
    planArtifactId: string;
    objectKey: string;
  }): Promise<Buffer>;
  downloadDeploymentState(input: {
    deploymentId: string;
    objectKey: string;
  }): Promise<Buffer>;
  uploadDeploymentState(input: UploadDeploymentStateInput): Promise<UploadedDeploymentState>;
  downloadDeploymentPlanOptimizationEvidence?(input: {
    deploymentId: string;
    planArtifactId: string;
  }): Promise<Buffer | undefined>;
};

export type CreateS3DeploymentApplyArtifactStorageOptions = {
  bucketName?: string;
  s3Client?: S3Client;
};

export function createS3DeploymentApplyArtifactStorage(
  options: CreateS3DeploymentApplyArtifactStorageOptions = {}
): DeploymentApplyArtifactStorage {
  const bucketName = options.bucketName ?? requireS3BucketName();
  const s3Client = options.s3Client ?? getS3Client();
  const terraformLockFileStorage = createS3DeploymentTerraformLockFileStorage({
    bucketName,
    s3Client
  });

  return {
    ...terraformLockFileStorage,

    async downloadDeploymentArtifact(input) {
      assertDeploymentPlanArtifactObjectKey(input);

      return downloadTerraformArtifactFromS3(input.objectKey, { bucketName, s3Client });
    },

    async downloadDeploymentState(input) {
      assertDeploymentStateObjectKey(input);

      return downloadTerraformArtifactFromS3(input.objectKey, { bucketName, s3Client });
    },

    async downloadDeploymentPlanOptimizationEvidence(input) {
      try {
        return await downloadTerraformArtifactFromS3(
          buildDeploymentPlanOptimizationEvidenceObjectKey(input),
          {
            bucketName,
            maxBytes: deploymentPlanOptimizationEvidenceMaxBytes,
            s3Client
          }
        );
      } catch (error) {
        if (isS3NotFound(error)) {
          return undefined;
        }

        throw error;
      }
    },

    async uploadDeploymentState(input) {
      const body = await readFile(input.stateFilePath);
      const objectKey = buildDeploymentStateObjectKey(input);

      assertDeploymentStateObjectKey({
        deploymentId: input.deploymentId,
        objectKey
      });

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
            kind: "terraform-state"
          }),
          Tagging: createDeploymentArtifactTagging("terraform-state"),
          ChecksumSHA256: createS3ChecksumSha256(body)
        })
      );

      return {
        objectKey
      };
    }
  };
}

export function buildDeploymentStateObjectKey(input: { deploymentId: string }): string {
  return `deployments/${input.deploymentId}/state/terraform.tfstate`;
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
