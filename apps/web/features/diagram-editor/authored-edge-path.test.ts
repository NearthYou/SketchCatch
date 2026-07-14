import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramEdgeRoute } from "../../../../packages/types/src";

import { resolveAuthoredEdgePath } from "./authored-edge-path";

const authoredRoute: DiagramEdgeRoute = {
  svgPath: "M 40.25 60.5 C 80 60.5 80 140 160 140 L 300.75 240.25",
  sourcePoint: { x: 40.25, y: 60.5 },
  targetPoint: { x: 300.75, y: 240.25 },
  waypoints: [
    { x: 40.25, y: 60.5 },
    { x: 160, y: 140 },
    { x: 300.75, y: 240.25 }
  ],
  labelPosition: { x: 171.5, y: 143.25 },
  arrowDirection: "target-to-source",
  arrowAngle: -37.5
};

test("resolveAuthoredEdgePath returns stored geometry verbatim despite offset live ports", () => {
  const resolved = resolveAuthoredEdgePath(authoredRoute, {
    sourceX: authoredRoute.sourcePoint.x + 5,
    sourceY: authoredRoute.sourcePoint.y - 7,
    targetX: authoredRoute.targetPoint.x - 11,
    targetY: authoredRoute.targetPoint.y + 13
  });

  assert.deepEqual(resolved, {
    path: authoredRoute.svgPath,
    labelX: authoredRoute.labelPosition?.x,
    labelY: authoredRoute.labelPosition?.y,
    sourceX: authoredRoute.sourcePoint.x,
    sourceY: authoredRoute.sourcePoint.y,
    targetX: authoredRoute.targetPoint.x,
    targetY: authoredRoute.targetPoint.y
  });
});

test("resolveAuthoredEdgePath connects live endpoints through authored interior waypoints", () => {
  const resolved = resolveAuthoredEdgePath(authoredRoute, {
    isStale: true,
    sourceX: 15,
    sourceY: 25,
    targetX: 420,
    targetY: 275
  });

  assert.equal(resolved.path, "M 15 25 L 160 140 L 420 275");
  assert.equal(resolved.path.includes("40.25 60.5"), false);
  assert.equal(resolved.path.includes("300.75 240.25"), false);
  assert.deepEqual(
    {
      sourceX: resolved.sourceX,
      sourceY: resolved.sourceY,
      targetX: resolved.targetX,
      targetY: resolved.targetY
    },
    { sourceX: 15, sourceY: 25, targetX: 420, targetY: 275 }
  );
  assert.deepEqual(
    { labelX: resolved.labelX, labelY: resolved.labelY },
    {
      labelX: authoredRoute.labelPosition?.x,
      labelY: authoredRoute.labelPosition?.y
    }
  );
});

test("resolveAuthoredEdgePath derives a deterministic halfway label when none was authored", () => {
  const resolved = resolveAuthoredEdgePath(
    {
      ...authoredRoute,
      svgPath: "M 0 0 L 100 0 L 100 100",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 100, y: 100 },
      waypoints: [{ x: 100, y: 0 }],
      labelPosition: undefined
    },
    { sourceX: 0, sourceY: 0, targetX: 100, targetY: 100 }
  );

  assert.deepEqual(
    { labelX: resolved.labelX, labelY: resolved.labelY },
    { labelX: 100, labelY: 0 }
  );
});
