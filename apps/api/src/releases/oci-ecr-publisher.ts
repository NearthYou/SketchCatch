import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  BatchCheckLayerAvailabilityCommand,
  BatchGetImageCommand,
  CompleteLayerUploadCommand,
  InitiateLayerUploadCommand,
  PutImageCommand,
  UploadLayerPartCommand
} from "@aws-sdk/client-ecr";

const sha256DigestPattern = /^sha256:([0-9a-f]{64})$/u;
const ociManifestMediaType = "application/vnd.oci.image.manifest.v1+json";
const maxBatchCheckLayerCount = 100;
const defaultUploadPartSize = 5 * 1024 * 1024;
const maximumManifestBytes = 10 * 1024 * 1024;

type EcrPublisherCommand =
  | BatchCheckLayerAvailabilityCommand
  | BatchGetImageCommand
  | CompleteLayerUploadCommand
  | InitiateLayerUploadCommand
  | PutImageCommand
  | UploadLayerPartCommand;

export type EcrPublisherClient = {
  send(command: EcrPublisherCommand): Promise<Record<string, unknown>>;
};

export type VerifiedOciBlob = {
  digest: string;
  byteSize: number;
  filePath: string;
};

export type VerifiedOciLayout = {
  manifest: string;
  manifestDigest: string;
  manifestMediaType: typeof ociManifestMediaType;
  blobs: VerifiedOciBlob[];
};

type OciDescriptor = {
  mediaType: string;
  digest: string;
  size: number;
};

type OciManifest = {
  schemaVersion: number;
  mediaType: string;
  config: OciDescriptor;
  layers: OciDescriptor[];
};

type OciIndex = {
  schemaVersion: number;
  manifests: OciDescriptor[];
};

export async function loadVerifiedOciLayout(
  rootDirectory: string,
  expectedManifestDigest: string
): Promise<VerifiedOciLayout> {
  const normalizedExpectedDigest = normalizeSha256Digest(expectedManifestDigest, "expected OCI");
  const layout = parseJsonObject(
    await readFile(join(rootDirectory, "oci-layout"), "utf8"),
    "OCI layout"
  );
  if (layout["imageLayoutVersion"] !== "1.0.0") {
    throw new Error("OCI layout version must be 1.0.0");
  }

  const index = parseOciIndex(await readFile(join(rootDirectory, "index.json"), "utf8"));
  if (index.manifests.length !== 1) {
    throw new Error("OCI index must contain exactly one image manifest");
  }
  const indexDescriptor = index.manifests[0];
  if (!indexDescriptor || indexDescriptor.mediaType !== ociManifestMediaType) {
    throw new Error("OCI index image manifest media type is unsupported");
  }
  const indexedDigest = normalizeSha256Digest(indexDescriptor.digest, "indexed OCI manifest");
  if (indexedDigest !== normalizedExpectedDigest) {
    throw new Error("OCI index manifest digest does not match the approved candidate");
  }

  const manifestBytes = await readVerifiedBlob(
    rootDirectory,
    indexedDigest,
    indexDescriptor.size,
    "OCI manifest",
    maximumManifestBytes
  );
  const manifestText = manifestBytes.toString("utf8");
  const manifest = parseOciManifest(manifestText);
  const descriptors = [manifest.config, ...manifest.layers];
  const seenDigests = new Set<string>();
  const blobs: VerifiedOciBlob[] = [];
  for (const descriptor of descriptors) {
    const digest = normalizeSha256Digest(descriptor.digest, "OCI blob");
    if (seenDigests.has(digest)) {
      throw new Error(`OCI manifest contains duplicate blob digest ${digest}`);
    }
    seenDigests.add(digest);
    await verifyFile(blobFilePath(rootDirectory, digest), digest, descriptor.size, "OCI blob");
    blobs.push({
      digest,
      byteSize: descriptor.size,
      filePath: blobFilePath(rootDirectory, digest)
    });
  }

  return {
    manifest: manifestText,
    manifestDigest: normalizedExpectedDigest,
    manifestMediaType: ociManifestMediaType,
    blobs
  };
}

