import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  ApiErrorResponse,
  DiagramBounds,
  DiagramEdgeMetadata,
  DiagramEdgeRoute,
  DiagramJson,
  DiagramNodeMetadata,
  DiagramPoint,
  DiagramPresentation,
  DiagramVariable,
  DiagramVariableBinding,
  TerraformGenerateResponse,
  TerraformSyncToDiagramResponse,
  TerraformValidateRequest,
  TerraformValidateResponse
} from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  TERRAFORM_IDENTIFIER_PATTERN,
  TerraformDiagramValidationError
} from "../services/terraform/diagram-to-terraform.js";
import { generateTerraformFromDiagramJson } from "../services/terraform/terraform-preview.js";
import { syncTerraformToDiagramJson } from "../services/terraform/terraform-to-diagram.js";
import { createTerraformValidationDiagnostics } from "../services/terraform/terraform-diagnostics.js";
import { evaluateArchitectureDependencies } from "@sketchcatch/types/architecture-dependency-rules";

const terraformValidationMaxCharacters = 1024 * 1024;
const terraformValidationMaxFileCount = 64;
const terraformValidationMaxFileNameLength = 120;

const terraformValidateBodySchema = z.object({
  terraformCode: z.string().max(terraformValidationMaxCharacters),
  terraformFiles: z
    .array(
      z.object({
        fileName: z.string().min(1).max(terraformValidationMaxFileNameLength),
        terraformCode: z.string().max(terraformValidationMaxCharacters)
      })
    )
    .max(terraformValidationMaxFileCount)
    .optional()
}).strict();

const terraformBlockTypeSchema = z.enum(["resource", "data"]);
const terraformIdentifierSchema = z.string().min(1).regex(TERRAFORM_IDENTIFIER_PATTERN);

const diagramPointSchema: z.ZodType<DiagramPoint> = z.object({
  x: z.number().finite(),
  y: z.number().finite()
}).strict();

const diagramBoundsSchema: z.ZodType<DiagramBounds> = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
}).strict();

const diagramPresentationSchema: z.ZodType<DiagramPresentation> = z.object({
  geometryPolicy: z.enum(["catalog-normalized", "source-exact"]),
  sourceViewBox: diagramBoundsSchema.optional(),
  initialViewportPending: z.boolean().optional()
}).strict();

const diagramVariableBindingSchema: z.ZodType<DiagramVariableBinding> = z.object({
  nodeId: z.string().min(1),
  parameterKey: z.string().min(1)
}).strict();

const diagramVariableSchema: z.ZodType<DiagramVariable> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  value: z.unknown(),
  bindings: z.array(diagramVariableBindingSchema),
  source: z.enum(["module", "user"])
}).strict();

const diagramNodeParametersSchema = z.object({
  terraformBlockType: terraformBlockTypeSchema.optional(),
  terraformSourceAuthority: z.literal("workspace-seed").optional(),
  resourceType: terraformIdentifierSchema,
  resourceName: terraformIdentifierSchema,
  fileName: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  invalid: z.boolean().optional()
});

const diagramNodeMetadataSchema: z.ZodType<DiagramNodeMetadata> = z.object({
  parentAreaNodeId: z.string().min(1).optional(),
  presentationArea: z.boolean().optional(),
  presentationCatalogItemId: z.string().min(1).optional()
}).strict();

const diagramEdgeMetadataSchema: z.ZodType<DiagramEdgeMetadata> = z.object({
  managedBy: z.literal("parameter-reference"),
  parameterPath: z.string().min(1)
}).strict();

const diagramEdgeRouteSchema: z.ZodType<DiagramEdgeRoute> = z.object({
  svgPath: z.string().min(1),
  sourcePoint: diagramPointSchema,
  targetPoint: diagramPointSchema,
  waypoints: z.array(diagramPointSchema),
  labelPosition: diagramPointSchema.optional(),
  arrowDirection: z.enum(["source-to-target", "target-to-source", "bidirectional", "none"]).optional(),
  arrowAngle: z.number().finite().optional()
}).strict();

const diagramNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  kind: z.enum(["resource", "design"]),
  position: z
    .object({
      x: z.number(),
      y: z.number()
    })
    .default({ x: 0, y: 0 }),
  size: z
    .object({
      width: z.number(),
      height: z.number()
    })
    .default({ width: 160, height: 96 }),
  label: z.string(),
  iconUrl: z.string().min(1).optional(),
  locked: z.boolean().default(false),
  zIndex: z.number().int().default(0),
  rotation: z.number().finite().optional(),
  style: z
    .object({
      textColor: z.string().min(1).optional(),
      borderColor: z.string().min(1).optional(),
      borderStyle: z.enum(["solid", "dashed", "dotted"]).optional()
    })
    .optional(),
  metadata: diagramNodeMetadataSchema.optional(),
  parameters: diagramNodeParametersSchema.optional()
});

const diagramEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandleId: z.string().min(1).optional(),
  targetHandleId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  style: z
    .object({
      color: z.string().min(1).optional(),
      lineStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
      width: z.enum(["thin", "medium", "thick"]).optional(),
      animated: z.boolean().optional()
    })
    .optional(),
  metadata: diagramEdgeMetadataSchema.optional(),
  route: diagramEdgeRouteSchema.optional(),
  zIndex: z.number().finite().optional()
});

const diagramJsonSchema: z.ZodType<DiagramJson> = z.object({
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number()
  }),
  variables: z.array(diagramVariableSchema).optional(),
  presentation: diagramPresentationSchema.optional()
});

const terraformGenerateBodySchema = z.object({
  diagramJson: diagramJsonSchema
});

const terraformSyncToDiagramBodySchema = z.object({
  diagramJson: diagramJsonSchema,
  terraformCode: z.string(),
  terraformFiles: z
    .array(
      z.object({
        fileName: z.string().min(1),
        terraformCode: z.string()
      })
    )
    .optional()
});

export type TerraformRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  validateTerraformPreviewCode?: (
    input: TerraformValidateRequest
  ) => Promise<TerraformValidateResponse>;
};

export async function registerTerraformRoutes(
  app: FastifyInstance,
  options: TerraformRouteOptions = {}
): Promise<void> {
  const getTerraformDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const validateTerraformPreviewCode =
    options.validateTerraformPreviewCode ?? validateTerraformPreviewCodeDefault;

  app.post("/terraform/generate", async (request, reply): Promise<TerraformGenerateResponse | void> => {
    await requireActiveUserId(request, getTerraformDatabaseClient);

    const body = terraformGenerateBodySchema.parse(request.body);

    try {
      return {
        terraformCode: generateTerraformFromDiagramJson(body.diagramJson),
        architectureDiagnostics: evaluateArchitectureDependencies(body.diagramJson, "preview")
      };
    } catch (error) {
      if (error instanceof TerraformDiagramValidationError) {
        const response: ApiErrorResponse = {
          error: "bad_request",
          message: error.message
        };

        reply.status(400).send(response);
        return;
      }

      throw error;
    }
  });

  app.post("/terraform/validate", async (request): Promise<TerraformValidateResponse> => {
    await requireActiveUserId(request, getTerraformDatabaseClient);

    const body = terraformValidateBodySchema.parse(request.body);

    return validateTerraformPreviewCode(body);
  });

  app.post(
    "/terraform/sync-to-diagram",
    async (request): Promise<TerraformSyncToDiagramResponse> => {
      await requireActiveUserId(request, getTerraformDatabaseClient);

      const body = terraformSyncToDiagramBodySchema.parse(request.body);

      return syncTerraformToDiagramJson(body.diagramJson, {
        terraformCode: body.terraformCode,
        terraformFiles: body.terraformFiles
      });
    }
  );
}

async function validateTerraformPreviewCodeDefault(
  input: TerraformValidateRequest
): Promise<TerraformValidateResponse> {
  return {
    diagnostics: createTerraformValidationDiagnostics(input)
  };
}
