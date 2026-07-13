import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeploymentLiveObservationManifestV2 } from "@sketchcatch/types";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";
import { createLiveObservationObserverService } from "./live-observation-observer-service.js";
import type { LiveObservationStore } from "./live-observation-store.js";
import { LiveObservationV2ServiceError } from "./live-observation-v2-service.js";

const NOW_MS = Date.parse("2026-07-11T00:00:00.000Z");
const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";
const OBSERVER_ID = "22222222-2222-4222-8222-222222222222";
const CONNECTION_ID = "abcdef12-3456-4789-8abc-def012345678";
const OTHER_DEPLOYMENT_ID = "223e4567-e89b-42d3-a456-426614174000";

test("observer service rejects a cross-deployment observation before provider or Store mutation", async () => {
  const store = createInMemoryLiveObservationStore({ now: () => NOW_MS });
  await store.createSession(createInput());
  let providerCalls = 0;
  const service = createLiveObservationObserverService({
    createObserverId: () => OBSERVER_ID,
    store,
    provider: {
      async observe() {
        providerCalls += 1;
        return availableSnapshot();
      }
    }
  });

  await service.refresh({
    observationId: OBSERVATION_ID,
    expectedDeploymentId: OTHER_DEPLOYMENT_ID,
    connection: createConnection()
  });

  assert.equal(providerCalls, 0);
  const victim = await store.readSession({ observationId: OBSERVATION_ID });
  assert.equal(victim.kind, "active");
  if (victim.kind === "active") assert.equal(victim.session.latestObservation, null);
});

for (const operation of ["read", "claim", "commit"] as const) {
  test(`observer service maps ${operation} Store outages to the stable cache error`, async () => {
    const baseStore = createInMemoryLiveObservationStore({ now: () => NOW_MS });
    await baseStore.createSession(createInput());
    const service = createLiveObservationObserverService({
      createObserverId: () => OBSERVER_ID,
      store: createFailingStore(baseStore, operation),
      provider: { async observe() { return availableSnapshot(); } }
    });

    await assert.rejects(
      service.refresh({
        observationId: OBSERVATION_ID,
        expectedDeploymentId: createManifest().provenance.deploymentId,
        connection: createConnection()
      }),
      (error: unknown) =>
        error instanceof LiveObservationV2ServiceError &&
        error.code === "LIVE_OBSERVATION_CACHE_UNAVAILABLE" &&
        !error.message.includes("internal-store-detail")
    );
  });
}

test("observer service derives a provider target only from the Store manifest and verified connection", async () => {
  const store = createInMemoryLiveObservationStore({ now: () => NOW_MS });
  await store.createSession(createInput());
  const targets: unknown[] = [];
  const snapshot = availableSnapshot();
  const service = createLiveObservationObserverService({
    createObserverId: () => OBSERVER_ID,
    store,
    provider: {
      async observe(target) {
        targets.push(target);
        return snapshot;
      }
    }
  });

  await service.refresh({
    observationId: OBSERVATION_ID,
    expectedDeploymentId: createManifest().provenance.deploymentId,
    connection: createConnection()
  });

  assert.deepEqual(targets, [{
    awsConnectionId: CONNECTION_ID,
    roleArn: "arn:aws:iam::123456789012:role/customer-observer",
    externalId: "external-id",
    region: "ap-northeast-2",
    loadBalancerArnSuffix: "app/customer-platform/50dc6c495c0c9188",
    targetGroupArn:
      "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:" +
      "targetgroup/customer-api/6d0ecf831eec9f09",
    targetGroupArnSuffix: "targetgroup/customer-api/6d0ecf831eec9f09",
    logGroupNames: ["/aws/ecs/customer-platform"],
    capacityTarget: { kind: "asg", autoScalingGroupName: "customer-asg" }
  }]);
  const read = await store.readSession({ observationId: OBSERVATION_ID });
  assert.equal(read.kind, "active");
  if (read.kind === "active") assert.deepEqual(read.session.latestObservation?.payload, snapshot);
});

