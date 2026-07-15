import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentCheckRequest,
  AiPreDeploymentCheckFromDiagramRequest,
  AiPreDeploymentAnalysisResult,
  AiPreDeploymentDeepScanResponse,
  AiSafetyExplanation,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ApiErrorResponse,
  ArchitectureDraftProgressStage,
  ArchitectureDraftStreamEvent,
  ArchitecturePatchPreviewResponse,
  ArchitectureJson,
  CheckFinding,
  ConfirmTranscribeResponse,
  CreateGitHubArchitectureDraftRequest,
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse,
  CreateArchitecturePatchPreviewRequest,
  CreateDesignSimulationRequest,
  DesignSimulationResult,
  LlmExplanation,
  RepositoryAnalysisTemplateId,
  SourceRepositoryAnalysisResult,
  TranscribeConfirmation,
  VoiceRequirementInput
} from "@sketchcatch/types";
import {
  REPOSITORY_ANALYSIS_TEMPLATE_IDS,
  REPOSITORY_ARCHITECTURE_FACT_KINDS,
  RESOURCE_TYPES,
  TEMPLATE_IDS
} from "@sketchcatch/types";
import {
  ArchitectureDraftGenerationError,
  createConfiguredAmazonQArchitectureDraftResponse,
  type CreateArchitectureDraftResponseFactory,
  createArchitectureDraftFromRepositoryEvidence
} from "../services/aiArchitectureDrafts.js";
import { simulateDesign } from "../services/aiDesignSimulation.js";
import {
  createConfiguredAiExplanation,
  type CreateLlmExplanation
} from "../services/aiLlmExplanation.js";
import {
  createConfiguredArchitecturePatchPreview,
  type CreateArchitecturePatchPreviewFactory
} from "../services/aiArchitecturePatchPreview.js";
import {
  analyzeImmediatePreDeploymentCheck,
  analyzePreDeploymentCheck,
  type AnalyzePreDeploymentCheck
} from "../services/aiPreDeploymentCheck.js";
import { analyzePreDeployment } from "../services/aiPreDeploymentAnalysis.js";
import { explainTerraformError } from "../services/aiTerraformErrorExplanation.js";
import { explainTerraformPreview } from "../services/aiTerraformPreviewExplanation.js";
import {
  createConfiguredOpenAiSafetyFindingExplanation,
  createFallbackSafetyFindingExplanation,
  type CreateSafetyFindingExplanation
} from "../services/aiSafetyFindingExplanation.js";
import { sanitizeTerraformErrorForAi } from "../services/aiProviderSafety.js";
import {
  createConfiguredTranscribeRequirementService,
  type TranscribeRequirementService
} from "../services/aiTranscribe.js";
import { convertDiagramJsonToArchitectureJson } from "../services/diagram-to-architecture.js";
import { diagramJsonSchema } from "./project-draft-schemas.js";
import { createConfiguredAwsPricingRateProvider } from "../services/awsPricingRateProvider.js";
import type { CostPricingRateProvider } from "../services/cost-analysis.js";
import type { RuntimeCache, RuntimeCacheJsonValue } from "../runtime-cache/index.js";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  createPostgresSourceRepositoryRepository,
  requireRepositoryAnalysisTemplateId,
  type SourceRepositoryRepository
} from "../source-repositories/source-repository-service.js";
import {
  getRepositoryEvidenceKind,
  isIgnoredRepositoryEvidencePath,
  isRepositoryEvidenceContentPath
} from "../source-repositories/repository-evidence-path.js";
import {
  analyzeRepositoryEvidence as analyzeLegacyRepositoryEvidence,
  type RepositoryEvidenceFile
} from "../services/aiRepositoryAnalysis.js";
import { analyzeRepositoryEvidence as analyzeSourceRepositorySnapshot } from "../source-repositories/repository-analysis.js";
import { recommendRepositoryTemplatesWithAi } from "../source-repositories/repository-template-recommendation.js";

const MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_COUNT = 64;
const MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_NAME_LENGTH = 180;
const MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_CHARS = 1024 * 1024;
const SAFETY_EXPLANATION_CACHE_NAMESPACE = "ai:safety-finding-explanation:v1";
const SAFETY_EXPLANATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SAFETY_EXPLANATION_TIMEOUT_MS = 2_500;
const PRE_DEPLOYMENT_DEEP_SCAN_CACHE_NAMESPACE = "pre-deployment-deep-scan:v1";

class AmazonQTerraformReviewUnavailableError extends Error {
  readonly statusCode = 503;
  readonly errorCode = "service_unavailable";
  readonly exposeMessage = true;

  constructor() {
    super("Amazon Q 에이전트 리뷰 결과를 받지 못했습니다. 다시 시도해주세요.");
    this.name = "AmazonQTerraformReviewUnavailableError";
  }
}

function requireAmazonQTerraformReview(explanation: LlmExplanation): LlmExplanation {
  if (
    explanation.fallbackUsed ||
    explanation.providerMetadata?.provider !== "amazon_q" ||
    explanation.providerMetadata.service !== "amazon_q_business"
  ) {
    throw new AmazonQTerraformReviewUnavailableError();
  }

  return explanation;
}
const PRE_DEPLOYMENT_DEEP_SCAN_TTL_MS = 5 * 60 * 1000;
const PRE_DEPLOYMENT_DEEP_SCAN_MAX_LOCAL_ENTRIES = 100;
type LocalDeepScanEntry = {
  readonly expiresAt: number;
  readonly value: AiPreDeploymentDeepScanResponse;
};

