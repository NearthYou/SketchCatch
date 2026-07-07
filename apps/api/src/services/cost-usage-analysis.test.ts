import assert from "node:assert/strict";
import { test } from "node:test";
import type { Project } from "@sketchcatch/types";
import {
  createProjectUsageCosts,
  createRecommendationsFromWaste,
  createResourceUsageCosts,
  createSampleCostUsageAnalysis,
  createWasteInsightsFromMetricSnapshots,
  type CostUsageDeployedResource,
  type CostUsageDeployment,
  type CostWasteMetricSnapshot
} from "./cost-usage-analysis.js";

const fixedNow = new Date("2026-07-07T12:00:00.000Z");
const userId = "11111111-1111-4111-8111-111111111111";
const projectA = makeProject({
  id: "22222222-2222-4222-8222-222222222222",
  name: "API Server"
});
const projectB = makeProject({
  id: "33333333-3333-4333-8333-333333333333",
  name: "Batch Worker"
});
const projectC = makeProject({
  id: "44444444-4444-4444-8444-444444444444",
  name: "Admin Console"
});

test("createSampleCostUsageAnalysis returns deterministic fallback usage data", () => {
  const result = createSampleCostUsageAnalysis({
    awsConnection: null,
    deployedResources: [],
    deployments: [],
    now: fixedNow,
    projects: [projectA],
    range: "7d",
    userId
  });

  assert.equal(result.dataSource, "sample");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.startDate, "2026-07-01");
  assert.equal(result.endDate, "2026-07-07");
  assert.equal(result.dailyTrend.length, 7);
  assert.equal(result.serviceCosts.length > 0, true);
  assert.equal(result.resourceCosts.length > 0, true);
  assert.equal(result.wasteResources.length, 2);
  assert.equal(result.recommendations.length, 2);
});

test("createSampleCostUsageAnalysis does not invent project rows when the user has no projects", () => {
  const result = createSampleCostUsageAnalysis({
    awsConnection: null,
    deployedResources: [],
    deployments: [],
    now: fixedNow,
    projects: [],
    range: "7d",
    userId
  });

  assert.deepEqual(result.projectCosts, []);
  assert.deepEqual(result.resourceCosts, []);
  assert.equal(result.wasteResources.some((resource) => resource.projectId !== undefined), false);
});

test("createSampleCostUsageAnalysis scopes project rows and resources to the selected project", () => {
  const result = createSampleCostUsageAnalysis({
    awsConnection: null,
    deployedResources: [
      makeResource({ deploymentId: "deployment-a", id: "resource-a1" }),
      makeResource({ deploymentId: "deployment-a", id: "resource-a2" }),
      makeResource({ deploymentId: "deployment-b", id: "resource-b1" })
    ],
    deployments: [
      makeDeployment({
        id: "deployment-a",
        projectId: projectA.id
      }),
      makeDeployment({
        id: "deployment-b",
        projectId: projectB.id
      })
    ],
    now: fixedNow,
    projectId: projectA.id,
    projects: [projectA, projectB],
    range: "7d",
    userId
  });

  assert.deepEqual(
    result.projectCosts.map((row) => row.projectId),
    [projectA.id]
  );
  assert.equal(result.resourceCosts.every((resource) => resource.projectId === projectA.id), true);
  assert.equal(result.serviceCosts.length > 0, true);
  assert.equal(
    result.resourceCosts.reduce((sum, resource) => sum + resource.amount, 0).toFixed(2),
    result.totalCost.amount.toFixed(2)
  );
});

test("createProjectUsageCosts prefers Cost Explorer project tags over deployment approximation", () => {
  const result = createProjectUsageCosts({
    deployedResources: [
      makeResource({ deploymentId: "deployment-a", id: "resource-a1" }),
      makeResource({ deploymentId: "deployment-a", id: "resource-a2" })
    ],
    deployments: [
      makeDeployment({
        id: "deployment-a",
        projectId: projectA.id
      })
    ],
    projects: [projectA, projectB],
    taggedProjectCosts: new Map([
      [projectA.id, 30],
      [projectB.id, 70]
    ]),
    totalCostAmount: 100
  });

  assert.deepEqual(
    result.map((row) => [row.projectId, row.amount, row.source]),
    [
      [projectB.id, 70, "cost_explorer_tag"],
      [projectA.id, 30, "cost_explorer_tag"]
    ]
  );
});

test("createProjectUsageCosts ignores tags outside deployed projects and falls back to deployment approximation", () => {
  const result = createProjectUsageCosts({
    deployedResources: [
      makeResource({ deploymentId: "deployment-a", id: "resource-a1" }),
      makeResource({ deploymentId: "deployment-a", id: "resource-a2" })
    ],
    deployments: [
      makeDeployment({
        id: "deployment-a",
        projectId: projectA.id
      })
    ],
    projects: [projectA],
    taggedProjectCosts: new Map([[projectB.id, 100]]),
    totalCostAmount: 100
  });

  assert.deepEqual(
    result.map((row) => [row.projectId, row.amount, row.resourceCount, row.source]),
    [[projectA.id, 100, 2, "deployed_resource_estimate"]]
  );
});

test("createProjectUsageCosts approximates project costs from latest deployed resources", () => {
  const result = createProjectUsageCosts({
    deployedResources: [
      makeResource({ deploymentId: "deployment-a", id: "resource-a1" }),
      makeResource({ deploymentId: "deployment-a", id: "resource-a2" }),
      makeResource({ deploymentId: "deployment-a", id: "resource-a3" }),
      makeResource({ deploymentId: "deployment-b", id: "resource-b1" })
    ],
    deployments: [
      makeDeployment({
        id: "deployment-a",
        projectId: projectA.id
      }),
      makeDeployment({
        id: "deployment-b",
        projectId: projectB.id
      })
    ],
    projects: [projectA, projectB],
    taggedProjectCosts: new Map(),
    totalCostAmount: 40
  });

  assert.deepEqual(
    result.map((row) => [row.projectId, row.amount, row.resourceCount, row.source]),
    [
      [projectA.id, 30, 3, "deployed_resource_estimate"],
      [projectB.id, 10, 1, "deployed_resource_estimate"]
    ]
  );
});

