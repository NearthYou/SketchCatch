import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DeploymentLiveObservationManifestV2,
  DeploymentLiveObservationAwsAdapterV4,
  LiveObservationProviderSnapshot
} from "@sketchcatch/types";
import {
  createLiveObservationObserverService,
  createProviderTarget,
  type LiveObservationAwsConnectionEvidence
} from "./live-observation-observer-service.js";
import type {
  LiveObservationStore,
  LiveObservationStoreObservation
} from "./live-observation-store.js";

const AWS_CONNECTION_ID = "66666666-7777-4888-8999-000000000000";
const LOAD_BALANCER_ARN =
  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/1234567890abcdef";
const TARGET_GROUP_ARN =
  "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/1234567890abcdef";
const connection: LiveObservationAwsConnectionEvidence = {
  id: AWS_CONNECTION_ID,
  accountId: "123456789012",
  roleArn: "arn:aws:iam::123456789012:role/sketchcatch-observer",
  externalId: "observer-external-id",
  region: "ap-northeast-2",
  status: "verified"
};

test("retains stored provider evidence when a new observer returns delayed without quantitative values", async () => {
  const stored = providerSnapshot({
    requests: 120,
    errorRate: 2.5,
    p95LatencyMs: 185,
    availability: 97.5,
    capacity: { desired: 2, running: 2, healthy: 2, max: null },
    observedAt: "2026-07-16T04:00:00.000Z",
    state: "available"
  });
  const freshDelayed = providerSnapshot({
    logs: [
      {
        timestamp: "2026-07-16T04:01:00.000Z",
        message: "provider metrics delayed"
      }
    ],
    observedAt: "2026-07-16T04:01:00.000Z",
    state: "delayed"
  });

  const committed = await refreshWithStoredSnapshot(stored, freshDelayed);

  assert.deepEqual(committed.payload, {
    requests: 120,
    errorRate: 2.5,
    p95LatencyMs: 185,
    availability: 97.5,
    capacity: { desired: 2, running: 2, healthy: 2, max: null },
    logs: freshDelayed.logs,
    observedAt: freshDelayed.observedAt,
    state: "delayed"
  });
});

test("does not reuse unavailable or partial stored evidence for an empty delayed snapshot", async () => {
  const freshDelayed = providerSnapshot({
    logs: [
      {
        timestamp: "2026-07-16T04:01:00.000Z",
        message: "provider metrics delayed"
      }
    ],
    observedAt: "2026-07-16T04:01:00.000Z",
    state: "delayed"
  });
  const unavailableStored = providerSnapshot({ state: "unavailable" });
  const partialStored = providerSnapshot({ requests: 120, state: "delayed" });

  const afterUnavailable = await refreshWithStoredSnapshot(
    unavailableStored,
    freshDelayed
  );
  const afterPartial = await refreshWithStoredSnapshot(partialStored, freshDelayed);

  assert.deepEqual(afterUnavailable.payload, freshDelayed);
  assert.deepEqual(afterPartial.payload, freshDelayed);
});

test("keeps complete delayed provider evidence and clears stored values on unavailable", async () => {
  const stored = providerSnapshot({
    requests: 120,
    errorRate: 2.5,
    p95LatencyMs: 185,
    availability: 97.5,
    capacity: { desired: 2, running: 2, healthy: 2, max: null },
    observedAt: "2026-07-16T04:00:00.000Z",
    state: "available"
  });
  const completeDelayed = providerSnapshot({
    requests: 80,
    errorRate: 1.25,
    p95LatencyMs: 140,
    availability: 98.75,
    capacity: { desired: 3, running: 3, healthy: 3, max: 6 },
    observedAt: "2026-07-16T04:01:00.000Z",
    state: "delayed"
  });
  const unavailable = providerSnapshot({
    observedAt: "2026-07-16T04:02:00.000Z",
    state: "unavailable"
  });

  const afterDelayed = await refreshWithStoredSnapshot(stored, completeDelayed);
  const afterUnavailable = await refreshWithStoredSnapshot(stored, unavailable);

  assert.deepEqual(afterDelayed.payload, completeDelayed);
  assert.deepEqual(afterUnavailable.payload, unavailable);
});

