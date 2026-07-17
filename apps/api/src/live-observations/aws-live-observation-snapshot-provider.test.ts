import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAwsLiveObservationSnapshotProvider,
  type AwsLiveObservationSnapshotTarget
} from "./aws-live-observation-snapshot-provider.js";
import { parseLiveObservationProviderSnapshot } from "./live-observation-provider-snapshot.js";

const NOW_MS = Date.parse("2026-07-16T05:00:30.000Z");
const PERIOD_START = new Date("2026-07-16T04:59:00.000Z");
const FIXED_TARGET: AwsLiveObservationSnapshotTarget = {
  awsConnectionId: "66666666-7777-4888-8999-000000000000",
  roleArn: "arn:aws:iam::123456789012:role/sketchcatch-observer",
  externalId: "observer-external-id",
  region: "ap-northeast-2",
  loadBalancerArnSuffix: "app/demo/1234567890abcdef",
  targetGroupArn:
    "arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/demo/1234567890abcdef",
  targetGroupArnSuffix: "targetgroup/demo/1234567890abcdef",
  logGroupNames: [],
  capacityTarget: {
    kind: "ecs_fargate",
    clusterName: "demo-cluster",
    serviceName: "demo-service",
    maxCapacity: null
  }
};

test("parses complete fixed Fargate last-known evidence as delayed", () => {
  const delayed = {
    requests: 12,
    errorRate: 1.5,
    p95LatencyMs: 25,
    availability: 98.5,
    capacity: { desired: 2, running: 2, healthy: 2, max: null },
    logs: [],
    observedAt: "2026-07-16T04:58:00.000Z",
    state: "delayed" as const
  };

  assert.deepEqual(parseLiveObservationProviderSnapshot(delayed), delayed);
});

test("rejects retained quantitative evidence when provider state is unavailable", () => {
  assert.throws(
    () =>
      parseLiveObservationProviderSnapshot({
        requests: 12,
        errorRate: 1.5,
        p95LatencyMs: 25,
        availability: 98.5,
        capacity: { desired: 2, running: 2, healthy: 2, max: null },
        logs: [],
        observedAt: "2026-07-16T04:58:00.000Z",
        state: "unavailable"
      }),
    /Unavailable snapshots must not retain quantitative evidence/
  );
});

test("rejects partial delayed quantitative evidence", () => {
  assert.throws(
    () =>
      parseLiveObservationProviderSnapshot({
        requests: 12,
        errorRate: 1.5,
        p95LatencyMs: 25,
        availability: 98.5,
        capacity: { desired: 2, running: null, healthy: 2, max: null },
        logs: [],
        observedAt: "2026-07-16T04:58:00.000Z",
        state: "delayed"
      }),
    /Delayed snapshots require complete last-known provider evidence/
  );
});

test("observes fixed Fargate capacity without inventing a scaling maximum", async () => {
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    prepareCredentials: async () => ({
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      sessionToken: "test-session-token"
    }),
    cloudWatchClientFactory: () => ({
      async getMetricData() {
        return {
          metricDataResults: [
            metric("responses_2xx", 2),
            metric("responses_3xx", 0),
            metric("responses_4xx", 0),
            metric("responses_5xx", 0),
            metric("latency", 0.025)
          ]
        };
      }
    }),
    autoScalingClientFactory: () => ({
      async describeAutoScalingGroup() {
        assert.fail("fixed Fargate observation must not read an Auto Scaling Group");
      }
    }),
    ecsClientFactory: () => ({
      async describeService(clusterName, serviceName) {
        assert.equal(clusterName, "demo-cluster");
        assert.equal(serviceName, "demo-service");
        return { service: { desiredCount: 2, runningCount: 2 } };
      }
    }),
    targetHealthClientFactory: () => ({
      async describeTargetHealth(targetGroupArn) {
        assert.equal(targetGroupArn, FIXED_TARGET.targetGroupArn);
        return {
          targets: [
            { id: "10.0.1.10", state: "healthy" },
            { id: "10.0.2.10", state: "healthy" }
          ]
        };
      }
    }),
    logsClientFactory: () => ({
      async filterLogEvents() {
        return { events: [] };
      }
    })
  });

  const snapshot = await provider.observe(
    FIXED_TARGET,
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  );

  assert.deepEqual(snapshot.capacity, {
    desired: 2,
    running: 2,
    healthy: 2,
    max: null
  });
});

