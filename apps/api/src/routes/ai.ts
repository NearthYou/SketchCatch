import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentCheckRequest,
  AiPreDeploymentCheckFromDiagramRequest,
  AiPreDeploymentAnalysisResult,
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
  CreateArchitectureDraftRequest,
  CreateArchitectureDraftResponse,
  CreateArchitecturePatchPreviewRequest,
  CreateDesignSimulationRequest,
  DesignSimulationResult,
  TranscribeConfirmation,
  VoiceRequirementInput
} from "@sketchcatch/types";
import { RESOURCE_TYPES } from "@sketchcatch/types";
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
import { createConfiguredTerraformSecurityScanner } from "../services/terraform/trivy-terraform-scan.js";

const MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_COUNT = 64;
const MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_NAME_LENGTH = 180;
const MAX_PRE_DEPLOYMENT_TERRAFORM_FILE_CHARS = 1024 * 1024;
const SAFETY_EXPLANATION_CACHE_NAMESPACE = "ai:safety-finding-explanation:v1";
const SAFETY_EXPLANATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SAFETY_EXPLANATION_GENERATION_COUNT = 8;
const SAFETY_EXPLANATION_GENERATION_CONCURRENCY = 2;
const DEFAULT_SAFETY_EXPLANATION_TIMEOUT_MS = 2_500;

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
  prompt: z.string().trim().min(1)
});

const githubArchitectureDraftBodySchema = z.object({
  repositoryUrl: z
    .string()
    .url()
    .refine((repositoryUrl) => isGitHubRepositoryUrl(repositoryUrl), {
      message: "Public GitHub repository URL is required"
    })
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
};

// AI MVP API의 입구입니다. 요청 모양은 여기서 확인하고, 실제 판단은 service 함수에 맡깁니다.
export async function registerAiRoutes(app: FastifyInstance, options: AiRouteOptions = {}): Promise<void> {
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
    options.analyzePreDeploymentCheck ??
    ((input) =>
      analyzePreDeploymentCheck(input, {
        terraformSecurityScanner: createConfiguredTerraformSecurityScanner({
          onScanError: (error) => {
            app.log.warn(
              {
                errorName: error instanceof Error ? error.name : typeof error
              },
              "Trivy Terraform scan failed; continuing without Trivy findings"
            );
          }
        })
      }));
  const transcribeRequirementService =
    options.transcribeRequirementService ?? createConfiguredTranscribeRequirementService();
  const pricingRateProvider = options.pricingRateProvider ?? createConfiguredAwsPricingRateProvider();

  app.post("/ai/architecture-draft", async (request): Promise<CreateArchitectureDraftResponse> => {
    const body = architectureDraftBodySchema.parse(request.body);

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

  app.post("/ai/github-architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    const body = githubArchitectureDraftBodySchema.parse(request.body);
    const repository = parseGitHubRepositoryUrl(body.repositoryUrl);
    const evidence = await fetchRepositoryEvidence(repository);
    const result = createArchitectureDraftFromRepositoryEvidence(body.repositoryUrl, evidence);

    return addArchitectureDraftLlmExplanation(result, createLlmExplanation);
  });

  app.post("/ai/pre-deployment-check", async (request): Promise<AiPreDeploymentAnalysisResult> => {
    const body = preDeploymentCheckBodySchema.parse(request.body);
    const result = await analyzePreDeploymentForCheck({
      architectureJson: body.architectureJson,
      ...(body.terraformFiles !== undefined ? { terraformFiles: body.terraformFiles } : {})
    });

    return addSafetyFindingExplanations(
      result,
      createSafetyFindingExplanation,
      options.runtimeCache,
      safetyExplanationTimeoutMs
    );
  });

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

    return addSafetyFindingExplanations(
      analyzePreDeployment(architectureJson),
      createSafetyFindingExplanation,
      options.runtimeCache,
      safetyExplanationTimeoutMs
    );
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
        ...result,
        llmExplanation: await createLlmExplanation({
          target: "terraform_error_explanation",
          result,
          terraformCodeContext: body.terraformCodeContext
        })
      };
    }
  );

  app.post(
    "/ai/terraform-preview-explanation",
    async (request): Promise<AiTerraformPreviewExplanationResult> => {
      const body = terraformPreviewExplanationBodySchema.parse(request.body);
      const result = explainTerraformPreview(body.terraformCode);

      return {
        ...result,
        llmExplanation: await createLlmExplanation({
          target: "terraform_preview_explanation",
          result
        })
      };
    }
  );

  app.post(
    "/ai/safety-finding-explanation",
    async (request): Promise<AiSafetyExplanation> => {
      const body = safetyFindingExplanationBodySchema.parse(request.body);

      return createSafetyFindingExplanation(body.finding);
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

async function addSafetyFindingExplanations(
  result: AiPreDeploymentAnalysisResult,
  createSafetyFindingExplanation: CreateSafetyFindingExplanation,
  runtimeCache: RuntimeCache | undefined,
  safetyExplanationTimeoutMs: number
): Promise<AiPreDeploymentAnalysisResult> {
  if (result.findings.length === 0) {
    return result;
  }

  const explanationByCacheKey = new Map<string, AiSafetyExplanation>();
  const missingFindingsByCacheKey = new Map<string, CheckFinding>();

  await Promise.all(
    result.findings.map(async (finding) => {
      if (finding.aiSafetyExplanation !== undefined) {
        return;
      }

      const cacheKey = createSafetyExplanationCacheKey(finding);
      const cachedExplanation = await readCachedSafetyExplanation(runtimeCache, cacheKey);

      if (cachedExplanation) {
        explanationByCacheKey.set(cacheKey, cachedExplanation);
        return;
      }

      if (!missingFindingsByCacheKey.has(cacheKey)) {
        missingFindingsByCacheKey.set(cacheKey, finding);
      }
    })
  );

  const missingEntries = [...missingFindingsByCacheKey.entries()];
  const generatedEntries = missingEntries.slice(0, MAX_SAFETY_EXPLANATION_GENERATION_COUNT);
  const fallbackEntries = missingEntries.slice(MAX_SAFETY_EXPLANATION_GENERATION_COUNT);

  await mapWithConcurrency(
    generatedEntries,
    SAFETY_EXPLANATION_GENERATION_CONCURRENCY,
    async ([cacheKey, finding]) => {
      const explanation = await createSafetyFindingExplanationWithinBudget(
        finding,
        createSafetyFindingExplanation,
        safetyExplanationTimeoutMs
      );

      explanationByCacheKey.set(cacheKey, explanation);

      if (!explanation.fallbackUsed) {
        await writeCachedSafetyExplanation(runtimeCache, cacheKey, explanation);
      }
    }
  );

  for (const [cacheKey, finding] of fallbackEntries) {
    explanationByCacheKey.set(
      cacheKey,
      createFallbackSafetyFindingExplanation(finding, "rate_limited")
    );
  }

  return {
    ...result,
    findings: result.findings.map((finding) => {
      const cacheKey = createSafetyExplanationCacheKey(finding);

      return {
        ...finding,
        aiSafetyExplanation:
          finding.aiSafetyExplanation ?? explanationByCacheKey.get(cacheKey)
      };
    })
  };
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

async function mapWithConcurrency<TValue>(
  values: readonly TValue[],
  concurrency: number,
  mapper: (value: TValue) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex];
        nextIndex += 1;

        if (value !== undefined) {
          await mapper(value);
        }
      }
    })
  );
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

