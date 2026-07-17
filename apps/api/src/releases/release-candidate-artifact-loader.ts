import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireS3BucketName } from "../config/env.js";
import { getS3Client } from "../s3/client.js";
import {
  validateFrontendArtifactManifest,
  type FrontendArtifactManifest
} from "./release-candidate-service.js";
import { loadVerifiedOciLayout, type VerifiedOciLayout } from "./oci-ecr-publisher.js";

const execFileAsync = promisify(execFile);
const sha256Pattern = /^[0-9a-f]{64}$/u;
const maximumFrontendExpandedBytes = 2 * 1024 * 1024 * 1024;
const maximumOciExpandedBytes = 4 * 1024 * 1024 * 1024;
const maximumFrontendFileBytes = 256 * 1024 * 1024;
const maximumOciFileBytes = 2 * 1024 * 1024 * 1024;
const maximumFrontendFileCount = 20_000;
const maximumOciFileCount = 50_000;

export type ReleaseCandidateArtifactReference = {
  projectId: string;
  candidateId: string;
  commitSha: string;
  configFingerprint: string;
  compositeDigest: string;
  apiOciDigest: string;
  apiArchiveDigest: string;
  apiArchiveByteSize: number;
  frontendArchiveDigest: string;
  frontendArchiveByteSize: number;
  frontendManifestDigest: string;
  frontendIndexDigest: string;
  apiArchiveObjectKey: string;
  apiArchiveObjectVersionId: string;
  frontendArchiveObjectKey: string;
  frontendArchiveObjectVersionId: string;
  frontendManifestObjectKey: string;
  frontendManifestObjectVersionId: string;
  manifestObjectKey: string;
  manifestObjectVersionId: string;
};

export type LoadedReleaseCandidateArtifacts = {
  rootDirectory: string;
  oci: VerifiedOciLayout;
  frontendDirectory: string;
  frontendManifest: FrontendArtifactManifest;
  cleanup(): Promise<void>;
};

export type LoadedFrontendReleaseCandidateArtifacts = Pick<
  LoadedReleaseCandidateArtifacts,
  "rootDirectory" | "frontendDirectory" | "frontendManifest" | "cleanup"
>;

type ReleaseCandidateArtifactS3Client = {
  send(command: GetObjectCommand): Promise<Record<string, unknown>>;
  destroy?: () => void;
};