const resourceTypeSchema = z.enum(RESOURCE_TYPES);

const resourceNodeSchema = z.object({
  id: z.string().min(1),
  type: resourceTypeSchema,
  label: z.string().min(1).optional(),
  positionX: z.number(),
  positionY: z.number(),
  config: z.record(z.string(), z.unknown())
});

const resourceEdgeSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  label: z.string().min(1).optional()
});

const architectureJsonSchema: z.ZodType<ArchitectureJson> = z.object({
  nodes: z.array(resourceNodeSchema),
  edges: z.array(resourceEdgeSchema)
});

const architectureDraftBodySchema: z.ZodType<CreateArchitectureDraftRequest> = z.object({
  prompt: z.string().trim().min(1),
  templateId: z.enum(TEMPLATE_IDS).optional(),
  dynamicQuestionAnswers: z
    .array(z.object({
      questionId: z.string().trim().min(1).max(160),
      question: z.string().trim().min(1).max(500),
      answer: z.string().trim().min(1).max(500)
    }))
    .max(32)
    .optional(),
  templateFallback: z.record(z.string(), z.unknown()).optional(),
  repositoryEvidence: z
    .object({
      mode: z.literal("strict"),
      facts: z.array(z.object({
        kind: z.enum(REPOSITORY_ARCHITECTURE_FACT_KINDS),
        value: z.string().trim().min(1).max(160),
        sourcePath: z.string().trim().min(1).max(500)
      })).max(64),
      repositoryName: z.string().trim().min(1).max(100).optional()
    })
    .optional(),
  repositoryAnalysis: z
    .object({
      projectId: z.uuid(),
      sourceRepositoryId: z.uuid()
    })
    .optional()
}).superRefine((body, context) => {
  if (body.templateFallback !== undefined && body.repositoryAnalysis === undefined) {
    context.addIssue({
      code: "custom",
      message: "Repository Analysis is required for template fallback",
      path: ["repositoryAnalysis"]
    });
  }
});

export const repositoryTemplateIdSchema = z.enum(REPOSITORY_ANALYSIS_TEMPLATE_IDS) satisfies
  z.ZodType<RepositoryAnalysisTemplateId>;

const sourceRepositoryAnalysisBodySchema = z.object({
  repositoryUrl: z
    .string()
    .url()
    .refine((repositoryUrl) => isGitHubRepositoryUrl(repositoryUrl), {
      message: "Public GitHub repository URL is required"
    }),
  defaultBranch: z.string().trim().min(1).max(255).optional()
});

const githubArchitectureDraftBodySchema: z.ZodType<CreateGitHubArchitectureDraftRequest> =
  sourceRepositoryAnalysisBodySchema.extend({
    selectedTemplateId: repositoryTemplateIdSchema
  });

const terraformScanFileInputSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_NAME_LENGTH),
  terraformCode: z.string().max(MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_CHARS)
});

const preDeploymentCheckBodySchema: z.ZodType<AiPreDeploymentCheckRequest> = z.object({
  architectureJson: architectureJsonSchema,
  terraformFiles: z
    .array(terraformScanFileInputSchema)
    .max(MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_COUNT)
    .optional()
});

const designSimulationBodySchema: z.ZodType<CreateDesignSimulationRequest> = z.object({
  architectureJson: architectureJsonSchema,
  trafficLevel: z.enum(["small", "normal"]).default("normal"),
  budgetLevel: z.enum(["low", "normal"]).default("normal"),
  period: z.enum(["day", "week", "month"]).default("month"),
  expectedUserCount: z.coerce.number().int().min(1).max(1_000_000).default(1000),
  region: z.string().trim().min(1).default("ap-northeast-2")
});

const preDeploymentCheckFromDiagramBodySchema: z.ZodType<AiPreDeploymentCheckFromDiagramRequest> = z.object({
  diagramJson: diagramJsonSchema
});

const terraformErrorExplanationBodySchema = z.object({
  stage: z.enum(["validate", "export", "plan", "apply"]),
  rawMessage: z.string().trim().min(1),
  diagnostic: z
    .object({
      severity: z.enum(["info", "warning", "error"]),
      message: z.string(),
      code: z.string().optional(),
      line: z.number().int().positive().optional(),
      sourceFileName: z.string().optional(),
      resourceAddress: z.string().optional(),
      nodeId: z.string().optional()
    })
    .optional(),
  relatedResourceId: z.string().min(1).optional(),
  terraformCodeContext: z.string().max(20_000).optional()
});

const terraformPreviewExplanationBodySchema = z.object({
  terraformCode: z.string().trim().min(1)
});

const terraformSourceLocationSchema = z.object({
  fileName: z.string().trim().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive().optional(),
  resourceAddress: z.string().trim().min(1).optional(),
  terraformBlockType: z.string().trim().min(1).optional(),
  terraformBlockName: z.string().trim().min(1).optional()
});

const checkFindingSchema: z.ZodType<CheckFinding> = z.object({
  id: z.string().trim().min(1),
  category: z.enum(["cost", "security", "configuration", "permission", "network", "performance", "availability"]),
  severity: z.enum(["low", "medium", "high"]),
  resourceId: z.string().trim().min(1).optional(),
  sourceLocation: terraformSourceLocationSchema.optional(),
  riskFamily: z.string().trim().min(1).optional(),
  trivyRuleIds: z.array(z.string().trim().min(1)).optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  recommendation: z.string().trim().min(1)
});

