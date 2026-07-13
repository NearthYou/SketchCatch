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
    targetHealthClientFactory: () => ({
      async describeTargetHealth() {
        return { targets: [{ id: "i-1", state: "healthy" }] };
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
    capacity: { desired: 2, running: 1, healthy: 1, max: 4 },
    logs: snapshot.logs,
    observedAt: new Date(NOW_MS).toISOString(),
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

test("metric freshness is measured from the completed period end", async () => {
  const periodStart = new Date(NOW_MS - 120_000);
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({ async getMetricData() { return {
      metricDataResults: [
        { id: "requests", timestamps: [periodStart], values: [10] },
        { id: "errors", timestamps: [periodStart], values: [0] },
        { id: "latency", timestamps: [periodStart], values: [0.1] }
      ]
    }; } }),
    autoScalingClientFactory: () => ({ async describeAutoScalingGroup() { return {
      autoScalingGroups: [{
        autoScalingGroupName: "customer-asg",
        desiredCapacity: 1,
        maxSize: 2,
        instances: [{ instanceId: "i-1", lifecycleState: "InService", healthStatus: "Healthy" }]
      }]
    }; } }),
    targetHealthClientFactory: () => ({
      async describeTargetHealth() { return { targets: [{ id: "i-1", state: "healthy" }] }; }
    }),
    ecsClientFactory: () => ({ async describeService() { return {}; } }),
    logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
  });

  const snapshot = await provider.observe(createTarget(), "period-end-boundary");

  assert.equal(snapshot.state, "available");
  assert.equal(snapshot.observedAt, new Date(NOW_MS - 60_000).toISOString());
  assert.equal(snapshot.requests, 10);
});

test("misaligned CloudWatch metric periods fail closed without quantitative values", async () => {
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({ async getMetricData() { return {
      metricDataResults: [
        { id: "requests", timestamps: [new Date(NOW_MS - 60_000)], values: [10] },
        { id: "errors", timestamps: [new Date(NOW_MS - 120_000)], values: [0] },
        { id: "latency", timestamps: [new Date(NOW_MS - 60_000)], values: [0.1] }
      ]
    }; } }),
    autoScalingClientFactory: () => ({ async describeAutoScalingGroup() { return {
      autoScalingGroups: [{
        autoScalingGroupName: "customer-asg",
        desiredCapacity: 1,
        maxSize: 2,
        instances: []
      }]
    }; } }),
    targetHealthClientFactory: () => ({
      async describeTargetHealth() { return { targets: [] }; }
    }),
    ecsClientFactory: () => ({ async describeService() { return {}; } }),
    logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
  });

  const snapshot = await provider.observe(createTarget(), "misaligned-periods");

  assert.equal(snapshot.state, "unavailable");
  assert.deepEqual(
    [snapshot.requests, snapshot.errorRate, snapshot.p95LatencyMs, snapshot.availability],
    [null, null, null, null]
  );
  assert.deepEqual(snapshot.capacity, {
    desired: null,
    running: null,
    healthy: null,
    max: null
  });
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
      targetHealthClientFactory: () => ({
        async describeTargetHealth() { return { targets: [] }; }
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
    targetHealthClientFactory: () => ({
      async describeTargetHealth() {
        return { targets: [{ id: "10.0.1.10", state: "healthy" }] };
      }
    }),
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

  assert.deepEqual(snapshot.capacity, { desired: 3, running: 2, healthy: 1, max: 4 });
  assert.equal(snapshot.availability, 100);
});

test("in-flight AWS reads stay single-flight and cache TTL starts after settlement", async () => {
  let now = NOW_MS;
  let metricCalls = 0;
  const deferred = createDeferred<{
    metricDataResults: Array<{ id: string; timestamps: Date[]; values: number[] }>;
  }>();
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => now,
    cacheTtlMs: 1_000,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({
      async getMetricData() {
        metricCalls += 1;
        return deferred.promise;
      }
    }),
    autoScalingClientFactory: () => ({ async describeAutoScalingGroup() { return {
      autoScalingGroups: [{
        autoScalingGroupName: "customer-asg",
        desiredCapacity: 1,
        maxSize: 2,
        instances: [{ instanceId: "i-1", lifecycleState: "InService" }]
      }]
    }; } }),
    targetHealthClientFactory: () => ({
      async describeTargetHealth() { return { targets: [{ id: "i-1", state: "healthy" }] }; }
    }),
    ecsClientFactory: () => ({ async describeService() { return {}; } }),
    logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
  });

  const first = provider.observe(createTarget(), "single-flight");
  await Promise.resolve();
  now += 11_000;
  const second = provider.observe(createTarget(), "single-flight");
  await Promise.resolve();
  assert.equal(metricCalls, 1);

  deferred.resolve({ metricDataResults: metricDataResults(OBSERVED_AT) });
  await Promise.all([first, second]);
  now += 999;
  await provider.observe(createTarget(), "single-flight");
  assert.equal(metricCalls, 1);
  now += 1;
  await provider.observe(createTarget(), "single-flight");
  assert.equal(metricCalls, 2);
});

