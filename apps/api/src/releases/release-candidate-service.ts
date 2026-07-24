import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { CompositeReleaseDigest, ReleaseCandidate } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  deployments,
  gitCicdPipelineRuns,
  projectBuildEnvironments,
  projectExecutionLeases,
  releaseCandidates
} from "../db/schema.js";
import type { LeaseFence } from "./project-execution-lease-service.js";

const candidateRetentionMs = 24 * 60 * 60 * 1000;
export const maximumApiArchiveBytes = 2 * 1024 * 1024 * 1024;
export const maximumFrontendArchiveBytes = 512 * 1024 * 1024;
export const maximumReleaseManifestBytes = 10 * 1024 * 1024;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const commitShaPattern = /^([0-9a-f]{40}|[0-9a-f]{64})$/u;

export type ReleaseCandidateRecord = typeof releaseCandidates.$inferSelect;

export type ReleaseCandidateBuildContext = {
  buildEnvironmentId: string;
  configFingerprint: string;
  status: "preparing" | "ready" | "verification_failed" | "disconnected";
};

export type ReleaseCandidateRepository = {
  findBuildContext(input: {
    projectId: string;
    deploymentId: string | null;
    pipelineRunId: string | null;
  }): Promise<ReleaseCandidateBuildContext | undefined>;
  findById(candidateId: string): Promise<ReleaseCandidateRecord | undefined>;
  save(
    input: Omit<ReleaseCandidateRecord, "createdAt"> & { createdAt?: Date },
    leaseFence?: LeaseFence
  ): Promise<ReleaseCandidateRecord>;
};

export type MultipartUploadPart = { partNumber: number; etag: string };

export type ReleaseCandidateStorage = {
  beginMultipartUpload(input: {
    objectKey: string;
    contentType: string;
    partCount: number;
  }): Promise<{
    uploadId: string;
    partUrls: Array<{ partNumber: number; url: string }>;
  }>;
  completeMultipartUpload(input: {
    objectKey: string;
    uploadId: string;
    parts: MultipartUploadPart[];
    expectedByteSize?: number;
    maximumByteSize: number;
  }): Promise<{ byteSize: number; versionId: string; sha256: string }>;
  readObjectText(input: { objectKey: string; versionId: string }): Promise<string>;
  putImmutableManifest(input: {
    objectKey: string;
    body: string;
  }): Promise<{ versionId: string }>;
  retainObjectVersionForRetry?(input: {
    objectKey: string;
    versionId: string;
  }): Promise<void>;
  deleteObjectVersion?(input: { objectKey: string; versionId: string }): Promise<void>;
};

export type BeginReleaseCandidateUploadInput = {
  projectId: string;
  deploymentId: string | null;
  pipelineRunId: string | null;
  commitSha: string;
  apiPartCount: number;
  frontendPartCount: number;
  manifestPartCount: number;
};

export type CandidateUploadCompletion = {
  uploadId: string;
  parts: MultipartUploadPart[];
};

export type FinalizeReleaseCandidateInput = {
  candidateId: string;
  projectId: string;
  deploymentId: string | null;
  pipelineRunId: string | null;
  commitSha: string;
  uploads: {
    api: CandidateUploadCompletion;
    frontend: CandidateUploadCompletion;
    manifest: CandidateUploadCompletion;
  };
  apiArchiveDigest: string;
  apiOciDigest: string;
  frontendArchiveDigest: string;
  frontendManifestDigest: string;
  apiArchiveByteSize: number;
  frontendArchiveByteSize: number;
  expectedBuildEnvironmentId: string;
  expectedConfigFingerprint: string;
};

export type ReleaseCandidateServiceOptions = {
  generateId?: () => string;
  now?: () => Date;
};

export type FinalizeReleaseCandidateOptions = Pick<ReleaseCandidateServiceOptions, "now"> & {
  leaseFence?: LeaseFence;
  heartbeat?: () => Promise<void>;
};

export type ReleaseCandidateErrorCode =
  | "RELEASE_REFERENCE_INVALID"
  | "BUILD_ENVIRONMENT_NOT_READY"
  | "RELEASE_CANDIDATE_EXISTS"
  | "RELEASE_CANDIDATE_INVALID"
  | "ARTIFACT_SIZE_LIMIT_EXCEEDED"
  | "ARTIFACT_SIZE_MISMATCH"
  | "ARTIFACT_CHECKSUM_MISMATCH";

export class ReleaseCandidateError extends Error {
  constructor(
    readonly code: ReleaseCandidateErrorCode,
    message: string,
    readonly statusCode = 409
  ) {
    super(message);
    this.name = "ReleaseCandidateError";
  }
}

