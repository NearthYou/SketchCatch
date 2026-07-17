import assert from "node:assert/strict";
import { test } from "node:test";
import type { AwsConnection, DeploymentLiveObservationManifestRecord } from "@sketchcatch/types";
import type { RuntimeEnv } from "../config/env.js";
import type { DeploymentRecord, DeploymentRepository } from "../deployments/deployment-service.js";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import type {
  CloudFrontLiveObservationExpectedTopology,
  CloudFrontLiveObservationTopologyVerifier
} from "./aws-cloudfront-live-observation-topology-verifier.js";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";
import { createDeploymentLiveObservationManifest } from "./live-observation-manifest-materializer.js";
import {
  LiveObservationManifestPersistenceConflictError,
  type DeploymentLiveObservationManifestRepository
} from "./live-observation-manifest-repository.js";
import {
  createLiveObservationV2Runtime,
  prepareDeploymentManifest
} from "./live-observation-v2-runtime.js";
import {
  createLiveObservationV2Service,
  LiveObservationV2ServiceError
} from "./live-observation-v2-service.js";

test("production Live Observation runtime accepts its Redis key namespace", () => {
  assert.doesNotThrow(() =>
    createLiveObservationV2Runtime({
      getDatabaseClient() {
        throw new Error("database access is not expected during runtime assembly");
      },
      keyring: {
        current: {
          kid: "production-2026-07-15",
          secret: Buffer.alloc(32, 0x41).toString("base64url")
        }
      },
      runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
      runtimeEnv: {
        nodeEnv: "production",
        redisUrl: "rediss://cache.example.test:6379",
        sketchcatchPublicBaseUrl: "https://sketchcatch.example"
      } as RuntimeEnv
    })
  );
});

test("revalidates an invalid manifest from its deployment architecture before creating a session", async () => {
  const deployment = createDeploymentRecord();
  const connection = createAwsConnection();
  const architectureLookups: Array<[string, string]> = [];
  const deploymentRepository = createDeploymentRepository(deployment, architectureLookups);

  let manifestRecord: DeploymentLiveObservationManifestRecord = {
    deploymentId: deployment.id,
    schemaVersion: 2,
    status: "manifest_invalid",
    manifest: null,
    invalidReason: "Live Observation manifest verification failed.",
    createdAt: "2026-07-16T03:00:00.000Z",
    updatedAt: "2026-07-16T03:00:00.000Z"
  };
  const manifestRepository: DeploymentLiveObservationManifestRepository = {
    async findByDeploymentId() {
      return manifestRecord;
    },
    async saveValid(manifest) {
      manifestRecord = {
        ...manifestRecord,
        status: "valid",
        manifest,
        invalidReason: null,
        updatedAt: "2026-07-16T03:01:00.000Z"
      };
      throw new LiveObservationManifestPersistenceConflictError();
    },
    async saveInvalid() {
      return manifestRecord;
    }
  };

  await prepareDeploymentManifest({
    accessContext: { kind: "user", userId: connection.userId },
    audienceBaseUrl: "https://sketchcatch.example",
    connection,
    deployment,
    deploymentRepository,
    manifestRepository,
    topologyVerifier: createTopologyVerifier()
  });

  assert.deepEqual(architectureLookups, [[deployment.architectureId, deployment.projectId]]);
  assert.equal(manifestRecord.status, "valid");
  assert.equal(manifestRecord.manifest?.adapter.version, 4);

  const service = createLiveObservationV2Service({
    audienceBaseUrl: "https://sketchcatch.example",
    capabilityKid: "test-key",
    manifestRepository,
    store: createInMemoryLiveObservationStore()
  });
  const created = await service.createSession(deployment.id);
  assert.equal(created.session.deploymentId, deployment.id);
});

