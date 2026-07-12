import type { ResourceCostEstimate } from "@sketchcatch/types";

export type ResourceCostView = {
  readonly estimated: readonly ResourceCostEstimate[];
  readonly unavailable: readonly ResourceCostEstimate[];
};

// 계산된 비용과 계산할 수 없는 비용을 분리해 0원과 미확인을 혼동하지 않게 합니다.
export function createResourceCostView(
  estimates: readonly ResourceCostEstimate[]
): ResourceCostView {
  return {
    estimated: estimates.filter((estimate) => estimate.supportLevel !== "not_estimated"),
    unavailable: estimates.filter((estimate) => estimate.supportLevel === "not_estimated")
  };
}
