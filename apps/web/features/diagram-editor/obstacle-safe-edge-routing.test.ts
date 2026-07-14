import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
  createAreaTitleRoutingObstacle,
  getObstacleSafeEdgeHandles,
  getOrthogonalRouteNodeOverlapLength
} from "./obstacle-safe-edge-routing";

test("chooses a route that does not cross an intermediate resource", () => {
  const source = makeResource("source", 0, 100);
  const blocker = makeResource("blocker", 240, 100);
  const target = makeResource("target", 480, 100);

  const handles = getObstacleSafeEdgeHandles(source, target, [source, blocker, target]);

  assert.equal(
    getOrthogonalRouteNodeOverlapLength(source, target, handles, blocker),
    0
  );
  assert.notDeepEqual(handles, {
    sourceHandleId: "handle-right",
    targetHandleId: "handle-left"
  });
});

test("keeps the shortest horizontal route when no resource blocks it", () => {
  const source = makeResource("source", 0, 100);
  const target = makeResource("target", 480, 100);

  assert.deepEqual(getObstacleSafeEdgeHandles(source, target, [source, target]), {
    sourceHandleId: "handle-right",
    targetHandleId: "handle-left"
  });
});

test("allows routes through an area body below its title", () => {
  const source = makeResource("source", 0, 100);
  const area = makeArea("area", 200, 40);
  const target = makeResource("target", 480, 100);

  assert.deepEqual(getObstacleSafeEdgeHandles(source, target, [source, area, target]), {
    sourceHandleId: "handle-right",
    targetHandleId: "handle-left"
  });
});

test("routes around an area title while allowing lines through the area body", () => {
  const source = makeResource("source", 0, 40);
  const area = makeArea("area", 200, 72);
  const target = makeResource("target", 480, 40);

  const handles = getObstacleSafeEdgeHandles(source, target, [source, area, target]);

  assert.equal(
    getOrthogonalRouteNodeOverlapLength(
      source,
      target,
      handles,
      createAreaTitleRoutingObstacle(area)
    ),
    0
  );
});

test("matches rendered smoothstep routes when avoiding compact resource nodes", () => {
  const loadBalancer = makeCompactResource("load-balancer", 440, 324);
  const serviceA = makeCompactResource("service-a", 764, 324);
  const serviceB = makeCompactResource("service-b", 764, 72);
  const alarm = makeCompactResource("alarm", 476, 600);
  const nodes = [loadBalancer, serviceA, serviceB, alarm];

  const upperServiceHandles = getObstacleSafeEdgeHandles(loadBalancer, serviceB, nodes);
  const alarmHandles = getObstacleSafeEdgeHandles(alarm, serviceA, nodes);

  assert.equal(
    getOrthogonalRouteNodeOverlapLength(loadBalancer, serviceB, upperServiceHandles, serviceA),
    0
  );
  assert.equal(
    getOrthogonalRouteNodeOverlapLength(alarm, serviceA, alarmHandles, loadBalancer),
    0
  );
});

function makeResource(id: string, x: number, y: number): DiagramNode {
  return {
    id,
    kind: "resource",
    label: id,
    locked: false,
    parameters: {
      fileName: "main",
      resourceName: id,
      resourceType: "aws_instance",
      terraformBlockType: "resource",
      values: {}
    },
    position: { x, y },
    size: { height: 96, width: 168 },
    type: "aws_instance",
    zIndex: 1
  };
}

function makeCompactResource(id: string, x: number, y: number): DiagramNode {
  return {
    ...makeResource(id, x, y),
    size: { height: 48, width: 48 }
  };
}

function makeArea(id: string, x: number, y: number): DiagramNode {
  return {
    id,
    kind: "design",
    label: id,
    locked: false,
    position: { x, y },
    size: { height: 220, width: 220 },
    type: "design_group",
    zIndex: 0
  };
}
