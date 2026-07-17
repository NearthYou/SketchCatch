import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ReleaseCandidateError,
  beginReleaseCandidateUpload,
  finalizeReleaseCandidate,
  type ReleaseCandidateRecord,
  type ReleaseCandidateRepository,
  type ReleaseCandidateStorage
} from "./release-candidate-service.js";

const projectId = "12345678-1234-1234-1234-1234567890ab";
const deploymentId = "87654321-1234-1234-1234-1234567890ab";
const commitSha = "a".repeat(40);
const configFingerprint = "b".repeat(64);
const apiArchiveDigest = "c".repeat(64);
const apiOciDigest = "d".repeat(64);
const frontendArchiveDigest = "e".repeat(64);
const frontendIndexDigest = "f".repeat(64);
const frontendManifestText = JSON.stringify({
  schemaVersion: 1,
  commitSha,
  candidateId: "candidate-1",
  marker: `${commitSha}:candidate-1`,
  index: { path: "index.html", sha256: frontendIndexDigest },
  files: [
    {
      path: "index.html",
      sha256: frontendIndexDigest,
      size: 42,
      contentType: "text/html; charset=utf-8"
    }
  ]
});
const frontendManifestDigest = createHash("sha256")
  .update(frontendManifestText)
  .digest("hex");
const now = new Date("2026-07-15T12:00:00.000Z");

test("release candidate upload uses project-scoped immutable object keys", async () => {
  const storage = createStorage();
  const result = await beginReleaseCandidateUpload(
    {
      projectId,
      deploymentId,
      pipelineRunId: null,
      commitSha,
      apiPartCount: 2,
      frontendPartCount: 1,
      manifestPartCount: 1
    },
    createRepository(),
    storage,
    { generateId: () => "candidate-1", now: () => now }
  );

  assert.equal(result.candidateId, "candidate-1");
  assert.equal(
    result.uploads.api.objectKey,
    `deployments/${deploymentId}/release-candidates/candidate-1/api-image.oci.tar`
  );
  assert.equal(result.uploads.api.partUrls.length, 2);
  assert.equal(result.expiresAt, "2026-07-16T12:00:00.000Z");
});

test("release candidate finalization stores a composite digest after all objects exist", async () => {
  const repository = createRepository();
  const storage = createStorage();
  const result = await finalizeReleaseCandidate(
    {
      candidateId: "candidate-1",
      projectId,
      deploymentId,
      pipelineRunId: null,
      commitSha,
      uploads: {
        api: { uploadId: "api-upload", parts: [{ partNumber: 1, etag: "api-etag" }] },
        frontend: {
          uploadId: "frontend-upload",
          parts: [{ partNumber: 1, etag: "frontend-etag" }]
        },
        manifest: {
          uploadId: "manifest-upload",
          parts: [{ partNumber: 1, etag: "manifest-etag" }]
        }
      },
      apiArchiveDigest,
      apiOciDigest,
      frontendArchiveDigest,
      frontendManifestDigest,
      apiArchiveByteSize: 100,
      frontendArchiveByteSize: 200,
      expectedBuildEnvironmentId: "build-environment-1",
      expectedConfigFingerprint: configFingerprint
    },
    repository,
    storage,
    { now: () => now }
  );

  assert.equal(result.compositeDigest.algorithm, "sha256");
  assert.equal(result.compositeDigest.value.length, 64);
  assert.equal(result.compositeDigest.apiOciDigest, apiOciDigest);
  assert.equal(result.apiArchiveDigest, apiArchiveDigest);
  assert.equal(result.frontendIndexDigest, frontendIndexDigest);
  assert.equal(result.apiArchiveObjectVersionId, "api-version");
  assert.equal(result.status, "pending");
  assert.equal(result.buildEnvironmentId, "build-environment-1");
});

test("release candidate finalization rejects a reported size that differs from S3", async () => {
  const storage = createStorage({ api: 99 });
  await assert.rejects(
    finalizeReleaseCandidate(
      {
        candidateId: "candidate-1",
        projectId,
        deploymentId,
        pipelineRunId: null,
        commitSha,
        uploads: {
          api: { uploadId: "api-upload", parts: [{ partNumber: 1, etag: "api-etag" }] },
          frontend: {
            uploadId: "frontend-upload",
            parts: [{ partNumber: 1, etag: "frontend-etag" }]
          },
          manifest: {
            uploadId: "manifest-upload",
            parts: [{ partNumber: 1, etag: "manifest-etag" }]
          }
        },
        apiArchiveDigest,
        apiOciDigest,
        frontendArchiveDigest,
        frontendManifestDigest,
        apiArchiveByteSize: 100,
        frontendArchiveByteSize: 200,
        expectedBuildEnvironmentId: "build-environment-1",
        expectedConfigFingerprint: configFingerprint
      },
      createRepository(),
      storage,
      { now: () => now }
    ),
    (error) =>
      error instanceof ReleaseCandidateError && error.code === "ARTIFACT_SIZE_MISMATCH"
  );
});

