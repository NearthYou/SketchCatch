import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CreateInvalidationCommand,
  GetInvalidationCommand
} from "@aws-sdk/client-cloudfront";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { FrontendReleaseEvidence, JsonValue } from "@sketchcatch/types";
import type { FrontendArtifactManifest } from "./release-candidate-service.js";

type AwsFrontendCommandClient = {
  send(command: { input: object }): Promise<Record<string, unknown>>;
};

export type ActivateFrontendReleaseInput = {
  candidateId: string;
  commitSha: string;
  frontendDirectory: string;
  manifest: FrontendArtifactManifest;
  bucketName: string;
  cloudFrontDistributionId: string;
};

export type FrontendUploadEvidence = {
  manifestObjectKey: string;
  manifestVersionId: string;
};

export type FrontendActivationEvidence = FrontendUploadEvidence & {
  indexObjectKey: "index.html";
  indexVersionId: string;
  commitMarker: string;
};

export async function activateFrontendRelease(
  input: ActivateFrontendReleaseInput,
  clients: { s3: AwsFrontendCommandClient; cloudFront: AwsFrontendCommandClient },
  options: {
    createInvalidationReference?: () => string;
    wait?: (milliseconds: number) => Promise<void>;
    beforeMutation?: () => Promise<void>;
  } = {}
): Promise<FrontendReleaseEvidence> {
  const upload = await uploadFrontendReleaseAssets(input, clients.s3, options);
  const activation = await activateFrontendReleaseIndex(input, upload, clients.s3, options);
  return invalidateFrontendRelease(input, activation, clients.cloudFront, options);
}

export async function uploadFrontendReleaseAssets(
  input: ActivateFrontendReleaseInput,
  s3: AwsFrontendCommandClient,
  options: { beforeMutation?: () => Promise<void> } = {}
): Promise<FrontendUploadEvidence> {
  const marker = `${input.commitSha}:${input.candidateId}`;
  if (input.manifest.marker !== marker) {
    throw new Error("Frontend manifest marker does not match the release candidate");
  }
  const nonIndexFiles = input.manifest.files.filter((file) => file.path !== "index.html");
  for (const file of nonIndexFiles) {
    await putVersionedFrontendObject(input, file, s3, undefined, options.beforeMutation);
  }

  const manifestObjectKey = `.sketchcatch/releases/${input.candidateId}/frontend-manifest.json`;
  const manifestBody = JSON.stringify(input.manifest);
  await options.beforeMutation?.();
  const manifestResult = await s3.send(
    new PutObjectCommand({
      Bucket: input.bucketName,
      Key: manifestObjectKey,
      Body: manifestBody,
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-store",
      ChecksumSHA256: sha256Base64(manifestBody),
      Metadata: releaseMetadata(input)
    })
  );
  const manifestVersionId = requireVersionId(manifestResult, manifestObjectKey);
  return { manifestObjectKey, manifestVersionId };
}

export async function activateFrontendReleaseIndex(
  input: ActivateFrontendReleaseInput,
  upload: FrontendUploadEvidence,
  s3: AwsFrontendCommandClient,
  options: { beforeMutation?: () => Promise<void> } = {}
): Promise<FrontendActivationEvidence> {
  const index = input.manifest.files.find((file) => file.path === "index.html");
  if (!index) throw new Error("Frontend manifest does not contain index.html");
  const indexResult = await putVersionedFrontendObject(
    input,
    index,
    s3,
    "no-cache",
    options.beforeMutation
  );
  const indexVersionId = requireVersionId(indexResult, "index.html");
  return {
    ...upload,
    indexObjectKey: "index.html",
    indexVersionId,
    commitMarker: `${input.commitSha}:${input.candidateId}`
  };
}

export async function invalidateFrontendRelease(
  input: ActivateFrontendReleaseInput,
  activation: FrontendActivationEvidence,
  cloudFront: AwsFrontendCommandClient,
  options: {
    createInvalidationReference?: () => string;
    wait?: (milliseconds: number) => Promise<void>;
    beforeMutation?: () => Promise<void>;
  } = {}
): Promise<FrontendReleaseEvidence> {
  await options.beforeMutation?.();
  const invalidation = await cloudFront.send(
    new CreateInvalidationCommand({
      DistributionId: input.cloudFrontDistributionId,
      InvalidationBatch: {
        CallerReference:
          options.createInvalidationReference?.() ??
          `sketchcatch-${input.candidateId}-${randomUUID()}`,
        Paths: { Quantity: 1, Items: ["/*"] }
      }
    })
  );
  const invalidationId = asRecord(invalidation["Invalidation"])?.["Id"];
  if (typeof invalidationId !== "string" || !invalidationId) {
    throw new Error("CloudFront did not return an invalidation ID");
  }
  await waitForInvalidation(
    cloudFront,
    input.cloudFrontDistributionId,
    invalidationId,
    options.wait ?? defaultWait
  );

  return {
    ...activation,
    invalidationId,
  };
}

