import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { S3Client } from "@aws-sdk/client-s3";

import { createS3ReleaseCandidateStorage } from "./s3-release-candidate-storage.js";

test("frontend retry retention moves the exact object version to the two-day lifecycle", async () => {
  let commandInput: Record<string, unknown> | undefined;
  const storage = createS3ReleaseCandidateStorage({
    bucketName: "sketchcatch-artifacts",
    s3Client: {
      async send(command: { input: Record<string, unknown> }) {
        commandInput = command.input;
        return {};
      }
    } as unknown as S3Client
  });

  await storage.retainObjectVersionForRetry?.({
    objectKey: "deployments/deployment-1/release-candidates/candidate-1/frontend.tar.zst",
    versionId: "frontend-v1"
  });

  assert.deepEqual(commandInput, {
    Bucket: "sketchcatch-artifacts",
    Key: "deployments/deployment-1/release-candidates/candidate-1/frontend.tar.zst",
    VersionId: "frontend-v1",
    Tagging: {
      TagSet: [
        { Key: "ManagedBy", Value: "SketchCatch" },
        { Key: "Artifact", Value: "ReleaseCandidate" },
        { Key: "SketchCatchLifecycle", Value: "ReleaseCandidateRetry" }
      ]
    }
  });
});

test("candidate checksum is calculated from the S3 stream without buffering the archive", async () => {
  const chunks = [Buffer.from("abc"), Buffer.from("def")];
  const responses = [
    {
      Parts: [{ PartNumber: 1, ETag: "etag-1", Size: 6 }],
      IsTruncated: false
    },
    { VersionId: "api-v1" },
    { ContentLength: 6 },
    {
      Body: {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk;
        }
      }
    }
  ];
  const storage = createS3ReleaseCandidateStorage({
    bucketName: "sketchcatch-artifacts",
    s3Client: {
      async send() {
        return responses.shift() ?? {};
      }
    } as unknown as S3Client
  });

  const completed = await storage.completeMultipartUpload({
    objectKey: "deployments/deployment-1/release-candidates/candidate-1/api-image.oci.tar",
    uploadId: "upload-1",
    parts: [{ partNumber: 1, etag: "etag-1" }],
    expectedByteSize: 6,
    maximumByteSize: 6
  });

  assert.deepEqual(completed, {
    byteSize: 6,
    versionId: "api-v1",
    sha256: createHash("sha256").update("abcdef").digest("hex")
  });
});

test("multipart finalization preserves S3 context when the provider reports UnknownError", async () => {
  const providerError = Object.assign(new Error("UnknownError"), {
    name: "UnknownError",
    $metadata: { httpStatusCode: 403 }
  });
  const storage = createS3ReleaseCandidateStorage({
    bucketName: "sketchcatch-artifacts",
    s3Client: {
      async send() {
        throw providerError;
      }
    } as unknown as S3Client
  });

  await assert.rejects(
    storage.completeMultipartUpload({
      objectKey: "deployments/deployment-1/release-candidates/candidate-1/api-image.oci.tar",
      uploadId: "upload-1",
      parts: [{ partNumber: 1, etag: "etag-1" }],
      expectedByteSize: 6,
      maximumByteSize: 6
    }),
    (error) => {
      assert(error instanceof Error);
      assert.match(error.message, /release candidate S3 ListParts failed/i);
      assert.match(error.message, /UnknownError/);
      assert.match(error.message, /HTTP 403/);
      return true;
    }
  );
});
