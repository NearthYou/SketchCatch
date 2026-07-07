import type { CostProjectUsage } from "@sketchcatch/types";

export const COST_USAGE_ALL_PROJECTS_KEY = "all-projects";

export type CostUsageProjectOption = {
  readonly amount: number;
  readonly key: string;
  readonly label: string;
  readonly percentage: number;
  readonly project: CostProjectUsage;
  readonly resourceCount: number;
};

export function createCostUsageProjectOptions(
  projectCosts: readonly CostProjectUsage[]
): CostUsageProjectOption[] {
  return projectCosts.map((project, index) => ({
    amount: project.amount,
    key: createCostUsageProjectKey(project, index),
    label: project.projectName,
    percentage: project.percentage,
    project,
    resourceCount: project.resourceCount
  }));
}

export function normalizeCostUsageProjectKey(
  projectCosts: readonly CostProjectUsage[],
  selectedProjectKey: string
): string {
  if (selectedProjectKey === COST_USAGE_ALL_PROJECTS_KEY) {
    return selectedProjectKey;
  }

  const hasProject = createCostUsageProjectOptions(projectCosts).some(
    (option) => option.key === selectedProjectKey
  );

  return hasProject ? selectedProjectKey : COST_USAGE_ALL_PROJECTS_KEY;
}

export function selectCostUsageProject(
  projectCosts: readonly CostProjectUsage[],
  selectedProjectKey: string
): CostProjectUsage | null {
  if (selectedProjectKey === COST_USAGE_ALL_PROJECTS_KEY) {
    return null;
  }

  return (
    createCostUsageProjectOptions(projectCosts).find(
      (option) => option.key === selectedProjectKey
    )?.project ?? null
  );
}

function createCostUsageProjectKey(project: CostProjectUsage, index: number): string {
  return project.projectId === null
    ? `project-name:${project.projectName}:${index}`
    : `project-id:${project.projectId}`;
}
