import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";

import { createLiveObservationDesignSimulationRequest } from "./live-observation-ai-recommendation";

const architecture: ArchitectureJson = {
  edges: [
    { id: "service-target", sourceId: "service", targetId: "target" },
    { id: "target-policy", sourceId: "target", targetId: "policy" }
  ],
  nodes: [
    {
      id: "service",
      type: "ECS_SERVICE",
      positionX: 0,
      positionY: 0,
      config: { terraformResourceName: "service" }
    },
    {
      id: "target",
      type: "APPLICATION_AUTO_SCALING_TARGET",
      positionX: 0,
      positionY: 0,
      config: {
        maxCapacity: 3,
        minCapacity: 1,
        terraformResourceName: "target"
      }
    },
    {
      id: "policy",
      type: "APPLICATION_AUTO_SCALING_POLICY",
      positionX: 0,
      positionY: 0,
      config: {
        policyType: "TargetTrackingScaling",
        terraformResourceName: "policy",
        targetTrackingScalingPolicyConfiguration: {
          targetValue: 60,
          predefinedMetricSpecification: [
            { predefinedMetricType: "ALBRequestCountPerTarget" }
          ]
        }
      }
    }
  ]
};

test("builds an AI simulation request from elevated live traffic", () => {
  const request = createLiveObservationDesignSimulationRequest(architecture, snapshot("high"));

  assert.deepEqual(request?.liveObservation, {
    acceptedEventCount: 7,
    pressureLevel: "high",
    pressurePercent: 70,
    projectedRequestsPerMinute: 42
  });
  assert.equal(request?.architectureJson, architecture);
});

test("does not request an AI improvement while live traffic is normal", () => {
  assert.equal(
    createLiveObservationDesignSimulationRequest(architecture, snapshot("normal")),
    null
  );
});

test("starts design judgment from the provider one-minute request count", () => {
  const value = snapshot("normal");
  value.live = {
    ...value.live,
    acceptedEventCount: 0,
    projectedRequestsPerMinute: 0,
    pressurePercent: 0,
    rollingRequestsPerSecond: 0
  };
  value.latestObservation = {
    observedAt: value.live.observedAt,
    payload: {
      availability: 100,
      capacity: { desired: 1, healthy: 1, max: 3, running: 1 },
      errorRate: 0,
      logs: [],
      observedAt: value.live.observedAt,
      p95LatencyMs: 20,
      requests: 540,
      state: "available"
    }
  };

  assert.deepEqual(
    createLiveObservationDesignSimulationRequest(architecture, value)?.liveObservation,
    {
      acceptedEventCount: 0,
      pressureLevel: "critical",
      pressurePercent: 900,
      projectedRequestsPerMinute: 540
    }
  );
});

function snapshot(
  pressureLevel: LiveObservationV2Snapshot["live"]["pressureLevel"]
): LiveObservationV2Snapshot {
  const isElevated = pressureLevel !== "normal";
return {
    observationId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    live: {
      acceptedEventCount: 7,
      rollingRequestsPerSecond: isElevated ? 0.7 : 0.1,
      projectedRequestsPerMinute: isElevated ? 42 : 6,
      pressurePercent: isElevated ? 70 : 10,
      pressureLevel,
      observedAt: "2026-07-21T00:00:00.000Z"
    },
    latestObservation: null,
    terminalAt: null
  };
}