test("maps V4 fixed and Service Auto Scaling capacity targets", () => {
  const fixed = createProviderTarget(createV4Manifest({ mode: "fixed" }), connection);
  const autoScaled = createProviderTarget(
    createV4Manifest({
      mode: "service_auto_scaling",
      minCapacity: 2,
      maxCapacity: 7,
      metric: "ECSServiceAverageCPUUtilization",
      targetValue: 65
    }),
    connection
  );

  assert.deepEqual(fixed?.capacityTarget, {
    kind: "ecs_fargate",
    clusterName: "demo-cluster",
    serviceName: "demo-service",
    maxCapacity: null
  });
  assert.deepEqual(autoScaled?.capacityTarget, {
    kind: "ecs_fargate",
    clusterName: "demo-cluster",
    serviceName: "demo-service",
    maxCapacity: 7
  });
});

test("preserves V2 ASG and ECS and V3 ECS capacity targets", () => {
  const asg = createProviderTarget(
    createManifest({
      kind: "aws-live-observation",
      version: 2,
      payload: {
        ...albPayload(),
        trafficHostname: "api.example.com",
        capacityTarget: {
          kind: "asg",
          autoScalingGroupName: "demo-asg"
        }
      }
    }),
    connection
  );
  const v2Ecs = createProviderTarget(
    createManifest({
      kind: "aws-live-observation",
      version: 2,
      payload: {
        ...albPayload(),
        trafficHostname: "api.example.com",
        capacityTarget: {
          kind: "ecs_fargate",
          clusterName: "demo-cluster",
          serviceName: "demo-service",
          maxCapacity: 4
        }
      }
    }),
    connection
  );
  const v3Ecs = createProviderTarget(
    createManifest({
      kind: "aws-live-observation",
      version: 3,
      payload: {
        ...cloudFrontPayload(),
        capacityTarget: {
          kind: "ecs_fargate",
          clusterName: "demo-cluster",
          serviceName: "demo-service",
          maxCapacity: 6
        }
      }
    }),
    connection
  );

  assert.deepEqual(asg?.capacityTarget, {
    kind: "asg",
    autoScalingGroupName: "demo-asg"
  });
  assert.deepEqual(v2Ecs?.capacityTarget, {
    kind: "ecs_fargate",
    clusterName: "demo-cluster",
    serviceName: "demo-service",
    maxCapacity: 4
  });
  assert.deepEqual(v3Ecs?.capacityTarget, {
    kind: "ecs_fargate",
    clusterName: "demo-cluster",
    serviceName: "demo-service",
    maxCapacity: 6
  });
});

function createV4Manifest(
  scaling: DeploymentLiveObservationAwsAdapterV4["payload"]["capacityTarget"]["scaling"]
): DeploymentLiveObservationManifestV2 {
  return createManifest({
    kind: "aws-live-observation",
    version: 4,
    payload: {
      ...cloudFrontPayload(),
      capacityTarget: {
        kind: "ecs_fargate",
        clusterName: "demo-cluster",
        serviceName: "demo-service",
        scaling
      }
    }
  });
}

function createManifest(
  adapter: DeploymentLiveObservationManifestV2["adapter"]
): DeploymentLiveObservationManifestV2 {
  return {
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId: "11111111-2222-4333-8444-555555555555",
      terraformArtifactSha256: "a".repeat(64),
      awsConnectionId: AWS_CONNECTION_ID,
      region: "ap-northeast-2",
      verifiedAt: "2026-07-16T04:00:00.000Z"
    },
    endpoints: {
      audienceBaseUrl: "https://console.example.com",
      trafficUrl: "https://d111111abcdef8.cloudfront.net/api/traffic"
    },
    pressure: {
      metric: "requests_per_target_per_minute",
      target: 60,
      windowSeconds: 60
    },
    adapter
  };
}

