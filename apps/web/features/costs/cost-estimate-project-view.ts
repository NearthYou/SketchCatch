import type { CostProjectEstimate, MoneyEstimate } from "@sketchcatch/types";

export function selectUndeployedCostProjects(
  projects: readonly CostProjectEstimate[]
): CostProjectEstimate[] {
  return projects.filter((project) => project.deploymentState === "not_deployed");
}

export function sumCostProjectEstimates(
  projects: readonly CostProjectEstimate[],
  field: "totalEstimate" | "totalMonthlyEstimate"
): MoneyEstimate {
  return {
    amount: roundUsd(
      projects.reduce(
        (sum, project) => sum + (project.costEstimate?.[field].amount ?? 0),
        0
      )
    ),
    currency: "USD"
  };
}

export function countEstimatableCostProjects(
  projects: readonly CostProjectEstimate[]
): number {
  return projects.filter((project) => project.costEstimate !== null).length;
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