const safetyFindingExplanationBodySchema = z.object({
  finding: checkFindingSchema
});

const architecturePatchPreviewBodySchema: z.ZodType<CreateArchitecturePatchPreviewRequest> = z.object({
  architectureJson: architectureJsonSchema,
  instruction: z.string().trim().min(1),
  selectedTargetResourceId: z.string().trim().min(1).optional(),
  connectionTargetResourceId: z.string().trim().min(1).optional(),
  skipConnection: z.boolean().optional()
});

const voiceRequirementInputBodySchema: z.ZodType<VoiceRequirementInput> = z.object({
  mediaUri: z.string().trim().min(1),
  mediaFormat: z.enum(["mp3", "mp4", "wav", "flac", "ogg", "amr", "webm"]),
  languageCode: z.string().trim().min(1).optional()
});

const voiceTranscribeParamsSchema = z.object({
  jobName: z.string().trim().min(1)
});

const confirmTranscribeBodySchema = z.object({
  transcriptText: z.string().trim().min(1),
  confirmedText: z.string().trim().min(1),
  confirmedByUserId: z.string().trim().min(1).optional()
});

export type AiRouteOptions = {
  readonly analyzePreDeploymentCheck?: AnalyzePreDeploymentCheck;
  readonly createArchitectureDraftResponse?: CreateArchitectureDraftResponseFactory;
  readonly createArchitecturePatchPreview?: CreateArchitecturePatchPreviewFactory;
  readonly createLlmExplanation?: CreateLlmExplanation;
  readonly createSafetyFindingExplanation?: CreateSafetyFindingExplanation;
  readonly pricingRateProvider?: CostPricingRateProvider;
  readonly runtimeCache?: RuntimeCache;
  readonly safetyExplanationTimeoutMs?: number | undefined;
  readonly transcribeRequirementService?: TranscribeRequirementService;
  readonly getDatabaseClient?: (() => DatabaseClient) | undefined;
  readonly createSourceRepositoryRepository?: ((db: DatabaseClient["db"]) => SourceRepositoryRepository) | undefined;
};

