import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  AiTerraformPreviewExplanationResult,
  ArchitectureJson
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

const architectureDraftBodySchema = z.object({
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

const terraformErrorExplanationBodySchema = z.object({
  stage: z.enum(["validate", "plan", "apply"]),
  rawMessage: z.string().trim().min(1),
  relatedResourceId: z.string().min(1).optional()
});

const terraformPreviewExplanationBodySchema = z.object({
  terraformCode: z.string().trim().min(1)
});

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post("/ai/architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    const body = architectureDraftBodySchema.parse(request.body);

    return createArchitectureDraft(body.prompt);
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

function parseGitHubRepositoryUrl(repositoryUrl: string): GitHubRepository {
  const url = new URL(repositoryUrl);
  const [owner, repo] = url.pathname.split("/").filter((segment) => segment.length > 0);

  return {
    owner: owner ?? "",
    repo: repo ?? ""
  };
}

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

function isGitHubRepositoryUrl(repositoryUrl: string): boolean {
  const url = new URL(repositoryUrl);
  const [owner, repo] = url.pathname.split("/").filter((segment) => segment.length > 0);

  return url.hostname === "github.com" && owner !== undefined && repo !== undefined;
}
