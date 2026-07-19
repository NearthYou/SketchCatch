import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, LiveObservationV2Snapshot } from "@sketchcatch/types";

import { createLiveObservationArchitectureModel } from "./live-observation-architecture.js";
import { createLiveObservationDiagramModel } from "./live-observation-diagram.js";

const architecture = {
  nodes: [
    resourceNode("cloudfront", "CLOUDFRONT", "CloudFront", 0),
    resourceNode("alb", "LOAD_BALANCER", "ALB", 200),
    resourceNode("target", "LOAD_BALANCER_TARGET_GROUP", "Target Group", 400),
    resourceNode("task", "ECS_TASK_DEFINITION", "Fargate Task", 600),
    resourceNode("service", "ECS_SERVICE", "ECS Service", 800)
  ],
  edges: [
    { id: "cloudfront-alb", sourceId: "cloudfront", targetId: "alb", label: "routes" },
    { id: "alb-target", sourceId: "alb", targetId: "target", label: "forwards" },
    { id: "target-service", sourceId: "target", targetId: "service", label: "targets" },
    { id: "service-task", sourceId: "service", targetId: "task", label: "uses" }
  ]
} satisfies ArchitectureJson;

test("keeps only the main traffic path and renders running or desired Fargate tasks", () => {
  const snapshot = providerSnapshot({ desired: 2, max: 3, running: 1 });
  const diagram = createLiveObservationArchitectureModel(architecture, snapshot).diagram;
  const model = createLiveObservationDiagramModel(diagram, snapshot);

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;

  assert.deepEqual(
    model.stages.map((stage) => stage.node.id),
    ["cloudfront", "alb", "target", "service"]
  );
  assert.deepEqual(
    model.capacityUnits.map((unit) => unit.observationState),
    ["active", "launching"]
  );
  assert.ok(model.capacityUnits.every((unit) => unit.node.label.startsWith("Fargate Task")));
});

test("does not render inactive task slots up to the autoscaling maximum", () => {
  const snapshot = providerSnapshot({ desired: 1, max: 3, running: 1 });
  const diagram = createLiveObservationArchitectureModel(architecture, snapshot).diagram;
  const model = createLiveObservationDiagramModel(diagram, snapshot);

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;

  assert.equal(model.capacityUnits.length, 1);
  assert.equal(model.capacityUnits[0]?.observationState, "active");
});

function resourceNode(
  id: string,
  type: ArchitectureJson["nodes"][number]["type"],
  label: string,
  positionX: number
): ArchitectureJson["nodes"][number] {
  return { config: {}, id, label, positionX, positionY: 0, type };
}

function providerSnapshot(capacity: {
  readonly desired: number;
  readonly max: number;
  readonly running: number;
}): LiveObservationV2Snapshot {
  const observedAt = "2026-07-19T01:00:00.000Z";
  return {
    observationId: "observation-1",
    status: "active",
    live: {
      acceptedEventCount: 1,
      observedAt,
      pressureLevel: "high",
      pressurePercent: 80,
      projectedRequestsPerMinute: 120,
      rollingRequestsPerSecond: 2
    },
    latestObservation: {
      observedAt,
      payload: {
        availability: 100,
        capacity: { ...capacity, healthy: capacity.running },
        errorRate: 0,
        logs: [],
        observedAt,
        p95LatencyMs: 40,
        requests: 50,
        state: "available"
      }
    },
    terminalAt: null
  };
}
