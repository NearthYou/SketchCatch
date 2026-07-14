import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CostProjectUsage,
  CostResourceUsage,
  CostServiceUsage,
  CostUsageMonthlyComparison
} from "@sketchcatch/types";
import {
  COST_USAGE_ALL_PROJECTS_KEY,
  createScopedCostUsageDailyTrend,
  createScopedCostUsageMonthlyComparison,
  createScopedCostUsageMonthlyTrend,
  createScopedCostUsageServiceCosts,
  createCostUsageProjectOptions,
  getCostUsageProjectIdFromKey,
  normalizeCostUsageProjectKey,
  selectCostUsageResourceCosts,
  selectCostUsageProject
} from "./cost-usage-project-view";

const projectCosts = [
  createProjectUsage({
    amount: 24.2,
    percentage: 60,
    projectId: "project-a",
    projectName: "API Server"
  }),
  createProjectUsage({
    amount: 16.28,
    percentage: 40,
    projectId: "project-b",
    projectName: "Batch Worker"
  })
];

test("createCostUsageProjectOptions creates stable selectable project options", () => {
  assert.deepEqual(createCostUsageProjectOptions(projectCosts), [
    {
      amount: 24.2,
      key: "project-id:project-a",
      label: "API Server",
      percentage: 60,
      project: projectCosts[0],
      resourceCount: 3
    },
    {
      amount: 16.28,
      key: "project-id:project-b",
      label: "Batch Worker",
      percentage: 40,
      project: projectCosts[1],
      resourceCount: 3
    }
  ]);
});

test("selectCostUsageProject returns null for the all projects option", () => {
  assert.equal(selectCostUsageProject(projectCosts, COST_USAGE_ALL_PROJECTS_KEY), null);
});

test("selectCostUsageProject resolves the matching project", () => {
  assert.deepEqual(selectCostUsageProject(projectCosts, "project-id:project-b"), projectCosts[1]);
});

test("getCostUsageProjectIdFromKey extracts the API project id from selectable keys", () => {
  assert.equal(getCostUsageProjectIdFromKey(COST_USAGE_ALL_PROJECTS_KEY), null);
  assert.equal(getCostUsageProjectIdFromKey("project-id:project-a"), "project-a");
});

test("normalizeCostUsageProjectKey falls back to all projects when the selected project disappears", () => {
  assert.equal(
    normalizeCostUsageProjectKey(projectCosts, "project-id:missing"),
    COST_USAGE_ALL_PROJECTS_KEY
  );
});

test("createScopedCostUsageDailyTrend scales the account trend for a selected project", () => {
  assert.deepEqual(
    createScopedCostUsageDailyTrend({
      dailyTrend: [
        { amount: 10, date: "2026-07-01" },
        { amount: 20, date: "2026-07-02" }
      ],
      selectedProject: projectCosts[0]!,
      totalCostAmount: 40
    }),
    [
      { amount: 6.05, date: "2026-07-01" },
      { amount: 12.1, date: "2026-07-02" }
    ]
  );
});

test("monthly project view scales values and marks allocated points as estimated", () => {
  const monthlyComparison: CostUsageMonthlyComparison = {
    currentMonthForecast: { amount: 80, currency: "USD" },
    currentMonthToDate: { amount: 40, currency: "USD" },
    forecastChangeAmount: { amount: -20, currency: "USD" },
    forecastChangePercentage: -20,
    previousMonthActual: { amount: 100, currency: "USD" }
  };

  assert.deepEqual(
    createScopedCostUsageMonthlyTrend({
      monthlyTrend: [
        { amount: 100, isEstimated: false, isPartial: false, month: "2026-06" },
        { amount: 40, isEstimated: false, isPartial: true, month: "2026-07" }
      ],
      selectedProject: projectCosts[0]!,
      totalCostAmount: 40
    }),
    [
      { amount: 60.5, isEstimated: true, isPartial: false, month: "2026-06" },
      { amount: 24.2, isEstimated: true, isPartial: true, month: "2026-07" }
    ]
  );
  assert.deepEqual(
    createScopedCostUsageMonthlyComparison({
      generatedAt: "2026-07-07T12:00:00.000Z",
      monthlyComparison,
      selectedProject: projectCosts[0]!,
      totalCostAmount: 40
    }),
    {
      currentMonthForecast: { amount: 48.4, currency: "USD" },
      currentMonthToDate: { amount: 24.2, currency: "USD" },
      forecastChangeAmount: { amount: -12.1, currency: "USD" },
      forecastChangePercentage: -20,
      previousMonthActual: { amount: 60.5, currency: "USD" }
    }
  );
});

