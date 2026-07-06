import { desc, eq, inArray } from "drizzle-orm";
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
import { architectures, projects } from "../db/schema.js";
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
  row: CostProjectRow,
  query: {
    expectedUserCount: number;
    period: CostEstimatePeriod;
    region: string;
  },
  pricingRateProvider: CostPricingRateProvider
): Promise<CostProjectEstimate> {
  if (row.architecture === undefined) {
    return {
      project: toProject(row.project),
      costEstimate: null
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

function roundUsd(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