test("maps a persistence-conflict winner with different immutable evidence to controlled 409", async () => {
  const deployment = createDeploymentRecord();
  const connection = createAwsConnection();
  const deploymentRepository = createDeploymentRepository(deployment);
  let manifestRecord: DeploymentLiveObservationManifestRecord = {
    deploymentId: deployment.id,
    schemaVersion: 2,
    status: "manifest_invalid",
    manifest: null,
    invalidReason: "Live Observation manifest verification failed.",
    createdAt: "2026-07-16T03:00:00.000Z",
    updatedAt: "2026-07-16T03:00:00.000Z"
  };
  const manifestRepository: DeploymentLiveObservationManifestRepository = {
    async findByDeploymentId() {
      return manifestRecord;
    },
    async saveValid(manifest) {
      manifestRecord = {
        ...manifestRecord,
        status: "valid",
        manifest: {
          ...manifest,
          endpoints: {
            ...manifest.endpoints,
            audienceBaseUrl: "https://different.sketchcatch.example"
          }
        },
        invalidReason: null
      };
      throw new LiveObservationManifestPersistenceConflictError();
    },
    async saveInvalid() {
      return manifestRecord;
    }
  };

  await assert.rejects(
    prepareDeploymentManifest({
      accessContext: { kind: "user", userId: connection.userId },
      audienceBaseUrl: "https://sketchcatch.example",
      connection,
      deployment,
      deploymentRepository,
      manifestRepository,
      topologyVerifier: createTopologyVerifier()
    }),
    (error: unknown) =>
      error instanceof LiveObservationV2ServiceError &&
      error.code === "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE"
  );
});

test("reconciles an invalid-diagnostic race without masking database outages", async () => {
  const deployment = createDeploymentRecord();
  const connection = createAwsConnection();
  const deploymentRepository = createDeploymentRepository(deployment, [], {
    architectureMissing: true
  });
  let manifestRecord = createInvalidManifestRecord(deployment.id);
  const conflictRepository: DeploymentLiveObservationManifestRepository = {
    async findByDeploymentId() {
      return manifestRecord;
    },
    async saveValid() {
      throw new Error("unexpected valid save");
    },
    async saveInvalid() {
      manifestRecord = createReusableManifestRecord(deployment, connection);
      throw new LiveObservationManifestPersistenceConflictError();
    }
  };

  await prepareDeploymentManifest({
    accessContext: { kind: "user", userId: connection.userId },
    audienceBaseUrl: "https://sketchcatch.example",
    connection,
    deployment,
    deploymentRepository,
    manifestRepository: conflictRepository,
    topologyVerifier: createTopologyVerifier()
  });

  const outage = new Error("database unavailable");
  const outageRepository: DeploymentLiveObservationManifestRepository = {
    ...conflictRepository,
    async findByDeploymentId() {
      return createInvalidManifestRecord(deployment.id);
    },
    async saveInvalid() {
      throw outage;
    }
  };
  await assert.rejects(
    prepareDeploymentManifest({
      accessContext: { kind: "user", userId: connection.userId },
      audienceBaseUrl: "https://sketchcatch.example",
      connection,
      deployment,
      deploymentRepository,
      manifestRepository: outageRepository,
      topologyVerifier: createTopologyVerifier()
    }),
    (error: unknown) => error === outage
  );
});

function createDeploymentRepository(
  deployment: DeploymentRecord,
  architectureLookups: Array<[string, string]> = [],
  options: { architectureMissing?: boolean } = {}
): DeploymentRepository {
  return {
    async findDeploymentById(candidateId: string) {
      return candidateId === deployment.id ? deployment : undefined;
    },
    async findAccessibleProject() {
      return { id: deployment.projectId } as never;
    },
    async findArchitectureInProject(architectureId: string, projectId: string) {
      architectureLookups.push([architectureId, projectId]);
      if (options.architectureMissing) return undefined;
      return {
        id: architectureId,
        projectId,
        version: 1,
        source: "manual",
        architectureJson: {
          nodes: [
            {
              id: "ecs-service",
              type: "ECS_SERVICE",
              positionX: 0,
              positionY: 0,
              config: {}
            }
          ],
          edges: []
        },
        createdAt: new Date("2026-07-16T01:00:00.000Z")
      };
    },
    async listTerraformOutputs() {
      return Object.entries(createCloudFrontOutputs()).map(([name, value], index) => ({
        id: `output-${index}`,
        deploymentId: deployment.id,
        name,
        value,
        sensitive: false,
        createdAt: new Date("2026-07-16T03:00:00.000Z")
      }));
    }
  } as unknown as DeploymentRepository;
}

function createTopologyVerifier(): CloudFrontLiveObservationTopologyVerifier {
  return {
    async verify({ expected }) {
      return createVerifiedTopology(expected);
    }
  };
}

function createVerifiedTopology(
  expected: CloudFrontLiveObservationExpectedTopology = createCloudFrontExpected()
) {
  return {
    ...expected,
    apiOriginId: "api-alb" as const,
    apiPathPattern: "/api/*" as const,
    bucketPolicyAllowsCloudFrontRead: true as const,
    defaultOriginId: "web-assets",
    frontendBucketPublicAccessBlocked: true as const,
    healthPathPattern: "/health" as const,
    originAccessControlId: "E123456789ABC",
    topologyVerifiedAt: "2026-07-16T03:00:00.000Z"
  };
}