test("monthly project view keeps tagged project actual costs when available", () => {
  const taggedMonthlyTrend = [
    { amount: 18.4, isEstimated: false, isPartial: false, month: "2026-06" },
    { amount: 4.2, isEstimated: false, isPartial: true, month: "2026-07" }
  ];

  assert.deepEqual(
    createScopedCostUsageMonthlyTrend({
      monthlyTrend: [],
      selectedProject: {
        ...projectCosts[0]!,
        monthlyTrend: taggedMonthlyTrend,
        source: "cost_explorer_tag"
      },
      totalCostAmount: 40
    }),
    taggedMonthlyTrend
  );
  assert.deepEqual(
    createScopedCostUsageMonthlyComparison({
      generatedAt: "2026-07-07T12:00:00.000Z",
      monthlyComparison: {
        currentMonthForecast: { amount: 200, currency: "USD" },
        currentMonthToDate: { amount: 50, currency: "USD" },
        forecastChangeAmount: { amount: 20, currency: "USD" },
        forecastChangePercentage: 10,
        previousMonthActual: { amount: 180, currency: "USD" }
      },
      selectedProject: {
        ...projectCosts[0]!,
        monthlyTrend: taggedMonthlyTrend,
        source: "cost_explorer_tag"
      },
      totalCostAmount: 40
    }),
    {
      currentMonthForecast: { amount: 18.6, currency: "USD" },
      currentMonthToDate: { amount: 4.2, currency: "USD" },
      forecastChangeAmount: { amount: 0.2, currency: "USD" },
      forecastChangePercentage: 1.1,
      previousMonthActual: { amount: 18.4, currency: "USD" }
    }
  );
});

test("selectCostUsageResourceCosts returns only resources for the selected project", () => {
  assert.deepEqual(
    selectCostUsageResourceCosts(
      [
        createResourceUsage({ id: "resource-a", projectId: "project-a" }),
        createResourceUsage({ id: "resource-b", projectId: "project-b" })
      ],
      projectCosts[0]!
    ).map((resource) => resource.id),
    ["resource-a"]
  );
});

test("createScopedCostUsageServiceCosts keeps account service costs for all projects", () => {
  const serviceCosts = [
    createServiceUsage({ amount: 24, percentage: 60, service: "Amazon EC2" })
  ];

  assert.deepEqual(
    createScopedCostUsageServiceCosts({
      resourceCosts: [],
      selectedProject: null,
      serviceCosts,
      totalCostAmount: 40
    }),
    serviceCosts
  );
});

test("createScopedCostUsageServiceCosts groups selected project resources by service", () => {
  assert.deepEqual(
    createScopedCostUsageServiceCosts({
      resourceCosts: [
        createResourceUsage({
          amount: 10,
          id: "resource-a",
          projectId: "project-a",
          service: "Amazon EC2"
        }),
        createResourceUsage({
          amount: 5,
          id: "resource-b",
          projectId: "project-a",
          service: "Amazon S3"
        }),
        createResourceUsage({
          amount: 5,
          id: "resource-c",
          projectId: "project-a",
          service: "Amazon EC2"
        }),
        createResourceUsage({
          amount: 30,
          id: "resource-d",
          projectId: "project-b",
          service: "Amazon RDS"
        })
      ],
      selectedProject: projectCosts[0]!,
      serviceCosts: [createServiceUsage({ amount: 40, percentage: 100, service: "Account" })],
      totalCostAmount: 40
    }),
    [
      createServiceUsage({ amount: 15, percentage: 75, service: "Amazon EC2" }),
      createServiceUsage({ amount: 5, percentage: 25, service: "Amazon S3" })
    ]
  );
});

function createProjectUsage(
  overrides: Pick<CostProjectUsage, "amount" | "percentage" | "projectId" | "projectName">
): CostProjectUsage {
  return {
    monthlyTrend: [],
    resourceCount: 3,
    source: "deployed_resource_estimate",
    ...overrides
  };
}

function createServiceUsage(overrides: CostServiceUsage): CostServiceUsage {
  return overrides;
}

function createResourceUsage(
  overrides: {
    readonly amount?: number;
    readonly id: string;
    readonly projectId: string;
    readonly service?: string;
  }
): CostResourceUsage {
  return {
    amount: overrides.amount ?? 10,
    id: overrides.id,
    percentage: 25,
    projectId: overrides.projectId,
    projectName: "Project",
    resourceId: overrides.id,
    resourceName: overrides.id,
    resourceType: "aws_instance",
    service: overrides.service ?? "Amazon Elastic Compute Cloud",
    source: "deployed_resource_estimate" as const,
    terraformAddress: "aws_instance.app"
  };
}
