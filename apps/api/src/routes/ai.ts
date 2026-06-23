import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AiArchitectureDraftResult,
  AiPreDeploymentAnalysisResult,
  AiTerraformErrorExplanationResult,
  ArchitectureJson
} from "@sketchcatch/types";
import { createArchitectureDraft } from "../services/aiArchitectureDrafts.js";
import { analyzePreDeployment } from "../services/aiPreDeploymentAnalysis.js";
import { explainTerraformError } from "../services/aiTerraformErrorExplanation.js";

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

const preDeploymentCheckBodySchema = z.object({
  architectureJson: architectureJsonSchema
});

const terraformErrorExplanationBodySchema = z.object({
  stage: z.enum(["validate", "plan", "apply"]),
  rawMessage: z.string().trim().min(1),
  relatedResourceId: z.string().min(1).optional()
});

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post("/ai/architecture-draft", async (request): Promise<AiArchitectureDraftResult> => {
    const body = architectureDraftBodySchema.parse(request.body);

    return createArchitectureDraft(body.prompt);
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
}
