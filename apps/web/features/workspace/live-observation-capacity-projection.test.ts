import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";
import { getLiveObservationCapacityProjection } from "./live-observation-capacity-projection";

test("projects bounded Fargate capacity from immediate rolling traffic", () => {
  const projection = getLiveObservationCapacityProjection(
    architecture({ minCapacity: 1, maxCapacity: 3, targetValue: 10 }),
    snapshot({ projectedRequestsPerMinute: 24, running: 1 })
  );

  assert.deepEqual(projection, {
    actualCount: 1,
    direction: "scale_out",
    maxCapacity: 3,
    predictedCount: 3,
    targetRequestsPerTaskPerMinute: 10
  });
});

test("keeps the minimum capacity at zero traffic and predicts scale-in separately", () => {
  const projection = getLiveObservationCapacityProjection(
    architecture({ minCapacity: 1, maxCapacity: 3, targetValue: 10 }),
    snapshot({ projectedRequestsPerMinute: 0, running: 3 })
  );

  assert.equal(projection?.predictedCount, 1);
  assert.equal(projection?.direction, "scale_in");
});

test("does not invent a forecast for unsupported scaling metrics", () => {
  assert.equal(
    getLiveObservationCapacityProjection(
      architecture({
        metric: "ECSServiceAverageCPUUtilization",
        minCapacity: 1,
        maxCapacity: 3,
        targetValue: 50
      }),
      snapshot({ projectedRequestsPerMinute: 120, running: 1 })
    ),
    null
  );
});

function architecture({
  metric = "ALBRequestCountPerTarget",
  minCapacity,
  maxCapacity,
  targetValue
}: {
  readonly metric?: string;
  readonly minCapacity: number;
  readonly maxCapacity: number;
  readonly targetValue: number;
}): ArchitectureJson {
  return {
    nodes: [
      {
        id: "service",
        type: "ECS_SERVICE",
        positionX: 0,
        positionY: 0,
        config: {}
      },
      {
        id: "target",
        type: "APPLICATION_AUTO_SCALING_TARGET",
        positionX: 0,
        positionY: 0,
        config: { minCapacity, maxCapacity }
      },
      {
        id: "policy",
        type: "APPLICATION_AUTO_SCALING_POLICY",
        positionX: 0,
        positionY: 0,
        config: {
          policyType: "TargetTrackingScaling",
          targetTrackingScalingPolicyConfiguration: {
            targetValue,
            predefinedMetricSpecification: [{ predefinedMetricType: metric }]
          }
        }
      }
    ],
    edges: [
      { id: "service-target", sourceId: "service", targetId: "target" },
      { id: "target-policy", sourceId: "target", targetId: "policy" }
    ]
  };
}

function snapshot({
  projectedRequestsPerMinute,
  running
}: {
  readonly projectedRequestsPerMinute: number;
  readonly running: number;
}): LiveObservationV2Snapshot {
  const observedAt = "2026-07-20T00:00:00.000Z";
  return {
    observationId: "00000000-0000-4000-8000-000000000001",
    status: "active",
    live: {
      acceptedEventCount: 1,
      rollingRequestsPerSecond: projectedRequestsPerMinute / 60,
      projectedRequestsPerMinute,
      pressurePercent: 100,
      pressureLevel: "critical",
      observedAt
    },
    latestObservation: {
      observedAt,
      payload: {
        requests: null,
        errorRate: null,
        p95LatencyMs: null,
        availability: null,
        capacity: {
          desired: running,
          running,
          healthy: running,
          max: 3
        },
        logs: [],
        observedAt,
        state: "available"
      }
    },
    terminalAt: null
  };
}
