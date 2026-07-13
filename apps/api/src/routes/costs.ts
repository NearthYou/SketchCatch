import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  CostEstimatePeriod,
  CostProjectEstimate,
  CostProjectEstimateListResponse,
  CostUsageAnalysisResponse,
  Project
} from "@sketchcatch/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { toAwsConnection } from "../aws-connections/aws-connection-service.js";
import { architectures, awsConnections, deployedResources, deployments, projects } from "../db/schema.js";
import { createConfiguredAwsPricingRateProvider } from "../services/awsPricingRateProvider.js";
import {
  analyzeCost,
  createCostEstimateRequest,
  DEFAULT_COST_REGION,
  DEFAULT_EXPECTED_USER_COUNT,
  DEFAULT_COST_ESTIMATE_PERIOD,
  type CostPricingRateProvider
} from "../services/cost-analysis.js";
import {
  analyzeCostUsage,
  type CostUsageAnalysisProvider,
  type CostUsageDeployedResource,
  type CostUsageDeployment
} from "../services/cost-usage-analysis.js";

export type CostRouteOptions = {
  readonly getDatabaseClient?: (() => DatabaseClient) | undefined;
  readonly pricingRateProvider?: CostPricingRateProvider | undefined;
  readonly costUsageProvider?: CostUsageAnalysisProvider | undefined;
};

const costProjectsQuerySchema = z.object({
  expectedUserCount: z.coerce.number().int().min(1).max(1_000_000).default(DEFAULT_EXPECTED_USER_COUNT),
  period: z.enum(["day", "week", "month"]).default(DEFAULT_COST_ESTIMATE_PERIOD),
  region: z.string().trim().min(1).default(DEFAULT_COST_REGION)
});

const costUsageQuerySchema = z.object({
  awsConnectionId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  range: z.enum(["7d", "30d", "month_to_date"]).default("30d")
});

type CostProjectRow = {
  readonly project: typeof projects.$inferSelect;
  readonly architecture: typeof architectures.$inferSelect | undefined;
};

export async function registerCostRoutes(
  app: FastifyInstance,
  options: CostRouteOptions = {}
): Promise<void> {
  const getCostDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const pricingRateProvider = options.pricingRateProvider ?? createConfiguredAwsPricingRateProvider();
  const costUsageProvider = options.costUsageProvider;

  app.get("/costs/projects", async (request): Promise<CostProjectEstimateListResponse> => {
    const currentUserId = await requireActiveUserId(request, getCostDatabaseClient);
    const query = costProjectsQuerySchema.parse(request.query);
    const { db } = getCostDatabaseClient();
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, currentUserId))
      .orderBy(desc(projects.updatedAt), desc(projects.createdAt));
    const projectIds = projectRows.map((project) => project.id);
    const deploymentRows =
      projectIds.length === 0
        ? []
        : await db
            .select()
            .from(deployments)
            .where(inArray(deployments.projectId, projectIds))
            .orderBy(desc(deployments.completedAt), desc(deployments.updatedAt));
    const deployedProjectIds = new Set(
      selectLatestSuccessfulDeployments(deploymentRows).map((deployment) => deployment.projectId)
    );
    const architectureRows =
      projectIds.length === 0
        ? []
        : await db
            .select()
            .from(architectures)
            .where(inArray(architectures.projectId, projectIds))
            .orderBy(desc(architectures.createdAt));
    const latestArchitectureByProjectId = new Map<string, typeof architectures.$inferSelect>();

    for (const architecture of architectureRows) {
      if (!latestArchitectureByProjectId.has(architecture.projectId)) {
        latestArchitectureByProjectId.set(architecture.projectId, architecture);
      }
    }

    const rows = projectRows.map((project) => ({
      architecture: latestArchitectureByProjectId.get(project.id),
      project
    }));
    const projectEstimates = await Promise.all(
      rows.map((row) =>
        createCostProjectEstimate(
          row,
          query,
          pricingRateProvider,
          deployedProjectIds.has(row.project.id)
        )
      )
    );
    const totalEstimateAmount = roundUsd(
      projectEstimates.reduce(
        (sum, item) => sum + (item.costEstimate?.totalEstimate.amount ?? 0),
        0
      )
    );
    const totalMonthlyEstimateAmount = roundUsd(
      projectEstimates.reduce(
        (sum, item) => sum + (item.costEstimate?.totalMonthlyEstimate.amount ?? 0),
        0
      )
    );

    return {
      expectedUserCount: query.expectedUserCount,
      period: query.period,
      projects: projectEstimates,
      region: query.region,
      totalEstimate: {
        amount: totalEstimateAmount,
        currency: "USD"
      },
      totalMonthlyEstimate: {
        amount: totalMonthlyEstimateAmount,
        currency: "USD"
      }
    };
  });

  app.get("/costs/usage", async (request): Promise<CostUsageAnalysisResponse> => {
    const currentUserId = await requireActiveUserId(request, getCostDatabaseClient);
    const query = costUsageQuerySchema.parse(request.query);
    const { db } = getCostDatabaseClient();
    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, currentUserId))
      .orderBy(desc(projects.updatedAt), desc(projects.createdAt));
    const projectIds = projectRows.map((project) => project.id);
    const selectedAwsConnectionRows =
      query.awsConnectionId === undefined
        ? await db
            .select()
            .from(awsConnections)
            .where(
              and(eq(awsConnections.userId, currentUserId), eq(awsConnections.status, "verified"))
            )
            .orderBy(desc(awsConnections.updatedAt), desc(awsConnections.createdAt))
        : await db
            .select()
            .from(awsConnections)
            .where(
              and(
                eq(awsConnections.id, query.awsConnectionId),
                eq(awsConnections.userId, currentUserId),
                eq(awsConnections.status, "verified")
              )
            )
            .orderBy(desc(awsConnections.updatedAt), desc(awsConnections.createdAt));
    const awsConnection =
      selectedAwsConnectionRows[0] === undefined ? null : toAwsConnection(selectedAwsConnectionRows[0]);
    const deploymentRows =
      projectIds.length === 0
        ? []
        : await db
            .select()
            .from(deployments)
            .where(inArray(deployments.projectId, projectIds))
            .orderBy(desc(deployments.completedAt), desc(deployments.updatedAt));
    const latestSuccessfulDeployments = selectLatestSuccessfulDeployments(deploymentRows);
    const deployedProjectIds = new Set(
      latestSuccessfulDeployments.map((deployment) => deployment.projectId)
    );
    const deploymentIds = latestSuccessfulDeployments.map((deployment) => deployment.id);
    const deployedResourceRows =
      deploymentIds.length === 0
        ? []
        : await db
            .select()
            .from(deployedResources)
            .where(inArray(deployedResources.deploymentId, deploymentIds));

    return analyzeCostUsage(
      {
        awsConnection,
        deployedResources: deployedResourceRows.map(toCostUsageDeployedResource),
        deployments: latestSuccessfulDeployments.map(toCostUsageDeployment),
        projectId: query.projectId,
        projects: projectRows
          .filter((project) => deployedProjectIds.has(project.id))
          .map(toProject),
        range: query.range,
        userId: currentUserId
      },
      costUsageProvider
    );
  });
}