test("reuses expired available evidence only for delayed CloudWatch refreshes", async () => {
  let nowMs = NOW_MS;
  let metricReadCount = 0;
  const delayedPeriodStart = new Date("2026-07-16T05:00:00.000Z");
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => nowMs,
    cacheTtlMs: 10_000,
    prepareCredentials: async () => ({
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      sessionToken: "test-session-token"
    }),
    cloudWatchClientFactory: () => ({
      async getMetricData() {
        metricReadCount += 1;
        if (metricReadCount === 4) {
          return {
            metricDataResults: [
              {
                ...metric("responses_2xx", 2),
                statusCode: "PartialData" as const
              }
            ]
          };
        }
        const timestamp = metricReadCount === 1 ? PERIOD_START : delayedPeriodStart;
        return {
          metricDataResults: [
            metric("responses_2xx", 2, timestamp),
            metric("responses_3xx", 0, timestamp),
            metric("responses_4xx", 0, timestamp),
            metric("responses_5xx", 0, timestamp),
            metric("latency", 0.025, timestamp)
          ]
        };
      }
    }),
    autoScalingClientFactory: () => ({
      async describeAutoScalingGroup() {
        assert.fail("fixed Fargate observation must not read an Auto Scaling Group");
      }
    }),
    ecsClientFactory: () => ({
      async describeService() {
        return { service: { desiredCount: 2, runningCount: 2 } };
      }
    }),
    targetHealthClientFactory: () => ({
      async describeTargetHealth() {
        return {
          targets: [
            { id: "10.0.1.10", state: "healthy" },
            { id: "10.0.2.10", state: "healthy" }
          ]
        };
      }
    }),
    logsClientFactory: () => ({
      async filterLogEvents() {
        return { events: [] };
      }
    })
  });
  const observationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const available = await provider.observe(FIXED_TARGET, observationId);
  assert.equal(available.state, "available");

  nowMs = Date.parse("2026-07-16T05:02:30.000Z");
  const delayed = await provider.observe(FIXED_TARGET, observationId);
  assert.deepEqual(delayed, {
    requests: 2,
    errorRate: 0,
    p95LatencyMs: 25,
    availability: 100,
    capacity: { desired: 2, running: 2, healthy: 2, max: null },
    logs: [],
    observedAt: "2026-07-16T05:01:00.000Z",
    state: "delayed"
  });

  nowMs = Date.parse("2026-07-16T05:02:41.000Z");
  const repeatedDelayed = await provider.observe(FIXED_TARGET, observationId);
  assert.deepEqual(repeatedDelayed, delayed);

  nowMs = Date.parse("2026-07-16T05:02:52.000Z");
  const unavailable = await provider.observe(FIXED_TARGET, observationId);
  assert.equal(unavailable.state, "unavailable");
  assert.deepEqual(
    {
      requests: unavailable.requests,
      errorRate: unavailable.errorRate,
      p95LatencyMs: unavailable.p95LatencyMs,
      availability: unavailable.availability,
      capacity: unavailable.capacity
    },
    {
      requests: null,
      errorRate: null,
      p95LatencyMs: null,
      availability: null,
      capacity: { desired: null, running: null, healthy: null, max: null }
    }
  );
});

test("keeps expired evidence isolated until its own observation refreshes", async () => {
  let nowMs = NOW_MS;
  let metricReadCount = 0;
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => nowMs,
    cacheTtlMs: 10_000,
    prepareCredentials: async () => ({
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      sessionToken: "test-session-token"
    }),
    cloudWatchClientFactory: () => ({
      async getMetricData() {
        metricReadCount += 1;
        const timestamp = metricReadCount === 1
          ? PERIOD_START
          : metricReadCount === 2
            ? new Date("2026-07-16T05:01:00.000Z")
            : new Date("2026-07-16T05:00:00.000Z");
        return {
          metricDataResults: [
            metric("responses_2xx", 2, timestamp),
            metric("responses_3xx", 0, timestamp),
            metric("responses_4xx", 0, timestamp),
            metric("responses_5xx", 0, timestamp),
            metric("latency", 0.025, timestamp)
          ]
        };
      }
    }),
    autoScalingClientFactory: () => ({
      async describeAutoScalingGroup() {
        assert.fail("fixed Fargate observation must not read an Auto Scaling Group");
      }
    }),
    ecsClientFactory: () => ({
      async describeService() {
        return { service: { desiredCount: 2, runningCount: 2 } };
      }
    }),
    targetHealthClientFactory: () => ({
      async describeTargetHealth() {
        return {
          targets: [
            { id: "10.0.1.10", state: "healthy" },
            { id: "10.0.2.10", state: "healthy" }
          ]
        };
      }
    }),
    logsClientFactory: () => ({
      async filterLogEvents() {
        return { events: [] };
      }
    })
  });
  const observationA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const observationB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const availableA = await provider.observe(FIXED_TARGET, observationA);
  assert.equal(availableA.state, "available");

  nowMs = Date.parse("2026-07-16T05:02:30.000Z");
  const availableB = await provider.observe(FIXED_TARGET, observationB);
  assert.equal(availableB.state, "available");

  const delayedA = await provider.observe(FIXED_TARGET, observationA);
  assert.deepEqual(delayedA, {
    ...availableA,
    observedAt: "2026-07-16T05:01:00.000Z",
    state: "delayed"
  });
});

function metric(id: string, value: number, timestamp: Date = PERIOD_START) {
  return {
    id,
    statusCode: "Complete" as const,
    timestamps: [timestamp],
    values: [value]
  };
}
