import { z, ZodError } from "zod";
import {
  REPOSITORY_ARCHITECTURE_FACT_KINDS,
  REPOSITORY_ANALYSIS_TEMPLATE_IDS,
  REPOSITORY_DEPLOYMENT_TYPES,
  REPOSITORY_EVIDENCE_KINDS,
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
const revisionSchema = z.string().regex(/^(?:[a-f\d]{40}|[a-f\d]{64})$/iu);
const aiHandoffSchema = z.custom<RepositoryAnalysisAiHandoff>(isRepositoryAnalysisAiHandoff, {
  error: "Invalid Repository analysis AI handoff"
});
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
  aiHandoff: aiHandoffSchema.optional()
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

function isRepositoryAnalysisAiHandoff(value: unknown): value is RepositoryAnalysisAiHandoff {
  if (!isRecord(value)) return false;
  if (value.status !== "template_selected" && value.status !== "template_selection_failed") {
    return false;
  }
  if (!Array.isArray(value.applicationUnits) || !value.applicationUnits.every((unit) =>
    isRecord(unit) &&
    typeof unit.id === "string" &&
    typeof unit.rootPath === "string" &&
    ["frontend", "backend", "fullstack", "unknown"].includes(String(unit.kind)) &&
    isStringArray(unit.frameworks) &&
    isStringArray(unit.evidencePaths)
  )) return false;
  if (!Array.isArray(value.evidence) || !value.evidence.every((evidence) =>
    isRecord(evidence) &&
    REPOSITORY_EVIDENCE_KINDS.includes(
      evidence.kind as (typeof REPOSITORY_EVIDENCE_KINDS)[number]
    ) &&
    typeof evidence.path === "string" &&
    (evidence.applicationUnitId === null || typeof evidence.applicationUnitId === "string") &&
    isStringArray(evidence.signals)
  )) return false;
  if (!Array.isArray(value.missingEvidence) || !value.missingEvidence.every((kind) =>
    REPOSITORY_EVIDENCE_KINDS.includes(kind as (typeof REPOSITORY_EVIDENCE_KINDS)[number])
  )) return false;
  if (
    value.deploymentTypeDefault !== undefined &&
    value.deploymentTypeDefault !== null &&
    !REPOSITORY_DEPLOYMENT_TYPES.includes(
      value.deploymentTypeDefault as (typeof REPOSITORY_DEPLOYMENT_TYPES)[number]
    )
  ) return false;
  if (
    value.usesCiCdDefault !== undefined &&
    value.usesCiCdDefault !== null &&
    typeof value.usesCiCdDefault !== "boolean"
  ) return false;
  if (value.architectureFacts !== undefined && (
    !Array.isArray(value.architectureFacts) ||
    !value.architectureFacts.every((fact) =>
      isRecord(fact) &&
      REPOSITORY_ARCHITECTURE_FACT_KINDS.includes(
        fact.kind as (typeof REPOSITORY_ARCHITECTURE_FACT_KINDS)[number]
      ) &&
      typeof fact.value === "string" &&
      typeof fact.sourcePath === "string"
    )
  )) return false;
  if (value.questions !== undefined && !isRepositoryQuestions(value.questions)) return false;
  if (value.recommendation !== undefined && !isRepositoryRecommendation(value.recommendation)) {
    return false;
  }

  if (value.status === "template_selected") {
    return typeof value.templateId === "string" &&
      REPOSITORY_ANALYSIS_TEMPLATE_IDS.includes(
        value.templateId as (typeof REPOSITORY_ANALYSIS_TEMPLATE_IDS)[number]
      ) &&
      isStringArray(value.selectionReasons);
  }
  return value.templateId === null && isStringArray(value.mismatchReasons);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRepositoryQuestions(value: unknown): boolean {
  return Array.isArray(value) && value.every((question) =>
    isRecord(question) &&
    typeof question.id === "string" &&
    typeof question.prompt === "string" &&
    ["single_select", "boolean", "free_text"].includes(String(question.answerType)) &&
    typeof question.required === "boolean" &&
    typeof question.reason === "string" &&
    (question.options === undefined || (
      Array.isArray(question.options) && question.options.every((option) =>
        isRecord(option) && typeof option.value === "string" && typeof option.label === "string"
      )
    ))
  );
}

function isRepositoryRecommendation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return REPOSITORY_DEPLOYMENT_TYPES.includes(
    value.deploymentType as (typeof REPOSITORY_DEPLOYMENT_TYPES)[number]
  ) &&
    typeof value.usesCiCd === "boolean" &&
    Array.isArray(value.candidates) &&
    value.candidates.every((candidate) =>
      isRecord(candidate) &&
      REPOSITORY_ANALYSIS_TEMPLATE_IDS.includes(
        candidate.templateId as (typeof REPOSITORY_ANALYSIS_TEMPLATE_IDS)[number]
      ) &&
      typeof candidate.displayTitle === "string" &&
      typeof candidate.confidence === "number" &&
      isStringArray(candidate.reasons) &&
      isStringArray(candidate.tradeoffs) &&
      (candidate.questions === undefined || isRepositoryQuestions(candidate.questions))
    );
}
