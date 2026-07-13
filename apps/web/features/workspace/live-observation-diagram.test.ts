import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramJson, DiagramNode, LiveObservationSnapshot } from "@sketchcatch/types";
import {
  createLiveObservationDiagramModel,
  getLiveObservationDiagramSegmentCount
} from "./live-observation-diagram";

test("selects the ECS traffic path and excludes support paths", () => {
  const diagram = createDiagram(
    [
      node("site", "aws_s3_object"),
      node("alb", "aws_lb"),
      node("listener", "aws_lb_listener"),
      node("target-group", "aws_lb_target_group"),
      node("service", "aws_ecs_service"),
      node("role", "aws_iam_role"),
      node("task-definition", "aws_ecs_task_definition"),
      node("logs", "aws_cloudwatch_log_group"),
      node("scaling-policy", "aws_appautoscaling_policy"),
      node("scaling-target", "aws_appautoscaling_target"),
      capacityNode("task-a"),
      capacityNode("task-b")
    ],
    [
      edge("site", "alb"),
      edge("alb", "listener"),
      edge("listener", "target-group"),
      edge("target-group", "service"),
      edge("service", "task-a"),
      edge("service", "task-b"),
      edge("role", "task-definition"),
      edge("logs", "task-definition"),
      edge("task-definition", "service"),
      edge("scaling-policy", "scaling-target"),
      edge("scaling-target", "service")
    ]
  );

  assert.equal(getLiveObservationDiagramSegmentCount(diagram), 5);

  const model = createLiveObservationDiagramModel(diagram, snapshot(2, 1));

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;
  assert.deepEqual(model.stages.map((stage) => stage.node.id), [
    "site",
    "alb",
    "listener",
    "target-group",
    "service"
  ]);
  assert.deepEqual(model.stages.map((stage) => stage.role), [
    "source",
    "hop",
    "hop",
    "hop",
    "controller"
  ]);
  assert.deepEqual(model.capacityUnits.map((unit) => [unit.node.id, unit.observationState]), [
    ["task-a", "active"],
    ["task-b", "launching"]
  ]);
});

test("returns zero segments for an empty diagram", () => {
  assert.equal(
    getLiveObservationDiagramSegmentCount(createDiagram([], [])),
    0
  );
});

test("derives a different main path for an ASG diagram", () => {
  const diagram = createDiagram(
    [
      designNode("internet", "sketchcatch_internet"),
      node("alb", "aws_lb"),
      node("target-group", "aws_lb_target_group"),
      node("asg", "aws_autoscaling_group"),
      capacityNode("instance-a", "aws_instance"),
      capacityNode("instance-b", "aws_instance")
    ],
    [
      edge("internet", "alb"),
      edge("alb", "target-group"),
      edge("target-group", "asg"),
      edge("asg", "instance-a"),
      edge("asg", "instance-b")
    ]
  );

  const model = createLiveObservationDiagramModel(diagram, snapshot(1, 1));

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;
  assert.deepEqual(model.stages.map((stage) => stage.node.id), [
    "internet",
    "alb",
    "target-group",
    "asg"
  ]);
  assert.deepEqual(model.capacityUnits.map((unit) => unit.observationState), ["active", "inactive"]);
});

test("infers ECS Fargate capacity from resource types and connectivity without metadata", () => {
  const diagram = createDiagram(
    [
      node("site", "aws_s3_object"),
      node("alb", "aws_lb"),
      node("target-group", "aws_lb_target_group"),
      node("task-definition", "aws_ecs_task_definition"),
      node("service", "aws_ecs_service")
    ],
    [
      edge("site", "alb"),
      edge("alb", "target-group"),
      edge("target-group", "service"),
      edge("task-definition", "service")
    ]
  );

  const model = createLiveObservationDiagramModel(diagram, snapshot(2, 1));

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;
  assert.deepEqual(model.stages.map((stage) => stage.node.id), [
    "site",
    "alb",
    "target-group",
    "service"
  ]);
  assert.equal(model.capacityUnits.length, 2);
  assert.deepEqual(model.capacityUnits.map((unit) => unit.observationState), [
    "active",
    "launching"
  ]);
  assert.equal(model.capacityUnits[0]?.node.id, "task-definition");
});

test("infers ASG capacity from resource types and connectivity without metadata", () => {
  const diagram = createDiagram(
    [
      designNode("internet", "sketchcatch_internet"),
      node("alb", "aws_lb"),
      node("target-group", "aws_lb_target_group"),
      node("launch-template", "aws_launch_template"),
      node("asg", "aws_autoscaling_group")
    ],
    [
      edge("internet", "alb"),
      edge("alb", "target-group"),
      edge("target-group", "asg"),
      edge("launch-template", "asg")
    ]
  );

  const model = createLiveObservationDiagramModel(diagram, snapshot(2, 1));

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;
  assert.deepEqual(model.stages.map((stage) => stage.node.id), [
    "internet",
    "alb",
    "target-group",
    "asg"
  ]);
  assert.equal(model.capacityUnits.length, 2);
  assert.equal(model.capacityUnits[0]?.node.id, "launch-template");
});

test("keeps inferred capacity scoped to the controller selected for the main path", () => {
  const diagram = createDiagram(
    [
      node("site-a", "aws_s3_object"),
      node("target-a", "aws_lb_target_group"),
      node("task-a", "aws_ecs_task_definition"),
      node("service-a", "aws_ecs_service"),
      node("site-b", "aws_s3_object"),
      node("target-b", "aws_lb_target_group"),
      node("task-b", "aws_ecs_task_definition"),
      node("service-b", "aws_ecs_service")
    ],
    [
      edge("site-a", "target-a"),
      edge("target-a", "service-a"),
      edge("task-a", "service-a"),
      edge("site-b", "target-b"),
      edge("target-b", "service-b"),
      edge("task-b", "service-b")
    ]
  );

  const model = createLiveObservationDiagramModel(diagram, snapshot(1, 1, 1));

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;
  assert.equal(model.stages.at(-1)?.node.id, "service-a");
  assert.deepEqual(model.capacityUnits.map((unit) => unit.node.id), ["task-a"]);
});

