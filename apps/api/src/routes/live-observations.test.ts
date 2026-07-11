import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import {
  createLiveObservationService,
  type CreateLiveObservationSessionInput
} from "../live-observations/live-observation-service.js";
import {
  registerLiveObservationRoutes,
  streamLiveObservationSnapshots
} from "./live-observations.js";

const deploymentId = "11111111-1111-4111-8111-111111111111";
const observationId = "22222222-2222-4222-8222-222222222222";
const publicToken = "a".repeat(43);
const nowMs = Date.parse("2026-07-10T09:00:00.000Z");

test("Live Observation routes create, snapshot, stream, collect, and stop one session", async (t) => {
  const app = Fastify();
  const service = createService();

  await app.register(registerLiveObservationRoutes, {
    enabled: true,
    liveObservationService: service,
    loadDeploymentContext: async () => createDeploymentContext(),
    webOrigins: ["https://app.example.com"]
  });
  await app.ready();
  t.after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: `/deployments/${deploymentId}/live-observations`
  });

  assert.equal(created.statusCode, 201);
  const createdBody = created.json();
  assert.equal(createdBody.session.id, observationId);
  assert.equal(createdBody.snapshot.status, "active");

  const snapshot = await app.inject({
    method: "GET",
    url: `/deployments/${deploymentId}/live-observations/${observationId}`
  });

  assert.equal(snapshot.statusCode, 200);
  assert.equal(snapshot.json().snapshot.observationId, observationId);

  const stream = await app.inject({
    method: "GET",
    url: `/deployments/${deploymentId}/live-observations/${observationId}/stream?once=true`
  });

  assert.equal(stream.statusCode, 200);
  assert.match(String(stream.headers["content-type"]), /text\/event-stream/);
  assert.match(stream.body, /event: snapshot/);
  assert.match(stream.body, new RegExp(`"observationId":"${observationId}"`));

  const collected = await app.inject({
    method: "POST",
    url: `/live-observations/public/${publicToken}/events`,
    headers: {
      origin: "https://audience.example.com"
    },
    payload: {
      eventId: "33333333-3333-4333-8333-333333333333"
    }
  });

  assert.equal(collected.statusCode, 202);
  assert.deepEqual(collected.json(), { accepted: true, acceptedEventCount: 1 });
  assert.equal(
    collected.headers["access-control-allow-origin"],
    "https://audience.example.com"
  );

  const duplicate = await app.inject({
    method: "POST",
    url: `/live-observations/public/${publicToken}/events`,
    headers: {
      origin: "https://app.example.com"
    },
    payload: {
      eventId: "33333333-3333-4333-8333-333333333333"
    }
  });

  assert.equal(duplicate.statusCode, 200);
  assert.deepEqual(duplicate.json(), { accepted: false, acceptedEventCount: 1 });
  assert.equal(
    duplicate.headers["access-control-allow-origin"],
    "https://app.example.com"
  );

  const stopped = await app.inject({
    method: "POST",
    url: `/deployments/${deploymentId}/live-observations/${observationId}/stop`
  });

  assert.equal(stopped.statusCode, 200);
  assert.equal(stopped.json().snapshot.status, "stopped");

  const afterStop = await app.inject({
    method: "POST",
    url: `/live-observations/public/${publicToken}/events`,
    payload: {
      eventId: "44444444-4444-4444-8444-444444444444"
    }
  });

  assert.equal(afterStop.statusCode, 410);
  assert.equal(afterStop.json().error, "LIVE_OBSERVATION_GONE");
});