export function createPostgresReleaseCandidateRepository(
  db: Database
): ReleaseCandidateRepository {
  return {
    async findBuildContext(input) {
      if ((input.deploymentId === null) === (input.pipelineRunId === null)) return undefined;
      if (input.deploymentId) {
        const [deployment] = await db
          .select({ id: deployments.id })
          .from(deployments)
          .where(
            and(eq(deployments.id, input.deploymentId), eq(deployments.projectId, input.projectId))
          );
        if (!deployment) return undefined;
      } else if (input.pipelineRunId) {
        const [pipelineRun] = await db
          .select({ id: gitCicdPipelineRuns.id })
          .from(gitCicdPipelineRuns)
          .where(
            and(
              eq(gitCicdPipelineRuns.id, input.pipelineRunId),
              eq(gitCicdPipelineRuns.projectId, input.projectId)
            )
          );
        if (!pipelineRun) return undefined;
      }
      const [environment] = await db
        .select({
          buildEnvironmentId: projectBuildEnvironments.id,
          configFingerprint: projectBuildEnvironments.runtimeFingerprint,
          status: projectBuildEnvironments.status
        })
        .from(projectBuildEnvironments)
        .where(eq(projectBuildEnvironments.projectId, input.projectId));
      return environment;
    },

    async findById(candidateId) {
      const [candidate] = await db
        .select()
        .from(releaseCandidates)
        .where(eq(releaseCandidates.id, candidateId));
      return candidate;
    },

    async save(input, leaseFence) {
      const saveCandidate = async (executor: Database) => {
        const [candidate] = await executor
          .insert(releaseCandidates)
          .values({ ...input, createdAt: input.createdAt ?? input.updatedAt })
          .returning();
        if (!candidate) throw new Error("Release candidate was not saved");
        return candidate;
      };
      if (!leaseFence) return saveCandidate(db);
      return db.transaction(async (transaction) => {
        const executor = transaction as unknown as Database;
        const [lease] = await executor
          .select({ projectId: projectExecutionLeases.projectId })
          .from(projectExecutionLeases)
          .where(
            and(
              eq(projectExecutionLeases.projectId, leaseFence.projectId),
              eq(projectExecutionLeases.holderId, leaseFence.holderId),
              eq(projectExecutionLeases.fencingVersion, leaseFence.fencingVersion),
              eq(projectExecutionLeases.status, "active"),
              gt(projectExecutionLeases.expiresAt, input.updatedAt)
            )
          )
          .for("update");
        if (!lease) {
          throw new ReleaseCandidateError(
            "RELEASE_CANDIDATE_INVALID",
            "Stale preflight cannot finalize a release candidate"
          );
        }
        return saveCandidate(executor);
      });
    }
  };
}

export async function beginReleaseCandidateUpload(
  input: BeginReleaseCandidateUploadInput,
  repository: ReleaseCandidateRepository,
  storage: ReleaseCandidateStorage,
  options: ReleaseCandidateServiceOptions = {}
) {
  validateReference(input);
  validateCommitSha(input.commitSha);
  validatePartCount(input.apiPartCount);
  validatePartCount(input.frontendPartCount);
  validatePartCount(input.manifestPartCount);
  const buildContext = await requireReadyBuildContext(input, repository);
  const candidateId = options.generateId?.() ?? randomUUID();
  const keys = createCandidateObjectKeys(
    input.deploymentId ?? input.pipelineRunId!,
    candidateId
  );
  const [api, frontend, manifest] = await Promise.all([
    storage.beginMultipartUpload({
      objectKey: keys.api,
      contentType: "application/vnd.oci.image.layer.v1.tar",
      partCount: input.apiPartCount
    }),
    storage.beginMultipartUpload({
      objectKey: keys.frontend,
      contentType: "application/zstd",
      partCount: input.frontendPartCount
    }),
    storage.beginMultipartUpload({
      objectKey: keys.frontendManifest,
      contentType: "application/json",
      partCount: input.manifestPartCount
    })
  ]);
  const now = options.now?.() ?? new Date();
  return {
    candidateId,
    buildEnvironmentId: buildContext.buildEnvironmentId,
    configFingerprint: buildContext.configFingerprint,
    expiresAt: new Date(now.getTime() + candidateRetentionMs).toISOString(),
    uploads: {
      api: { objectKey: keys.api, ...api },
      frontend: { objectKey: keys.frontend, ...frontend },
      manifest: { objectKey: keys.frontendManifest, ...manifest }
    }
  };
}