export async function verifyPublicFrontendRelease(
  input: {
    outputUrl: string;
    expectedMarker: string;
    healthPath: string;
    apiProbePath: string;
    apiProbeMethod?: "GET" | "POST";
    apiProbeExpectedStatus?: number;
  },
  request: typeof fetch = fetch,
  options: {
    wait?: (milliseconds: number) => Promise<void>;
    maxApiProbeAttempts?: number;
  } = {}
): Promise<JsonValue> {
  const base = new URL(input.outputUrl);
  if (base.protocol !== "https:") throw new Error("Public release URL must use HTTPS");
  const indexResponse = await request(new URL("/", base), {
    headers: { "cache-control": "no-cache" },
    redirect: "error"
  });
  const indexBody = await indexResponse.text();
  if (!indexResponse.ok || !indexBody.includes(`content="${input.expectedMarker}"`)) {
    throw new Error("CloudFront root does not contain the expected release marker");
  }
  const healthUrl = new URL(normalizePublicPath(input.healthPath), base);
  const healthResponse = await request(healthUrl, { redirect: "error" });
  if (!healthResponse.ok) throw new Error(`Public health probe failed with ${healthResponse.status}`);
  const apiUrl = new URL(normalizeApiProbePath(input.apiProbePath), base);
  const apiProbeMethod = input.apiProbeMethod ?? "GET";
  const apiProbeExpectedStatus = input.apiProbeExpectedStatus ?? 200;
  const apiProbeStatus = await verifyPublicApiProbe(
    {
      apiUrl,
      apiProbePath: input.apiProbePath,
      apiProbeMethod,
      apiProbeExpectedStatus
    },
    request,
    options
  );
  return {
    state: "healthy",
    outputUrl: base.toString(),
    marker: input.expectedMarker,
    healthPath: healthUrl.pathname,
    apiProbePath: apiUrl.pathname,
    apiProbeMethod,
    apiProbeStatus,
    verifiedAt: new Date().toISOString()
  };
}

async function verifyPublicApiProbe(
  input: {
    apiUrl: URL;
    apiProbePath: string;
    apiProbeMethod: "GET" | "POST";
    apiProbeExpectedStatus: number;
  },
  request: typeof fetch,
  options: {
    wait?: (milliseconds: number) => Promise<void>;
    maxApiProbeAttempts?: number;
  }
): Promise<number> {
  const maxAttempts = options.maxApiProbeAttempts ?? 12;
  const wait = options.wait ?? defaultWait;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await request(input.apiUrl, {
        method: input.apiProbeMethod,
        redirect: "error",
        ...(input.apiProbeMethod === "POST"
          ? { headers: { "content-type": "application/json" }, body: "{}" }
          : {})
      });
      if (!response.ok || response.status !== input.apiProbeExpectedStatus) {
        throw new Error(`Public API route probe failed with ${response.status}`);
      }
      const body = await readJsonRecord(response);
      if (
        input.apiProbeMethod === "POST" &&
        input.apiProbePath === "/api/check-ins" &&
        (!isUuid(body?.["sessionId"]) || !isIsoTimestamp(body?.["expiresAt"]))
      ) {
        throw new Error("Public API route probe response does not match the demo API contract");
      }
      return response.status;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Public API route probe failed");
    }
    if (attempt + 1 < maxAttempts) await wait(5_000);
  }
  throw lastError ?? new Error("Public API route probe failed");
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await response.json() as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isUuid(value: unknown): boolean {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isIsoTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

async function putVersionedFrontendObject(
  input: ActivateFrontendReleaseInput,
  file: FrontendArtifactManifest["files"][number],
  s3: AwsFrontendCommandClient,
  cacheControl = cacheControlForPath(file.path),
  beforeMutation?: () => Promise<void>
): Promise<Record<string, unknown>> {
  const body = await readFile(join(input.frontendDirectory, ...file.path.split("/")));
  const digest = createHash("sha256").update(body).digest("hex");
  if (body.byteLength !== file.size || digest !== file.sha256) {
    throw new Error(`Frontend file changed after candidate verification: ${file.path}`);
  }
  await beforeMutation?.();
  const response = await s3.send(
    new PutObjectCommand({
      Bucket: input.bucketName,
      Key: file.path,
      Body: body,
      ContentType: file.contentType,
      CacheControl: cacheControl,
      ChecksumSHA256: createHash("sha256").update(body).digest("base64"),
      Metadata: releaseMetadata(input)
    })
  );
  requireVersionId(response, file.path);
  return response;
}

async function waitForInvalidation(
  cloudFront: AwsFrontendCommandClient,
  distributionId: string,
  invalidationId: string,
  wait: (milliseconds: number) => Promise<void>
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await cloudFront.send(
      new GetInvalidationCommand({ DistributionId: distributionId, Id: invalidationId })
    );
    const status = asRecord(response["Invalidation"])?.["Status"];
    if (status === "Completed") return;
    if (typeof status !== "string" || !status) {
      throw new Error("CloudFront invalidation status is unavailable");
    }
    await wait(5_000);
  }
  throw new Error("CloudFront invalidation did not complete before the timeout");
}

function releaseMetadata(input: ActivateFrontendReleaseInput): Record<string, string> {
  return {
    "sketchcatch-commit": input.commitSha,
    "sketchcatch-candidate": input.candidateId
  };
}

function requireVersionId(response: Record<string, unknown>, objectKey: string): string {
  const versionId = response["VersionId"];
  if (typeof versionId !== "string" || !versionId) {
    throw new Error(`S3 bucket versioning is required for frontend object ${objectKey}`);
  }
  return versionId;
}

function cacheControlForPath(path: string): string {
  return /(?:^|[._-])[0-9a-f]{8,}(?:[._-]|$)/iu.test(path)
    ? "public,max-age=31536000,immutable"
    : "no-cache";
}

function sha256Base64(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

function normalizePublicPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new Error("Public health path is invalid");
  }
  return value;
}

function normalizeApiProbePath(value: string): string {
  const path = normalizePublicPath(value);
  if (path !== "/api" && !path.startsWith("/api/")) {
    throw new Error("Public API probe path must use the /api route");
  }
  return path;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function defaultWait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