test("createProjectUsageCosts keeps fallback project amounts distinct without deployed resources", () => {
  const result = createProjectUsageCosts({
    deployedResources: [],
    deployments: [],
    projects: [projectA, projectB, projectC],
    taggedProjectCosts: new Map(),
    totalCostAmount: 235.2
  });
  const amounts = result.map((row) => row.amount);
  const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0);

  assert.equal(result.length, 3);
  assert.equal(new Set(amounts).size > 1, true);
  assert.equal(totalAmount.toFixed(2), "235.20");
  assert.equal(result.every((row) => row.resourceCount === 0), true);
});

test("createResourceUsageCosts splits project cost across deployed resources", () => {
  const projectCosts = createProjectUsageCosts({
    deployedResources: [
      makeResource({ deploymentId: "deployment-a", id: "resource-a1" }),
      makeResource({ deploymentId: "deployment-a", id: "resource-a2" })
    ],
    deployments: [
      makeDeployment({
        id: "deployment-a",
        projectId: projectA.id
      })
    ],
    projects: [projectA],
    taggedProjectCosts: new Map(),
    totalCostAmount: 40
  });
  const result = createResourceUsageCosts({
    deployedResources: [
      makeResource({ deploymentId: "deployment-a", id: "resource-a1" }),
      makeResource({ deploymentId: "deployment-a", id: "resource-a2" })
    ],
    deployments: [
      makeDeployment({
        id: "deployment-a",
        projectId: projectA.id
      })
    ],
    projectCosts,
    projects: [projectA],
    totalCostAmount: 40
  });

  assert.deepEqual(
    result.map((row) => [row.projectId, row.amount, row.source]),
    [
      [projectA.id, 20, "deployed_resource_estimate"],
      [projectA.id, 20, "deployed_resource_estimate"]
    ]
  );
});

test("createWasteInsightsFromMetricSnapshots detects low EC2 RDS ALB and NAT usage", () => {
  const wasteResources = createWasteInsightsFromMetricSnapshots([
    makeMetricSnapshot({
      metricName: "CPUUtilization",
      resource: makeResource({
        id: "ec2-resource",
        resourceId: "i-123",
        terraformType: "aws_instance"
      }),
      value: 3.4
    }),
    makeMetricSnapshot({
      metricName: "DatabaseConnections",
      resource: makeResource({
        id: "rds-resource",
        resourceId: "db-prod",
        terraformType: "aws_db_instance"
      }),
      service: "Amazon Relational Database Service",
      unit: "Count",
      value: 0.3
    }),
    makeMetricSnapshot({
      metricName: "RequestCount",
      resource: makeResource({
        id: "alb-resource",
        resourceId: "app/alb/123",
        terraformType: "aws_lb"
      }),
      service: "Elastic Load Balancing",
      unit: "Count",
      value: 42
    }),
    makeMetricSnapshot({
      metricName: "BytesOutToDestination",
      resource: makeResource({
        id: "nat-resource",
        resourceId: "nat-123",
        terraformType: "aws_nat_gateway"
      }),
      service: "Amazon Virtual Private Cloud",
      unit: "Bytes",
      value: 512
    })
  ]);
  const recommendations = createRecommendationsFromWaste(wasteResources);

  assert.equal(wasteResources.length, 4);
  assert.deepEqual(
    wasteResources.map((resource) => resource.metricName),
    ["CPUUtilization", "DatabaseConnections", "RequestCount", "BytesOutToDestination"]
  );
  assert.equal(recommendations.length, 4);
  assert.deepEqual(
    recommendations.map((recommendation) => recommendation.severity),
    ["low", "medium", "medium", "low"]
  );
  assert.equal(wasteResources[0]?.finding.includes("t3.nano"), true);
  assert.equal(recommendations[0]?.actionLabel.includes("t3.nano"), true);
});

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    createdAt: "2026-07-01T00:00:00.000Z",
    description: null,
    id: "22222222-2222-4222-8222-222222222222",
    name: "Project",
    updatedAt: "2026-07-01T00:00:00.000Z",
    userId,
    ...overrides
  };
}

function makeDeployment(overrides: Partial<CostUsageDeployment> = {}): CostUsageDeployment {
  return {
    completedAt: new Date("2026-07-02T00:00:00.000Z"),
    id: "deployment-a",
    projectId: projectA.id,
    startedAt: new Date("2026-07-02T00:00:00.000Z"),
    status: "SUCCESS",
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    ...overrides
  };
}

function makeResource(overrides: Partial<CostUsageDeployedResource> = {}): CostUsageDeployedResource {
  return {
    deploymentId: "deployment-a",
    id: "resource-a",
    region: "ap-northeast-2",
    resourceId: "resource-id",
    terraformAddress: "aws_instance.app",
    terraformType: "aws_instance",
    ...overrides
  };
}

function makeMetricSnapshot(input: {
  readonly metricName: string;
  readonly resource: CostUsageDeployedResource;
  readonly service?: string;
  readonly unit?: string;
  readonly value: number;
}): CostWasteMetricSnapshot {
  return {
    averageValue: input.value,
    metricName: input.metricName,
    project: projectA,
    resource: input.resource,
    service: input.service ?? "Amazon Elastic Compute Cloud",
    unit: input.unit ?? "Percent"
  };
}
