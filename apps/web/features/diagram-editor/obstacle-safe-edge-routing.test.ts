import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramNode } from "../../../../packages/types/src";
import {
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

test("does not treat an area node as a routing obstacle", () => {
  const source = makeResource("source", 0, 100);
  const area = makeArea("area", 200, 40);
  const target = makeResource("target", 480, 100);

  assert.deepEqual(getObstacleSafeEdgeHandles(source, target, [source, area, target]), {
    sourceHandleId: "handle-right",
    targetHandleId: "handle-left"
  });
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

function makeArea(id: string, x: number, y: number): DiagramNode {
  return {
    id,
    kind: "design",
    label: id,
    locked: false,
    position: { x, y },
    size: { height: 220, width: 220 },
    type: "group",
    zIndex: 0
  };
}