// AI MVP API의 입구입니다. 요청 모양은 여기서 확인하고, 실제 판단은 service 함수에 맡깁니다.
export async function registerAiRoutes(app: FastifyInstance, options: AiRouteOptions = {}): Promise<void> {
  const deepScans = new Map<string, LocalDeepScanEntry>();
  const createLlmExplanation = options.createLlmExplanation ?? createConfiguredAiExplanation();
  const createArchitectureDraftResponse =
    options.createArchitectureDraftResponse ??
    createConfiguredAmazonQArchitectureDraftResponse({
      runtimeCache: options.runtimeCache,
      onWarmupError: (error) => {
        app.log.warn({ error }, "Amazon Q architecture pattern warm-up failed");
      }
    });
  const createArchitecturePatchPreview =
    options.createArchitecturePatchPreview ?? createConfiguredArchitecturePatchPreview();
  const createSafetyFindingExplanation =
    options.createSafetyFindingExplanation ?? createConfiguredOpenAiSafetyFindingExplanation();
  const safetyExplanationTimeoutMs =
    options.safetyExplanationTimeoutMs ?? DEFAULT_SAFETY_EXPLANATION_TIMEOUT_MS;
  const analyzePreDeploymentForCheck =
    options.analyzePreDeploymentCheck ?? analyzePreDeploymentCheck;
  const transcribeRequirementService =
    options.transcribeRequirementService ?? createConfiguredTranscribeRequirementService();
  const pricingRateProvider = options.pricingRateProvider ?? createConfiguredAwsPricingRateProvider();
  const getAiDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const createSourceRepositoryRepository =
    options.createSourceRepositoryRepository ?? createPostgresSourceRepositoryRepository;

  app.post("/ai/architecture-draft", async (request): Promise<CreateArchitectureDraftResponse> => {
    const body = architectureDraftBodySchema.parse(request.body);

    if (body.repositoryAnalysis) {
      const userId = await requireActiveUserId(request, getAiDatabaseClient);
      const selectedTemplateId = await requireRepositoryAnalysisTemplateId(
        {
          projectId: body.repositoryAnalysis.projectId,
          sourceRepositoryId: body.repositoryAnalysis.sourceRepositoryId,
          requestedTemplateId: body.templateId,
          accessContext: { kind: "user", userId }
        },
        createSourceRepositoryRepository(getAiDatabaseClient().db)
      );

      return createArchitectureDraftResponse({
        ...body,
        ...((TEMPLATE_IDS as readonly string[]).includes(selectedTemplateId)
          ? { templateId: selectedTemplateId as (typeof TEMPLATE_IDS)[number] }
          : {})
      });
    }

    return createArchitectureDraftResponse(body);
  });

  app.post("/ai/architecture-draft/stream", async (request, reply) => {
    const body = architectureDraftBodySchema.parse(request.body);

    reply.hijack();
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) {
        reply.raw.setHeader(name, value);
      }
    }
    reply.raw.statusCode = 200;
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.flushHeaders();

    const writeEvent = (event: ArchitectureDraftStreamEvent): void => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.write(`${JSON.stringify(event)}\n`);
      }
    };
    const onProgress = (stage: ArchitectureDraftProgressStage): void => {
      writeEvent({ type: "progress", stage });
    };

    try {
      const result = await createArchitectureDraftResponse(body, { onProgress });
      writeEvent({ type: "result", result });
    } catch (error) {
      const errorContext = {
        errorKind:
          error instanceof ArchitectureDraftGenerationError ? error.kind : "unknown",
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessages: readErrorMessageChain(error)
      };
      if (error instanceof ArchitectureDraftGenerationError && error.statusCode < 500) {
        app.log.info(errorContext, "Architecture Draft stream could not satisfy requirements");
      } else {
        app.log.warn(errorContext, "Architecture Draft stream failed");
      }
      writeEvent({ type: "error", error: createArchitectureDraftStreamError(error) });
    } finally {
      reply.raw.end();
    }

    return reply;
  });

  app.post(
    "/ai/source-repository-analysis",
    async (request): Promise<SourceRepositoryAnalysisResult> => {
      const body = sourceRepositoryAnalysisBodySchema.parse(request.body);
      const repository = parseGitHubRepositoryUrl(body.repositoryUrl);
      const requestedBranch = body.defaultBranch ?? "";
      const cacheKey = createPublicRepositoryAnalysisCacheKey(body.repositoryUrl, requestedBranch);
      const cachedAnalysis = await options.runtimeCache
        ?.get<SourceRepositoryAnalysisResult>(cacheKey)
        .catch(() => null);

      if (cachedAnalysis) {
        return cachedAnalysis;
      }

      const branchInventory = await fetchPublicRepositoryBranchInventory(repository);
      const defaultBranch = resolvePublicRepositoryAnalysisBranch(
        requestedBranch,
        branchInventory.defaultBranch,
        branchInventory.branches.map((branch) => branch.name)
      );
      const repositoryRevision = resolvePublicRepositoryRevision(
        branchInventory.branches,
        defaultBranch
      );

      if (!repositoryRevision) {
        throw new PublicRepositoryRevisionUnavailableError(defaultBranch);
      }

      const availableBranches = orderPublicRepositoryBranches(
        defaultBranch,
        branchInventory.branches.map((branch) => branch.name)
      );
      const snapshot = await fetchRepositoryEvidence(repository, defaultBranch);
      const legacyAnalysis = analyzeLegacyRepositoryEvidence({
        defaultBranch,
        evidence: snapshot.files,
        repositoryUrl: body.repositoryUrl
      });

      const aiHandoff = analyzeSourceRepositorySnapshot({
        revision: repositoryRevision,
        treePaths: snapshot.treePaths,
        files: snapshot.files
      });
      const recommendation = aiHandoff.deploymentTypeDefault
        ? await recommendRepositoryTemplatesWithAi({
            snapshot: {
              revision: repositoryRevision,
              treePaths: snapshot.treePaths,
              files: snapshot.files
            },
            applicationUnits: aiHandoff.applicationUnits,
            evidence: aiHandoff.evidence,
            missingEvidence: aiHandoff.missingEvidence,
            deploymentType: aiHandoff.deploymentTypeDefault,
            usesCiCd: true,
            answers: []
          })
        : aiHandoff.recommendation;

      const result: SourceRepositoryAnalysisResult = {
        ...legacyAnalysis,
        availableBranches,
        repositoryRevision,
        recommendedTemplateId: recommendation?.candidates[0]?.templateId
          ?? legacyAnalysis.recommendedTemplateId,
        recommendationReason: recommendation?.candidates[0]?.reasons.join(" ")
          ?? legacyAnalysis.recommendationReason,
        aiHandoff: recommendation ? { ...aiHandoff, recommendation } : aiHandoff
      };

      await options.runtimeCache
        ?.set(
          cacheKey,
          JSON.parse(JSON.stringify(result)) as RuntimeCacheJsonValue,
          { ttlMs: PUBLIC_REPOSITORY_ANALYSIS_CACHE_TTL_MS }
        )
        .catch(() => undefined);

      return result;
    }
  );

  app.post("/ai/github-architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    const body = githubArchitectureDraftBodySchema.parse(request.body);
    const repository = parseGitHubRepositoryUrl(body.repositoryUrl);
    const snapshot = await fetchRepositoryEvidence(repository, body.defaultBranch ?? "main");
    const templateContext = getRepositoryTemplateContext(body.selectedTemplateId);
    const result = createArchitectureDraftFromRepositoryEvidence(body.repositoryUrl, [
      ...snapshot.files.map((file) => file.content),
      templateContext
    ]);

    return addArchitectureDraftLlmExplanation(result, createLlmExplanation);
  });

  app.post("/ai/pre-deployment-check", async (request): Promise<AiPreDeploymentAnalysisResult> => {
    const body = preDeploymentCheckBodySchema.parse(request.body);
    const artifactSha256 = createSingleTerraformArtifactSha256(body.terraformFiles ?? []);
    const input = {
      architectureJson: body.architectureJson,
      ...(artifactSha256 ? { artifactSha256 } : {}),
      ...(body.terraformFiles !== undefined ? { terraformFiles: body.terraformFiles } : {})
    };
    const immediateResult = analyzeImmediatePreDeploymentCheck(input);

    if (!body.terraformFiles?.some((file) => file.terraformCode.trim().length > 0)) {
      return { ...immediateResult, deepScan: { status: "not_required" } };
    }

    const scanId = randomUUID();
    void writeDeepScanResult(
      options.runtimeCache,
      deepScans,
      scanId,
      { status: "running" },
      true
    );
    void analyzePreDeploymentForCheck(input)
      .then((analysis) =>
        writeDeepScanResult(options.runtimeCache, deepScans, scanId, {
          status: "complete",
          analysis: { ...analysis, deepScan: { status: "complete", scanId } }
        })
      )
      .catch((error) => {
        app.log.warn(
          { errorName: error instanceof Error ? error.name : typeof error, scanId },
          "Background Trivy scan failed"
        );
        return writeDeepScanResult(options.runtimeCache, deepScans, scanId, {
          status: "failed",
          message: "Trivy 심층 검사를 완료하지 못했습니다. 다시 검사해 주세요."
        });
      });

    return { ...immediateResult, deepScan: { status: "running", scanId } };
  });

  app.get(
    "/ai/pre-deployment-check/:scanId",
    async (request): Promise<AiPreDeploymentDeepScanResponse> => {
      const { scanId } = z.object({ scanId: z.uuid() }).parse(request.params);
      const localResult = deepScans.get(scanId);
      if (localResult && localResult.expiresAt > Date.now()) return localResult.value;
      if (localResult) deepScans.delete(scanId);

      if (options.runtimeCache) {
        try {
          const cached = await options.runtimeCache.get<AiPreDeploymentDeepScanResponse>({
            namespace: PRE_DEPLOYMENT_DEEP_SCAN_CACHE_NAMESPACE,
            key: scanId
          });
          if (cached) return cached;
        } catch {
          // Runtime Cache is an optimization; report a stable missing result below.
        }
      }

      return { status: "failed", message: "심층 검사 결과가 만료되었거나 존재하지 않습니다." };
    }
  );

  app.post("/ai/design-simulation", async (request): Promise<DesignSimulationResult> => {
    const body = designSimulationBodySchema.parse(request.body);
    const result = await simulateDesign(body, { pricingRateProvider });

    return {
      ...result,
      llmExplanation: await createLlmExplanation({
        target: "design_simulation",
        result
      })
    };
  });

  app.post("/ai/pre-deployment-check-from-diagram", async (request): Promise<AiPreDeploymentAnalysisResult> => {
    const body = preDeploymentCheckFromDiagramBodySchema.parse(request.body);
    const architectureJson = convertDiagramJsonToArchitectureJson(body.diagramJson);

    return analyzePreDeployment(architectureJson);
  });

  app.post(
    "/ai/terraform-error-explanation",
    async (request): Promise<AiTerraformErrorExplanationResult> => {
      const body = terraformErrorExplanationBodySchema.parse(request.body);
      const sanitizedError = sanitizeTerraformErrorForAi(body);
      const result = explainTerraformError({
        diagnostic: body.diagnostic,
        stage: body.stage,
        rawMessage: sanitizedError.sanitizedMessage,
        relatedResourceId: body.relatedResourceId,
        terraformCodeContext: body.terraformCodeContext
      });

      return {
        ...result
      };
    }
  );

  app.post(
    "/ai/terraform-preview-explanation",
    async (request): Promise<AiTerraformPreviewExplanationResult> => {
      const body = terraformPreviewExplanationBodySchema.parse(request.body);
      const result = explainTerraformPreview(body.terraformCode);
      const llmExplanation = await createLlmExplanation({
        target: "terraform_preview_explanation",
        result
      });

      return {
        ...result,
        llmExplanation: requireAmazonQTerraformReview(llmExplanation)
      };
    }
  );

  app.post(
    "/ai/safety-finding-explanation",
    async (request): Promise<AiSafetyExplanation> => {
      const body = safetyFindingExplanationBodySchema.parse(request.body);

      return resolveSafetyFindingExplanation(
        body.finding,
        createSafetyFindingExplanation,
        options.runtimeCache,
        safetyExplanationTimeoutMs
      );
    }
  );

  app.post("/ai/architecture-patch-preview", async (request): Promise<ArchitecturePatchPreviewResponse> => {
    const body = architecturePatchPreviewBodySchema.parse(request.body);
    const preview = await createArchitecturePatchPreview(body);

    if (preview.status === "needs_clarification") {
      return preview;
    }

    const llmExplanation = await createLlmExplanation({
      target: "architecture_patch_preview",
      result: preview
    });

    return {
      ...preview,
      llmExplanation,
      providerMetadata:
        preview.providerMetadata.provider === "fallback"
          ? (llmExplanation.providerMetadata ?? preview.providerMetadata)
          : preview.providerMetadata
    };
  });

  app.post("/ai/voice-requirement/transcribe", async (request): Promise<TranscribeConfirmation> => {
    const body = voiceRequirementInputBodySchema.parse(request.body);

    return transcribeRequirementService.start(body);
  });

  app.get("/ai/voice-requirement/transcribe/:jobName", async (request): Promise<TranscribeConfirmation> => {
    const params = voiceTranscribeParamsSchema.parse(request.params);

    return transcribeRequirementService.getConfirmation(params.jobName);
  });

  app.post("/ai/voice-requirement/confirm", async (request): Promise<ConfirmTranscribeResponse> => {
    const body = confirmTranscribeBodySchema.parse(request.body);

    return transcribeRequirementService.confirmTranscript(body);
  });
}

