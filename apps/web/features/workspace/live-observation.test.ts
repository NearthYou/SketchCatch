import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiveObservationSession } from "@sketchcatch/types";
import {
  createPresenterTrafficBoost,
  getEligibleLiveObservationDeployments,
  getLiveObservationInstanceMarkers,
  getLiveObservationPressureLabel,
  getLiveObservationRequestBurst,
  getLiveObservationRequestTargetIndexes
} from "./live-observation";

test("pressure levels have exact visible Korean labels", () => {
  assert.equal(getLiveObservationPressureLabel("normal"), "정상");
  assert.equal(getLiveObservationPressureLabel("warning"), "요청 증가");
  assert.equal(getLiveObservationPressureLabel("high"), "Scale-out 예상");
  assert.equal(getLiveObservationPressureLabel("critical"), "포화 임박");
});

test("eligible Live Observation deployments are successful demo deployments ordered newest first", () => {
  const deployments = [
    createDeploymentCandidate("older", "SUCCESS", "demo_web_service", "2026-07-10T01:00:00.000Z"),
    createDeploymentCandidate("practice", "SUCCESS", "practice", "2026-07-10T04:00:00.000Z"),
    createDeploymentCandidate("failed", "FAILED", "demo_web_service", "2026-07-10T05:00:00.000Z"),
    createDeploymentCandidate("latest", "SUCCESS", "demo_web_service", "2026-07-10T03:00:00.000Z")
  ];

  assert.deepEqual(
    getEligibleLiveObservationDeployments(deployments).map((deployment) => deployment.id),
    ["latest", "older"]
  );
});

test("request burst renders only positive counter deltas and caps visible particles at five", () => {
  assert.deepEqual(getLiveObservationRequestBurst(10, 11, true), {
    overflowCount: 0,
    visibleParticleCount: 1
  });
  assert.deepEqual(getLiveObservationRequestBurst(10, 18, true), {
    overflowCount: 3,
    visibleParticleCount: 5
  });
  assert.equal(getLiveObservationRequestBurst(null, 18, true), null);
  assert.equal(getLiveObservationRequestBurst(18, 18, true), null);
  assert.equal(getLiveObservationRequestBurst(18, 17, true), null);
  assert.equal(getLiveObservationRequestBurst(10, 18, false), null);
});

test("request particles alternate only between actual InService target indexes", () => {
  assert.deepEqual(getLiveObservationRequestTargetIndexes(5, 2, 1), [0, 1, 0, 1, 0]);
  assert.deepEqual(getLiveObservationRequestTargetIndexes(3, 2, 2), [1, 0, 1]);
  assert.deepEqual(getLiveObservationRequestTargetIndexes(3, 1, 4), [0, 0, 0]);
  assert.deepEqual(getLiveObservationRequestTargetIndexes(3, 0, 1), []);
});

test("presenter boost sends at most 5 requests per second and 450 total", async () => {
  const scheduler = new FakeScheduler();
  let nowMs = 0;
  let trafficRequests = 0;
  let receiptRequests = 0;
  const controller = createPresenterTrafficBoost(createSession(), {
    createEventId: () => `event-${receiptRequests + 1}`,
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/api/traffic")) {
        trafficRequests += 1;
      } else {
        receiptRequests += 1;
      }
      return new Response(null, { status: 202 });
    },
    now: () => nowMs,
    scheduler
  });

  controller.start();
  await flushAsyncWork();
  assert.equal(trafficRequests, 5);

  for (let second = 1; second < 90; second += 1) {
    nowMs = second * 1_000;
    scheduler.tick();
    await flushAsyncWork();
  }

  nowMs = 90_000;
  scheduler.tick();
  await flushAsyncWork();

  assert.equal(trafficRequests, 450);
  assert.equal(receiptRequests, 450);
  assert.equal(controller.getProgress().running, false);
  assert.equal(controller.getProgress().attemptedRequests, 450);
});

test("presenter boost never exceeds concurrency 5 and aborts immediately", async () => {
  const scheduler = new FakeScheduler();
  const pendingSignals: AbortSignal[] = [];
  let activeRequests = 0;
  let maximumConcurrency = 0;
  const controller = createPresenterTrafficBoost(createSession(), {
    createEventId: () => "event-pending",
    fetch: async (_input, init) => {
      activeRequests += 1;
      maximumConcurrency = Math.max(maximumConcurrency, activeRequests);
      if (init?.signal) {
        pendingSignals.push(init.signal);
      }
      return new Promise<Response>(() => undefined);
    },
    now: () => 0,
    scheduler
  });

  controller.start();
  scheduler.tick();

  assert.equal(maximumConcurrency, 5);
  controller.stop();
  assert.ok(pendingSignals.every((signal) => signal.aborted));
  assert.equal(controller.getProgress().running, false);
});

