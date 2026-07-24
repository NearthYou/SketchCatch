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
    [
      ["task-1", "stable"],
      ["task-2", "exiting"]
    ]
  );
  assert.deepEqual(
    settleLiveObservationCapacityUnits(next).map((capacityUnit) => capacityUnit.node.id),
    ["task-1"]
  );
});

test("keeps an already exiting task through a rapid forecast update", () => {
  const exiting = reconcileLiveObservationCapacityUnits(
    [unit("task-1", "active"), unit("task-2", "active")].map((capacityUnit) => ({
      ...capacityUnit,
      transition: "stable" as const
    })),
    [unit("task-1", "active")]
  );

  const updated = reconcileLiveObservationCapacityUnits(exiting, [
    unit("task-1", "active"),
    unit("task-3", "launching")
  ]);

  assert.deepEqual(
    updated.map((capacityUnit) => [capacityUnit.node.id, capacityUnit.transition]),
    [
      ["task-1", "stable"],
      ["task-3", "stable"],
      ["task-2", "exiting"]
    ]
  );
});

test("removes a forecast unit immediately when actual capacity catches up", () => {
  const current = [
    unit("task-1", "active"),
    unit("task--predicted-capacity-2", "launching")
  ].map((capacityUnit) => ({ ...capacityUnit, transition: "stable" as const }));

  const transition = reconcileLiveObservationCapacityUnits(current, [
    unit("task-1", "active"),
    unit("task-2", "active")
  ]);

  assert.deepEqual(
    transition.map((capacityUnit) => [capacityUnit.node.id, capacityUnit.transition]),
    [
      ["task-1", "stable"],
      ["task-2", "entering"]
    ]
  );
});

test("shows a newly observed active task as expected before settling it as running", () => {
  const transition = reconcileLiveObservationCapacityUnits(
    [unit("task-1", "active")].map((capacityUnit) => ({
      ...capacityUnit,
      transition: "stable" as const
    })),
    [unit("task-1", "active"), unit("task-2", "active")]
  );

  assert.deepEqual(
    transition.map((capacityUnit) => [
      capacityUnit.node.id,
      capacityUnit.observationState,
      capacityUnit.transition
    ]),
    [
      ["task-1", "active", "stable"],
      ["task-2", "launching", "entering"]
    ]
  );
  assert.deepEqual(
    settleLiveObservationCapacityUnits([unit("task-1", "active"), unit("task-2", "active")]).map(
      (capacityUnit) => [capacityUnit.node.id, capacityUnit.observationState]
    ),
    [
      ["task-1", "active"],
      ["task-2", "active"]
    ]
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