export async function publishOciLayoutToEcr(
  artifact: VerifiedOciLayout,
  target: { repositoryName: string; imageTag: string },
  client: EcrPublisherClient,
  options: { beforeMutation?: () => Promise<void> } = {}
): Promise<{ imageDigest: string; imageTag: string }> {
  if (!target.repositoryName.trim()) throw new Error("ECR repository name is required");
  if (!target.imageTag.trim()) throw new Error("ECR image tag is required");
  const expectedDigest = normalizeSha256Digest(artifact.manifestDigest, "OCI manifest");
  const existingDigest = await findTaggedImageDigest(
    target.repositoryName,
    target.imageTag,
    client
  );
  if (existingDigest) {
    if (existingDigest === expectedDigest) {
      return { imageDigest: expectedDigest, imageTag: target.imageTag };
    }
    throw immutableTagConflict(target.imageTag, existingDigest, expectedDigest);
  }
  const missingDigests = await findMissingBlobDigests(
    target.repositoryName,
    artifact.blobs.map((blob) => blob.digest),
    client
  );

  for (const blob of artifact.blobs) {
    if (!missingDigests.has(blob.digest)) continue;
    await uploadBlob(target.repositoryName, blob, client, options.beforeMutation);
  }

  await options.beforeMutation?.();
  let response: Record<string, unknown>;
  try {
    response = await client.send(
      new PutImageCommand({
        repositoryName: target.repositoryName,
        imageManifest: artifact.manifest,
        imageManifestMediaType: artifact.manifestMediaType,
        imageTag: target.imageTag
      })
    );
  } catch (error) {
    if (!isImmutableTagAlreadyExists(error)) throw error;
    const racedDigest = await findTaggedImageDigest(
      target.repositoryName,
      target.imageTag,
      client
    );
    if (racedDigest === expectedDigest) {
      return { imageDigest: expectedDigest, imageTag: target.imageTag };
    }
    throw immutableTagConflict(target.imageTag, racedDigest, expectedDigest);
  }
  const image = asRecord(response["image"]);
  const imageId = asRecord(image?.["imageId"]);
  const publishedDigest = imageId?.["imageDigest"];
  if (publishedDigest !== expectedDigest) {
    throw new Error(
      `ECR returned an unexpected image digest: expected ${expectedDigest}, received ${String(publishedDigest)}`
    );
  }
  return { imageDigest: expectedDigest, imageTag: target.imageTag };
}

async function findTaggedImageDigest(
  repositoryName: string,
  imageTag: string,
  client: EcrPublisherClient
): Promise<string | null> {
  const response = await client.send(
    new BatchGetImageCommand({
      repositoryName,
      imageIds: [{ imageTag }],
      acceptedMediaTypes: [ociManifestMediaType]
    })
  );
  const failures = Array.isArray(response["failures"]) ? response["failures"] : [];
  for (const value of failures) {
    const failure = asRecord(value);
    if (failure?.["failureCode"] !== "ImageNotFound") {
      throw new Error(`ECR could not verify immutable image tag ${imageTag}`);
    }
  }
  const images = Array.isArray(response["images"]) ? response["images"] : [];
  if (images.length === 0) return null;
  if (images.length !== 1) {
    throw new Error(`ECR returned multiple images for immutable tag ${imageTag}`);
  }
  const imageId = asRecord(asRecord(images[0])?.["imageId"]);
  const digest = imageId?.["imageDigest"];
  if (typeof digest !== "string") {
    throw new Error(`ECR did not return an image digest for immutable tag ${imageTag}`);
  }
  return normalizeSha256Digest(digest, "ECR tagged image");
}

function isImmutableTagAlreadyExists(error: unknown): boolean {
  return error instanceof Error && error.name === "ImageTagAlreadyExistsException";
}

function immutableTagConflict(
  imageTag: string,
  actualDigest: string | null,
  expectedDigest: string
): Error {
  return new Error(
    `ECR immutable tag ${imageTag} already points to a different image digest: ` +
      `expected ${expectedDigest}, received ${actualDigest ?? "unknown"}`
  );
}

async function findMissingBlobDigests(
  repositoryName: string,
  digests: string[],
  client: EcrPublisherClient
): Promise<Set<string>> {
  const missing = new Set<string>();
  for (let offset = 0; offset < digests.length; offset += maxBatchCheckLayerCount) {
    const batch = digests.slice(offset, offset + maxBatchCheckLayerCount);
    const response = await client.send(
      new BatchCheckLayerAvailabilityCommand({ repositoryName, layerDigests: batch })
    );
    const failures = Array.isArray(response["failures"]) ? response["failures"] : [];
    if (failures.length > 0) {
      throw new Error("ECR failed to check one or more OCI blobs");
    }
    const layers = Array.isArray(response["layers"]) ? response["layers"] : [];
    const availabilityByDigest = new Map<string, string>();
    for (const value of layers) {
      const layer = asRecord(value);
      if (typeof layer?.["layerDigest"] !== "string") continue;
      availabilityByDigest.set(
        normalizeSha256Digest(layer["layerDigest"], "ECR layer"),
        String(layer["layerAvailability"])
      );
    }
    for (const digest of batch) {
      const availability = availabilityByDigest.get(digest);
      if (availability === "AVAILABLE") continue;
      if (availability === "MISSING") {
        missing.add(digest);
        continue;
      }
      throw new Error(`ECR did not return layer availability for ${digest}`);
    }
  }
  return missing;
}