function albPayload() {
  return {
    loadBalancerDnsName: "demo-1234567890.ap-northeast-2.elb.amazonaws.com",
    loadBalancerArn: LOAD_BALANCER_ARN,
    targetGroupArn: TARGET_GROUP_ARN,
    logGroupNames: ["/ecs/demo"]
  };
}

function cloudFrontPayload() {
  return {
    cloudFrontDistributionId: "E123456789ABC",
    cloudFrontDomainName: "d111111abcdef8.cloudfront.net",
    frontendBucketName: "audience-live-check-web-assets",
    defaultOriginId: "web-assets",
    originAccessControlId: "E123456789OAC",
    apiOriginId: "api-alb",
    apiPathPattern: "/api/*" as const,
    healthPathPattern: "/health" as const,
    frontendBucketPublicAccessBlocked: true as const,
    bucketPolicyAllowsCloudFrontRead: true as const,
    topologyVerifiedAt: "2026-07-16T04:00:00.000Z",
    frontendState: "current" as const,
    ...albPayload()
  };
}

function providerSnapshot(
  overrides: Partial<LiveObservationProviderSnapshot> = {}
): LiveObservationProviderSnapshot {
  return {
    requests: null,
    errorRate: null,
    p95LatencyMs: null,
    availability: null,
    capacity: { desired: null, running: null, healthy: null, max: null },
    logs: [],
    observedAt: "2026-07-16T04:00:00.000Z",
    state: "delayed",
    ...overrides
  };
}

async function refreshWithStoredSnapshot(
  storedSnapshot: LiveObservationProviderSnapshot,
  providerSnapshotValue: LiveObservationProviderSnapshot
): Promise<LiveObservationStoreObservation> {
  const observationId = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
  const manifest = createV4Manifest({ mode: "fixed" });
  const commits: LiveObservationStoreObservation[] = [];
  const store: LiveObservationStore = {
    async createSession() {
      throw new Error("Unexpected createSession");
    },
    async readSession() {
      return {
        kind: "active",
        evaluatedAt: "2026-07-16T04:01:00.000Z",
        session: {
          observationId,
          deploymentId: manifest.provenance.deploymentId,
          status: "active",
          manifest,
          capability: { kid: "current-key", tokenVersion: 1 },
          createdAt: "2026-07-16T04:00:00.000Z",
          expiresAt: "2026-07-16T04:15:00.000Z",
          live: {
            acceptedEventCount: 0,
            rollingRequestsPerSecond: 0,
            projectedRequestsPerMinute: 0,
            pressurePercent: 0,
            pressureLevel: "normal",
            observedAt: "2026-07-16T04:01:00.000Z"
          },
          latestObservation: {
            observedAt: "2026-07-16T04:00:00.000Z",
            payload: storedSnapshot
          }
        }
      };
    },
    async collectEvent() {
      throw new Error("Unexpected collectEvent");
    },
    async stopSession() {
      throw new Error("Unexpected stopSession");
    },
    async claimObserverLease() {
      return {
        kind: "claimed",
        evaluatedAt: "2026-07-16T04:01:00.000Z",
        lease: {
          fencingToken: 1,
          expiresAt: "2026-07-16T04:01:15.000Z"
        }
      };
    },
    async commitObservation(input) {
      commits.push(input.observation);
      return {
        kind: "committed",
        evaluatedAt: "2026-07-16T04:01:00.000Z"
      };
    }
  };
  const service = createLiveObservationObserverService({
    store,
    provider: {
      async observe() {
        return providerSnapshotValue;
      }
    },
    createObserverId: () => "88888888-9999-4aaa-8bbb-cccccccccccc"
  });

  await service.refresh({
    observationId,
    expectedDeploymentId: manifest.provenance.deploymentId,
    connection
  });

  assert.equal(commits.length, 1);
  return commits[0]!;
}