// Architecture Draft 계열 route가 같은 LLM 설명 계약을 쓰도록 한곳에서 붙입니다.
async function addArchitectureDraftLlmExplanation(
  result: AiArchitectureDraftResult,
  createLlmExplanation: CreateLlmExplanation,
  requirementPromptText?: string | undefined
): Promise<AiArchitectureDraftResult> {
  return {
    ...result,
    llmExplanation: await createLlmExplanation({
      target: "architecture_draft",
      result,
      requirementPromptText
    })
  };
}

async function resolveSafetyFindingExplanation(
  finding: CheckFinding,
  createSafetyFindingExplanation: CreateSafetyFindingExplanation,
  runtimeCache: RuntimeCache | undefined,
  safetyExplanationTimeoutMs: number
): Promise<AiSafetyExplanation> {
  if (finding.aiSafetyExplanation) {
    return finding.aiSafetyExplanation;
  }

  const cacheKey = createSafetyExplanationCacheKey(finding);
  const cachedExplanation = await readCachedSafetyExplanation(runtimeCache, cacheKey);

  if (cachedExplanation) {
    return cachedExplanation;
  }

  const explanation = await createSafetyFindingExplanationWithinBudget(
    finding,
    createSafetyFindingExplanation,
    safetyExplanationTimeoutMs
  );

  if (!explanation.fallbackUsed) {
    await writeCachedSafetyExplanation(runtimeCache, cacheKey, explanation);
  }

  return explanation;
}

