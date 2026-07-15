import assert from "node:assert/strict";
import test from "node:test";
import {
  assertArchitectureBoardCompilerEvidenceRegressionBudget,
  createArchitectureBoardCompilerEvidenceRegressionBudget
} from "./architecture-board-compiler-evidence-baseline";

test("evidence regression budget은 명시된 시각 이상치 상한을 넘으면 위반을 기록한다", () => {
  const budget = createArchitectureBoardCompilerEvidenceRegressionBudget({
    nodeOverlapCount: 1,
    siblingAreaOverlapCount: 2,
    parentBoundaryViolationCount: 3,
    edgeCrossingCount: 4,
    edgeNodeIntersectionCount: 5,
    edgeAreaTitleIntersectionCount: 6,
    backwardEdgeCount: 7,
    supportLaneIntrusionCount: 8
  });

  assert.deepEqual(
    assertArchitectureBoardCompilerEvidenceRegressionBudget(
      {
        nodeOverlapCount: 1,
        siblingAreaOverlapCount: 2,
        parentBoundaryViolationCount: 3,
        edgeCrossingCount: 4,
        edgeNodeIntersectionCount: 5,
        edgeAreaTitleIntersectionCount: 6,
        backwardEdgeCount: 7,
        supportLaneIntrusionCount: 8
      },
      budget
    ),
    []
  );

  assert.deepEqual(
    assertArchitectureBoardCompilerEvidenceRegressionBudget(
      {
        nodeOverlapCount: 2,
        siblingAreaOverlapCount: 2,
        parentBoundaryViolationCount: 3,
        edgeCrossingCount: 5,
        edgeNodeIntersectionCount: 5,
        edgeAreaTitleIntersectionCount: 6,
        backwardEdgeCount: 7,
        supportLaneIntrusionCount: 8
      },
      budget
    ),
    [
      {
        metric: "nodeOverlapCount",
        actual: 2,
        maximum: 1
      },
      {
        metric: "edgeCrossingCount",
        actual: 5,
        maximum: 4
      }
    ]
  );
});
