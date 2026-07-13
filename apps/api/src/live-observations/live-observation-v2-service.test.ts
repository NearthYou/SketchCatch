import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  DeploymentLiveObservationManifestRecord,
  DeploymentLiveObservationManifestV2
} from "@sketchcatch/types";
import { createInMemoryLiveObservationStore } from "./in-memory-live-observation-store.js";
import type { DeploymentLiveObservationManifestRepository } from "./live-observation-manifest-repository.js";
import {
  createLiveObservationV2Service,
  LiveObservationV2ServiceError
} from "./live-observation-v2-service.js";

const NOW_MS = Date.parse("2026-07-11T00:00:00.000Z");
const DEPLOYMENT_ID = "123e4567-e89b-42d3-a456-426614174000";
const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";

test("v2 service creates a Store session with a capability-free audience URL", async () => {
  const service = createLiveObservationV2Service({
    audienceBaseUrl: "https://sketchcatch.example.com/",
    capabilityKid: "current-key",
    createObservationId: () => OBSERVATION_ID,
    manifestRepository: new FakeManifestRepository(createValidRecord()),
    store: createInMemoryLiveObservationStore({ now: () => NOW_MS })
  });

  const response = await service.createSession(DEPLOYMENT_ID);

  assert.deepEqual(response.session, {
    id: OBSERVATION_ID,
    deploymentId: DEPLOYMENT_ID,
    status: "active",
    audienceUrl: `https://sketchcatch.example.com/observe/${OBSERVATION_ID}`,
    createdAt: "2026-07-11T00:00:00.000Z",
    expiresAt: "2026-07-11T00:15:00.000Z"
  });
  assert.equal(JSON.stringify(response).includes("credential"), false);
  assert.equal(JSON.stringify(response).includes("trafficUrl"), false);
  assert.equal(response.snapshot.live.acceptedEventCount, 0);
});

test("v2 service returns the active deployment session and enforces deployment ownership on read", async () => {
  const service = createLiveObservationV2Service({
    audienceBaseUrl: "https://sketchcatch.example.com",
    capabilityKid: "current-key",
    createObservationId: () => OBSERVATION_ID,
    manifestRepository: new FakeManifestRepository(createValidRecord()),
    store: createInMemoryLiveObservationStore({ now: () => NOW_MS })
  });
  const created = await service.createSession(DEPLOYMENT_ID);

  assert.deepEqual(await service.createSession(DEPLOYMENT_ID), created);
  assert.equal(
    (await service.readSession(DEPLOYMENT_ID, OBSERVATION_ID)).snapshot.status,
    "active"
  );
  await assert.rejects(
    () => service.readSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OBSERVATION_ID),
    (error) => error instanceof LiveObservationV2ServiceError && error.code === "LIVE_OBSERVATION_NOT_FOUND"
  );
});

test("v2 service stops a session without retaining manifest or capability in its response", async () => {
  const service = createLiveObservationV2Service({
    audienceBaseUrl: "https://sketchcatch.example.com",
    capabilityKid: "current-key",
    createObservationId: () => OBSERVATION_ID,
    manifestRepository: new FakeManifestRepository(createValidRecord()),
    store: createInMemoryLiveObservationStore({ now: () => NOW_MS })
  });
  await service.createSession(DEPLOYMENT_ID);

  const stopped = await service.stopSession(DEPLOYMENT_ID, OBSERVATION_ID);

  assert.equal(stopped.snapshot.status, "stopped");
  assert.equal(JSON.stringify(stopped).includes("manifest"), false);
  assert.equal(JSON.stringify(stopped).includes("capability"), false);
});

test("v2 service fails closed when the deployment has no valid manifest", async () => {
  for (const record of [null, createInvalidRecord()]) {
    const service = createLiveObservationV2Service({
      audienceBaseUrl: "https://sketchcatch.example.com",
      capabilityKid: "current-key",
      createObservationId: () => OBSERVATION_ID,
      manifestRepository: new FakeManifestRepository(record),
      store: createInMemoryLiveObservationStore({ now: () => NOW_MS })
    });

    await assert.rejects(
      () => service.createSession(DEPLOYMENT_ID),
      (error) =>
        error instanceof LiveObservationV2ServiceError &&
        error.code === "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE"
    );
  }
});

class FakeManifestRepository implements DeploymentLiveObservationManifestRepository {
  constructor(private readonly record: DeploymentLiveObservationManifestRecord | null) {}

  async findByDeploymentId() {
    return this.record;
  }

  async saveValid(): Promise<DeploymentLiveObservationManifestRecord> {
    throw new Error("not used");
  }

  async saveInvalid(): Promise<DeploymentLiveObservationManifestRecord> {
    throw new Error("not used");
  }
}

function createValidRecord(): DeploymentLiveObservationManifestRecord {
  return {
    deploymentId: DEPLOYMENT_ID,
    schemaVersion: 2,
    status: "valid",
    manifest: createManifest(),
    invalidReason: null,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}

function createInvalidRecord(): DeploymentLiveObservationManifestRecord {
  return {
    deploymentId: DEPLOYMENT_ID,
    schemaVersion: 2,
    status: "manifest_invalid",
    manifest: null,
    invalidReason: "Live Observation manifest verification failed.",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z"
  };
}

function createManifest(): DeploymentLiveObservationManifestV2 {
  return {
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId: DEPLOYMENT_ID,
      terraformArtifactSha256: "0123456789abcdef".repeat(4),
      awsConnectionId: "abcdef12-3456-4789-8abc-def012345678",
      region: "ap-northeast-2",
      verifiedAt: "2026-07-11T00:00:00.000Z"
    },
    endpoints: {
      audienceBaseUrl: "https://sketchcatch.example.com",
      trafficUrl: "https://traffic.example.com/events"
    },
    pressure: {
      metric: "requests_per_target_per_minute",
      target: 60,
      windowSeconds: 60
    },
    adapter: {
      kind: "aws-live-observation",
      version: 2,
      payload: {
        loadBalancerArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/customer-platform/50dc6c495c0c9188",
        targetGroupArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/customer-api/6d0ecf831eec9f09",
        capacityTarget: {
          kind: "asg",
          autoScalingGroupName: "customer-platform-asg"
        }
      }
    }
  };
}
