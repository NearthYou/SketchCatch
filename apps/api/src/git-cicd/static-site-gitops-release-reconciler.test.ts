import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  GetDistributionCommand,
  GetDistributionConfigCommand,
  GetInvalidationCommand,
  type CloudFrontClient
} from "@aws-sdk/client-cloudfront";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client
} from "@aws-sdk/client-s3";
import type { StaticSiteGitOpsReleaseEvidence } from "@sketchcatch/types";
import {
  createAwsStaticSiteGitOpsCloudGateway,
  createStaticSiteGitOpsReleaseReconciler,
  StaticSiteGitOpsReleaseVerificationError,
  type StaticSiteGitOpsObservedState,
  type StaticSiteGitOpsReleaseRecord,
  type StaticSiteGitOpsReleaseRepository
} from "./static-site-gitops-release-reconciler.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const pipelineRunId = "22222222-2222-4222-8222-222222222222";
const commitSha = "a".repeat(40);
const now = new Date("2026-07-14T00:00:00.000Z");

test("static reconciler persists a server-verified immutable release", async () => {
  const repository = new FakeRepository();
  const evidence = createEvidence();
  const reconciler = createStaticSiteGitOpsReleaseReconciler({
    repository,
    gateway: { inspect: async () => createObserved(evidence) },
    createId: () => "33333333-3333-4333-8333-333333333333",
    now: () => now
  });

  const release = await reconciler.reconcile(createInput(evidence));

  assert.equal(release?.status, "succeeded");
  assert.equal(release?.artifactDigest, evidence.artifactDigest.slice("sha256:".length));
  assert.equal(release?.providerRevision?.resourceType, "cloudfront_distribution");
  assert.equal(release?.providerRevision?.artifactReference, evidence.manifestUri);
  assert.equal((release?.healthEvidence as { state?: string } | null)?.state, "healthy");
  assert.equal(release?.rollbackEvidence, null);
});

test("static reconciler records a verified pointer rollback after a failed release", async () => {
  const repository = new FakeRepository();
  const evidence = createEvidence({
    outcome: "failed",
    failureReason: "health_check_failure",
    activeReleasePrefix: "releases/previous/old"
  });
  const reconciler = createStaticSiteGitOpsReleaseReconciler({
    repository,
    gateway: { inspect: async () => createObserved(evidence) },
    now: () => now
  });

  const release = await reconciler.reconcile(
    createInput(evidence, { pipelineStatus: "failed" })
  );

  assert.equal(release?.status, "failed");
  assert.equal((release?.healthEvidence as { state?: string } | null)?.state, "restored");
  assert.equal(
    (release?.rollbackEvidence as { restoredReleasePrefix?: string } | null)
      ?.restoredReleasePrefix,
    "releases/previous/old"
  );
});

test("static reconciler rejects target, pipeline, and observed cloud drift", async () => {
  const evidence = createEvidence();
  const repository = new FakeRepository();
  const targetMismatch = createStaticSiteGitOpsReleaseReconciler({
    repository,
    gateway: { inspect: async () => createObserved(evidence) }
  });
  await assert.rejects(
    targetMismatch.reconcile(createInput({ ...evidence, hostingBucketName: "other-bucket" })),
    StaticSiteGitOpsReleaseVerificationError
  );

  for (const observed of [
    createObserved(evidence, { manifestDigest: "f".repeat(64) }),
    createObserved(evidence, { originPath: "/releases/drifted" }),
    createObserved(evidence, { invalidationStatus: "InProgress" }),
    createObserved(evidence, { distributionEtag: "EOTHER" })
  ]) {
    const reconciler = createStaticSiteGitOpsReleaseReconciler({
      repository: new FakeRepository(),
      gateway: { inspect: async () => observed }
    });
    await assert.rejects(
      reconciler.reconcile(createInput(evidence)),
      StaticSiteGitOpsReleaseVerificationError
    );
  }
});