const GITHUB_EVIDENCE_PATHS = ["README.md", "package.json", "Dockerfile", "docker-compose.yml"] as const;

// GitHub URL에서 owner/repo만 뽑습니다. public repository 근거 파일을 읽을 때 이 값이 필요합니다.
function parseGitHubRepositoryUrl(repositoryUrl: string): GitHubRepository {
  const url = new URL(repositoryUrl);
  const [owner, repo] = url.pathname.split("/").filter((segment) => segment.length > 0);

  return {
    owner: owner ?? "",
    repo: repo ?? ""
  };
}

// GitHub 전체 코드를 분석하지 않고, README/package/Docker 관련 파일만 가볍게 읽습니다.
async function fetchRepositoryEvidence(repository: GitHubRepository): Promise<string[]> {
  const evidence = await Promise.all(
    GITHUB_EVIDENCE_PATHS.map(async (path) => {
      const url = `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/main/${path}`;
      const response = await fetch(url);

      if (!response.ok) {
        return "";
      }

      return response.text();
    })
  );

  return evidence.filter((content) => content.trim().length > 0);
}

// GitHub repository URL인지 먼저 막아주는 guardrail입니다.
function isGitHubRepositoryUrl(repositoryUrl: string): boolean {
  const url = new URL(repositoryUrl);
  const [owner, repo] = url.pathname.split("/").filter((segment) => segment.length > 0);

  return url.hostname === "github.com" && owner !== undefined && repo !== undefined;
}
