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
import {
  createS3DeploymentTerraformLockFileStorage,
  type DeploymentTerraformLockFileStorage
} from "./terraform-lock-file-storage.js";
import { downloadTerraformArtifactFromS3 } from "./terraform-workspace.js";

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
  downloadDeploymentState(input: { deploymentId: string; objectKey: string }): Promise<Buffer>;
  uploadDeploymentPlanArtifact(
    input: UploadDeploymentPlanArtifactInput
  ): Promise<UploadedDeploymentPlanArtifact>;
  deleteDeploymentPlanArtifact(objectKey: string): Promise<void>;
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

    async downloadDeploymentState(input) {
      assertDeploymentStateObjectKey(input);

      return downloadTerraformArtifactFromS3(input.objectKey);
    },

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

    async deleteDeploymentPlanArtifact(objectKey) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: objectKey
        })
      );
    }
  };
}

export function buildDeploymentPlanArtifactObjectKey(input: {
  deploymentId: string;
  planArtifactId: string;
}): string {
  return `deployments/${input.deploymentId}/plans/${input.planArtifactId}.tfplan`;
}

function createSha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
