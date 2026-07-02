import { readFile } from "node:fs/promises";
import { GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput, type S3Client } from "@aws-sdk/client-s3";
import {
  assertDeploymentTerraformLockFileObjectKey,
  createDeploymentArtifactMetadata,
  createDeploymentArtifactTagging,
  createS3ChecksumSha256
} from "./deployment-artifact-security.js";

export const terraformLockFileName = ".terraform.lock.hcl";
export const defaultTerraformLockFileMaxBytes = 256 * 1024;

export type UploadDeploymentTerraformLockFileInput = {
  deploymentId: string;
  lockFilePath: string;
};

export type UploadedDeploymentTerraformLockFile = {
  objectKey: string;
};

export type DeploymentTerraformLockFileStorage = {
  uploadDeploymentTerraformLockFile(
    input: UploadDeploymentTerraformLockFileInput
  ): Promise<UploadedDeploymentTerraformLockFile>;
  downloadDeploymentTerraformLockFile(input: { deploymentId: string }): Promise<Buffer | undefined>;
};

export type CreateS3DeploymentTerraformLockFileStorageOptions = {
  bucketName: string;
  s3Client: S3Client;
};

export function createS3DeploymentTerraformLockFileStorage(
  options: CreateS3DeploymentTerraformLockFileStorageOptions
): DeploymentTerraformLockFileStorage {
  return {
    async uploadDeploymentTerraformLockFile(input) {
      const body = assertBufferSize(await readFile(input.lockFilePath));
      const objectKey = buildDeploymentTerraformLockFileObjectKey(input);

      assertDeploymentTerraformLockFileObjectKey({
        deploymentId: input.deploymentId,
        objectKey
      });

      await options.s3Client.send(
        new PutObjectCommand({
          Bucket: options.bucketName,
          Key: objectKey,
          Body: body,
          ContentType: "text/plain; charset=utf-8",
          CacheControl: "no-store",
          ServerSideEncryption: "AES256",
          Metadata: createDeploymentArtifactMetadata({
            deploymentId: input.deploymentId,
            kind: "terraform-lock"
          }),
          Tagging: createDeploymentArtifactTagging("terraform-lock"),
          ChecksumSHA256: createS3ChecksumSha256(body)
        })
      );

      return { objectKey };
    },

    async downloadDeploymentTerraformLockFile(input) {
      const objectKey = buildDeploymentTerraformLockFileObjectKey(input);

      assertDeploymentTerraformLockFileObjectKey({
        deploymentId: input.deploymentId,
        objectKey
      });

      try {
        const result = await options.s3Client.send(
          new GetObjectCommand({
            Bucket: options.bucketName,
            Key: objectKey
          })
        );

        if (
          typeof result.ContentLength === "number" &&
          result.ContentLength > defaultTerraformLockFileMaxBytes
        ) {
          throw new Error(
            `Terraform lock file exceeds the ${defaultTerraformLockFileMaxBytes} byte size limit`
          );
        }

        return s3BodyToBuffer(result.Body, defaultTerraformLockFileMaxBytes);
      } catch (error) {
        if (isS3NotFound(error)) {
          return undefined;
        }

        throw error;
      }
    }
  };
}

export function buildDeploymentTerraformLockFileObjectKey(input: {
  deploymentId: string;
}): string {
  return `deployments/${input.deploymentId}/terraform/${terraformLockFileName}`;
}

async function s3BodyToBuffer(
  body: GetObjectCommandOutput["Body"],
  maxBytes: number
): Promise<Buffer> {
  if (!body) {
    throw new Error("S3 object body is empty");
  }

  if (typeof body === "string") {
    return assertBufferSize(Buffer.from(body), maxBytes);
  }

  if (body instanceof Uint8Array) {
    return assertBufferSize(Buffer.from(body), maxBytes);
  }

  if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return assertBufferSize(Buffer.from(await body.transformToByteArray()), maxBytes);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error(`Terraform lock file exceeds the ${maxBytes} byte size limit`);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function assertBufferSize(
  buffer: Buffer,
  maxBytes = defaultTerraformLockFileMaxBytes
): Buffer {
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Terraform lock file exceeds the ${maxBytes} byte size limit`);
  }

  return buffer;
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
