import { readFile } from "node:fs/promises";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";
import { downloadTerraformArtifactFromS3 } from "./terraform-workspace.js";

export type UploadDeploymentStateInput = {
  deploymentId: string;
  stateFilePath: string;
};

export type UploadedDeploymentState = {
  objectKey: string;
};

export type DeploymentApplyArtifactStorage = {
  downloadDeploymentArtifact(objectKey: string): Promise<Buffer>;
  uploadDeploymentState(input: UploadDeploymentStateInput): Promise<UploadedDeploymentState>;
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

  return {
    async downloadDeploymentArtifact(objectKey) {
      return downloadTerraformArtifactFromS3(objectKey);
    },

    async uploadDeploymentState(input) {
      const body = await readFile(input.stateFilePath);
      const objectKey = buildDeploymentStateObjectKey(input);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
          Body: body,
          ContentType: "application/json",
          ServerSideEncryption: "AES256"
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
