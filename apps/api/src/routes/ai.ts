import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentCheckFromDiagramRequest,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ArchitecturePatchPreview,
  ArchitectureJson,
  ConfirmTranscribeResponse,
  CreateArchitectureDraftRequest,
  CreateDesignSimulationRequest,
  DesignSimulationResult,
  TranscribeConfirmation,
  VoiceRequirementInput
} from "@sketchcatch/types";
import {
  createArchitectureDraft,
  createArchitectureDraftFromRepositoryEvidence
} from "../services/aiArchitectureDrafts.js";
import { simulateDesign } from "../services/aiDesignSimulation.js";
import {
  createConfiguredAiExplanation,
  type CreateLlmExplanation
} from "../services/aiLlmExplanation.js";
import { createArchitecturePatchPreview } from "../services/aiArchitecturePatchPreview.js";
import { analyzePreDeployment } from "../services/aiPreDeploymentAnalysis.js";
import { explainTerraformError } from "../services/aiTerraformErrorExplanation.js";
import { explainTerraformPreview } from "../services/aiTerraformPreviewExplanation.js";
import { sanitizeTerraformErrorForAi } from "../services/aiProviderSafety.js";
import {
  createConfiguredTranscribeRequirementService,
  type TranscribeRequirementService
} from "../services/aiTranscribe.js";
import { convertDiagramJsonToArchitectureJson } from "../services/diagram-to-architecture.js";
import { diagramJsonSchema } from "./project-draft-schemas.js";

const resourceTypeSchema = z.enum([
  "VPC",
  "SUBNET",
  "INTERNET_GATEWAY",
  "ROUTE_TABLE",
  "ROUTE_TABLE_ASSOCIATION",
  "EC2",
  "RDS",
  "S3",
  "SECURITY_GROUP",
  "CLOUDFRONT",
  "LAMBDA",
  "AMI",
  "IAM_ROLE",
  "IAM_POLICY",
  "IAM_INSTANCE_PROFILE",
  "KMS_KEY",
  "CLOUDWATCH_LOG_GROUP",
  "CLOUDWATCH_METRIC_ALARM",
  "API_GATEWAY_REST_API",
  "LAMBDA_PERMISSION",
  "UNKNOWN"
]);

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

const preDeploymentCheckBodySchema = z.object({
  architectureJson: architectureJsonSchema
});

const designSimulationBodySchema: z.ZodType<CreateDesignSimulationRequest> = z.object({
  architectureJson: architectureJsonSchema,
  trafficLevel: z.enum(["small", "normal"]).default("normal"),
  budgetLevel: z.enum(["low", "normal"]).default("normal")
});

const preDeploymentCheckFromDiagramBodySchema: z.ZodType<AiPreDeploymentCheckFromDiagramRequest> = z.object({
  diagramJson: diagramJsonSchema
});

const terraformErrorExplanationBodySchema = z.object({
  stage: z.enum(["validate", "export", "plan", "apply"]),
  rawMessage: z.string().trim().min(1),
  relatedResourceId: z.string().min(1).optional()
});

const terraformPreviewExplanationBodySchema = z.object({
  terraformCode: z.string().trim().min(1)
});

const architecturePatchPreviewBodySchema = z.object({
  architectureJson: architectureJsonSchema,
  instruction: z.string().trim().min(1)
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
  readonly createLlmExplanation?: CreateLlmExplanation;
  readonly transcribeRequirementService?: TranscribeRequirementService;
};

// AI MVP API의 입구입니다. 요청 모양은 여기서 확인하고, 실제 판단은 service 함수에 맡깁니다.
export async function registerAiRoutes(app: FastifyInstance, options: AiRouteOptions = {}): Promise<void> {
  const createLlmExplanation = options.createLlmExplanation ?? createConfiguredAiExplanation();
  const transcribeRequirementService =
    options.transcribeRequirementService ?? createConfiguredTranscribeRequirementService();

  app.post("/ai/architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    const body = architectureDraftBodySchema.parse(request.body);
    const result = createArchitectureDraft(body);

    return addArchitectureDraftLlmExplanation(result, createLlmExplanation, body.prompt);
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
    const result = analyzePreDeployment(body.architectureJson);

    return {
      ...result,
      llmExplanation: await createLlmExplanation({
        target: "pre_deployment_check",
        result
      })
    };
  });

  app.post("/ai/design-simulation", async (request): Promise<DesignSimulationResult> => {
    const body = designSimulationBodySchema.parse(request.body);
    const result = simulateDesign(body);

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
        stage: body.stage,
        rawMessage: sanitizedError.sanitizedMessage,
        relatedResourceId: body.relatedResourceId
      });

      return {
        ...result,
        llmExplanation: await createLlmExplanation({
          target: "terraform_error_explanation",
          result
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

  app.post("/ai/architecture-patch-preview", async (request): Promise<ArchitecturePatchPreview> => {
    const body = architecturePatchPreviewBodySchema.parse(request.body);
    const preview = createArchitecturePatchPreview(body);
    const llmExplanation = await createLlmExplanation({
      target: "architecture_patch_preview",
      result: preview
    });

    return {
      ...preview,
      llmExplanation,
      providerMetadata: llmExplanation.providerMetadata ?? preview.providerMetadata
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