function selectLatestSuccessfulDeployments(
  rows: readonly (typeof deployments.$inferSelect)[]
): (typeof deployments.$inferSelect)[] {
  const latestDeploymentsByProjectId = new Map<string, typeof deployments.$inferSelect>();

  for (const deployment of rows) {
    if (deployment.status !== "SUCCESS" || latestDeploymentsByProjectId.has(deployment.projectId)) {
      continue;
    }

    latestDeploymentsByProjectId.set(deployment.projectId, deployment);
  }

  return [...latestDeploymentsByProjectId.values()];
}

async function createCostProjectEstimate(
  row: CostProjectRow,
  query: {
    expectedUserCount: number;
    period: CostEstimatePeriod;
    region: string;
  },
  pricingRateProvider: CostPricingRateProvider,
  isDeployed: boolean
): Promise<CostProjectEstimate> {
  if (row.architecture === undefined) {
    return {
      project: toProject(row.project),
      costEstimate: null,
      deploymentState: isDeployed ? "deployed" : "not_deployed"
    };
  }

  const costEstimate = await analyzeCost(
    createCostEstimateRequest({
      architectureJson: row.architecture.architectureJson,
      expectedUserCount: query.expectedUserCount,
      period: query.period,
      region: query.region
    }),
    { pricingRateProvider }
  );

  return {
    project: toProject(row.project),
    costEstimate,
    deploymentState: isDeployed ? "deployed" : "not_deployed"
  };
}

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toCostUsageDeployment(row: typeof deployments.$inferSelect): CostUsageDeployment {
  return {
    completedAt: row.completedAt,
    id: row.id,
    projectId: row.projectId,
    startedAt: row.startedAt,
    status: row.status,
    updatedAt: row.updatedAt
  };
}

function toCostUsageDeployedResource(
  row: typeof deployedResources.$inferSelect
): CostUsageDeployedResource {
  return {
    deploymentId: row.deploymentId,
    id: row.id,
    region: row.region,
    resourceId: row.resourceId,
    terraformAddress: row.terraformAddress,
    terraformType: row.terraformType
  };
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