async function createSafetyFindingExplanationWithinBudget(
  finding: CheckFinding,
  createSafetyFindingExplanation: CreateSafetyFindingExplanation,
  timeoutMs: number
): Promise<AiSafetyExplanation> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return createFallbackSafetyFindingExplanation(finding, "provider_error");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      createSafetyFindingExplanation(finding),
      new Promise<AiSafetyExplanation>((resolve) => {
        timeout = setTimeout(() => {
          resolve(createFallbackSafetyFindingExplanation(finding, "provider_error"));
        }, timeoutMs);
      })
    ]);
  } catch {
    return createFallbackSafetyFindingExplanation(finding, "provider_error");
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function createSafetyExplanationCacheKey(finding: CheckFinding): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        category: finding.category,
        description: finding.description,
        id: finding.id,
        recommendation: finding.recommendation,
        resourceId: finding.resourceId ?? null,
        severity: finding.severity,
        sourceLocation: finding.sourceLocation ?? null,
        title: finding.title
      })
    )
    .digest("hex");

  return hash;
}

async function readCachedSafetyExplanation(
  runtimeCache: RuntimeCache | undefined,
  cacheKey: string
): Promise<AiSafetyExplanation | null> {
  if (!runtimeCache) {
    return null;
  }

  const value = await runtimeCache
    .get<AiSafetyExplanation>({
      namespace: SAFETY_EXPLANATION_CACHE_NAMESPACE,
      key: cacheKey
    })
    .catch(() => null);

  return isAiSafetyExplanation(value) ? value : null;
}

async function writeCachedSafetyExplanation(
  runtimeCache: RuntimeCache | undefined,
  cacheKey: string,
  explanation: AiSafetyExplanation
): Promise<void> {
  if (!runtimeCache) {
    return;
  }

  await runtimeCache
    .set(
      {
        namespace: SAFETY_EXPLANATION_CACHE_NAMESPACE,
        key: cacheKey
      },
      toRuntimeCacheJsonValue(explanation),
      {
        ttlMs: SAFETY_EXPLANATION_CACHE_TTL_MS
      }
    )
    .catch(() => undefined);
}

function isAiSafetyExplanation(value: unknown): value is AiSafetyExplanation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<AiSafetyExplanation>;

  return (
    typeof candidate.riskSummary === "string" &&
    typeof candidate.whyDangerous === "string" &&
    typeof candidate.recommendedFix === "string" &&
    Array.isArray(candidate.verificationSteps) &&
    candidate.verificationSteps.every((step) => typeof step === "string") &&
    typeof candidate.fallbackUsed === "boolean"
  );
}

function toRuntimeCacheJsonValue(value: AiSafetyExplanation): RuntimeCacheJsonValue {
  return JSON.parse(JSON.stringify(value)) as RuntimeCacheJsonValue;
}

function createSingleTerraformArtifactSha256(
  terraformFiles: readonly { readonly terraformCode: string }[]
): string | undefined {
  const nonEmptyFiles = terraformFiles.filter((file) => file.terraformCode.trim().length > 0);
  return nonEmptyFiles.length === 1
    ? createHash("sha256").update(nonEmptyFiles[0]!.terraformCode, "utf8").digest("hex")
    : undefined;
}

async function writeDeepScanResult(
  runtimeCache: RuntimeCache | undefined,
  localResults: Map<string, LocalDeepScanEntry>,
  scanId: string,
  value: AiPreDeploymentDeepScanResponse,
  onlyIfAbsent = false
): Promise<void> {
  localResults.set(scanId, {
    expiresAt: Date.now() + PRE_DEPLOYMENT_DEEP_SCAN_TTL_MS,
    value
  });
  while (localResults.size > PRE_DEPLOYMENT_DEEP_SCAN_MAX_LOCAL_ENTRIES) {
    const oldestKey = localResults.keys().next().value as string | undefined;
    if (!oldestKey) break;
    localResults.delete(oldestKey);
  }
  if (!runtimeCache) return;

  try {
    const entryKey = { namespace: PRE_DEPLOYMENT_DEEP_SCAN_CACHE_NAMESPACE, key: scanId };
    const cacheValue = JSON.parse(JSON.stringify(value)) as RuntimeCacheJsonValue;
    if (onlyIfAbsent) {
      await runtimeCache.setIfAbsent(entryKey, cacheValue, {
        ttlMs: PRE_DEPLOYMENT_DEEP_SCAN_TTL_MS
      });
    } else {
      await runtimeCache.set(entryKey, cacheValue, {
        ttlMs: PRE_DEPLOYMENT_DEEP_SCAN_TTL_MS
      });
    }
  } catch {
    // The process-local result remains available when Runtime Cache is degraded.
  }
}

