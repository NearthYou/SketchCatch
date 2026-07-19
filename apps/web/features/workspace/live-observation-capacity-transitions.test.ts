import assert from "node:assert/strict";
import test from "node:test";
import type { LiveObservationCapacityUnit } from "./live-observation-diagram.js";
import {
  reconcileLiveObservationCapacityUnits,
  settleLiveObservationCapacityUnits
} from "./live-observation-capacity-transitions.js";

test("keeps a removed task as exiting until the transition settles", () => {
  const current = [unit("task-1", "active"), unit("task-2", "active")];
  const next = [unit("task-1", "active")];

  const transition = reconcileLiveObservationCapacityUnits(
    current.map((capacityUnit) => ({ ...capacityUnit, transition: "stable" as const })),
    next
  );

  assert.deepEqual(
    transition.map((capacityUnit) => [capacityUnit.node.id, capacityUnit.transition]),
    [["task-1", "stable"], ["task-2", "exiting"]]
  );
  assert.deepEqual(
    settleLiveObservationCapacityUnits(next).map((capacityUnit) => capacityUnit.node.id),
    ["task-1"]
  );
});

function unit(
  id: string,
  observationState: LiveObservationCapacityUnit["observationState"]
): LiveObservationCapacityUnit {
  return {
    node: {
      id,
      kind: "resource",
      label: "Fargate Task",
      locked: false,
      position: { x: 0, y: 0 },
      size: { height: 48, width: 48 },
      type: "aws_ecs_task_definition",
      zIndex: 0
    },
    observationState
  };
}
