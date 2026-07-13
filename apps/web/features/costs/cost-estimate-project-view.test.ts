import assert from "node:assert/strict";
import { test } from "node:test";
import type { CostProjectEstimate } from "@sketchcatch/types";
import {
  countEstimatableCostProjects,
  selectUndeployedCostProjects,
  sumCostProjectEstimates
} from "./cost-estimate-project-view";

const undeployed = createProjectEstimate("draft", "not_deployed", 12.34);
const deployed = createProjectEstimate("live", "deployed", 45.67);
const empty = createProjectEstimate("empty", "not_deployed", null);

test("selectUndeployedCostProjects excludes successfully deployed projects", () => {
  assert.deepEqual(selectUndeployedCostProjects([undeployed, deployed, empty]), [undeployed, empty]);
});

test("sumCostProjectEstimates adds only available project estimates", () => {
  assert.deepEqual(
    sumCostProjectEstimates([undeployed, empty], "totalMonthlyEstimate"),
    { amount: 12.34, currency: "USD" }
  );
});

test("countEstimatableCostProjects excludes projects without an architecture estimate", () => {
  assert.equal(countEstimatableCostProjects([undeployed, empty]), 1);
});

function createProjectEstimate(
  id: string,
  deploymentState: CostProjectEstimate["deploymentState"],
  amount: number | null
): CostProjectEstimate {
  return {
    costEstimate:
      amount === null
        ? null
        : {
            assumptions: [],
            expectedUserCount: 1000,
            fallbackUsed: true,
            period: "month",
            pricingAssumption: "보수적 추정 단가",
            pricingSource: "fallback",
            region: "ap-northeast-2",
            resources: [],
            reviewMessages: [],
            totalEstimate: { amount, currency: "USD" },
            totalMonthlyEstimate: { amount, currency: "USD" }
          },
    deploymentState,
    project: {
      createdAt: "2026-07-13T00:00:00.000Z",
      description: null,
      id,
      name: id,
      updatedAt: "2026-07-13T00:00:00.000Z",
      userId: "user"
    }
  };
}