test("AWS read cache fails closed at capacity when every entry is pending", async () => {
  let metricCalls = 0;
  const deferred = createDeferred<{
    metricDataResults: Array<{ id: string; timestamps: Date[]; values: number[] }>;
  }>();
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    cacheMaxEntries: 2,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({
      async getMetricData() {
        metricCalls += 1;
        return deferred.promise;
      }
    }),
    autoScalingClientFactory: () => ({ async describeAutoScalingGroup() { return {
      autoScalingGroups: [{
        autoScalingGroupName: "customer-asg",
        desiredCapacity: 1,
        maxSize: 2,
        instances: []
      }]
    }; } }),
    targetHealthClientFactory: () => ({ async describeTargetHealth() { return { targets: [] }; } }),
    ecsClientFactory: () => ({ async describeService() { return {}; } }),
    logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
  });

  const first = provider.observe(createTarget(), "cache-a");
  const second = provider.observe(createTarget(), "cache-b");
  const rejectedAtCapacity = provider.observe(createTarget(), "cache-c");
  await Promise.resolve();

  assert.equal(metricCalls, 2);
  const rejectedSnapshot = await rejectedAtCapacity;
  assert.equal(rejectedSnapshot.state, "unavailable");
  deferred.resolve({ metricDataResults: metricDataResults(OBSERVED_AT) });
  await Promise.all([first, second]);
});

test("AWS read cache evicts only the oldest settled entry at capacity", async () => {
  let now = NOW_MS;
  let metricCalls = 0;
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => now,
    cacheMaxEntries: 2,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({ async getMetricData() {
      metricCalls += 1;
      return { metricDataResults: metricDataResults(OBSERVED_AT) };
    } }),
    autoScalingClientFactory: () => ({ async describeAutoScalingGroup() { return {
      autoScalingGroups: [{
        autoScalingGroupName: "customer-asg",
        desiredCapacity: 1,
        maxSize: 2,
        instances: []
      }]
    }; } }),
    targetHealthClientFactory: () => ({ async describeTargetHealth() { return { targets: [] }; } }),
    ecsClientFactory: () => ({ async describeService() { return {}; } }),
    logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
  });

  await provider.observe(createTarget(), "settled-a");
  now += 1;
  await provider.observe(createTarget(), "settled-b");
  now += 1;
  await provider.observe(createTarget(), "settled-c");
  await provider.observe(createTarget(), "settled-b");
  assert.equal(metricCalls, 3);

  await provider.observe(createTarget(), "settled-a");
  assert.equal(metricCalls, 4);
});

test("AWS read deadline aborts credential preparation and settles unavailable", async () => {
  let capturedSignal: AbortSignal | undefined;
  const scheduled = new Set<() => void>();
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    requestTimeoutMs: 1_000,
    deadlineScheduler: {
      schedule(callback) {
        scheduled.add(callback);
        return { cancel: () => scheduled.delete(callback) };
      }
    },
    async prepareCredentials(_target, signal) {
      capturedSignal = signal;
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }
  });

  const pending = provider.observe(createTarget(), "deadline");
  await Promise.resolve();
  assert.equal(scheduled.size, 1);
  assert.equal(capturedSignal?.aborted, false);

  for (const fire of [...scheduled]) fire();
  const snapshot = await pending;

  assert.equal(capturedSignal?.aborted, true);
  assert.equal(snapshot.state, "unavailable");
  assert.equal(scheduled.size, 0);
});

test("target health read failure makes every capacity value unavailable", async () => {
  const provider = createAwsLiveObservationSnapshotProvider({
    now: () => NOW_MS,
    async prepareCredentials() { return CREDENTIALS; },
    cloudWatchClientFactory: () => ({ async getMetricData() { return {
      metricDataResults: metricDataResults(OBSERVED_AT)
    }; } }),
    autoScalingClientFactory: () => ({ async describeAutoScalingGroup() { return {
      autoScalingGroups: [{
        autoScalingGroupName: "customer-asg",
        desiredCapacity: 2,
        maxSize: 4,
        instances: [{ instanceId: "i-1", lifecycleState: "InService" }]
      }]
    }; } }),
    targetHealthClientFactory: () => ({
      async describeTargetHealth() { throw new Error("target health unavailable"); }
    }),
    ecsClientFactory: () => ({ async describeService() { return {}; } }),
    logsClientFactory: () => ({ async filterLogEvents() { return { events: [] }; } })
  });

  const snapshot = await provider.observe(createTarget(), "target-health-failure");

  assert.equal(snapshot.state, "unavailable");
  assert.deepEqual(snapshot.capacity, {
    desired: null,
    running: null,
    healthy: null,
    max: null
  });
});

function createTarget(): AwsLiveObservationSnapshotTarget {
  return {
    awsConnectionId: "abcdef12-3456-4789-8abc-def012345678",
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
  };
}

function metricDataResults(timestamp: Date) {
  return [
    { id: "requests", timestamps: [timestamp], values: [10] },
    { id: "errors", timestamps: [timestamp], values: [0] },
    { id: "latency", timestamps: [timestamp], values: [0.1] }
  ];
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
