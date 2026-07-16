import { randomUUID } from "node:crypto";
import {
  CloudFrontClient,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  GetInvalidationCommand
} from "@aws-sdk/client-cloudfront";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { and, eq, sql } from "drizzle-orm";
import type {
  GitCicdPipelineRunStatus,
  StaticSiteGitOpsReleaseEvidence,
  StaticSiteRuntimeConfig
} from "@sketchcatch/types";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  awsConnections,
  projectDeploymentTargets
} from "../db/schema.js";
import { resolveApplicationReleaseVersion } from "../releases/application-release-identity.js";

export type StaticSiteGitOpsReleaseRecord = typeof applicationReleases.$inferSelect;

export type StaticSiteGitOpsVerificationTarget = {
  projectId: string;
  connection: {
    roleArn: string;
    externalId: string;
    region: string;
  };
  runtimeConfig: StaticSiteRuntimeConfig;
};

export type StaticSiteGitOpsObservedState = {
  manifestVersionId: string;
  manifestDigest: string;
  manifestFileCount: number;
  releaseObjectCount: number;
  distributionStatus: string;
  distributionEnabled: boolean;
  distributionEtag: string;
  distributionDomainName: string;
  distributionAliases: string[];
  originPath: string;
  originDomainName: string;
  invalidationStatus: string | null;
};

export type StaticSiteGitOpsReleaseRepository = {
  findVerificationTarget(
    projectId: string
  ): Promise<StaticSiteGitOpsVerificationTarget | undefined>;
  upsertRelease(input: StaticSiteGitOpsReleaseRecord): Promise<StaticSiteGitOpsReleaseRecord>;
};

export type StaticSiteGitOpsCloudGateway = {
  inspect(input: {
    roleArn: string;
    externalId: string;
    region: string;
    hostingBucketName: string;
    cloudFrontDistributionId: string;
    cloudFrontOriginId: string;
    outputUrl: string;
    commitSha: string;
    releasePrefix: string;
    manifestVersionId: string;
    invalidationId: string | null;
  }): Promise<StaticSiteGitOpsObservedState>;
};

export type StaticSiteGitOpsReleaseReconcileInput = {
  projectId: string;
  pipelineRunId: string;
  commitSha: string;
  pipelineStatus: GitCicdPipelineRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  evidence: StaticSiteGitOpsReleaseEvidence;
};

export type StaticSiteGitOpsReleaseReconciler = {
  reconcile(
    input: StaticSiteGitOpsReleaseReconcileInput
  ): Promise<StaticSiteGitOpsReleaseRecord | null>;
};

export class StaticSiteGitOpsReleaseVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaticSiteGitOpsReleaseVerificationError";
  }
}