export async function finalizeReleaseCandidate(
  input: FinalizeReleaseCandidateInput,
  repository: ReleaseCandidateRepository,
  storage: ReleaseCandidateStorage,
  options: FinalizeReleaseCandidateOptions = {}
): Promise<ReleaseCandidate> {
  validateReference(input);
  validateCommitSha(input.commitSha);
  validateDigest(input.apiArchiveDigest, "API archive");
  validateDigest(input.apiOciDigest, "API OCI");
  validateDigest(input.frontendArchiveDigest, "frontend archive");
  validateDigest(input.frontendManifestDigest, "frontend manifest");
  if (input.apiArchiveByteSize <= 0 || input.frontendArchiveByteSize <= 0) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Release candidate artifact sizes must be positive"
    );
  }
  if (
    input.apiArchiveByteSize > maximumApiArchiveBytes ||
    input.frontendArchiveByteSize > maximumFrontendArchiveBytes
  ) {
    throw new ReleaseCandidateError(
      "ARTIFACT_SIZE_LIMIT_EXCEEDED",
      "Release candidate archive exceeds the managed Artifact size limit"
    );
  }
  const existing = await repository.findById(input.candidateId);
  if (existing) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_EXISTS",
      "Release candidate has already been finalized"
    );
  }
  await options.heartbeat?.();
  const buildContext = await requireReadyBuildContext(input, repository);
  if (
    buildContext.buildEnvironmentId !== input.expectedBuildEnvironmentId ||
    buildContext.configFingerprint !== input.expectedConfigFingerprint
  ) {
    throw new ReleaseCandidateError(
      "BUILD_ENVIRONMENT_NOT_READY",
      "Build environment changed while the approved preflight was running"
    );
  }
  const keys = createCandidateObjectKeys(
    input.deploymentId ?? input.pipelineRunId!,
    input.candidateId
  );
  const [apiObject, frontendObject, manifestObject] = await Promise.all([
    storage.completeMultipartUpload({
      objectKey: keys.api,
      uploadId: input.uploads.api.uploadId,
      parts: input.uploads.api.parts,
      expectedByteSize: input.apiArchiveByteSize,
      maximumByteSize: maximumApiArchiveBytes
    }),
    storage.completeMultipartUpload({
      objectKey: keys.frontend,
      uploadId: input.uploads.frontend.uploadId,
      parts: input.uploads.frontend.parts,
      expectedByteSize: input.frontendArchiveByteSize,
      maximumByteSize: maximumFrontendArchiveBytes
    }),
    storage.completeMultipartUpload({
      objectKey: keys.frontendManifest,
      uploadId: input.uploads.manifest.uploadId,
      parts: input.uploads.manifest.parts,
      maximumByteSize: maximumReleaseManifestBytes
    })
  ]);
  await options.heartbeat?.();
  if (
    apiObject.byteSize !== input.apiArchiveByteSize ||
    frontendObject.byteSize !== input.frontendArchiveByteSize ||
    manifestObject.byteSize <= 0
  ) {
    throw new ReleaseCandidateError(
      "ARTIFACT_SIZE_MISMATCH",
      "Uploaded release artifact size does not match the build result"
    );
  }
  if (
    apiObject.sha256 !== input.apiArchiveDigest ||
    frontendObject.sha256 !== input.frontendArchiveDigest ||
    manifestObject.sha256 !== input.frontendManifestDigest
  ) {
    throw new ReleaseCandidateError(
      "ARTIFACT_CHECKSUM_MISMATCH",
      "Uploaded release artifact checksum does not match the build result"
    );
  }
  const frontendManifestText = await storage.readObjectText({
    objectKey: keys.frontendManifest,
    versionId: manifestObject.versionId
  });
  await options.heartbeat?.();
  const frontendManifest = validateFrontendArtifactManifest(frontendManifestText, {
    candidateId: input.candidateId,
    commitSha: input.commitSha
  });
  const compositeDigest = createCompositeReleaseDigest({
    commitSha: input.commitSha,
    configFingerprint: buildContext.configFingerprint,
    apiOciDigest: input.apiOciDigest,
    frontendManifestDigest: input.frontendManifestDigest
  });
  const now = options.now?.() ?? new Date();
  const immutableManifest = await storage.putImmutableManifest({
    objectKey: keys.candidateManifest,
    body: JSON.stringify({
      schemaVersion: 1,
      projectId: input.projectId,
      candidateId: input.candidateId,
      commitSha: input.commitSha,
      configFingerprint: buildContext.configFingerprint,
      compositeDigest,
      artifacts: {
        api: {
          objectKey: keys.api,
          versionId: apiObject.versionId,
          byteSize: input.apiArchiveByteSize,
          sha256: input.apiArchiveDigest,
          ociManifestDigest: input.apiOciDigest
        },
        frontend: {
          objectKey: keys.frontend,
          versionId: frontendObject.versionId,
          byteSize: input.frontendArchiveByteSize,
          sha256: input.frontendArchiveDigest
        },
        frontendManifest: {
          objectKey: keys.frontendManifest,
          versionId: manifestObject.versionId,
          byteSize: manifestObject.byteSize,
          sha256: input.frontendManifestDigest
        }
      }
    })
  });
  await options.heartbeat?.();
  const saved = await repository.save({
    id: input.candidateId,
    projectId: input.projectId,
    deploymentId: input.deploymentId,
    pipelineRunId: input.pipelineRunId,
    buildEnvironmentId: buildContext.buildEnvironmentId,
    commitSha: input.commitSha,
    configFingerprint: buildContext.configFingerprint,
    compositeDigest: compositeDigest.value,
    apiOciDigest: input.apiOciDigest,
    apiArchiveDigest: input.apiArchiveDigest,
    frontendArchiveDigest: input.frontendArchiveDigest,
    frontendManifestDigest: input.frontendManifestDigest,
    frontendIndexDigest: frontendManifest.index.sha256,
    apiArchiveObjectKey: keys.api,
    apiArchiveObjectVersionId: apiObject.versionId,
    apiArchiveByteSize: input.apiArchiveByteSize,
    frontendArchiveObjectKey: keys.frontend,
    frontendArchiveObjectVersionId: frontendObject.versionId,
    frontendArchiveByteSize: input.frontendArchiveByteSize,
    frontendManifestObjectKey: keys.frontendManifest,
    frontendManifestObjectVersionId: manifestObject.versionId,
    manifestObjectKey: keys.candidateManifest,
    manifestObjectVersionId: immutableManifest.versionId,
    status: "pending",
    expiresAt: new Date(now.getTime() + candidateRetentionMs),
    frontendRetryExpiresAt: null,
    updatedAt: now
  }, options.leaseFence);
  return toReleaseCandidate(saved);
}

