import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DiagramJson, TerraformGenerateResponse } from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { generateTerraformFromDiagramJson } from "../services/terraform/diagramToTerraform.js";

const terraformBlockTypeSchema = z.enum(["resource", "data"]);

const diagramNodeParametersSchema = z.object({
  terraformBlockType: terraformBlockTypeSchema.optional(),
  resourceType: z.string().min(1),
  resourceName: z.string().min(1),
  fileName: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  invalid: z.boolean().optional()
});

const diagramNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  kind: z.enum(["resource", "design"]),
  label: z.string().min(1),
  parameters: diagramNodeParametersSchema.optional()
});

const diagramEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  label: z.string().min(1).optional()
});

const diagramJsonSchema: z.ZodType<DiagramJson> = z.object({
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number()
  })
});

const terraformGenerateBodySchema = z.object({
  diagramJson: diagramJsonSchema
});

type TerraformRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export async function registerTerraformRoutes(
  app: FastifyInstance,
  options: TerraformRouteOptions = {}
): Promise<void> {
  const getTerraformDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;

  app.post("/terraform/generate", async (request): Promise<TerraformGenerateResponse> => {
    await requireActiveUserId(request, getTerraformDatabaseClient);

    const body = terraformGenerateBodySchema.parse(request.body);

    return {
      terraformCode: generateTerraformFromDiagramJson(body.diagramJson)
    };
  });
}