function createInvalidManifestRecord(
  candidateDeploymentId: string
): DeploymentLiveObservationManifestRecord {
  return {
    deploymentId: candidateDeploymentId,
    schemaVersion: 2,
    status: "manifest_invalid",
    manifest: null,
    invalidReason: "Live Observation manifest verification failed.",
    createdAt: "2026-07-16T03:00:00.000Z",
    updatedAt: "2026-07-16T03:00:00.000Z"
  };
}

function createReusableManifestRecord(
  deployment: DeploymentRecord,
  connection: AwsConnection
): DeploymentLiveObservationManifestRecord {
  const manifest = createDeploymentLiveObservationManifest({
    audienceBaseUrl: "https://sketchcatch.example",
    architecture: {
      nodes: [
        {
          id: "ecs-service",
          type: "ECS_SERVICE",
          positionX: 0,
          positionY: 0,
          config: {}
        }
      ],
      edges: []
    },
    deployment,
    connection,
    outputs: createCloudFrontOutputs(),
    topology: createVerifiedTopology()
  });
  return {
    deploymentId: deployment.id,
    schemaVersion: 2,
    status: "valid",
    manifest,
    invalidReason: null,
    createdAt: "2026-07-16T03:00:00.000Z",
    updatedAt: "2026-07-16T03:01:00.000Z"
  };
}

function createCloudFrontExpected(): CloudFrontLiveObservationExpectedTopology {
  return {
    accountId: "123456789012",
    region: "ap-northeast-2",
    cloudFrontDistributionId: "E123456789ABC",
    cloudFrontDomainName: "d111111abcdef8.cloudfront.net",
    frontendBucketName: "audience-live-check-web-assets",
    loadBalancerArn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
    loadBalancerDnsName: "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
    targetGroupArn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/0123456789abcdef",
    clusterName: "audience-live-check-cluster",
    serviceName: "audience-live-check-service"
  };
}

function createDeploymentRecord(): DeploymentRecord {
  const now = new Date("2026-07-16T02:00:00.000Z");
  return {
    id: "123e4567-e89b-4d3a-a456-426614174000",
    projectId: "323e4567-e89b-4d3a-a456-426614174000",
    architectureId: "423e4567-e89b-4d3a-a456-426614174000",
    terraformArtifactId: "523e4567-e89b-4d3a-a456-426614174000",
    awsConnectionId: "223e4567-e89b-4d3a-a456-426614174000",
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    awsConnectionNameSnapshot: "Demo connection",
    liveProfile: "practice",
    scope: "infrastructure",
    targetKind: "ecs_fargate",
    source: "direct",
    releaseId: null,
    releaseCandidateId: null,
    rollbackOfDeploymentId: null,
    rollbackTargetDeploymentId: null,
    preparedDraftRevision: null,
    preparedSnapshotHash: null,
    approvedPreparedSnapshotHash: null,
    currentPlanArtifactId: null,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "SUCCESS",
    activeStage: null,
    planSummary: null,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: now,
    approvedByUserId: "623e4567-e89b-4d3a-a456-426614174000",
    approvedTerraformArtifactId: "523e4567-e89b-4d3a-a456-426614174000",
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: "a".repeat(64),
    approvedTfplanHash: "b".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    startedAt: now,
    completedAt: now,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function createAwsConnection(): AwsConnection {
  return {
    id: "223e4567-e89b-4d3a-a456-426614174000",
    userId: "623e4567-e89b-4d3a-a456-426614174000",
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchLiveObservation",
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-07-16T02:00:00.000Z",
    createdAt: "2026-07-16T01:00:00.000Z",
    updatedAt: "2026-07-16T02:00:00.000Z"
  };
}

function createCloudFrontOutputs(): Readonly<Record<string, unknown>> {
  return {
    cloudfront_distribution_id: "E123456789ABC",
    cloudfront_domain_name: "d111111abcdef8.cloudfront.net",
    cloudfront_url: "https://d111111abcdef8.cloudfront.net",
    static_bucket_name: "audience-live-check-web-assets",
    alb_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/audience-live-check/0123456789abcdef",
    alb_dns_name: "audience-live-check-1234567890.ap-northeast-2.elb.amazonaws.com",
    target_group_arn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/audience-live-check/0123456789abcdef",
    ecs_cluster_name: "audience-live-check-cluster",
    ecs_service_name: "audience-live-check-service",
    log_group_names: ["/ecs/audience-live-check"]
  };
}