function createCandidateObjectKeys(releaseReferenceId: string, candidateId: string) {
  const prefix = `deployments/${releaseReferenceId}/release-candidates/${candidateId}`;
  return {
    api: `${prefix}/api-image.oci.tar`,
    frontend: `${prefix}/frontend.tar.zst`,
    frontendManifest: `${prefix}/frontend-manifest.json`,
    candidateManifest: `${prefix}/candidate-manifest.json`
  };
}

function createCompositeReleaseDigest(input: {
  commitSha: string;
  configFingerprint: string;
  apiOciDigest: string;
  frontendManifestDigest: string;
}): CompositeReleaseDigest {
  const value = createHash("sha256")
    .update(
      JSON.stringify({
        algorithm: "sha256",
        commitSha: input.commitSha,
        configFingerprint: input.configFingerprint,
        apiOciDigest: input.apiOciDigest,
        frontendManifestDigest: input.frontendManifestDigest
      })
    )
    .digest("hex");
  return {
    algorithm: "sha256",
    value,
    apiOciDigest: input.apiOciDigest,
    frontendManifestDigest: input.frontendManifestDigest
  };
}

async function requireReadyBuildContext(
  input: { projectId: string; deploymentId: string | null; pipelineRunId: string | null },
  repository: ReleaseCandidateRepository
): Promise<ReleaseCandidateBuildContext> {
  const context = await repository.findBuildContext(input);
  if (!context) {
    throw new ReleaseCandidateError(
      "RELEASE_REFERENCE_INVALID",
      "Release reference does not belong to the project",
      404
    );
  }
  if (context.status !== "ready") {
    throw new ReleaseCandidateError(
      "BUILD_ENVIRONMENT_NOT_READY",
      "Project build environment must be verified before building"
    );
  }
  return context;
}

function validateReference(input: {
  deploymentId: string | null;
  pipelineRunId: string | null;
}): void {
  if ((input.deploymentId === null) === (input.pipelineRunId === null)) {
    throw new ReleaseCandidateError(
      "RELEASE_REFERENCE_INVALID",
      "Exactly one managed deployment or Git pipeline run is required"
    );
  }
}

function validateCommitSha(value: string): void {
  if (!commitShaPattern.test(value)) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Release candidate commit SHA is invalid"
    );
  }
}

