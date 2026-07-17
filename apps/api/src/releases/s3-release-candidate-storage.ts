import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  UploadPartCommand,
  type S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";
import type { ReleaseCandidateStorage } from "./release-candidate-service.js";

export function createS3ReleaseCandidateStorage(
  options: {
    bucketName?: string;
    s3Client?: S3Client;
    uploadUrlExpiresInSeconds?: number;
  } = {}
): ReleaseCandidateStorage {
  const bucketName = options.bucketName?.trim() || requireS3BucketName();
  const s3Client = options.s3Client ?? getS3Client();
  const expiresIn = options.uploadUrlExpiresInSeconds ?? 3_600;

  return {
    async beginMultipartUpload(input) {
      const created = await s3Client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucketName,
          Key: input.objectKey,
          ContentType: input.contentType,
          ServerSideEncryption: "AES256",
          Tagging:
            input.contentType === "application/json"
              ? "ManagedBy=SketchCatch&Artifact=ReleaseCandidateManifest&SketchCatchLifecycle=ReleaseEvidence"
              : "ManagedBy=SketchCatch&Artifact=ReleaseCandidate&SketchCatchLifecycle=ReleaseCandidate"
        })
      );
      if (!created.UploadId) {
        throw new Error(`S3 did not return an upload ID for ${input.objectKey}`);
      }
      const uploadId = created.UploadId;
      const partUrls = await Promise.all(
        Array.from({ length: input.partCount }, async (_, index) => {
          const partNumber = index + 1;
          const url = await getSignedUrl(
            s3Client,
            new UploadPartCommand({
              Bucket: bucketName,
              Key: input.objectKey,
              UploadId: uploadId,
              PartNumber: partNumber
            }),
            { expiresIn }
          );
          return { partNumber, url };
        })
      );
      return { uploadId, partUrls };
    },

    async completeMultipartUpload(input) {
      const uploadedByteSize = await withReleaseCandidateStorageContext(
        "ListParts",
        input.objectKey,
        () =>
          inspectMultipartUpload(s3Client, {
            bucketName,
            objectKey: input.objectKey,
            uploadId: input.uploadId,
            parts: input.parts
          })
      );
      if (
        uploadedByteSize <= 0 ||
        uploadedByteSize > input.maximumByteSize ||
        (input.expectedByteSize !== undefined && uploadedByteSize !== input.expectedByteSize)
      ) {
        await withReleaseCandidateStorageContext("AbortMultipartUpload", input.objectKey, () =>
          s3Client.send(
            new AbortMultipartUploadCommand({
              Bucket: bucketName,
              Key: input.objectKey,
              UploadId: input.uploadId
            })
          )
        );
        throw new Error(`Release candidate upload size is invalid: ${input.objectKey}`);
      }
      const parts = [...input.parts]
        .sort((left, right) => left.partNumber - right.partNumber)
        .map((part) => ({ ETag: part.etag, PartNumber: part.partNumber }));
      const completed = await withReleaseCandidateStorageContext(
        "CompleteMultipartUpload",
        input.objectKey,
        () =>
          s3Client.send(
            new CompleteMultipartUploadCommand({
              Bucket: bucketName,
              Key: input.objectKey,
              UploadId: input.uploadId,
              MultipartUpload: { Parts: parts }
            })
          )
      );
      const versionId = completed.VersionId;
      if (!versionId) {
        throw new Error(`S3 object versioning is required for ${input.objectKey}`);
      }
      const object = await withReleaseCandidateStorageContext("HeadObject", input.objectKey, () =>
        s3Client.send(
          new HeadObjectCommand({
            Bucket: bucketName,
            Key: input.objectKey,
            VersionId: versionId
          })
        )
      );
      if (typeof object.ContentLength !== "number" || object.ContentLength <= 0) {
        throw new Error(`Completed release candidate object is empty: ${input.objectKey}`);
      }
      const completedByteSize = object.ContentLength;
      if (completedByteSize !== uploadedByteSize || completedByteSize > input.maximumByteSize) {
        try {
          await withReleaseCandidateStorageContext("DeleteObject", input.objectKey, () =>
            s3Client.send(
              new DeleteObjectCommand({
                Bucket: bucketName,
                Key: input.objectKey,
                VersionId: versionId
              })
            )
          );
        } catch (cleanupError) {
          throw new Error("Completed release candidate object size changed: " + input.objectKey, { cause: cleanupError });
        }
        throw new Error("Completed release candidate object size changed: " + input.objectKey);
      }
      return {
        byteSize: completedByteSize,
        versionId,
        sha256: await withReleaseCandidateStorageContext("GetObject", input.objectKey, () =>
          hashS3Object(s3Client, {
            bucketName,
            objectKey: input.objectKey,
            versionId,
            expectedByteSize: completedByteSize,
            maximumByteSize: input.maximumByteSize
          })
        )
      };
    },

    async readObjectText(input) {
      const object = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: input.objectKey,
          VersionId: input.versionId
        })
      );
      const bytes = await readBodyBytes(object.Body, 10 * 1024 * 1024);
      return Buffer.concat(bytes).toString("utf8");
    },

    async putImmutableManifest(input) {
      const result = await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: input.objectKey,
          Body: input.body,
          ContentType: "application/json",
          ServerSideEncryption: "AES256",
          IfNoneMatch: "*",
          Tagging:
            "ManagedBy=SketchCatch&Artifact=ReleaseCandidateManifest&SketchCatchLifecycle=ReleaseEvidence"
        })
      );
      if (!result.VersionId) {
        throw new Error(`S3 object versioning is required for ${input.objectKey}`);
      }
      return { versionId: result.VersionId };
    },

    async retainObjectVersionForRetry(input) {
      await s3Client.send(
        new PutObjectTaggingCommand({
          Bucket: bucketName,
          Key: input.objectKey,
          VersionId: input.versionId,
          Tagging: {
            TagSet: [
              { Key: "ManagedBy", Value: "SketchCatch" },
              { Key: "Artifact", Value: "ReleaseCandidate" },
              { Key: "SketchCatchLifecycle", Value: "ReleaseCandidateRetry" }
            ]
          }
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
    }
  };
}

async function withReleaseCandidateStorageContext<T>(
  operation: string,
  objectKey: string,
  execute: () => Promise<T>
): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    throw new Error(
      `Release candidate S3 ${operation} failed for ${objectKey}: ${describeProviderError(error)}`,
      { cause: error }
    );
  }
}