export function createStaticSiteGitOpsReleaseReconciler(options: {
  repository: StaticSiteGitOpsReleaseRepository;
  gateway: StaticSiteGitOpsCloudGateway;
  createId?: () => string;
  now?: () => Date;
}): StaticSiteGitOpsReleaseReconciler {
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  return {
    async reconcile(input) {
      const target = await options.repository.findVerificationTarget(input.projectId);
      if (!target) {
        throw new StaticSiteGitOpsReleaseVerificationError(
          "Verified static site deployment target not found"
        );
      }
      validateEvidenceAgainstTarget(input, target);
      let observed: StaticSiteGitOpsObservedState;
      try {
        observed = await options.gateway.inspect({
          ...target.connection,
          hostingBucketName: target.runtimeConfig.hostingBucketName,
          cloudFrontDistributionId: target.runtimeConfig.cloudFrontDistributionId,
          cloudFrontOriginId: target.runtimeConfig.cloudFrontOriginId,
          outputUrl: target.runtimeConfig.outputUrl,
          commitSha: input.commitSha,
          releasePrefix: input.evidence.releasePrefix,
          manifestVersionId: input.evidence.manifestVersionId,
          invalidationId: input.evidence.invalidationId
        });
      } catch (error) {
        throw new StaticSiteGitOpsReleaseVerificationError(
          `Failed to inspect S3/CloudFront release state: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      validateObservedState(input.evidence, observed, target.runtimeConfig);

      const timestamp = now();
      const succeeded = input.evidence.outcome === "succeeded";
      return options.repository.upsertRelease({
        id: createId(),
        projectId: input.projectId,
        deploymentId: null,
        pipelineRunId: input.pipelineRunId,
        source: "gitops",
        runtimeTargetKind: "static_site",
        version: resolveApplicationReleaseVersion({ commitSha: input.commitSha }),
        commitSha: input.commitSha.toLowerCase(),
        artifactDigestAlgorithm: "sha256",
        artifactDigest: input.evidence.artifactDigest.slice("sha256:".length),
        releaseCandidateId: null,
        compositeDigest: null,
        providerRevision: {
          provider: "aws",
          resourceType: "cloudfront_distribution",
          revisionId: `${input.evidence.cloudFrontDistributionId}:${observed.distributionEtag}`,
          artifactReference: input.evidence.manifestUri,
          metadata: {
            hostingBucketName: input.evidence.hostingBucketName,
            releasePrefix: input.evidence.releasePrefix,
            activeReleasePrefix: input.evidence.activeReleasePrefix,
            manifestVersionId: input.evidence.manifestVersionId,
            cloudFrontOriginId: input.evidence.cloudFrontOriginId,
            invalidationId: input.evidence.invalidationId,
            fileCount: observed.manifestFileCount
          }
        },
        frontendEvidence: null,
        failureStage: null,
        baselineReleaseId: null,
        outputUrl: input.evidence.outputUrl,
        status: succeeded ? "succeeded" : "failed",
        healthEvidence: {
          state: succeeded ? "healthy" : "restored",
          distributionStatus: observed.distributionStatus,
          originPath: observed.originPath,
          invalidationStatus: observed.invalidationStatus,
          verifiedAt: timestamp.toISOString()
        },
        rollbackEvidence: succeeded
          ? null
          : {
              attemptedReleasePrefix: input.evidence.releasePrefix,
              restoredReleasePrefix: input.evidence.previousReleasePrefix,
              reason: input.evidence.failureReason,
              invalidationId: input.evidence.invalidationId
            },
        startedAt: input.startedAt,
        completedAt: input.finishedAt,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  };
}

function validateEvidenceAgainstTarget(
  input: StaticSiteGitOpsReleaseReconcileInput,
  target: StaticSiteGitOpsVerificationTarget
): void {
  const evidence = input.evidence;
  const runtime = target.runtimeConfig;
  const digest = evidence.artifactDigest.slice("sha256:".length);
  const expectedPrefix = `releases/${input.commitSha.toLowerCase()}/${digest}`;
  const expectedManifest =
    `s3://${runtime.hostingBucketName}/${expectedPrefix}/.sketchcatch-release-manifest.json`;
  const expectedActivePrefix =
    evidence.outcome === "succeeded" ? evidence.releasePrefix : evidence.previousReleasePrefix;
  if (
    evidence.commitSha.toLowerCase() !== input.commitSha.toLowerCase() ||
    evidence.hostingBucketName !== runtime.hostingBucketName ||
    evidence.cloudFrontDistributionId !== runtime.cloudFrontDistributionId ||
    evidence.cloudFrontOriginId !== runtime.cloudFrontOriginId ||
    evidence.outputUrl !== runtime.outputUrl ||
    !/^sha256:[a-f\d]{64}$/.test(evidence.artifactDigest) ||
    evidence.releasePrefix !== expectedPrefix ||
    evidence.manifestUri !== expectedManifest ||
    evidence.activeReleasePrefix !== expectedActivePrefix ||
    (evidence.outcome === "succeeded" && input.pipelineStatus !== "succeeded") ||
    (evidence.outcome === "failed" && input.pipelineStatus !== "failed")
  ) {
    throw new StaticSiteGitOpsReleaseVerificationError(
      "Pipeline evidence does not match the confirmed static site deployment target"
    );
  }
}

function validateObservedState(
  evidence: StaticSiteGitOpsReleaseEvidence,
  observed: StaticSiteGitOpsObservedState,
  runtime: StaticSiteRuntimeConfig
): void {
  const expectedOriginPath = evidence.activeReleasePrefix
    ? `/${evidence.activeReleasePrefix}`
    : "";
  const outputHost = new URL(runtime.outputUrl).hostname.toLowerCase();
  const allowedHosts = new Set([
    observed.distributionDomainName.toLowerCase(),
    ...observed.distributionAliases.map((item) => item.toLowerCase())
  ]);
  if (
    observed.manifestVersionId !== evidence.manifestVersionId ||
    observed.manifestDigest !== evidence.artifactDigest.slice("sha256:".length) ||
    observed.manifestFileCount !== evidence.fileCount ||
    observed.releaseObjectCount !== evidence.fileCount + 1 ||
    observed.distributionStatus !== "Deployed" ||
    !observed.distributionEnabled ||
    observed.distributionEtag !== evidence.distributionEtag ||
    observed.originPath !== expectedOriginPath ||
    observed.invalidationStatus !== (evidence.invalidationId ? "Completed" : null) ||
    !allowedHosts.has(outputHost) ||
    !isConfiguredS3Origin(observed.originDomainName, runtime.hostingBucketName)
  ) {
    throw new StaticSiteGitOpsReleaseVerificationError(
      "Observed S3/CloudFront state does not match immutable static release evidence"
    );
  }
}

function isConfiguredS3Origin(domainName: string, bucketName: string): boolean {
  const domain = domainName.toLowerCase().replace(/\.$/, "");
  const allowedSuffix =
    domain.endsWith(".amazonaws.com") || domain.endsWith(".amazonaws.com.cn");
  return domain === `${bucketName}.s3.amazonaws.com` ||
    domain === `${bucketName}.s3.amazonaws.com.cn` ||
    (domain.startsWith(`${bucketName}.s3.`) && allowedSuffix);
}

export function createPostgresStaticSiteGitOpsReleaseRepository(
  db: Database
): StaticSiteGitOpsReleaseRepository {
  return {
    async findVerificationTarget(projectId) {
      const [row] = await db
        .select({
          projectId: projectDeploymentTargets.projectId,
          runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
          runtimeConfig: projectDeploymentTargets.runtimeConfig,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region
        })
        .from(projectDeploymentTargets)
        .innerJoin(
          awsConnections,
          eq(awsConnections.id, projectDeploymentTargets.connectionId)
        )
        .where(
          and(
            eq(projectDeploymentTargets.projectId, projectId),
            eq(projectDeploymentTargets.runtimeTargetKind, "static_site"),
            eq(awsConnections.status, "verified")
          )
        );
      if (
        !row?.roleArn ||
        row.runtimeTargetKind !== "static_site" ||
        row.runtimeConfig?.runtimeTargetKind !== "static_site"
      ) return undefined;
      return {
        projectId: row.projectId,
        connection: {
          roleArn: row.roleArn,
          externalId: row.externalId,
          region: row.region
        },
        runtimeConfig: row.runtimeConfig
      };
    },
    async upsertRelease(input) {
      const [release] = await db
        .insert(applicationReleases)
        .values(input)
        .onConflictDoUpdate({
          target: applicationReleases.pipelineRunId,
          targetWhere: sql`${applicationReleases.pipelineRunId} is not null`,
          set: {
            version: input.version,
            commitSha: input.commitSha,
            artifactDigest: input.artifactDigest,
            providerRevision: input.providerRevision,
            outputUrl: input.outputUrl,
            status: input.status,
            healthEvidence: input.healthEvidence,
            rollbackEvidence: input.rollbackEvidence,
            startedAt: input.startedAt,
            completedAt: input.completedAt,
            updatedAt: input.updatedAt
          }
        })
        .returning();
      if (!release) throw new Error("Static site GitOps release was not persisted");
      return release;
    }
  };
}

export function createAwsStaticSiteGitOpsCloudGateway(options: {
  stsGateway?: Pick<AwsConnectionStsGateway, "assumeRole">;
  createS3Client?: (configuration: ConstructorParameters<typeof S3Client>[0]) => S3Client;
  createCloudFrontClient?: (
    configuration: ConstructorParameters<typeof CloudFrontClient>[0]
  ) => CloudFrontClient;
} = {}): StaticSiteGitOpsCloudGateway {
  return {
    async inspect(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      let s3Client: S3Client | undefined;
      let cloudFrontClient: CloudFrontClient | undefined;
      try {
        const credentials = await (options.stsGateway ?? createAwsSdkStsGateway()).assumeRole({
          roleArn: input.roleArn,
          externalId: input.externalId,
          region: input.region,
          roleSessionName: `sketchcatch-static-release-${randomUUID()}`,
          abortSignal: controller.signal
        });
        const configuration = { region: input.region, credentials };
        s3Client = options.createS3Client?.(configuration) ?? new S3Client(configuration);
        cloudFrontClient = options.createCloudFrontClient?.(configuration) ??
          new CloudFrontClient(configuration);
        const manifestKey = `${input.releasePrefix}/.sketchcatch-release-manifest.json`;
        const [manifestHead, manifestObject, distributionConfig, distribution, invalidation] =
          await Promise.all([
            s3Client.send(
              new HeadObjectCommand({
                Bucket: input.hostingBucketName,
                Key: manifestKey,
                VersionId: input.manifestVersionId,
                ChecksumMode: "ENABLED"
              }),
              { abortSignal: controller.signal }
            ),
            s3Client.send(
              new GetObjectCommand({
                Bucket: input.hostingBucketName,
                Key: manifestKey,
                VersionId: input.manifestVersionId
              }),
              { abortSignal: controller.signal }
            ),
            cloudFrontClient.send(
              new GetDistributionConfigCommand({ Id: input.cloudFrontDistributionId }),
              { abortSignal: controller.signal }
            ),
            cloudFrontClient.send(
              new GetDistributionCommand({ Id: input.cloudFrontDistributionId }),
              { abortSignal: controller.signal }
            ),
            input.invalidationId
              ? cloudFrontClient.send(
                  new GetInvalidationCommand({
                    DistributionId: input.cloudFrontDistributionId,
                    Id: input.invalidationId
                  }),
                  { abortSignal: controller.signal }
                )
              : Promise.resolve(null)
          ]);

        if (
          Number(manifestHead.ContentLength ?? 0) > 16_000_000 ||
          Number(manifestObject.ContentLength ?? 0) > 16_000_000
        ) {
          throw new StaticSiteGitOpsReleaseVerificationError(
            "Static release manifest is too large"
          );
        }
        const manifest = parseManifest(await readSdkBody(manifestObject.Body), input.commitSha);
        const listedKeys = await listReleaseKeys(
          s3Client,
          input.hostingBucketName,
          input.releasePrefix,
          controller.signal
        );
        const expectedKeys = new Set([
          ...manifest.paths.map((path) => `${input.releasePrefix}/${path}`),
          manifestKey
        ]);
        if (
          listedKeys.length !== expectedKeys.size ||
          listedKeys.some((key) => !expectedKeys.has(key))
        ) {
          throw new StaticSiteGitOpsReleaseVerificationError(
            "Versioned S3 release objects do not match the immutable manifest"
          );
        }
        const config = distributionConfig.DistributionConfig;
        const origins = config?.Origins?.Items ?? [];
        const matchingOrigins = origins.filter((item) => item.Id === input.cloudFrontOriginId);
        const origin = matchingOrigins[0];
        const checksum = manifestHead.ChecksumSHA256;
        const checksumBytes = checksum ? Buffer.from(checksum, "base64") : Buffer.alloc(0);
        if (
          manifestHead.VersionId !== input.manifestVersionId ||
          checksumBytes.byteLength !== 32 ||
          !config ||
          matchingOrigins.length !== 1 ||
          !origin?.S3OriginConfig ||
          !distributionConfig.ETag ||
          !distribution.Distribution?.Status ||
          !distribution.Distribution.DomainName
        ) {
          throw new StaticSiteGitOpsReleaseVerificationError(
            "S3 or CloudFront release state was incomplete"
          );
        }
        return {
          manifestVersionId: manifestHead.VersionId,
          manifestDigest: checksumBytes.toString("hex"),
          manifestFileCount: manifest.paths.length,
          releaseObjectCount: listedKeys.length,
          distributionStatus: distribution.Distribution.Status,
          distributionEnabled: config.Enabled === true,
          distributionEtag: distributionConfig.ETag,
          distributionDomainName: distribution.Distribution.DomainName,
          distributionAliases: config.Aliases?.Items ?? [],
          originPath: origin.OriginPath ?? "",
          originDomainName: origin.DomainName ?? "",
          invalidationStatus: invalidation?.Invalidation?.Status ?? null
        };
      } finally {
        s3Client?.destroy();
        cloudFrontClient?.destroy();
        clearTimeout(timeout);
      }
    }
  };
}

function parseManifest(value: string, commitSha: string): { paths: string[] } {
  if (Buffer.byteLength(value, "utf8") > 16_000_000) {
    throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest is too large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest is invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest is invalid");
  }
  const item = parsed as Record<string, unknown>;
  if (
    Object.keys(item).some((key) => !["schemaVersion", "commitSha", "files"].includes(key)) ||
    item.schemaVersion !== 1 ||
    String(item.commitSha).toLowerCase() !== commitSha.toLowerCase() ||
    !Array.isArray(item.files) ||
    item.files.length < 1 ||
    item.files.length > 10_000
  ) {
    throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest is incomplete");
  }
  const paths = item.files.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest entry is invalid");
    }
    const file = entry as Record<string, unknown>;
    const path = String(file.path ?? "");
    if (
      Object.keys(file).some((key) => !["path", "size", "sha256"].includes(key)) ||
      !isSafeRelativePath(path) ||
      !Number.isInteger(file.size) ||
      Number(file.size) < 0 ||
      !/^[a-f\d]{64}$/.test(String(file.sha256 ?? ""))
    ) {
      throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest entry is unsafe");
    }
    return path;
  });
  if (new Set(paths).size !== paths.length || !paths.includes("index.html")) {
    throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest paths are invalid");
  }
  return { paths };
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 &&
    path.length <= 1_024 &&
    !path.includes("\\") &&
    !path.startsWith("/") &&
    !path.includes("\0") &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

async function readSdkBody(body: unknown): Promise<string> {
  if (!body || typeof body !== "object" || !("transformToString" in body)) {
    throw new StaticSiteGitOpsReleaseVerificationError("Static release manifest body is missing");
  }
  const transform = (body as { transformToString(): Promise<string> }).transformToString;
  return transform.call(body);
}

async function listReleaseKeys(
  client: S3Client,
  bucket: string,
  prefix: string,
  abortSignal: AbortSignal
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${prefix}/`,
        ContinuationToken: continuationToken
      }),
      { abortSignal }
    );
    for (const item of response.Contents ?? []) {
      if (!item.Key) continue;
      keys.push(item.Key);
      if (keys.length > 10_001) {
        throw new StaticSiteGitOpsReleaseVerificationError("Static release object count is too large");
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    if (response.IsTruncated && !continuationToken) {
      throw new StaticSiteGitOpsReleaseVerificationError("S3 release listing was incomplete");
    }
  } while (continuationToken);
  return keys;
}