function validateDigest(value: string, label: string): void {
  if (!sha256Pattern.test(value)) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      `${label} SHA-256 digest is invalid`
    );
  }
}

function validatePartCount(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Multipart upload part count must be between 1 and 10000"
    );
  }
}

export type FrontendArtifactManifest = {
  schemaVersion: 1;
  commitSha: string;
  candidateId: string;
  marker: string;
  index: { path: "index.html"; sha256: string };
  files: Array<{ path: string; sha256: string; size: number; contentType: string }>;
};

export function validateFrontendArtifactManifest(
  value: string,
  expected: { candidateId: string; commitSha: string }
): FrontendArtifactManifest {
  if (Buffer.byteLength(value, "utf8") > 10 * 1024 * 1024) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Frontend manifest exceeds the maximum size"
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Frontend manifest must be valid JSON"
    );
  }
  if (!isRecord(parsed) || JSON.stringify(parsed) !== value) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Frontend manifest must use the canonical JSON encoding"
    );
  }
  const index = parsed["index"];
  const files = parsed["files"];
  if (
    parsed["schemaVersion"] !== 1 ||
    parsed["commitSha"] !== expected.commitSha ||
    parsed["candidateId"] !== expected.candidateId ||
    parsed["marker"] !== `${expected.commitSha}:${expected.candidateId}` ||
    !isRecord(index) ||
    index["path"] !== "index.html" ||
    typeof index["sha256"] !== "string" ||
    !sha256Pattern.test(index["sha256"]) ||
    !Array.isArray(files) ||
    files.length === 0
  ) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Frontend manifest release identity is invalid"
    );
  }
  const paths = new Set<string>();
  for (const file of files) {
    if (
      !isRecord(file) ||
      typeof file["path"] !== "string" ||
      !isSafeArtifactPath(file["path"]) ||
      paths.has(file["path"]) ||
      typeof file["sha256"] !== "string" ||
      !sha256Pattern.test(file["sha256"]) ||
      !Number.isSafeInteger(file["size"]) ||
      Number(file["size"]) < 0 ||
      typeof file["contentType"] !== "string" ||
      !file["contentType"]
    ) {
      throw new ReleaseCandidateError(
        "RELEASE_CANDIDATE_INVALID",
        "Frontend manifest contains an invalid file entry"
      );
    }
    paths.add(file["path"]);
  }
  const indexFile = files.find(
    (file) => isRecord(file) && file["path"] === "index.html"
  );
  if (!isRecord(indexFile) || indexFile["sha256"] !== index["sha256"]) {
    throw new ReleaseCandidateError(
      "RELEASE_CANDIDATE_INVALID",
      "Frontend manifest index digest is inconsistent"
    );
  }
  return parsed as FrontendArtifactManifest;
}

function isSafeArtifactPath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1024 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toReleaseCandidate(record: ReleaseCandidateRecord): ReleaseCandidate {
  return {
    id: record.id,
    projectId: record.projectId,
    deploymentId: record.deploymentId,
    pipelineRunId: record.pipelineRunId,
    buildEnvironmentId: record.buildEnvironmentId,
    commitSha: record.commitSha,
    compositeDigest: {
      algorithm: "sha256",
      value: record.compositeDigest,
      apiOciDigest: record.apiOciDigest,
      frontendManifestDigest: record.frontendManifestDigest
    },
    apiOciDigest: record.apiOciDigest,
    apiArchiveDigest: record.apiArchiveDigest,
    frontendArchiveDigest: record.frontendArchiveDigest,
    frontendManifestDigest: record.frontendManifestDigest,
    frontendIndexDigest: record.frontendIndexDigest,
    apiArchiveObjectKey: record.apiArchiveObjectKey,
    apiArchiveObjectVersionId: record.apiArchiveObjectVersionId,
    apiArchiveByteSize: record.apiArchiveByteSize,
    frontendArchiveObjectKey: record.frontendArchiveObjectKey,
    frontendArchiveObjectVersionId: record.frontendArchiveObjectVersionId,
    frontendArchiveByteSize: record.frontendArchiveByteSize,
    frontendManifestObjectKey: record.frontendManifestObjectKey,
    frontendManifestObjectVersionId: record.frontendManifestObjectVersionId,
    manifestObjectKey: record.manifestObjectKey,
    manifestObjectVersionId: record.manifestObjectVersionId,
    status: record.status,
    expiresAt: record.expiresAt.toISOString(),
    frontendRetryExpiresAt: record.frontendRetryExpiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}
