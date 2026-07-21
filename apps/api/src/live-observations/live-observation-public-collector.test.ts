import assert from "node:assert/strict";
import test from "node:test";
import type { DeploymentLiveObservationManifestV2 } from "@sketchcatch/types";
import type { LiveObservationStore } from "./live-observation-store.js";
import { createLiveObservationPublicCollector } from "./live-observation-public-collector.js";

const OBSERVATION_ID = "11111111-1111-4111-8111-111111111111";
const DEPLOYMENT_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = "2026-07-22T00:00:00.000Z";
const EXPIRES_AT = "2026-07-22T00:15:00.000Z";
const EVALUATED_AT = "2026-07-22T00:01:00.000Z";

test("records verified target traffic without a separate per-IP limiter", async () => {
  let transportCalls = 0;
  const store = {
    async collectEvent() {
      return {
        kind: "accepted",
        live: {
          acceptedEventCount: 1,
          observedAt: EVALUATED_AT,
          pressureLevel: "normal",
          pressurePercent: 10,
          projectedRequestsPerMinute: 6,
          rollingRequestsPerSecond: 0.1
        }
      };
    },
    async readSession() {
      return {
        evaluatedAt: EVALUATED_AT,
        kind: "active",
        session: {
          capability: { kid: "current", tokenVersion: 1 },
          createdAt: CREATED_AT,
          deploymentId: DEPLOYMENT_ID,
          expiresAt: EXPIRES_AT,
          manifest: createManifest(),
          observationId: OBSERVATION_ID
        }
      };
    }
  } as unknown as LiveObservationStore;
  const collector = createLiveObservationPublicCollector({
    capability: { verify: () => true } as never,
    store,
    trafficTransport: {
      async post() {
        transportCalls += 1;
        return { status: 204 };
      }
    }
  });
  const authorized = await collector.authorize({
    authorization: `LiveObservation current.${"a".repeat(43)}`,
    observationId: OBSERVATION_ID,
    origin: "https://deployed-app.example.com"
  });

  const result = await authorized.request({
    eventId: "33333333-3333-4333-8333-333333333333"
  });

  assert.deepEqual(result, { accepted: true, acceptedEventCount: 1 });
  assert.equal(transportCalls, 1);

  const receipt = await authorized.receipt({
    eventId: "55555555-5555-4555-8555-555555555555"
  });
  assert.deepEqual(receipt, { accepted: true, acceptedEventCount: 1 });
  assert.equal(transportCalls, 1);
});

function createManifest(): DeploymentLiveObservationManifestV2 {
  return {
    schemaVersion: 2,
    provider: "aws",
    provenance: {
      deploymentId: DEPLOYMENT_ID,
      terraformArtifactSha256: "a".repeat(64),
      awsConnectionId: "44444444-4444-4444-8444-444444444444",
      region: "ap-northeast-2",
      verifiedAt: CREATED_AT
    },
    endpoints: {
      audienceBaseUrl: "https://audience.example.com",
      audienceApplicationUrl: "https://deployed-app.example.com",
      trafficUrl: "https://api.example.com/traffic"
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
        trafficHostname: "api.example.com",
        loadBalancerDnsName: "demo-1234567890.ap-northeast-2.elb.amazonaws.com",
        loadBalancerArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:loadbalancer/app/demo/1234567890abcdef",
        targetGroupArn:
          "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/1234567890abcdef",
        capacityTarget: {
          kind: "asg",
          autoScalingGroupName: "demo-asg"
        }
      }
    }
  };
}
