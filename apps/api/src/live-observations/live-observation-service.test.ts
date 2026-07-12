import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import type { RuntimeCache } from "../runtime-cache/index.js";
import type { DeploymentObservabilityProvider } from "./deployment-observability-provider.js";
import {
  LiveObservationServiceError,
  createLiveObservationService,
  getLiveObservationPressureLevel
} from "./live-observation-service.js";

const fixedNowMs = Date.parse("2026-07-10T09:00:00.000Z");

test("getLiveObservationPressureLevel preserves exact pressure boundaries", () => {
  assert.equal(getLiveObservationPressureLevel(39.99), "normal");
  assert.equal(getLiveObservationPressureLevel(40), "warning");
  assert.equal(getLiveObservationPressureLevel(69.99), "warning");
  assert.equal(getLiveObservationPressureLevel(70), "high");
  assert.equal(getLiveObservationPressureLevel(99.99), "high");
  assert.equal(getLiveObservationPressureLevel(100), "critical");
});

test("createSession validates deployment eligibility and reuses one active session", async () => {
  let observationSequence = 0;
  const service = createService({
    createObservationId: () => `observation-${++observationSequence}`,
    createPublicToken: () => `token-${observationSequence}`
  });

  const first = await service.createSession(createSessionInput());
  const second = await service.createSession(createSessionInput());

  assert.equal(first.session.id, "observation-1");
  assert.equal(second.session.id, first.session.id);
  assert.equal(first.session.status, "active");
  assert.equal(first.session.trafficApiUrl, "https://traffic.example.com/api/traffic");
  assert.match(first.session.audienceUrl, /^https:\/\/audience\.example\.com\//);
  assert.match(first.session.audienceUrl, /observation=token-1/);
  assert.match(first.session.audienceUrl, /collector=https%3A%2F%2Fapp\.example\.com/);
  assert.match(first.session.audienceUrl, /traffic=https%3A%2F%2Ftraffic\.example\.com%2Fapi%2Ftraffic/);
  assert.equal(first.session.createdAt, "2026-07-10T09:00:00.000Z");
  assert.equal(first.session.expiresAt, "2026-07-10T09:15:00.000Z");

  await assert.rejects(
    () => service.createSession(createSessionInput({ status: "FAILED" })),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE")
  );
  await assert.rejects(
    () => service.createSession(createSessionInput({ liveProfile: "practice" })),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE")
  );
  await assert.rejects(
    () =>
      service.createSession(
        createSessionInput({
          outputs: {
            ...createRequiredOutputs(),
            scale_out_threshold: null
          }
        })
      ),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_OUTPUT_INVALID")
  );
});

test("createSession accepts ECS Fargate outputs and builds an ECS service observation target", async () => {
  let observedTarget: unknown;
  const service = createService({
    observabilityProvider: {
      async observe(target, observationId) {
        observedTarget = target;
        return createObservabilityProvider().observe(target, observationId);
      }
    }
  });

  await service.createSession(
    createSessionInput({
      outputs: {
        ...createRequiredOutputs(),
        asg_name: undefined,
        ecs_cluster_name: "demo-cluster",
        ecs_service_name: "demo-service",
        max_capacity: 2
      }
    })
  );

  assert.deepEqual(observedTarget, {
    albArnSuffix: "app/demo/123",
    awsConnectionId: "connection-1",
    capacityTarget: {
      clusterName: "demo-cluster",
      kind: "ecs_service",
      maxCapacity: 2,
      serviceName: "demo-service"
    },
    externalId: "external-id",
    region: "ap-northeast-2",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-demo",
    targetGroupArnSuffix: "targetgroup/demo/456"
  });
});

test("collectEvent deduplicates receipts and computes rolling pressure from accepted events", async () => {
  const service = createService();
  const created = await service.createSession(createSessionInput());

  for (let index = 0; index < 10; index += 1) {
    const result = await service.collectEvent({
      eventId: `event-${index}`,
      publicToken: "public-token"
    });

    assert.equal(result.accepted, true);
    assert.equal(result.acceptedEventCount, index + 1);
  }

  const duplicate = await service.collectEvent({
    eventId: "event-0",
    publicToken: "public-token"
  });
  const snapshot = await service.getSnapshot(created.session.id);

  assert.deepEqual(duplicate, {
    accepted: false,
    acceptedEventCount: 10
  });
  assert.equal(snapshot.live.acceptedEventCount, 10);
  assert.equal(snapshot.live.rollingRequestsPerSecond, 1);
  assert.equal(snapshot.live.projectedRequestsPerMinute, 60);
  assert.equal(snapshot.live.pressurePercent, 100);
  assert.equal(snapshot.live.pressureLevel, "critical");
});

test("collectEvent enforces burst rate limit without counting rejected receipts", async () => {
  const service = createService();
  const created = await service.createSession(createSessionInput());

  for (let index = 0; index < 20; index += 1) {
    await service.collectEvent({
      eventId: `burst-${index}`,
      publicToken: "public-token"
    });
  }

  await assert.rejects(
    () =>
      service.collectEvent({
        eventId: "burst-20",
        publicToken: "public-token"
      }),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_RATE_LIMITED")
  );

  assert.equal((await service.getSnapshot(created.session.id)).live.acceptedEventCount, 20);
});

test("collectEvent does not reset the burst allowance at a one-second boundary", async () => {
  let nowMs = fixedNowMs + 999;
  const service = createService({ now: () => nowMs });
  await service.createSession(createSessionInput());

  for (let index = 0; index < 20; index += 1) {
    await service.collectEvent({
      eventId: `boundary-${index}`,
      publicToken: "public-token"
    });
  }

  nowMs = fixedNowMs + 1_001;
  await assert.rejects(
    () =>
      service.collectEvent({
        eventId: "boundary-next-second",
        publicToken: "public-token"
      }),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_RATE_LIMITED")
  );
});

test("collectEvent enforces the ten-second rolling rate window across fixed boundaries", async () => {
  let nowMs = fixedNowMs;
  const service = createService({ now: () => nowMs });
  await service.createSession(createSessionInput());

  const eventsBySecond = new Map([
    [1, 2],
    [2, 1],
    [3, 1],
    [5, 20],
    [6, 19],
    [7, 19],
    [8, 19],
    [9, 19]
  ]);

  for (const [second, eventCount] of eventsBySecond) {
    nowMs = fixedNowMs + second * 1_000 + 999;
    for (let event = 0; event < eventCount; event += 1) {
      await service.collectEvent({
        eventId: `rolling-${second}-${event}`,
        publicToken: "public-token"
      });
    }
  }

  nowMs = fixedNowMs + 10_999;
  await assert.rejects(
    () =>
      service.collectEvent({
        eventId: "rolling-fixed-window-reset",
        publicToken: "public-token"
      }),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_RATE_LIMITED")
  );
});

test("collectEvent keeps the accepted count bounded when the session event cap is reached", async () => {
  const service = createService({ maxAcceptedEvents: 2 });
  const created = await service.createSession(createSessionInput());

  await service.collectEvent({ eventId: "capped-1", publicToken: "public-token" });
  await service.collectEvent({ eventId: "capped-2", publicToken: "public-token" });
  await assert.rejects(
    () => service.collectEvent({ eventId: "capped-3", publicToken: "public-token" }),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_RATE_LIMITED")
  );

  assert.equal((await service.getSnapshot(created.session.id)).live.acceptedEventCount, 2);
});

test("stopSession ends observation without changing infrastructure and collector returns gone", async () => {
  const terminalObservationIds: string[] = [];
  const service = createService({
    onSessionTerminal: (observationId) => terminalObservationIds.push(observationId)
  });
  const created = await service.createSession(createSessionInput());

  const stopped = await service.stopSession(created.session.id, created.session.deploymentId);

  assert.equal(stopped.status, "stopped");
  assert.deepEqual(terminalObservationIds, [created.session.id]);
  assert.equal((await service.getSnapshot(created.session.id)).status, "stopped");
  await assert.rejects(
    () => service.collectEvent({ eventId: "after-stop", publicToken: "public-token" }),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_GONE")
  );
});

test("natural session expiry releases provider-owned observation state", async () => {
  let currentTimeMs = fixedNowMs;
  const terminalObservationIds: string[] = [];
  const service = createService({
    now: () => currentTimeMs,
    onSessionTerminal: (observationId) => terminalObservationIds.push(observationId)
  });
  const created = await service.createSession(createSessionInput());

  currentTimeMs = Date.parse(created.session.expiresAt);
  const expired = await service.getSnapshot(created.session.id);

  assert.equal(expired.status, "expired");
  assert.deepEqual(terminalObservationIds, [created.session.id]);
});

test("createSession requires a healthy Redis backend when shared cache is required", async () => {
  const service = createService({ requireSharedCache: true });

  await assert.rejects(
    () => service.createSession(createSessionInput()),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_CACHE_UNAVAILABLE")
  );
});

test("createSession fails when Redis writes degrade to process memory after readiness", async () => {
  const backingCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  let degradationCount = 0;
  const degradedRedisCache: RuntimeCache = {
    backend: "redis",
    delete: (key) => backingCache.delete(key),
    get: (key) => backingCache.get(key),
    getDegradationCount: () => degradationCount,
    increment: (key, delta, options) => backingCache.increment(key, delta, options),
    isAvailable: async () => true,
    async set(key, value, options) {
      degradationCount += 1;
      await backingCache.set(key, value, options);
    },
    setIfAbsent: (key, value, options) =>
      backingCache.setIfAbsent(key, value, options)
  };
  const service = createService({
    requireSharedCache: true,
    runtimeCache: degradedRedisCache
  });

  await assert.rejects(
    () => service.createSession(createSessionInput()),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_CACHE_UNAVAILABLE")
  );
});

test("createSession fails when Redis degrades while loading the initial snapshot", async () => {
  const backingCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  let degradationCount = 0;
  const degradedRedisCache: RuntimeCache = {
    backend: "redis",
    delete: (key) => backingCache.delete(key),
    get: (key) => backingCache.get(key),
    getDegradationCount: () => degradationCount,
    increment: (key, delta, options) => backingCache.increment(key, delta, options),
    isAvailable: async () => true,
    async set(key, value, options) {
      if (key.key.endsWith(":aws")) {
        degradationCount += 1;
      }
      await backingCache.set(key, value, options);
    },
    setIfAbsent: (key, value, options) =>
      backingCache.setIfAbsent(key, value, options)
  };
  const service = createService({
    requireSharedCache: true,
    runtimeCache: degradedRedisCache
  });

  await assert.rejects(
    () => service.createSession(createSessionInput()),
    (error: unknown) => hasServiceCode(error, "LIVE_OBSERVATION_CACHE_UNAVAILABLE")
  );
});

function createService(
  overrides: Partial<Parameters<typeof createLiveObservationService>[0]> = {}
) {
  return createLiveObservationService({
    createObservationId: () => "observation-1",
    createPublicToken: () => "public-token",
    now: () => fixedNowMs,
    observabilityProvider: createObservabilityProvider(),
    publicApiBaseUrl: "https://app.example.com",
    runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
    ...overrides
  });
}

function createSessionInput(
  overrides: Partial<Parameters<ReturnType<typeof createLiveObservationService>["createSession"]>[0]> = {}
) {
  return {
    deploymentId: "deployment-1",
    liveProfile: "demo_web_service" as const,
    observationTarget: {
      awsConnectionId: "connection-1",
      externalId: "external-id",
      region: "ap-northeast-2",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-demo"
    },
    outputs: createRequiredOutputs(),
    status: "SUCCESS" as const,
    ...overrides
  };
}

function createRequiredOutputs(): Record<string, unknown> {
  return {
    alb_arn_suffix: "app/demo/123",
    api_base_url: "https://traffic.example.com",
    asg_name: "demo-asg",
    scale_out_threshold: 60,
    static_site_url: "https://audience.example.com/",
    target_group_arn_suffix: "targetgroup/demo/456"
  };
}

function createObservabilityProvider(): DeploymentObservabilityProvider {
  return {
    async observe() {
      return {
        capacity: {
          currentInstanceCount: 1,
          desiredCapacity: 1,
          errorCode: null,
          inServiceInstanceCount: 1,
          instances: [
            {
              healthStatus: "Healthy",
              instanceId: "i-123",
              lifecycleState: "InService"
            }
          ],
          latestActivity: null,
          maxCapacity: 2,
          observedAt: "2026-07-10T09:00:00.000Z",
          state: "available"
        },
        cloudWatch: {
          delayedBySeconds: 60,
          errorCode: null,
          observedAt: "2026-07-10T08:59:00.000Z",
          periodSeconds: 60,
          requestCountPerTarget: 10,
          state: "delayed"
        }
      };
    }
  };
}

function hasServiceCode(error: unknown, code: LiveObservationServiceError["code"]): boolean {
  return error instanceof LiveObservationServiceError && error.code === code;
}
