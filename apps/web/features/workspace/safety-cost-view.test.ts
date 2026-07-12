import assert from "node:assert/strict";
import test from "node:test";
import type { ResourceCostEstimate } from "@sketchcatch/types";
import { createResourceCostView } from "./safety-cost-view";

test("resource cost view keeps free resources separate from unavailable estimates", () => {
  const estimates = [
    createEstimate("ec2", "fallback_estimate", 12),
    createEstimate("vpc", "no_direct_cost", 0),
    createEstimate("rds", "not_estimated", 0)
  ];

  const result = createResourceCostView(estimates);

  assert.deepEqual(result.estimated.map((estimate) => estimate.resourceId), ["ec2", "vpc"]);
  assert.deepEqual(result.unavailable.map((estimate) => estimate.resourceId), ["rds"]);
});

// 비용 화면 테스트에 필요한 최소 Resource 추정값을 만듭니다.
function createEstimate(
  resourceId: string,
  supportLevel: ResourceCostEstimate["supportLevel"],
  amount: number
): ResourceCostEstimate {
  return {
    resourceId,
    resourceType: "EC2",
    name: resourceId,
    monthlyEstimate: { amount, currency: "USD" },
    periodEstimate: { amount, currency: "USD" },
    supportLevel,
    supportReason: "test",
    costDrivers: [],
    explanation: "test"
  };
}
