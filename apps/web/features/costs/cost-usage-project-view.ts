import type { CostProjectUsage, CostResourceUsage, CostUsageTrendPoint } from "@sketchcatch/types";

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

export function getCostUsageProjectIdFromKey(selectedProjectKey: string): string | null {
  return selectedProjectKey.startsWith("project-id:")
    ? selectedProjectKey.slice("project-id:".length)
    : null;
}

export function createScopedCostUsageDailyTrend(input: {
  readonly dailyTrend: readonly CostUsageTrendPoint[];
  readonly selectedProject: CostProjectUsage | null;
  readonly totalCostAmount: number;
}): CostUsageTrendPoint[] {
  if (input.selectedProject === null) {
    return [...input.dailyTrend];
  }

  if (input.totalCostAmount <= 0 || input.selectedProject.amount <= 0) {
    return input.dailyTrend.map((point) => ({
      amount: 0,
      date: point.date
    }));
  }

  const scale = input.selectedProject.amount / input.totalCostAmount;

  return input.dailyTrend.map((point) => ({
    amount: roundUsd(point.amount * scale),
    date: point.date
  }));
}

export function selectCostUsageResourceCosts(
  resourceCosts: readonly CostResourceUsage[],
  selectedProject: CostProjectUsage | null
): CostResourceUsage[] {
  if (selectedProject === null) {
    return [...resourceCosts];
  }

  if (selectedProject.projectId === null) {
    return [];
  }

  return resourceCosts.filter((resource) => resource.projectId === selectedProject.projectId);
}

function createCostUsageProjectKey(project: CostProjectUsage, index: number): string {
  return project.projectId === null
    ? `project-name:${project.projectName}:${index}`
    : `project-id:${project.projectId}`;
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