function createArchitectureDraftStreamError(
  error: unknown
): ApiErrorResponse & { readonly statusCode: number } {
  if (error instanceof ArchitectureDraftGenerationError) {
    return {
      error: error.errorCode,
      message: error.message,
      statusCode: error.statusCode
    };
  }

  return {
    error: "internal_server_error",
    message: "아키텍처 초안 생성 중 오류가 발생했습니다.",
    statusCode: 500
  };
}

function readErrorMessageChain(error: unknown): string[] {
  const messages: string[] = [];
  let current = error;

  while (current instanceof Error && messages.length < 6) {
    messages.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }

  return messages;
}

type GitHubRepository = {
  readonly owner: string;
  readonly repo: string;
};

type PublicGitHubRecursiveTreeResponse = {
  readonly truncated?: unknown;
  readonly tree?: Array<{
    readonly path?: unknown;
    readonly type?: unknown;
  }>;
};

type PublicGitHubRepositoryResponse = {
  readonly default_branch?: unknown;
};

type PublicGitHubBranchResponse = Array<{
  readonly name?: unknown;
  readonly commit?: {
    readonly sha?: unknown;
  };
}>;

type PublicRepositoryBranch = {
  readonly name: string;
  readonly revision: string | null;
};

type PublicRepositoryBranchInventory = {
  readonly defaultBranch: string | null;
  readonly branches: readonly PublicRepositoryBranch[];
};

const PUBLIC_GITHUB_API_BASE_URL = "https://api.github.com";
const MAX_PUBLIC_REPOSITORY_EVIDENCE_FILES = 24;
const MAX_PUBLIC_REPOSITORY_BRANCH_PAGES = 50;
const PUBLIC_GITHUB_REQUEST_TIMEOUT_MS = 10_000;
const PUBLIC_REPOSITORY_ANALYSIS_CACHE_NAMESPACE = "ai:public-repository-analysis:v14";
const PUBLIC_REPOSITORY_ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1_000;

// GitHub URL에서 owner/repo만 뽑습니다. public repository 근거 파일을 읽을 때 이 값이 필요합니다.
function parseGitHubRepositoryUrl(repositoryUrl: string): GitHubRepository {
  const url = new URL(repositoryUrl);
  const [owner, rawRepo] = url.pathname.split("/").filter((segment) => segment.length > 0);
  const repo = rawRepo?.replace(/\.git$/i, "");

  return {
    owner: owner ?? "",
    repo: repo ?? ""
  };
}

function createPublicRepositoryAnalysisCacheKey(repositoryUrl: string, defaultBranch: string) {
  return {
    namespace: PUBLIC_REPOSITORY_ANALYSIS_CACHE_NAMESPACE,
    key: createHash("sha256")
      .update(`${repositoryUrl.trim().toLowerCase()}\0${defaultBranch.trim()}`)
      .digest("hex")
  };
}