export async function loadReleaseCandidateArtifacts(
  reference: ReleaseCandidateArtifactReference,
  options: {
    bucketName?: string;
    s3Client?: ReleaseCandidateArtifactS3Client;
  } = {}
): Promise<LoadedReleaseCandidateArtifacts> {
  validateReference(reference);
  const bucketName = options.bucketName?.trim() || requireS3BucketName();
  const client =
    options.s3Client ??
    (getS3Client() as unknown as ReleaseCandidateArtifactS3Client);
  const rootDirectory = await mkdtemp(join(tmpdir(), "sketchcatch-release-"));
  try {
    const apiArchive = join(rootDirectory, "api-image.oci.tar");
    const frontendArchive = join(rootDirectory, "frontend.tar.zst");
    const ociDirectory = join(rootDirectory, "oci");
    const frontendDirectory = join(rootDirectory, "frontend");
    await mkdir(ociDirectory);
    await mkdir(frontendDirectory);

    await downloadVerifiedObject(client, {
      bucketName,
      objectKey: reference.apiArchiveObjectKey,
      versionId: reference.apiArchiveObjectVersionId,
      expectedSha256: reference.apiArchiveDigest,
      expectedByteSize: reference.apiArchiveByteSize,
      destination: apiArchive
    });
    await downloadVerifiedObject(client, {
      bucketName,
      objectKey: reference.frontendArchiveObjectKey,
      versionId: reference.frontendArchiveObjectVersionId,
      expectedSha256: reference.frontendArchiveDigest,
      expectedByteSize: reference.frontendArchiveByteSize,
      destination: frontendArchive
    });
    const frontendManifestText = await readVerifiedTextObject(client, {
      bucketName,
      objectKey: reference.frontendManifestObjectKey,
      versionId: reference.frontendManifestObjectVersionId,
      expectedSha256: reference.frontendManifestDigest
    });
    const candidateManifestText = await readTextObject(client, {
      bucketName,
      objectKey: reference.manifestObjectKey,
      versionId: reference.manifestObjectVersionId
    });
    assertCandidateManifest(candidateManifestText, reference);
    const frontendManifest = validateFrontendArtifactManifest(frontendManifestText, {
      candidateId: reference.candidateId,
      commitSha: reference.commitSha
    });
    if (frontendManifest.index.sha256 !== reference.frontendIndexDigest) {
      throw new Error("Frontend index digest does not match the approved candidate");
    }

    await extractVerifiedTar(apiArchive, ociDirectory, false, {
      maximumExpandedBytes: maximumOciExpandedBytes,
      maximumFileBytes: maximumOciFileBytes,
      maximumFileCount: maximumOciFileCount
    });
    await extractVerifiedTar(frontendArchive, frontendDirectory, true, {
      maximumExpandedBytes: maximumFrontendExpandedBytes,
      maximumFileBytes: maximumFrontendFileBytes,
      maximumFileCount: maximumFrontendFileCount,
      expectedFiles: new Map(
        frontendManifest.files.map((file) => [file.path, file.size] as const)
      )
    });
    await assertExtractedTreeContainsOnlyFilesAndDirectories(ociDirectory);
    await assertExtractedTreeContainsOnlyFilesAndDirectories(frontendDirectory);
    const oci = await loadVerifiedOciLayout(ociDirectory, reference.apiOciDigest);
    await verifyFrontendDirectory(frontendDirectory, frontendManifest);

    return {
      rootDirectory,
      oci,
      frontendDirectory,
      frontendManifest,
      async cleanup() {
        await rm(rootDirectory, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await rm(rootDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function loadFrontendReleaseCandidateArtifacts(
  reference: ReleaseCandidateArtifactReference,
  options: {
    bucketName?: string;
    s3Client?: ReleaseCandidateArtifactS3Client;
  } = {}
): Promise<LoadedFrontendReleaseCandidateArtifacts> {
  validateReference(reference);
  const bucketName = options.bucketName?.trim() || requireS3BucketName();
  const client =
    options.s3Client ??
    (getS3Client() as unknown as ReleaseCandidateArtifactS3Client);
  const rootDirectory = await mkdtemp(join(tmpdir(), "sketchcatch-frontend-retry-"));
  try {
    const frontendArchive = join(rootDirectory, "frontend.tar.zst");
    const frontendDirectory = join(rootDirectory, "frontend");
    await mkdir(frontendDirectory);
    await downloadVerifiedObject(client, {
      bucketName,
      objectKey: reference.frontendArchiveObjectKey,
      versionId: reference.frontendArchiveObjectVersionId,
      expectedSha256: reference.frontendArchiveDigest,
      expectedByteSize: reference.frontendArchiveByteSize,
      destination: frontendArchive
    });
    const frontendManifestText = await readVerifiedTextObject(client, {
      bucketName,
      objectKey: reference.frontendManifestObjectKey,
      versionId: reference.frontendManifestObjectVersionId,
      expectedSha256: reference.frontendManifestDigest
    });
    const candidateManifestText = await readTextObject(client, {
      bucketName,
      objectKey: reference.manifestObjectKey,
      versionId: reference.manifestObjectVersionId
    });
    assertCandidateManifest(candidateManifestText, reference);
    const frontendManifest = validateFrontendArtifactManifest(frontendManifestText, {
      candidateId: reference.candidateId,
      commitSha: reference.commitSha
    });
    if (frontendManifest.index.sha256 !== reference.frontendIndexDigest) {
      throw new Error("Frontend index digest does not match the approved candidate");
    }
    await extractVerifiedTar(frontendArchive, frontendDirectory, true, {
      maximumExpandedBytes: maximumFrontendExpandedBytes,
      maximumFileBytes: maximumFrontendFileBytes,
      maximumFileCount: maximumFrontendFileCount,
      expectedFiles: new Map(
        frontendManifest.files.map((file) => [file.path, file.size] as const)
      )
    });
    await assertExtractedTreeContainsOnlyFilesAndDirectories(frontendDirectory);
    await verifyFrontendDirectory(frontendDirectory, frontendManifest);
    return {
      rootDirectory,
      frontendDirectory,
      frontendManifest,
      async cleanup() {
        await rm(rootDirectory, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await rm(rootDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function downloadVerifiedObject(
  client: ReleaseCandidateArtifactS3Client,
  input: {
    bucketName: string;
    objectKey: string;
    versionId: string;
    expectedSha256: string;
    expectedByteSize: number;
    destination: string;
  }
): Promise<void> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: input.bucketName,
      Key: input.objectKey,
      VersionId: input.versionId
    })
  );
  const body = response["Body"];
  if (!isAsyncIterable(body)) throw new Error(`S3 object body is unavailable: ${input.objectKey}`);
  const handle = await open(input.destination, "wx", 0o600);
  const hash = createHash("sha256");
  let byteSize = 0;
  try {
    for await (const value of body) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      byteSize += chunk.byteLength;
      if (byteSize > input.expectedByteSize) {
        throw new Error(`S3 object exceeds approved size: ${input.objectKey}`);
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  if (byteSize !== input.expectedByteSize) {
    throw new Error(`S3 object size does not match approved candidate: ${input.objectKey}`);
  }
  if (hash.digest("hex") !== input.expectedSha256) {
    throw new Error(`S3 object checksum does not match approved candidate: ${input.objectKey}`);
  }
}

async function readVerifiedTextObject(
  client: ReleaseCandidateArtifactS3Client,
  input: {
    bucketName: string;
    objectKey: string;
    versionId: string;
    expectedSha256: string;
  }
): Promise<string> {
  const text = await readTextObject(client, input);
  if (createHash("sha256").update(text).digest("hex") !== input.expectedSha256) {
    throw new Error(`S3 object checksum does not match approved candidate: ${input.objectKey}`);
  }
  return text;
}

async function readTextObject(
  client: ReleaseCandidateArtifactS3Client,
  input: { bucketName: string; objectKey: string; versionId: string }
): Promise<string> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: input.bucketName,
      Key: input.objectKey,
      VersionId: input.versionId
    })
  );
  const body = response["Body"];
  if (!isAsyncIterable(body)) throw new Error(`S3 object body is unavailable: ${input.objectKey}`);
  const chunks: Buffer[] = [];
  let byteSize = 0;
  for await (const value of body) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    byteSize += chunk.byteLength;
    if (byteSize > 10 * 1024 * 1024) throw new Error("Release manifest exceeds 10 MiB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function extractVerifiedTar(
  archivePath: string,
  destination: string,
  zstdCompressed: boolean,
  limits: {
    maximumExpandedBytes: number;
    maximumFileBytes: number;
    maximumFileCount: number;
    expectedFiles?: ReadonlyMap<string, number>;
  }
): Promise<void> {
  const compressionArgs = zstdCompressed ? ["--zstd"] : [];
  const { stdout } = await execFileAsync(
    "tar",
    [...compressionArgs, "--list", "--verbose", "--file", archivePath],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  assertArchiveEntriesWithinLimits(stdout, limits);
  await execFileAsync(
    "tar",
    [
      ...compressionArgs,
      "--extract",
      "--file",
      archivePath,
      "--directory",
      destination,
      "--no-same-owner",
      "--no-same-permissions"
    ],
    { maxBuffer: 20 * 1024 * 1024 }
  );
}

function assertArchiveEntriesWithinLimits(
  listing: string,
  limits: {
    maximumExpandedBytes: number;
    maximumFileBytes: number;
    maximumFileCount: number;
    expectedFiles?: ReadonlyMap<string, number>;
  }
): void {
  const observedFiles = new Set<string>();
  let expandedBytes = 0;
  let fileCount = 0;
  for (const line of listing.split("\n")) {
    if (!line.trim()) continue;
    const match =
      /^(\S+)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(.+)$/u.exec(line) ??
      /^(\S+)\s+\S+\/\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/u.exec(line);
    if (!match) throw new Error("Release archive metadata could not be verified");
    const [, mode = "", rawSize = "", rawPath = ""] = match;
    const normalizedPath = normalizeArchivePath(rawPath);
    assertSafeArchivePath(normalizedPath);
    if (mode.startsWith("d")) continue;
    if (!mode.startsWith("-")) {
      throw new Error(`Release archive contains an unsupported entry type: ${normalizedPath}`);
    }
    const size = Number(rawSize);
    if (!Number.isSafeInteger(size) || size < 0 || size > limits.maximumFileBytes) {
      throw new Error(`Release archive file exceeds its size limit: ${normalizedPath}`);
    }
    fileCount += 1;
    expandedBytes += size;
    if (
      fileCount > limits.maximumFileCount ||
      expandedBytes > limits.maximumExpandedBytes
    ) {
      throw new Error("Release archive exceeds the trusted worker extraction quota");
    }
    if (observedFiles.has(normalizedPath)) {
      throw new Error(`Release archive contains a duplicate file: ${normalizedPath}`);
    }
    observedFiles.add(normalizedPath);
    if (
      limits.expectedFiles &&
      limits.expectedFiles.get(normalizedPath) !== size
    ) {
      throw new Error(`Frontend archive metadata does not match its manifest: ${normalizedPath}`);
    }
  }
  if (
    limits.expectedFiles &&
    (observedFiles.size !== limits.expectedFiles.size ||
      [...limits.expectedFiles.keys()].some((path) => !observedFiles.has(path)))
  ) {
    throw new Error("Frontend archive file set does not match its manifest");
  }
}

function normalizeArchivePath(value: string): string {
  return value.replace(/^\.\//u, "").replace(/\/$/u, "");
}

function assertSafeArchivePath(value: string): void {
  const normalized = normalizeArchivePath(value);
  if (!normalized) return;
  if (
    normalized.length > 2_048 ||
    normalized.startsWith("/") ||
    normalized.includes("\\") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Release archive contains an unsafe path: ${value}`);
  }
}

async function assertExtractedTreeContainsOnlyFilesAndDirectories(root: string): Promise<void> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const parent = entry.parentPath;
    const path = join(parent, entry.name);
    const metadata = await lstat(path);
    if (!metadata.isFile() && !metadata.isDirectory()) {
      throw new Error(`Release archive contains an unsupported file type: ${relative(root, path)}`);
    }
    const resolved = resolve(path);
    if (resolved !== root && !resolved.startsWith(`${resolve(root)}/`)) {
      throw new Error("Release archive escaped its extraction directory");
    }
  }
}

async function verifyFrontendDirectory(
  root: string,
  manifest: FrontendArtifactManifest
): Promise<void> {
  const expectedPaths = new Set(manifest.files.map((file) => file.path));
  const actualPaths = new Set<string>();
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parent = entry.parentPath;
    actualPaths.add(relative(root, join(parent, entry.name)).split("\\").join("/"));
  }
  if (
    actualPaths.size !== expectedPaths.size ||
    [...actualPaths].some((path) => !expectedPaths.has(path))
  ) {
    throw new Error("Frontend archive file set does not match its manifest");
  }
  for (const file of manifest.files) {
    const path = join(root, ...file.path.split("/"));
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.size !== file.size) {
      throw new Error(`Frontend file size does not match its manifest: ${file.path}`);
    }
    const digest = createHash("sha256").update(await readFile(path)).digest("hex");
    if (digest !== file.sha256) {
      throw new Error(`Frontend file checksum does not match its manifest: ${file.path}`);
    }
  }
  const index = await readFile(join(root, "index.html"), "utf8");
  if (!index.includes(`content="${manifest.marker}"`)) {
    throw new Error("Frontend index does not contain the approved release marker");
  }
}

function assertCandidateManifest(
  value: string,
  reference: ReleaseCandidateArtifactReference
): void {
  let manifest: unknown;
  try {
    manifest = JSON.parse(value);
  } catch {
    throw new Error("Release candidate manifest is invalid JSON");
  }
  const record = asRecord(manifest);
  const compositeDigest = asRecord(record?.["compositeDigest"]);
  const artifacts = asRecord(record?.["artifacts"]);
  const api = asRecord(artifacts?.["api"]);
  const frontend = asRecord(artifacts?.["frontend"]);
  const frontendManifest = asRecord(artifacts?.["frontendManifest"]);
  if (
    record?.["schemaVersion"] !== 1 ||
    record["projectId"] !== reference.projectId ||
    record["candidateId"] !== reference.candidateId ||
    record["commitSha"] !== reference.commitSha ||
    record["configFingerprint"] !== reference.configFingerprint ||
    compositeDigest?.["value"] !== reference.compositeDigest ||
    compositeDigest["apiOciDigest"] !== reference.apiOciDigest ||
    compositeDigest["frontendManifestDigest"] !== reference.frontendManifestDigest ||
    !matchesArtifact(api, {
      objectKey: reference.apiArchiveObjectKey,
      versionId: reference.apiArchiveObjectVersionId,
      byteSize: reference.apiArchiveByteSize,
      sha256: reference.apiArchiveDigest
    }) ||
    api?.["ociManifestDigest"] !== reference.apiOciDigest ||
    !matchesArtifact(frontend, {
      objectKey: reference.frontendArchiveObjectKey,
      versionId: reference.frontendArchiveObjectVersionId,
      byteSize: reference.frontendArchiveByteSize,
      sha256: reference.frontendArchiveDigest
    }) ||
    !matchesArtifact(frontendManifest, {
      objectKey: reference.frontendManifestObjectKey,
      versionId: reference.frontendManifestObjectVersionId,
      sha256: reference.frontendManifestDigest
    })
  ) {
    throw new Error("Release candidate manifest does not match the approved DB snapshot");
  }
}

function matchesArtifact(
  actual: Record<string, unknown> | undefined,
  expected: { objectKey: string; versionId: string; byteSize?: number; sha256: string }
): boolean {
  return Boolean(
    actual &&
      actual["objectKey"] === expected.objectKey &&
      actual["versionId"] === expected.versionId &&
      actual["sha256"] === expected.sha256 &&
      (expected.byteSize === undefined || actual["byteSize"] === expected.byteSize)
  );
}

function validateReference(reference: ReleaseCandidateArtifactReference): void {
  for (const digest of [
    reference.configFingerprint,
    reference.compositeDigest,
    reference.apiOciDigest,
    reference.apiArchiveDigest,
    reference.frontendArchiveDigest,
    reference.frontendManifestDigest,
    reference.frontendIndexDigest
  ]) {
    if (!sha256Pattern.test(digest)) throw new Error("Release candidate contains an invalid digest");
  }
  if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/u.test(reference.commitSha)) {
    throw new Error("Release candidate contains an invalid commit SHA");
  }
  for (const key of [
    reference.apiArchiveObjectKey,
    reference.frontendArchiveObjectKey,
    reference.frontendManifestObjectKey,
    reference.manifestObjectKey
  ]) {
    if (!key.startsWith("deployments/") || !key.includes(`/release-candidates/${reference.candidateId}/`)) {
      throw new Error("Release candidate object key is outside the internal deployment boundary");
    }
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array | string> {
  return Boolean(value && typeof value === "object" && Symbol.asyncIterator in value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
