import type {
  CostProjectUsage,
  CostResourceUsage,
  CostServiceUsage,
  CostUsageTrendPoint
} from "@sketchcatch/types";

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

export function createScopedCostUsageServiceCosts(input: {
  readonly resourceCosts: readonly CostResourceUsage[];
  readonly selectedProject: CostProjectUsage | null;
  readonly serviceCosts: readonly CostServiceUsage[];
  readonly totalCostAmount: number;
}): CostServiceUsage[] {
  if (input.selectedProject === null) {
    return [...input.serviceCosts];
  }

  if (input.selectedProject.projectId === null) {
    return [];
  }

  const selectedResources = selectCostUsageResourceCosts(input.resourceCosts, input.selectedProject);

  if (selectedResources.length > 0) {
    return createServiceCostsFromEntries(groupResourceCostsByService(selectedResources));
  }

  if (input.totalCostAmount <= 0 || input.selectedProject.amount <= 0) {
    return [];
  }

  const scale = input.selectedProject.amount / input.totalCostAmount;

  return createServiceCostsFromEntries(
    input.serviceCosts.map((service) => [
      service.service,
      roundUsd(service.amount * scale)
    ])
  );
}

function createCostUsageProjectKey(project: CostProjectUsage, index: number): string {
  return project.projectId === null
    ? `project-name:${project.projectName}:${index}`
    : `project-id:${project.projectId}`;
}

function groupResourceCostsByService(
  resourceCosts: readonly CostResourceUsage[]
): readonly [string, number][] {
  const serviceCosts = new Map<string, number>();

  for (const resource of resourceCosts) {
    serviceCosts.set(resource.service, (serviceCosts.get(resource.service) ?? 0) + resource.amount);
  }

  return [...serviceCosts.entries()];
}

function createServiceCostsFromEntries(entries: readonly [string, number][]): CostServiceUsage[] {
  const totalAmount = entries.reduce((sum, [, amount]) => sum + amount, 0);

  return entries
    .map(([service, amount]) => ({
      amount: roundUsd(amount),
      percentage: totalAmount > 0 ? roundPercent((amount / totalAmount) * 100) : 0,
      service
    }))
    .sort((left, right) => right.amount - left.amount || left.service.localeCompare(right.service));
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
