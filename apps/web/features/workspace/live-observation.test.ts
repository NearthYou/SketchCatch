import assert from "node:assert/strict";
import { test } from "node:test";
import type { LiveObservationV2Session } from "@sketchcatch/types";
import {
  getEligibleLiveObservationDeployments,
  getLiveObservationAudienceUrl,
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

test("eligible Live Observation deployments are successful completed deployments ordered newest first", () => {
  const deployments = [
    createDeploymentCandidate("older", "SUCCESS", "demo_web_service", "2026-07-10T01:00:00.000Z"),
    createDeploymentCandidate("practice", "SUCCESS", "practice", "2026-07-10T04:00:00.000Z"),
    createDeploymentCandidate("failed", "FAILED", "demo_web_service", "2026-07-10T05:00:00.000Z"),
    createDeploymentCandidate("latest", "SUCCESS", "demo_web_service", "2026-07-10T03:00:00.000Z")
  ];

  assert.deepEqual(
    getEligibleLiveObservationDeployments(deployments).map((deployment) => deployment.id),
    ["practice", "latest", "older"]
  );
});

test("audience URL accepts only the capability-free v2 observe path", () => {
  const session: LiveObservationV2Session = {
    audienceUrl: "https://audience.example.com/observe/22222222-2222-4222-8222-222222222222",
    createdAt: "2026-07-10T00:00:00.000Z",
    deploymentId: "11111111-1111-4111-8111-111111111111",
    expiresAt: "2026-07-10T00:15:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    status: "active"
  };

  assert.equal(getLiveObservationAudienceUrl(session), session.audienceUrl);
  assert.equal(
    getLiveObservationAudienceUrl({ ...session, audienceUrl: `${session.audienceUrl}?capability=secret` }),
    null
  );
  assert.equal(
    getLiveObservationAudienceUrl({ ...session, audienceUrl: "https://audience.example.com/other" }),
    null
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

  const fargate = createSnapshot({
    desiredCapacity: 2,
    instances: [
      createInstance("task/demo/1", "RUNNING"),
      createInstance("task/demo/2", "PROVISIONING")
    ]
  });
  assert.deepEqual(
    getLiveObservationInstanceMarkers(fargate).map((marker) => [marker.state, marker.label]),
    [
      ["in-service", "RUNNING"],
      ["launching", "Launching"]
    ]
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
