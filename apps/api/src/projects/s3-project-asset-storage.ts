import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3ServiceException,
  type ObjectIdentifier,
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

    async deletePrefix(input) {
      assertProjectDeletionPrefix(input.prefix);
      let previousBatchFingerprint: string | null = null;

      while (true) {
        const listed = await s3Client.send(
          new ListObjectVersionsCommand({
            Bucket: bucketName,
            Prefix: input.prefix,
            MaxKeys: 1000
          })
        );
        const objectVersions = collectObjectVersions(listed.Versions, listed.DeleteMarkers);
        const listedObjectCount =
          (listed.Versions?.length ?? 0) + (listed.DeleteMarkers?.length ?? 0);

        if (objectVersions.length !== listedObjectCount) {
          throw new Error("S3 returned an object version without a key or version ID");
        }

        if (objectVersions.length === 0) {
          return;
        }

        const batchFingerprint = objectVersions
          .map((object) => `${object.Key}\0${object.VersionId}`)
          .sort()
          .join("\n");
        if (batchFingerprint === previousBatchFingerprint) {
          throw new Error("S3 object versions remained after a successful delete response");
        }
        previousBatchFingerprint = batchFingerprint;

        const deleted = await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: objectVersions,
              Quiet: true
            }
          })
        );

        if ((deleted.Errors?.length ?? 0) > 0) {
          throw new Error("Failed to delete every S3 object version under the project prefix");
        }
      }
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

function collectObjectVersions(
  versions: ReadonlyArray<{ Key?: string | undefined; VersionId?: string | undefined }> | undefined,
  deleteMarkers:
    | ReadonlyArray<{ Key?: string | undefined; VersionId?: string | undefined }>
    | undefined
): ObjectIdentifier[] {
  return [...(versions ?? []), ...(deleteMarkers ?? [])].flatMap((object) =>
    object.Key && object.VersionId
      ? [
          {
            Key: object.Key,
            VersionId: object.VersionId
          }
        ]
      : []
  );
}

function assertProjectDeletionPrefix(prefix: string): void {
  if (
    !/^(?:projects|deployments)\/[A-Za-z0-9_-]+\/$/u.test(prefix) ||
    prefix.includes("\0") ||
    prefix.includes("\\")
  ) {
    throw new Error("Project artifact deletion prefix is invalid");
  }
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