test("Live Observation stream emits one-second updates, heartbeats, and clears timers on close", async () => {
  const service = createService();
  await service.createSession(createDeploymentContext());
  const callbacks = new Map<number, () => void>();
  const clearedIntervals: number[] = [];
  const chunks: string[] = [];
  let closeListener: (() => void) | undefined;
  const rawReply = {
    destroyed: false,
    writableEnded: false,
    end() {
      this.writableEnded = true;
    },
    write(chunk: string) {
      chunks.push(chunk);
    },
    writeHead() {}
  };

  await streamLiveObservationSnapshots({
    deploymentId,
    observationId,
    once: false,
    reply: {
      hijack() {},
      raw: rawReply
    } as never,
    request: {
      log: { warn() {} },
      raw: {
        on(event: string, callback: () => void) {
          if (event === "close") {
            closeListener = callback;
          }
        }
      }
    } as never,
    scheduler: {
      clearInterval(handle) {
        clearedIntervals.push(Number(handle));
      },
      setInterval(callback, delayMs) {
        callbacks.set(delayMs, callback);
        return delayMs;
      }
    },
    service
  });

  await service.collectEvent({
    eventId: "33333333-3333-4333-8333-333333333333",
    publicToken
  });
  callbacks.get(1_000)?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  callbacks.get(15_000)?.();

  assert.equal(chunks.filter((chunk) => chunk.startsWith("event: snapshot")).length, 2);
  assert.match(chunks.join(""), /"acceptedEventCount":1/);
  assert.ok(chunks.includes(": heartbeat\n\n"));

  closeListener?.();
  assert.deepEqual(clearedIntervals.sort((left, right) => left - right), [1_000, 15_000]);
  assert.equal(rawReply.writableEnded, true);
});

test("Live Observation routes reject ineligible deployments and unavailable production cache", async (t) => {
  const app = Fastify();
  let deploymentContext = createDeploymentContext({ status: "FAILED" });

  await app.register(registerLiveObservationRoutes, {
    enabled: true,
    liveObservationService: createService(),
    loadDeploymentContext: async () => deploymentContext
  });
  await app.ready();
  t.after(() => app.close());

  const ineligible = await app.inject({
    method: "POST",
    url: `/deployments/${deploymentId}/live-observations`
  });

  assert.equal(ineligible.statusCode, 409);
  assert.equal(
    ineligible.json().error,
    "LIVE_OBSERVATION_DEPLOYMENT_NOT_ELIGIBLE"
  );

  deploymentContext = createDeploymentContext({ status: "SUCCESS" });
  const cacheUnavailableApp = Fastify();

  await cacheUnavailableApp.register(registerLiveObservationRoutes, {
    enabled: true,
    liveObservationService: createService({ requireSharedCache: true }),
    loadDeploymentContext: async () => deploymentContext
  });
  await cacheUnavailableApp.ready();
  t.after(() => cacheUnavailableApp.close());

  const unavailable = await cacheUnavailableApp.inject({
    method: "POST",
    url: `/deployments/${deploymentId}/live-observations`
  });

  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.json().error, "LIVE_OBSERVATION_CACHE_UNAVAILABLE");
});

test("disabled Live Observation route does not start sessions", async (t) => {
  const app = Fastify();

  await app.register(registerLiveObservationRoutes, {
    enabled: false,
    liveObservationService: createService(),
    loadDeploymentContext: async () => createDeploymentContext()
  });
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/deployments/${deploymentId}/live-observations`
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, "not_found");
});

function createService(
  overrides: Partial<Parameters<typeof createLiveObservationService>[0]> = {}
) {
  return createLiveObservationService({
    createObservationId: () => observationId,
    createPublicToken: () => publicToken,
    now: () => nowMs,
    observabilityProvider: {
      async observe() {
        return {
          cloudWatch: {
            delayedBySeconds: null,
            errorCode: null,
            observedAt: "2026-07-10T09:00:00.000Z",
            periodSeconds: 60,
            requestCountPerTarget: 0,
            state: "available"
          },
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
          }
        };
      }
    },
    publicApiBaseUrl: "https://app.example.com",
    runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
    ...overrides
  });
}

function createDeploymentContext(
  overrides: Partial<CreateLiveObservationSessionInput> = {}
): CreateLiveObservationSessionInput {
  return {
    deploymentId,
    liveProfile: "demo_web_service",
    observationTarget: {
      awsConnectionId: "55555555-5555-4555-8555-555555555555",
      externalId: "external-id",
      region: "ap-northeast-2",
      roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole-demo"
    },
    outputs: {
      alb_arn_suffix: "app/demo/123",
      api_base_url: "https://traffic.example.com",
      asg_name: "demo-asg",
      scale_out_threshold: 60,
      static_site_url: "https://audience.example.com/",
      target_group_arn_suffix: "targetgroup/demo/456"
    },
    status: "SUCCESS",
    ...overrides
  };
}