function describeProviderError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const details = new Set<string>();
  if (error.name && error.name !== "Error") details.add(error.name);
  if (error.message) details.add(error.message);
  const statusCode = (error as Error & { $metadata?: { httpStatusCode?: unknown } }).$metadata
    ?.httpStatusCode;
  if (typeof statusCode === "number") details.add(`HTTP ${statusCode}`);

  return [...details].join(" · ") || "Unknown provider error";
}

async function inspectMultipartUpload(
  s3Client: Pick<S3Client, "send">,
  input: {
    bucketName: string;
    objectKey: string;
    uploadId: string;
    parts: ReadonlyArray<{ partNumber: number; etag: string }>;
  }
): Promise<number> {
  const observed = new Map<number, { etag: string; size: number }>();
  let partNumberMarker: string | undefined;
  do {
    const response = await s3Client.send(
      new ListPartsCommand({
        Bucket: input.bucketName,
        Key: input.objectKey,
        UploadId: input.uploadId,
        ...(partNumberMarker ? { PartNumberMarker: partNumberMarker } : {})
      })
    );
    for (const part of response.Parts ?? []) {
      if (
        typeof part.PartNumber !== "number" ||
        typeof part.ETag !== "string" ||
        typeof part.Size !== "number" ||
        part.Size <= 0
      ) {
        throw new Error(`S3 multipart upload contains invalid part metadata: ${input.objectKey}`);
      }
      observed.set(part.PartNumber, { etag: normalizeEtag(part.ETag), size: part.Size });
    }
    partNumberMarker = response.IsTruncated
      ? String(response.NextPartNumberMarker ?? "") || undefined
      : undefined;
  } while (partNumberMarker);

  if (observed.size !== input.parts.length) {
    throw new Error(`S3 multipart upload part count changed: ${input.objectKey}`);
  }
  let total = 0;
  for (const expected of input.parts) {
    const part = observed.get(expected.partNumber);
    if (!part || part.etag !== normalizeEtag(expected.etag)) {
      throw new Error(`S3 multipart upload ETag changed: ${input.objectKey}`);
    }
    total += part.size;
  }
  return total;
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^"|"$/gu, "");
}

async function hashS3Object(
  s3Client: Pick<S3Client, "send">,
  input: {
    bucketName: string;
    objectKey: string;
    versionId: string;
    expectedByteSize: number;
    maximumByteSize: number;
  }
): Promise<string> {
  const object = await s3Client.send(
    new GetObjectCommand({
      Bucket: input.bucketName,
      Key: input.objectKey,
      VersionId: input.versionId
    })
  );
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  if (!object.Body || !(Symbol.asyncIterator in Object(object.Body))) {
    throw new Error("S3 object body is unavailable");
  }
  let total = 0;
  for await (const value of object.Body as AsyncIterable<Uint8Array | string>) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > input.expectedByteSize || total > input.maximumByteSize) {
      throw new Error("S3 object body exceeds its declared content length");
    }
    hash.update(chunk);
  }
  if (total !== input.expectedByteSize) {
    throw new Error("S3 object body does not match its declared content length");
  }
  return hash.digest("hex");
}

async function readBodyBytes(body: unknown, maximumBytes = Number.POSITIVE_INFINITY) {
  if (!body || !(Symbol.asyncIterator in Object(body))) {
    throw new Error("S3 object body is unavailable");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of body as AsyncIterable<Uint8Array | string>) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > maximumBytes) throw new Error("S3 object exceeds the maximum readable size");
    chunks.push(chunk);
  }
  return chunks;
}