test("release candidate finalization reports checksum mismatches separately from size mismatches", async () => {
  const storage = createStorage({ apiDigest: "9".repeat(64) });
  await assert.rejects(
    finalizeReleaseCandidate(
      {
        candidateId: "candidate-1",
        projectId,
        deploymentId,
        pipelineRunId: null,
        commitSha,
        uploads: {
          api: { uploadId: "api-upload", parts: [{ partNumber: 1, etag: "api-etag" }] },
          frontend: {
            uploadId: "frontend-upload",
            parts: [{ partNumber: 1, etag: "frontend-etag" }]
          },
          manifest: {
            uploadId: "manifest-upload",
            parts: [{ partNumber: 1, etag: "manifest-etag" }]
          }
        },
        apiArchiveDigest,
        apiOciDigest,
        frontendArchiveDigest,
        frontendManifestDigest,
        apiArchiveByteSize: 100,
        frontendArchiveByteSize: 200,
        expectedBuildEnvironmentId: "build-environment-1",
        expectedConfigFingerprint: configFingerprint
      },
      createRepository(),
      storage,
      { now: () => now }
    ),
    (error) =>
      error instanceof ReleaseCandidateError && error.code === "ARTIFACT_CHECKSUM_MISMATCH"
  );
});

test("release candidate finalization rejects archives above the managed size limits", async () => {
  await assert.rejects(
    finalizeReleaseCandidate(
      {
        candidateId: "candidate-1",
        projectId,
        deploymentId,
        pipelineRunId: null,
        commitSha,
        uploads: {
          api: { uploadId: "api-upload", parts: [{ partNumber: 1, etag: "api-etag" }] },
          frontend: {
            uploadId: "frontend-upload",
            parts: [{ partNumber: 1, etag: "frontend-etag" }]
          },
          manifest: {
            uploadId: "manifest-upload",
            parts: [{ partNumber: 1, etag: "manifest-etag" }]
          }
        },
        apiArchiveDigest,
        apiOciDigest,
        frontendArchiveDigest,
        frontendManifestDigest,
        apiArchiveByteSize: 2 * 1024 * 1024 * 1024 + 1,
        frontendArchiveByteSize: 200,
        expectedBuildEnvironmentId: "build-environment-1",
        expectedConfigFingerprint: configFingerprint
      },
      createRepository(),
      createStorage(),
      { now: () => now }
    ),
    (error) =>
      error instanceof ReleaseCandidateError &&
      error.code === "ARTIFACT_SIZE_LIMIT_EXCEEDED"
  );
});

function createRepository(): ReleaseCandidateRepository {
  let saved: ReleaseCandidateRecord | undefined;
  return {
    async findBuildContext() {
      return {
        buildEnvironmentId: "build-environment-1",
        configFingerprint,
        status: "ready"
      };
    },
    async findById() {
      return saved;
    },
    async save(input) {
      saved = { ...input, createdAt: input.createdAt ?? input.updatedAt };
      return saved;
    }
  };
}

function createStorage(
  values: {
    api?: number;
    frontend?: number;
    manifest?: number;
    apiDigest?: string;
  } = {}
): ReleaseCandidateStorage {
  return {
    async beginMultipartUpload(input) {
      return {
        uploadId: input.objectKey.includes("api-image")
          ? "api-upload"
          : input.objectKey.includes("frontend.")
            ? "frontend-upload"
            : "manifest-upload",
        partUrls: Array.from({ length: input.partCount }, (_, index) => ({
          partNumber: index + 1,
          url: `https://upload.example/${index + 1}`
        }))
      };
    },
    async completeMultipartUpload(input) {
      if (input.objectKey.includes("api-image")) {
        return {
          byteSize: values.api ?? 100,
          versionId: "api-version",
          sha256: values.apiDigest ?? apiArchiveDigest
        };
      }
      if (input.objectKey.includes("frontend.")) {
        return {
          byteSize: values.frontend ?? 200,
          versionId: "frontend-version",
          sha256: frontendArchiveDigest
        };
      }
      return {
        byteSize: values.manifest ?? Buffer.byteLength(frontendManifestText),
        versionId: "manifest-version",
        sha256: frontendManifestDigest
      };
    },
    async readObjectText() {
      return frontendManifestText;
    },
    async putImmutableManifest() {
      return { versionId: "candidate-manifest-version" };
    }
  };
}
