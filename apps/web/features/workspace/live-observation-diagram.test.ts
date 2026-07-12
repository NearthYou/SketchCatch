import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode, LiveObservationSnapshot } from "@sketchcatch/types";
import { createLiveObservationDiagramModel } from "./live-observation-diagram";

test("diagram observation model preserves board coordinates and activates Fargate tasks from capacity", () => {
  const diagram: DiagramJson = {
    nodes: [
      node("site", "aws_s3_object", 20, 20),
      node("alb", "aws_lb", 220, 20),
      node("service", "aws_ecs_service", 420, 20),
      capacityNode("task-a", 620, 0),
      capacityNode("task-b", 620, 100)
    ],
    edges: [
      { id: "site-alb", sourceNodeId: "site", targetNodeId: "alb" },
      { id: "alb-service", sourceNodeId: "alb", targetNodeId: "service" },
      { id: "service-task-a", sourceNodeId: "service", targetNodeId: "task-a" },
      { id: "service-task-b", sourceNodeId: "service", targetNodeId: "task-b" }
    ],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const model = createLiveObservationDiagramModel(diagram, snapshot(2, 1));

  assert.equal(model.nodes.find((candidate) => candidate.id === "alb")?.position.x, 220);
  assert.equal(model.nodes.find((candidate) => candidate.id === "task-a")?.observationState, "active");
  assert.equal(model.nodes.find((candidate) => candidate.id === "task-b")?.observationState, "launching");
  assert.deepEqual([...model.activeEdgeIds], ["site-alb", "alb-service", "service-task-a", "service-task-b"]);

  const beforeScaleOut = createLiveObservationDiagramModel(diagram, snapshot(1, 1));
  assert.equal(beforeScaleOut.nodes.find((candidate) => candidate.id === "task-b")?.observationState, "inactive");
  assert.equal(beforeScaleOut.activeEdgeIds.has("service-task-b"), false);
});

function node(id: string, resourceType: string, x: number, y: number): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    position: { x, y },
    size: { width: 120, height: 70 },
    type: resourceType,
    zIndex: 1,
    parameters: { fileName: "main", resourceName: id, resourceType, values: {} }
  };
}

function capacityNode(id: string, x: number, y: number): DiagramNode {
  return {
    ...node(id, "aws_ecs_task_definition", x, y),
    kind: "design",
    label: "Fargate Task",
    metadata: { liveObservationRole: "capacity-unit" },
    parameters: undefined
  };
}

function snapshot(desiredCapacity: number, runningCount: number): LiveObservationSnapshot {
  return {
    observationId: "observation-1",
    status: "active",
    live: { acceptedEventCount: 1, rollingRequestsPerSecond: 1, projectedRequestsPerMinute: 60, pressurePercent: 100, pressureLevel: "critical", observedAt: "2026-07-12T00:00:00.000Z" },
    cloudWatch: { state: "available", requestCountPerTarget: 60, periodSeconds: 60, observedAt: "2026-07-12T00:00:00.000Z", delayedBySeconds: 0, errorCode: null },
    capacity: { state: "available", desiredCapacity, currentInstanceCount: desiredCapacity, inServiceInstanceCount: runningCount, maxCapacity: 2, instances: [], latestActivity: null, observedAt: "2026-07-12T00:00:00.000Z", errorCode: null }
  };
}