async function fetchPublicRepositoryBranchInventory(
  repository: GitHubRepository
): Promise<PublicRepositoryBranchInventory> {
  const repositoryPath = `${PUBLIC_GITHUB_API_BASE_URL}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  const requestOptions = {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "SketchCatch"
    },
    signal: AbortSignal.timeout(PUBLIC_GITHUB_REQUEST_TIMEOUT_MS)
  };
  const metadataPromise = fetch(repositoryPath, requestOptions).catch(() => null);
  const branches: PublicRepositoryBranch[] = [];

  for (let page = 1; page <= MAX_PUBLIC_REPOSITORY_BRANCH_PAGES; page += 1) {
    const response = await fetch(
      `${repositoryPath}/branches?per_page=100&page=${page}`,
      requestOptions
    ).catch(() => null);

    if (!response?.ok) break;

    const pageBranches = (await response.json()) as PublicGitHubBranchResponse;
    branches.push(...pageBranches.flatMap((branch) => {
      if (typeof branch.name !== "string" || !branch.name.trim()) return [];

      return [{
        name: branch.name.trim(),
        revision:
          typeof branch.commit?.sha === "string" && branch.commit.sha.trim()
            ? branch.commit.sha.trim()
            : null
      }];
    }));

    if (pageBranches.length < 100) break;
  }

  const metadataResponse = await metadataPromise;
  const metadata = metadataResponse?.ok
    ? ((await metadataResponse.json()) as PublicGitHubRepositoryResponse)
    : null;

  return {
    defaultBranch:
      typeof metadata?.default_branch === "string" && metadata.default_branch.trim()
        ? metadata.default_branch.trim()
        : null,
    branches: [...new Map(branches.map((branch) => [branch.name, branch])).values()]
  };
}

export function resolvePublicRepositoryRevision(
  branches: readonly PublicRepositoryBranch[],
  selectedBranch: string
): string | null {
  const revision = branches.find((branch) => branch.name === selectedBranch)?.revision ?? null;

  return revision && /^(?:[a-f\d]{40}|[a-f\d]{64})$/iu.test(revision)
    ? revision.toLowerCase()
    : null;
}

class PublicRepositoryRevisionUnavailableError extends Error {
  readonly statusCode = 422;
  readonly code = "PUBLIC_REPOSITORY_REVISION_UNAVAILABLE";

  constructor(branch: string) {
    super(`GitHub에서 ${branch} branch의 commit SHA를 확인할 수 없습니다.`);
    this.name = "PublicRepositoryRevisionUnavailableError";
  }
}

function resolvePublicRepositoryAnalysisBranch(
  requestedBranch: string,
  repositoryDefaultBranch: string | null,
  branches: readonly string[]
): string {
  const requested = requestedBranch.trim();

  if (requested) return requested;
  if (repositoryDefaultBranch) return repositoryDefaultBranch;
  if (branches.includes("main")) return "main";
  if (branches.includes("master")) return "master";
  return branches[0] ?? "main";
}

function orderPublicRepositoryBranches(selectedBranch: string, branches: readonly string[]): string[] {
  return [
    selectedBranch,
    ...branches.filter((branch) => branch !== selectedBranch).sort((left, right) => left.localeCompare(right))
  ];
}

// GitHub 전체 코드를 분석하지 않고, README/package/Docker 관련 파일만 가볍게 읽습니다.
async function fetchRepositoryEvidence(
  repository: GitHubRepository,
  defaultBranch: string
): Promise<{
  readonly treePaths: readonly string[];
  readonly files: readonly RepositoryEvidenceFile[];
}> {
  const treePaths = await fetchPublicRepositoryTreePaths(repository, defaultBranch);
  const evidencePaths = selectPublicRepositoryEvidencePaths(treePaths);
  const evidence = await Promise.all(
    evidencePaths.map(async (path) => {
      const url = `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${encodeURIComponent(defaultBranch)}/${path}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(PUBLIC_GITHUB_REQUEST_TIMEOUT_MS)
      }).catch(() => null);

      if (!response?.ok) {
        return null;
      }

      return { content: await response.text(), path };
    })
  );

  return {
    treePaths,
    files: evidence.flatMap((file) => (file === null ? [] : [file]))
  };
}

async function fetchPublicRepositoryTreePaths(
  repository: GitHubRepository,
  defaultBranch: string
): Promise<readonly string[]> {
  const url = `${PUBLIC_GITHUB_API_BASE_URL}/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(
    repository.repo
  )}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "SketchCatch"
    },
    signal: AbortSignal.timeout(PUBLIC_GITHUB_REQUEST_TIMEOUT_MS)
  }).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  const tree = (await response.json()) as PublicGitHubRecursiveTreeResponse;

  if (tree.truncated === true) {
    return [];
  }

  return (tree.tree ?? [])
    .flatMap((entry) =>
      entry.type === "blob" && typeof entry.path === "string" && entry.path
        ? [entry.path]
        : []
    )
    .sort();
}

function selectPublicRepositoryEvidencePaths(treePaths: readonly string[]): readonly string[] {
  return treePaths
    .filter((path) => !isIgnoredRepositoryEvidencePath(path) && isRepositoryEvidenceContentPath(path))
    .sort(comparePublicRepositoryEvidencePaths)
    .slice(0, MAX_PUBLIC_REPOSITORY_EVIDENCE_FILES);
}

function comparePublicRepositoryEvidencePaths(left: string, right: string): number {
  const priorityDelta = getPublicRepositoryEvidencePriority(left) - getPublicRepositoryEvidencePriority(right);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const depthDelta = left.split("/").length - right.split("/").length;

  return depthDelta !== 0 ? depthDelta : left.localeCompare(right);
}

function getPublicRepositoryEvidencePriority(path: string): number {
  const kind = getRepositoryEvidenceKind(path);

  if (kind === "package_json") return 0;
  if (kind === "dockerfile") return 1;
  if (kind === "framework_config") return 2;
  if (kind === "readme") return path.includes("/") ? 4 : 3;
  return 5;
}

function getRepositoryTemplateContext(templateId: CreateGitHubArchitectureDraftRequest["selectedTemplateId"]): string {
  const contexts = {
    "ecs-fargate-container-app": "Selected Template: ECS Fargate service behind an Application Load Balancer.",
    "eks-container-app": "Selected Template: EKS managed node group with a Kubernetes workload.",
    "full-serverless-web-app": "Selected Template: Cognito-authenticated serverless web application.",
    "minimal-serverless-api": "Selected Template: API Gateway, Lambda, and DynamoDB serverless API.",
    "static-web-hosting": "Selected Template: S3 and CloudFront static website architecture.",
    "three-tier-web-app": "Selected Template: ALB, Auto Scaling Group, EC2, and RDS three-tier architecture."
  } as const;

  return contexts[templateId as keyof typeof contexts] ?? `Selected Template: ${templateId}.`;
}

// GitHub repository URL인지 먼저 막아주는 guardrail입니다.
function isGitHubRepositoryUrl(repositoryUrl: string): boolean {
  const url = new URL(repositoryUrl);
  const [owner, rawRepo] = url.pathname.split("/").filter((segment) => segment.length > 0);
  const repo = rawRepo?.replace(/\.git$/i, "");

  return url.hostname === "github.com" && owner !== undefined && repo !== undefined;
}