async function uploadBlob(
  repositoryName: string,
  blob: VerifiedOciBlob,
  client: EcrPublisherClient,
  beforeMutation: (() => Promise<void>) | undefined
): Promise<void> {
  await verifyFile(blob.filePath, blob.digest, blob.byteSize, "OCI blob");
  await beforeMutation?.();
  const initiate = await client.send(new InitiateLayerUploadCommand({ repositoryName }));
  const uploadId = initiate["uploadId"];
  if (typeof uploadId !== "string" || uploadId.length === 0) {
    throw new Error(`ECR did not return an upload ID for ${blob.digest}`);
  }
  const returnedPartSize = initiate["partSize"];
  const partSize =
    typeof returnedPartSize === "number" && Number.isSafeInteger(returnedPartSize) && returnedPartSize > 0
      ? returnedPartSize
      : defaultUploadPartSize;
  let offset = 0;
  for await (const value of createReadStream(blob.filePath, { highWaterMark: partSize })) {
    const contents = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const endExclusive = offset + contents.byteLength;
    await beforeMutation?.();
    await client.send(
      new UploadLayerPartCommand({
        repositoryName,
        uploadId,
        partFirstByte: offset,
        partLastByte: endExclusive - 1,
        layerPartBlob: contents
      })
    );
    offset = endExclusive;
  }
  if (offset !== blob.byteSize) {
    throw new Error(`OCI blob size changed during ECR upload: ${blob.digest}`);
  }
  await beforeMutation?.();
  await client.send(
    new CompleteLayerUploadCommand({
      repositoryName,
      uploadId,
      layerDigests: [blob.digest]
    })
  );
}

async function readVerifiedBlob(
  rootDirectory: string,
  digest: string,
  expectedSize: number,
  label: string,
  maximumBytes: number
): Promise<Buffer> {
  if (expectedSize > maximumBytes) {
    throw new Error(`${label} exceeds the maximum readable size`);
  }
  const filePath = blobFilePath(rootDirectory, digest);
  await verifyFile(filePath, digest, expectedSize, label);
  return readFile(filePath);
}

async function verifyFile(
  filePath: string,
  digest: string,
  expectedSize: number,
  label: string
): Promise<void> {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
    throw new Error(`${label} size is invalid`);
  }
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size !== expectedSize) {
    throw new Error(`${label} size does not match its descriptor`);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  if (`sha256:${hash.digest("hex")}` !== digest) {
    throw new Error(`${label} digest does not match its descriptor`);
  }
}

function blobFilePath(rootDirectory: string, digest: string): string {
  const match = sha256DigestPattern.exec(digest);
  if (!match?.[1]) throw new Error("OCI blob digest must use sha256");
  return join(rootDirectory, "blobs", "sha256", match[1]);
}

function parseOciIndex(contents: string): OciIndex {
  const value = parseJsonObject(contents, "OCI index");
  if (value["schemaVersion"] !== 2 || !Array.isArray(value["manifests"])) {
    throw new Error("OCI index is invalid");
  }
  return {
    schemaVersion: 2,
    manifests: value["manifests"].map((descriptor) => parseDescriptor(descriptor, "OCI index"))
  };
}

function parseOciManifest(contents: string): OciManifest {
  const value = parseJsonObject(contents, "OCI manifest");
  if (
    value["schemaVersion"] !== 2 ||
    value["mediaType"] !== ociManifestMediaType ||
    !Array.isArray(value["layers"])
  ) {
    throw new Error("OCI image manifest is invalid");
  }
  return {
    schemaVersion: 2,
    mediaType: ociManifestMediaType,
    config: parseDescriptor(value["config"], "OCI config"),
    layers: value["layers"].map((descriptor) => parseDescriptor(descriptor, "OCI layer"))
  };
}

function parseDescriptor(value: unknown, label: string): OciDescriptor {
  const descriptor = asRecord(value);
  if (
    !descriptor ||
    typeof descriptor["mediaType"] !== "string" ||
    typeof descriptor["digest"] !== "string" ||
    typeof descriptor["size"] !== "number" ||
    !Number.isSafeInteger(descriptor["size"]) ||
    descriptor["size"] < 0
  ) {
    throw new Error(`${label} descriptor is invalid`);
  }
  normalizeSha256Digest(descriptor["digest"], label);
  return {
    mediaType: descriptor["mediaType"],
    digest: descriptor["digest"],
    size: descriptor["size"]
  };
}

function parseJsonObject(contents: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(contents) as unknown;
    const object = asRecord(parsed);
    if (!object) throw new Error("not an object");
    return object;
  } catch {
    throw new Error(`${label} JSON is invalid`);
  }
}

function normalizeSha256Digest(value: string, label: string): string {
  const normalized = value.startsWith("sha256:") ? value : `sha256:${value}`;
  if (!sha256DigestPattern.test(normalized)) {
    throw new Error(`${label} digest must be a lowercase sha256 digest`);
  }
  return normalized;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
