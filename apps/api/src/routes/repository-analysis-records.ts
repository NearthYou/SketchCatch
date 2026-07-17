import { z, ZodError } from "zod";
import {
  REPOSITORY_ANALYSIS_TEMPLATE_IDS,
  type RepositoryAnalysisAiHandoff,
  type RepositoryAnalysisRecordResponse,
  type SaveRepositoryAnalysisRecordRequest
} from "@sketchcatch/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  createPostgresRepositoryAnalysisRecordStore,
  createRepositoryAnalysisRecordService,
  RepositoryAnalysisRecordServiceError,
  type RepositoryAnalysisRecordService
} from "../repository-analysis-records/repository-analysis-record-service.js";

const projectParamsSchema = z.object({ projectId: z.uuid() }).strict();
const templateIdSchema = z.enum(REPOSITORY_ANALYSIS_TEMPLATE_IDS);
const revisionSchema = z.string().regex(/^[a-f\d]{40}$/iu);
const analysisResultSchema = z.object({
  repositoryUrl: z.url().max(500),
  repositoryRevision: revisionSchema,
  defaultBranch: z.string().trim().min(1).max(255),
  availableBranches: z.array(z.string().trim().min(1).max(255)).max(500),
  evidenceFiles: z.array(z.object({
    path: z.string().trim().min(1).max(1_024),
    found: z.boolean()
  }).strict()).max(2_000),
  detectedSignals: z.array(z.string().trim().min(1).max(255)).max(2_000),
  recommendedTemplateId: templateIdSchema.nullable(),
  recommendationReason: z.string().max(4_000),
  aiHandoff: z.custom<RepositoryAnalysisAiHandoff>(
    (value) => typeof value === "object" && value !== null
  ).optional()
}).strict();
const saveRecordSchema = z.object({
  provider: z.literal("github"),
  repositoryUrl: z.url().max(500),
  owner: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  branch: z.string().trim().min(1).max(255),
  repositoryRevision: revisionSchema,
  analysisResult: analysisResultSchema,
  selectedTemplateId: templateIdSchema.nullable(),
  analyzedAt: z.iso.datetime()
}).strict();

export type RepositoryAnalysisRecordRouteOptions = {
  createService?: () => RepositoryAnalysisRecordService;
  getDatabaseClient?: () => DatabaseClient;
  requireUserId?: (request: FastifyRequest) => Promise<string>;
};

export async function registerRepositoryAnalysisRecordRoutes(
  app: FastifyInstance,
  options: RepositoryAnalysisRecordRouteOptions = {}
): Promise<void> {
  const getClient = options.getDatabaseClient ?? getDatabaseClient;
  const requireUser = options.requireUserId ?? ((request) =>
    requireActiveUserId(request, getClient));
  const createService = options.createService ?? (() =>
    createRepositoryAnalysisRecordService(
      createPostgresRepositoryAnalysisRecordStore(getClient().db)
    ));

  app.get("/projects/:projectId/repository-analysis-record", async (request, reply) => {
    try {
      const { projectId } = projectParamsSchema.parse(request.params);
      const userId = await requireUser(request);
      const response: RepositoryAnalysisRecordResponse = {
        record: await createService().getCurrent(projectId, userId)
      };
      return reply.status(200).send(response);
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.put("/projects/:projectId/repository-analysis-record", async (request, reply) => {
    try {
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = saveRecordSchema.parse(request.body) satisfies SaveRepositoryAnalysisRecordRequest;
      const userId = await requireUser(request);
      const response: RepositoryAnalysisRecordResponse = {
        record: await createService().replaceCurrent(projectId, userId, body)
      };
      return reply.status(200).send(response);
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof RepositoryAnalysisRecordServiceError) {
    return reply.status(error.statusCode).send({
      error: error.errorCode,
      message: error.message
    });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "bad_request",
      message: error.issues[0]?.message ?? "Invalid request"
    });
  }
  throw error;
}
