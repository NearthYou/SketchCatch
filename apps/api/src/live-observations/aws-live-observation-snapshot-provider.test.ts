import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAwsLiveObservationSnapshotProvider,
  type AwsLiveObservationSnapshotTarget
} from "./aws-live-observation-snapshot-provider.js";

const NOW_MS = Date.parse("2026-07-11T00:05:00.000Z");
const OBSERVED_AT = new Date(NOW_MS - 60_000);
const CREDENTIALS = {
  accessKeyId: "AKIAEXAMPLE00000000",
  secretAccessKey: "secret",
  sessionToken: "session",
  expiration: new Date(NOW_MS + 60_000)
};

test("AWS snapshot provider normalizes ALB metrics, ASG capacity, and redacted bounded logs", async () => {
  const metricInputs: unknown[] = [];
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({
      async getMetricData(input) {
        metricInputs.push(input);
        return {
          metricDataResults: [
            { id: "requests", timestamps: [OBSERVED_AT], values: [120] },
            { id: "errors", timestamps: [OBSERVED_AT], values: [3] },
            { id: "latency", timestamps: [OBSERVED_AT], values: [0.183] }
          ]
        };
      }
    }),
    autoScalingClientFactory: () => ({
      async describeAutoScalingGroup() {
        return {
          autoScalingGroups: [{
            autoScalingGroupName: "customer-asg",
            desiredCapacity: 2,
            maxSize: 4,
            instances: [
              { instanceId: "i-1", lifecycleState: "InService", healthStatus: "Healthy" },
              { instanceId: "i-2", lifecycleState: "Pending", healthStatus: "Healthy" }
            ]
          }]
        };
      }
    }),
    ecsClientFactory: () => ({ async describeService() { return {}; } }),
    logsClientFactory: () => ({
      async filterLogEvents() {
        return {
          events: Array.from({ length: 60 }, (_, index) => ({
            timestamp: NOW_MS - index,
            message: index === 0
              ? "password=super-secret AWS_SECRET_ACCESS_KEY=raw-secret"
              : `request ${index}`
          }))
        };
      }
    })
  });

  const snapshot = await provider.observe(createTarget(), "observation-1");
  await provider.observe(createTarget(), "observation-1");

  assert.deepEqual(snapshot, {
    requests: 120,
    errorRate: 2.5,
    p95LatencyMs: 183,
    availability: 97.5,
    capacity: { desired: 2, running: 2, healthy: 1, max: 4 },
    logs: snapshot.logs,
    observedAt: OBSERVED_AT.toISOString(),
    state: "available"
  });
  assert.equal(snapshot.logs.length, 50);
  assert.equal(JSON.stringify(snapshot.logs).includes("super-secret"), false);
  assert.equal(JSON.stringify(snapshot.logs).includes("raw-secret"), false);
  assert.match(snapshot.logs[0]?.message ?? "", /\[REDACTED\]/);
  assert.deepEqual(
    (metricInputs[0] as { metrics: Array<{ metricName: string; stat: string; scope: string }> }).metrics,
    [
      { id: "requests", metricName: "RequestCount", stat: "Sum", scope: "load_balancer" },
      { id: "errors", metricName: "HTTPCode_Target_5XX_Count", stat: "Sum", scope: "target_group" },
      { id: "latency", metricName: "TargetResponseTime", stat: "p95", scope: "target_group" }
    ]
  );
  assert.equal(metricInputs.length, 1);
});

test("delayed or unavailable AWS evidence never retains quantitative values", async () => {
  for (const mode of ["delayed", "missing"] as const) {
    const provider = createAwsLiveObservationSnapshotProvider({
      now: () => NOW_MS,
      async prepareCredentials() { return CREDENTIALS; },
      cloudWatchClientFactory: () => ({
        async getMetricData() {
          if (mode === "missing") return { metricDataResults: [] };
          const timestamp = new Date(NOW_MS - 180_000);
          return { metricDataResults: [
            { id: "requests", timestamps: [timestamp], values: [999] },
            { id: "errors", timestamps: [timestamp], values: [999] },
            { id: "latency", timestamps: [timestamp], values: [999] }
          ] };
        }
      }),
      autoScalingClientFactory: () => ({
        async describeAutoScalingGroup() {
          return { autoScalingGroups: [{
            autoScalingGroupName: "customer-asg",
            desiredCapacity: 9,
            maxSize: 10,
            instances: []
          }] };
        }
      }),
      ecsClientFactory: () => ({ async describeService() { return {}; } }),
      logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
    });

    const snapshot = await provider.observe(createTarget(), `observation-${mode}`);
    assert.deepEqual(
      {
        requests: snapshot.requests,
        errorRate: snapshot.errorRate,
        p95LatencyMs: snapshot.p95LatencyMs,
        availability: snapshot.availability,
        capacity: snapshot.capacity
      },
      {
        requests: null,
        errorRate: null,
        p95LatencyMs: null,
        availability: null,
        capacity: { desired: null, running: null, healthy: null, max: null }
      }
    );
    assert.equal(snapshot.state, mode === "delayed" ? "delayed" : "unavailable");
  }
});

test("ECS/Fargate capacity uses desired and running task evidence", async () => {
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({ async getMetricData() { return { metricDataResults: [
      { id: "requests", timestamps: [OBSERVED_AT], values: [0] },
      { id: "errors", timestamps: [OBSERVED_AT], values: [0] },
      { id: "latency", timestamps: [OBSERVED_AT], values: [0.01] }
    ] }; } }),
    autoScalingClientFactory: () => ({ async describeAutoScalingGroup() { return {}; } }),
    ecsClientFactory: () => ({
      async describeService() {
        return { service: { desiredCount: 3, runningCount: 2 } };
      }
    }),
    logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
  });
  const target = createTarget();
  target.capacityTarget = {
    kind: "ecs_fargate",
    clusterName: "customer-cluster",
    serviceName: "customer-service",
    maxCapacity: 4
  };

  const snapshot = await provider.observe(target, "observation-ecs");

  assert.deepEqual(snapshot.capacity, { desired: 3, running: 2, healthy: 2, max: 4 });
  assert.equal(snapshot.availability, 100);
});

function createTarget(): AwsLiveObservationSnapshotTarget {
  return {
    awsConnectionId: "abcdef12-3456-4789-8abc-def012345678",
    roleArn: "arn:aws:iam::123456789012:role/customer-observer",
    externalId: "external-id",
    region: "ap-northeast-2",
    loadBalancerArnSuffix: "app/customer-platform/50dc6c495c0c9188",
    targetGroupArnSuffix: "targetgroup/customer-api/6d0ecf831eec9f09",
    logGroupNames: ["/aws/ecs/customer-platform"],
    capacityTarget: { kind: "asg", autoScalingGroupName: "customer-asg" }
  };
}