test("prefers explicit observation roles over inferred traffic capabilities", () => {
  const diagram = createDiagram(
    [
      node("inferred-source", "aws_s3_object"),
      roleNode("explicit-source", "custom_client", "traffic-source"),
      roleNode("explicit-hop", "custom_proxy", "traffic-hop"),
      roleNode("controller", "custom_runtime", "capacity-controller"),
      capacityNode("unit", "custom_unit")
    ],
    [
      edge("inferred-source", "controller"),
      edge("explicit-source", "explicit-hop"),
      edge("explicit-hop", "controller"),
      edge("controller", "unit")
    ]
  );

  const model = createLiveObservationDiagramModel(diagram, snapshot(1, 1));

  assert.equal(model.status, "ready");
  if (model.status !== "ready") return;
  assert.deepEqual(model.stages.map((stage) => stage.node.id), [
    "explicit-source",
    "explicit-hop",
    "controller"
  ]);
});

test("returns an unavailable model when capacity or a source path is missing", () => {
  const withoutCapacity = createLiveObservationDiagramModel(
    createDiagram([node("site", "aws_s3_object")], []),
    snapshot(1, 1)
  );
  assert.deepEqual(withoutCapacity, { status: "unavailable", reason: "capacity-missing" });

  const disconnectedCapacity = createLiveObservationDiagramModel(
    createDiagram([node("service", "aws_ecs_service"), capacityNode("task")], [edge("service", "task")]),
    snapshot(1, 1)
  );
  assert.deepEqual(disconnectedCapacity, { status: "unavailable", reason: "path-missing" });
});

test("expands capacity slots from max capacity and caps individual units at eight", () => {
  const diagram = createDiagram(
    [
      node("site", "aws_s3_object"),
      node("service", "aws_ecs_service"),
      capacityNode("task-template")
    ],
    [edge("site", "service"), edge("service", "task-template")]
  );

  const two = createLiveObservationDiagramModel(diagram, snapshot(1, 1, 2));
  const eight = createLiveObservationDiagramModel(diagram, snapshot(2, 1, 8));
  const twelve = createLiveObservationDiagramModel(diagram, snapshot(2, 1, 12));

  assert.equal(two.status, "ready");
  assert.equal(eight.status, "ready");
  assert.equal(twelve.status, "ready");
  if (two.status !== "ready" || eight.status !== "ready" || twelve.status !== "ready") return;

  assert.equal(two.capacityUnits.length, 2);
  assert.equal(two.hiddenCapacityCount, 0);
  assert.equal(eight.capacityUnits.length, 8);
  assert.equal(eight.hiddenCapacityCount, 0);
  assert.equal(twelve.capacityUnits.length, 8);
  assert.equal(twelve.hiddenCapacityCount, 4);
  assert.deepEqual(
    twelve.capacityUnits.slice(0, 3).map((unit) => unit.observationState),
    ["active", "launching", "inactive"]
  );
  assert.equal(new Set(twelve.capacityUnits.map((unit) => unit.node.id)).size, 8);
});

function createDiagram(nodes: DiagramNode[], edges: DiagramJson["edges"]): DiagramJson {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}

function node(id: string, resourceType: string): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    position: { x: 0, y: 0 },
    size: { width: 48, height: 48 },
    type: resourceType,
    zIndex: 1,
    parameters: { fileName: "main", resourceName: id, resourceType, values: {} }
  };
}

function designNode(id: string, type: string): DiagramNode {
  return { ...node(id, type), kind: "design", parameters: undefined };
}

function roleNode(
  id: string,
  resourceType: string,
  liveObservationRole: NonNullable<DiagramNode["metadata"]>["liveObservationRole"]
): DiagramNode {
  return { ...node(id, resourceType), metadata: { liveObservationRole } };
}

function capacityNode(id: string, resourceType = "aws_ecs_task_definition"): DiagramNode {
  return {
    ...designNode(id, resourceType),
    label: resourceType === "aws_instance" ? "EC2 Instance" : "Capacity Unit",
    metadata: { liveObservationRole: "capacity-unit" }
  };
}

function edge(sourceNodeId: string, targetNodeId: string): DiagramJson["edges"][number] {
  return { id: `${sourceNodeId}-${targetNodeId}`, sourceNodeId, targetNodeId };
}

function snapshot(
  desiredCapacity: number,
  runningCount: number,
  maxCapacity = 2
): LiveObservationSnapshot {
  return {
    observationId: "observation-1",
    status: "active",
    live: { acceptedEventCount: 1, rollingRequestsPerSecond: 1, projectedRequestsPerMinute: 60, pressurePercent: 100, pressureLevel: "critical", observedAt: "2026-07-12T00:00:00.000Z" },
    cloudWatch: { state: "available", requestCountPerTarget: 60, periodSeconds: 60, observedAt: "2026-07-12T00:00:00.000Z", delayedBySeconds: 0, errorCode: null },
    capacity: { state: "available", desiredCapacity, currentInstanceCount: desiredCapacity, inServiceInstanceCount: runningCount, maxCapacity, instances: [], latestActivity: null, observedAt: "2026-07-12T00:00:00.000Z", errorCode: null }
  };
}
