import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ArchitectureJson,
  CreateArchitectureDraftRequest
} from "@sketchcatch/types";
import {
  createArchitectureDraft,
  createArchitectureDraftFromRepositoryEvidence
} from "../services/aiArchitectureDrafts.js";
import { analyzePreDeployment } from "../services/aiPreDeploymentAnalysis.js";
import { explainTerraformError } from "../services/aiTerraformErrorExplanation.js";
import { explainTerraformPreview } from "../services/aiTerraformPreviewExplanation.js";

const resourceTypeSchema = z.enum([
  "VPC",
  "SUBNET",
  "EC2",
  "RDS",
  "S3",
  "SECURITY_GROUP",
  "CLOUDFRONT",
  "LAMBDA",
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

// 프론트가 일부 선택값을 안 보내도 서비스 안쪽은 항상 같은 요청 모양만 보게 만듭니다.
const architectureDraftBodySchema: z.ZodType<CreateArchitectureDraftRequest> = z.object({
  prompt: z.string().trim().min(1),
  scenarioHint: z.enum(["auto", "static_site", "api_server", "backend_with_db"]).default("auto"),
  budgetLevel: z.enum(["low", "normal"]).default("normal"),
  trafficLevel: z.enum(["small", "normal"]).default("normal"),
  securityPriority: z.enum(["basic", "high"]).default("basic")
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

const terraformErrorExplanationBodySchema = z.object({
  stage: z.enum(["validate", "export", "plan", "apply"]),
  rawMessage: z.string().trim().min(1),
  relatedResourceId: z.string().min(1).optional()
});

const terraformPreviewExplanationBodySchema = z.object({
  terraformCode: z.string().trim().min(1)
});

// AI MVP API의 입구입니다. 요청 모양은 여기서 확인하고, 실제 판단은 service 함수에 맡깁니다.
export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post("/ai/architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    const body = architectureDraftBodySchema.parse(request.body);

    return createArchitectureDraft(body);
  });

  app.post("/ai/github-architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    const body = githubArchitectureDraftBodySchema.parse(request.body);
    const repository = parseGitHubRepositoryUrl(body.repositoryUrl);
    const evidence = await fetchRepositoryEvidence(repository);

    return createArchitectureDraftFromRepositoryEvidence(body.repositoryUrl, evidence);
  });

  app.post("/ai/pre-deployment-check", async (request): Promise<AiPreDeploymentAnalysisResult> => {
    const body = preDeploymentCheckBodySchema.parse(request.body);

    return analyzePreDeployment(body.architectureJson);
  });

  app.post(
    "/ai/terraform-error-explanation",
    async (request): Promise<AiTerraformErrorExplanationResult> => {
      const body = terraformErrorExplanationBodySchema.parse(request.body);

      return explainTerraformError(body);
    }
  );

  app.post(
    "/ai/terraform-preview-explanation",
    async (request): Promise<AiTerraformPreviewExplanationResult> => {
      const body = terraformPreviewExplanationBodySchema.parse(request.body);

      return explainTerraformPreview(body.terraformCode);
    }
  );
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
