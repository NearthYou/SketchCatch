import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException,
  type S3Client
} from "@aws-sdk/client-s3";
import { getS3Client } from "../s3/client.js";
import type { ProjectAssetStorage } from "./project-asset-storage.js";

export type CreateS3ProjectAssetStorageOptions = {
  bucketName: string;
  s3Client?: S3Client;
};

export function createS3ProjectAssetStorage(
  options: CreateS3ProjectAssetStorageOptions
): ProjectAssetStorage {
  const bucketName = options.bucketName.trim();

  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME is required for S3 Project asset storage");
  }

  const s3Client = options.s3Client ?? getS3Client();

  return {
    async putObject(input) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType
        })
      );
    },

    async getObject(input) {
      const object = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: input.objectKey
        })
      );

      if (!object.Body) {
        throw new Error(`Project asset object has no body: ${input.objectKey}`);
      }

      return Buffer.from(await object.Body.transformToByteArray());
    },

    async deleteObject(input) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: input.objectKey
        })
      );
    },

    async deleteObjectVersion(input) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: input.objectKey,
          VersionId: input.versionId
        })
      );
    },

    async objectExists(input) {
      try {
        const object = await s3Client.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: input.objectKey
          })
        );

        return input.byteSize === null || object.ContentLength === input.byteSize;
      } catch (error) {
        if (isS3ObjectMissingError(error)) {
          return false;
        }

        throw error;
      }
    }
  };
}

function isS3ObjectMissingError(error: unknown): boolean {
  if (error instanceof S3ServiceException) {
    return error.$metadata.httpStatusCode === 404 || error.name === "NotFound";
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotFound" || error.name === "NoSuchKey")
  );
}
