import { and, desc, eq } from "drizzle-orm";
import type {
  CostEstimatePeriod,
  CostProjectEstimate,
  CostProjectEstimateListResponse,
  Project
} from "@sketchcatch/types";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { architectures, deployments, projects } from "../db/schema.js";
import { createConfiguredAwsPricingRateProvider } from "../services/awsPricingRateProvider.js";
import {
  analyzeCost,
  createCostEstimateRequest,
  DEFAULT_COST_REGION,
  DEFAULT_EXPECTED_USER_COUNT,
  DEFAULT_COST_ESTIMATE_PERIOD,
  type CostPricingRateProvider
} from "../services/cost-analysis.js";

export type CostRouteOptions = {
  readonly getDatabaseClient?: (() => DatabaseClient) | undefined;
  readonly pricingRateProvider?: CostPricingRateProvider | undefined;
};

const costProjectsQuerySchema = z.object({
  expectedUserCount: z.coerce.number().int().min(1).max(1_000_000).default(DEFAULT_EXPECTED_USER_COUNT),
  period: z.enum(["day", "week", "month"]).default(DEFAULT_COST_ESTIMATE_PERIOD),
  region: z.string().trim().min(1).default(DEFAULT_COST_REGION)
});

type RunningCostProjectRow = {
  readonly project: typeof projects.$inferSelect;
  readonly deployment: typeof deployments.$inferSelect;
  readonly architecture: typeof architectures.$inferSelect;
};

export async function registerCostRoutes(
  app: FastifyInstance,
  options: CostRouteOptions = {}
): Promise<void> {
  const getCostDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const pricingRateProvider = options.pricingRateProvider ?? createConfiguredAwsPricingRateProvider();

  app.get("/costs/projects", async (request): Promise<CostProjectEstimateListResponse> => {
    const currentUserId = await requireActiveUserId(request, getCostDatabaseClient);
    const query = costProjectsQuerySchema.parse(request.query);
    const { db } = getCostDatabaseClient();
    const rows = await db
      .select({
        project: projects,
        deployment: deployments,
        architecture: architectures
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(architectures, eq(deployments.architectureId, architectures.id))
      .where(and(eq(projects.userId, currentUserId), eq(deployments.status, "RUNNING")))
      .orderBy(desc(deployments.startedAt), desc(deployments.updatedAt), desc(deployments.createdAt));
    const projectEstimates = await Promise.all(
      rows.map((row) => createCostProjectEstimate(row, query, pricingRateProvider))
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
}

async function createCostProjectEstimate(
  row: RunningCostProjectRow,
  query: {
    expectedUserCount: number;
    period: CostEstimatePeriod;
    region: string;
  },
  pricingRateProvider: CostPricingRateProvider
): Promise<CostProjectEstimate> {
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
    deployedAt: getDeploymentDate(row.deployment).toISOString(),
    costEstimate
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

function getDeploymentDate(row: typeof deployments.$inferSelect): Date {
  return row.startedAt ?? row.updatedAt ?? row.createdAt;
}

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