test("presenter boost sends receipt only when Traffic API returns 2xx", async () => {
  const scheduler = new FakeScheduler();
  let trafficRequests = 0;
  let receiptRequests = 0;
  const controller = createPresenterTrafficBoost(createSession(), {
    createEventId: () => "event-id",
    fetch: async (input) => {
      if (String(input).endsWith("/api/traffic")) {
        trafficRequests += 1;
        return new Response(null, { status: trafficRequests === 1 ? 500 : 204 });
      }
      receiptRequests += 1;
      return new Response(null, { status: 202 });
    },
    now: () => 0,
    scheduler
  });

  controller.start();
  await flushAsyncWork();

  assert.equal(trafficRequests, 5);
  assert.equal(receiptRequests, 4);
  assert.equal(controller.getProgress().trafficFailures, 1);
  controller.stop();
});

test("instance markers distinguish expected, launching, InService, and unavailable AWS states", () => {
  const critical = createSnapshot({ pressureLevel: "critical" });
  assert.deepEqual(
    getLiveObservationInstanceMarkers(critical).map((marker) => [marker.state, marker.label]),
    [
      ["in-service", "InService"],
      ["launching", "Scale-out expected"]
    ]
  );

  const launching = createSnapshot({
    desiredCapacity: 2,
    instances: [
      createInstance("i-one", "InService"),
      createInstance("i-two", "Pending")
    ]
  });
  assert.deepEqual(
    getLiveObservationInstanceMarkers(launching).map((marker) => marker.state),
    ["in-service", "launching"]
  );

  const scaled = createSnapshot({
    desiredCapacity: 2,
    instances: [
      createInstance("i-one", "InService"),
      createInstance("i-two", "InService")
    ]
  });
  assert.deepEqual(
    getLiveObservationInstanceMarkers(scaled).map((marker) => marker.state),
    ["in-service", "in-service"]
  );

  const terminating = createSnapshot({
    desiredCapacity: 1,
    instances: [
      createInstance("i-one", "InService"),
      createInstance("i-two", "Terminating")
    ]
  });
  assert.deepEqual(
    getLiveObservationInstanceMarkers(terminating).map((marker) => [marker.state, marker.label]),
    [
      ["in-service", "InService"],
      ["transitioning", "Terminating"]
    ]
  );

  assert.deepEqual(
    getLiveObservationInstanceMarkers({
      ...critical,
      capacity: {
        ...critical.capacity,
        state: "unavailable",
        instances: []
      }
    }),
    []
  );
});

function createDeploymentCandidate(
  id: string,
  status: string,
  liveProfile: string,
  completedAt: string | null
) {
  return { completedAt, id, liveProfile, status };
}

function createSession(): LiveObservationSession {
  return {
    audienceUrl:
      "https://audience.example.com/?observation=public-token&collector=https%3A%2F%2Fapp.example.com",
    createdAt: "2026-07-10T00:00:00.000Z",
    deploymentId: "11111111-1111-4111-8111-111111111111",
    expiresAt: "2026-07-10T00:15:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    status: "active",
    trafficApiUrl: "https://traffic.example.com/api/traffic"
  };
}

function createSnapshot(input: {
  desiredCapacity?: number | undefined;
  instances?: Array<ReturnType<typeof createInstance>> | undefined;
  pressureLevel?: "normal" | "critical" | undefined;
} = {}) {
  return {
    capacity: {
      currentInstanceCount: input.instances?.length ?? 1,
      desiredCapacity: input.desiredCapacity ?? 1,
      errorCode: null,
      inServiceInstanceCount:
        input.instances?.filter((instance) => instance.lifecycleState === "InService").length ?? 1,
      instances: input.instances ?? [createInstance("i-one", "InService")],
      latestActivity: null,
      maxCapacity: 2,
      observedAt: "2026-07-10T00:00:01.000Z",
      state: "available" as const
    },
    cloudWatch: {
      delayedBySeconds: 1,
      errorCode: null,
      observedAt: "2026-07-10T00:00:00.000Z",
      periodSeconds: 60 as const,
      requestCountPerTarget: 1,
      state: "available" as const
    },
    live: {
      acceptedEventCount: 1,
      observedAt: "2026-07-10T00:00:01.000Z",
      pressureLevel: input.pressureLevel ?? "normal",
      pressurePercent: input.pressureLevel === "critical" ? 100 : 10,
      projectedRequestsPerMinute: 6,
      rollingRequestsPerSecond: 0.1
    },
    observationId: "22222222-2222-4222-8222-222222222222",
    status: "active" as const
  };
}

function createInstance(instanceId: string, lifecycleState: string) {
  return { healthStatus: "Healthy", instanceId, lifecycleState };
}

class FakeScheduler {
  private readonly callbacks = new Set<() => void>();

  setInterval(callback: () => void): object {
    this.callbacks.add(callback);
    return callback;
  }

  clearInterval(handle: object): void {
    this.callbacks.delete(handle as () => void);
  }

  tick(): void {
    for (const callback of [...this.callbacks]) {
      callback();
    }
  }
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
