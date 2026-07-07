import assert from "node:assert/strict";
import { test } from "node:test";
import type { CostProjectUsage } from "@sketchcatch/types";
import {
  COST_USAGE_ALL_PROJECTS_KEY,
  createCostUsageProjectOptions,
  normalizeCostUsageProjectKey,
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

test("normalizeCostUsageProjectKey falls back to all projects when the selected project disappears", () => {
  assert.equal(
    normalizeCostUsageProjectKey(projectCosts, "project-id:missing"),
    COST_USAGE_ALL_PROJECTS_KEY
  );
});

function createProjectUsage(
  overrides: Pick<CostProjectUsage, "amount" | "percentage" | "projectId" | "projectName">
): CostProjectUsage {
  return {
    resourceCount: 3,
    source: "deployed_resource_estimate",
    ...overrides
  };
}