test("observer service overwrites old numbers with unavailable state when connection evidence is invalid", async () => {
  let now = NOW_MS;
  const store = createInMemoryLiveObservationStore({ now: () => now });
  await store.createSession(createInput());
  let providerCalls = 0;
  const service = createLiveObservationObserverService({
    createObserverId: () => OBSERVER_ID,
    store,
    provider: {
      async observe() {
        providerCalls += 1;
        return availableSnapshot();
      }
    }
  });
  await service.refresh({
    observationId: OBSERVATION_ID,
    expectedDeploymentId: createManifest().provenance.deploymentId,
    connection: createConnection()
  });
  now += 1_000;

  await service.refresh({
    observationId: OBSERVATION_ID,
    expectedDeploymentId: createManifest().provenance.deploymentId,
    connection: { ...createConnection(), status: "pending" }
  });

  assert.equal(providerCalls, 1);
  const read = await store.readSession({ observationId: OBSERVATION_ID });
  assert.equal(read.kind, "active");
  if (read.kind !== "active") return;
  assert.deepEqual(read.session.latestObservation?.payload, {
    requests: null,
    errorRate: null,
    p95LatencyMs: null,
    availability: null,
    capacity: { desired: null, running: null, healthy: null, max: null },
    logs: [],
    observedAt: "2026-07-11T00:00:01.000Z",
    state: "unavailable"
  });
});

test("observer service rejects a role ARN partition outside the verified connection region", async () => {
  const store = createInMemoryLiveObservationStore({ now: () => NOW_MS });
  await store.createSession(createInput());
  let providerCalls = 0;
  const service = createLiveObservationObserverService({
    createObserverId: () => OBSERVER_ID,
    store,
    provider: {
      async observe() {
        providerCalls += 1;
        return availableSnapshot();
      }
    }
  });

  await service.refresh({
    observationId: OBSERVATION_ID,
    expectedDeploymentId: createManifest().provenance.deploymentId,
    connection: createConnection({
      roleArn: "arn:aws-cn:iam::123456789012:role/customer-observer"
    })
  });

  assert.equal(providerCalls, 0);
});

function createInput() {
  return {
    observationId: OBSERVATION_ID,
    manifest: createManifest(),
    capability: { kid: "current-key", tokenVersion: 1 }
  };
}

function createManifest(): DeploymentLiveObservationManifestV2 {
  return {
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId: "123e4567-e89b-42d3-a456-426614174000",
      terraformArtifactSha256: "a".repeat(64),
      awsConnectionId: CONNECTION_ID,
      region: "ap-northeast-2",
      verifiedAt: "2026-07-11T00:00:00.000Z"
    },
    endpoints: {
      audienceBaseUrl: "https://audience.example.com",
      trafficUrl: "https://api.example.com/traffic"
    },
    pressure: { metric: "requests_per_target_per_minute", target: 60, windowSeconds: 60 },
    adapter: {
      kind: "aws-live-observation",
      version: 2,
      payload: {
        trafficHostname: "api.example.com",
        loadBalancerDnsName: "customer-platform-123456789.ap-northeast-2.elb.amazonaws.com",
        loadBalancerArn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer-platform/50dc6c495c0c9188",
        targetGroupArn: "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/customer-api/6d0ecf831eec9f09",
        logGroupNames: ["/aws/ecs/customer-platform"],
        capacityTarget: { kind: "asg", autoScalingGroupName: "customer-asg" }
      }
    }
  };
}

function createConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/customer-observer",
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "verified",
    ...overrides
  };
}

function availableSnapshot() {
  return {
    requests: 120,
    errorRate: 2.5,
    p95LatencyMs: 183,
    availability: 97.5,
    capacity: { desired: 2, running: 2, healthy: 2, max: 4 },
    logs: [],
    observedAt: "2026-07-11T00:00:00.000Z",
    state: "available" as const
  };
}

function createFailingStore(
  store: LiveObservationStore,
  operation: "read" | "claim" | "commit"
): LiveObservationStore {
  const fail = async (): Promise<never> => {
    throw new Error("internal-store-detail");
  };
  if (operation === "read") return { ...store, readSession: fail };
  if (operation === "claim") return { ...store, claimObserverLease: fail };
  return { ...store, commitObservation: fail };
}
