import assert from "node:assert/strict";
import test from "node:test";
import { createReverseEngineeringFinalRegressionFixture } from "./reverse-engineering-final-regression.fixture";
import { createReverseEngineeringImportDecision } from "./useReverseEngineeringWorkflow";

test("보드에 적용할 때 현재 후보의 Terraform 선택만 import 결정에 남긴다", () => {
  const { result } = createReverseEngineeringFinalRegressionFixture();

  const decision = createReverseEngineeringImportDecision({
    acknowledgedReviewOnlyResourceIds: [
      "ecs-task-definition-task9",
      "lambda-task9",
      "lambda-task9",
      "iam-role-task9",
      "vpc-task9",
      "not-in-result"
    ],
    result,
    selectedReadyResourceIds: [
      "vpc-task9",
      "vpc-task9",
      "subnet-task9",
      "ecs-task-definition-task9",
      "lambda-task9",
      "not-in-result"
    ],
    sourceNodeIds: ["vpc-task9", "ecs-task-definition-task9", "lambda-task9"]
  });

  assert.deepEqual(decision, {
    version: 1,
    selectedReadyResourceIds: ["vpc-task9"],
    acknowledgedReviewOnlyResourceIds: ["ecs-task-definition-task9", "lambda-task9"]
  });
});

test("결과가 없으면 Terraform 선택을 보드 적용 요청에 싣지 않는다", () => {
  assert.deepEqual(
    createReverseEngineeringImportDecision({
      acknowledgedReviewOnlyResourceIds: ["review-only-resource"],
      result: null,
      selectedReadyResourceIds: ["ready-resource"],
      sourceNodeIds: ["ready-resource", "review-only-resource"]
    }),
    {
      version: 1,
      selectedReadyResourceIds: [],
      acknowledgedReviewOnlyResourceIds: []
    }
  );
});