test("AWS static gateway re-queries manifest objects, CloudFront origin, and invalidation", async () => {
  const manifest = JSON.stringify({
    schemaVersion: 1,
    commitSha,
    files: [{ path: "index.html", size: 6, sha256: "c".repeat(64) }]
  });
  const digest = createHash("sha256").update(manifest).digest();
  const releasePrefix = `releases/${commitSha}/${digest.toString("hex")}`;
  const s3Commands: string[] = [];
  const cloudFrontCommands: string[] = [];
  const s3Client = {
    async send(command: object) {
      s3Commands.push(command.constructor.name);
      if (command instanceof HeadObjectCommand) {
        return { VersionId: "version-current", ChecksumSHA256: digest.toString("base64") };
      }
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToString: async () => manifest } };
      }
      if (command instanceof ListObjectsV2Command) {
        return {
          IsTruncated: false,
          Contents: [
            { Key: `${releasePrefix}/index.html` },
            { Key: `${releasePrefix}/.sketchcatch-release-manifest.json` }
          ]
        };
      }
      throw new Error("unexpected S3 command");
    },
    destroy() {}
  } as unknown as S3Client;
  const cloudFrontClient = {
    async send(command: object) {
      cloudFrontCommands.push(command.constructor.name);
      if (command instanceof GetDistributionConfigCommand) {
        return {
          ETag: "E2ABCDEF123456",
          DistributionConfig: {
            Enabled: true,
            Aliases: { Quantity: 1, Items: ["static.example.com"] },
            Origins: {
              Quantity: 1,
              Items: [{
                Id: "static-origin",
                DomainName: "sketchcatch-static-releases.s3.ap-northeast-2.amazonaws.com",
                OriginPath: `/${releasePrefix}`,
                S3OriginConfig: { OriginAccessIdentity: "" }
              }]
            }
          }
        };
      }
      if (command instanceof GetDistributionCommand) {
        return { Distribution: { Status: "Deployed", DomainName: "d111.cloudfront.net" } };
      }
      if (command instanceof GetInvalidationCommand) {
        return { Invalidation: { Status: "Completed" } };
      }
      throw new Error("unexpected CloudFront command");
    },
    destroy() {}
  } as unknown as CloudFrontClient;
  const gateway = createAwsStaticSiteGitOpsCloudGateway({
    stsGateway: {
      assumeRole: async () => ({
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        sessionToken: "test-session-token",
        expiration: now
      })
    },
    createS3Client: () => s3Client,
    createCloudFrontClient: () => cloudFrontClient
  });

  const observed = await gateway.inspect({
    roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
    externalId: "external-id",
    region: "ap-northeast-2",
    hostingBucketName: "sketchcatch-static-releases",
    cloudFrontDistributionId: "E1234567890ABC",
    cloudFrontOriginId: "static-origin",
    outputUrl: "https://static.example.com",
    commitSha,
    releasePrefix,
    manifestVersionId: "version-current",
    invalidationId: "I1234567890ABC"
  });

  assert.equal(observed.manifestDigest, digest.toString("hex"));
  assert.equal(observed.releaseObjectCount, 2);
  assert.deepEqual(s3Commands, ["HeadObjectCommand", "GetObjectCommand", "ListObjectsV2Command"]);
  assert.deepEqual(cloudFrontCommands, [
    "GetDistributionConfigCommand",
    "GetDistributionCommand",
    "GetInvalidationCommand"
  ]);
});

class FakeRepository implements StaticSiteGitOpsReleaseRepository {
  release: StaticSiteGitOpsReleaseRecord | null = null;

  async findVerificationTarget() {
    return {
      projectId,
      connection: {
        roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
        externalId: "external-id",
        region: "ap-northeast-2"
      },
      runtimeConfig: {
        runtimeTargetKind: "static_site" as const,
        hostingBucketName: "sketchcatch-static-releases",
        cloudFrontDistributionId: "E1234567890ABC",
        cloudFrontOriginId: "static-origin",
        outputUrl: "https://static.example.com"
      }
    };
  }

  async upsertRelease(input: StaticSiteGitOpsReleaseRecord) {
    this.release = input;
    return input;
  }
}

function createEvidence(
  overrides: Partial<StaticSiteGitOpsReleaseEvidence> = {}
): StaticSiteGitOpsReleaseEvidence {
  const digest = "b".repeat(64);
  const releasePrefix = `releases/${commitSha}/${digest}`;
  return {
    schemaVersion: 1,
    runtimeTargetKind: "static_site",
    outcome: "succeeded",
    failureReason: null,
    commitSha,
    artifactDigest: `sha256:${digest}`,
    manifestUri:
      `s3://sketchcatch-static-releases/${releasePrefix}/.sketchcatch-release-manifest.json`,
    manifestVersionId: "version-current",
    releasePrefix,
    previousReleasePrefix: "releases/previous/old",
    activeReleasePrefix: releasePrefix,
    hostingBucketName: "sketchcatch-static-releases",
    cloudFrontDistributionId: "E1234567890ABC",
    cloudFrontOriginId: "static-origin",
    distributionEtag: "E2ABCDEF123456",
    invalidationId: "I1234567890ABC",
    fileCount: 1,
    outputUrl: "https://static.example.com",
    ...overrides
  };
}

function createObserved(
  evidence: StaticSiteGitOpsReleaseEvidence,
  overrides: Partial<StaticSiteGitOpsObservedState> = {}
): StaticSiteGitOpsObservedState {
  return {
    manifestVersionId: evidence.manifestVersionId,
    manifestDigest: evidence.artifactDigest.slice("sha256:".length),
    manifestFileCount: evidence.fileCount,
    releaseObjectCount: evidence.fileCount + 1,
    distributionStatus: "Deployed",
    distributionEnabled: true,
    distributionEtag: evidence.distributionEtag,
    distributionDomainName: "d111.cloudfront.net",
    distributionAliases: ["static.example.com"],
    originPath: `/${evidence.activeReleasePrefix}`,
    originDomainName: "sketchcatch-static-releases.s3.ap-northeast-2.amazonaws.com",
    invalidationStatus: evidence.invalidationId ? "Completed" : null,
    ...overrides
  };
}

function createInput(
  evidence: StaticSiteGitOpsReleaseEvidence,
  overrides: { pipelineStatus?: "succeeded" | "failed" } = {}
) {
  return {
    projectId,
    pipelineRunId,
    commitSha,
    pipelineStatus: overrides.pipelineStatus ?? "succeeded" as const,
    startedAt: now,
    finishedAt: now,
    evidence
  };
}
