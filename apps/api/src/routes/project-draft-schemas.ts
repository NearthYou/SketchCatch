import { z } from "zod";
import { diagramNodeModuleSourceSchema } from "./diagram-node-module-source-schema.js";
import type {
  DiagramBounds,
  DiagramEdgeMetadata,
  DiagramEdgeRoute,
  DiagramJson,
  DiagramNodeMetadata,
  DiagramPoint,
  DiagramPresentation,
  DiagramVariable,
  DiagramVariableBinding
} from "@sketchcatch/types";

const diagramPointSchema: z.ZodType<DiagramPoint> = z
  .object({
    x: z.number().finite(),
    y: z.number().finite()
  })
  .strict();

const diagramPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

const diagramSizeSchema = z.object({
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
});

const diagramBoundsSchema: z.ZodType<DiagramBounds> = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive()
  })
  .strict();

const diagramPresentationSchema: z.ZodType<DiagramPresentation> = z
  .object({
    geometryPolicy: z.enum(["catalog-normalized", "source-exact"]),
    sourceViewBox: diagramBoundsSchema.optional(),
    initialViewportPending: z.boolean().optional(),
    terraformSourceFingerprint: z.string().min(1).optional()
  })
  .strict();

const diagramVariableBindingSchema: z.ZodType<DiagramVariableBinding> = z
  .object({
    nodeId: z.string().min(1),
    parameterKey: z.string().min(1)
  })
  .strict();

const diagramVariableSchema: z.ZodType<DiagramVariable> = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().min(1),
    value: z.unknown(),
    bindings: z.array(diagramVariableBindingSchema),
    source: z.enum(["module", "user"])
  })
  .strict();

const diagramNodeStyleSchema = z.object({
  textColor: z.string().min(1).optional(),
  borderColor: z.string().min(1).optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional()
});

const diagramNodeMetadataSchema: z.ZodType<DiagramNodeMetadata> = z
  .object({
    parentAreaNodeId: z.string().min(1).optional(),
    areaAutoSizeBaseline: z
      .object({
        position: diagramPositionSchema,
        size: diagramSizeSchema
      })
      .optional(),
    presentationArea: z.boolean().optional(),
    presentationCatalogItemId: z.string().min(1).optional(),
    moduleSource: diagramNodeModuleSourceSchema.optional(),
    reverseEngineering: z
      .object({
        source: z.literal("aws_scan"),
        protectedValueKeys: z.array(z.string().min(1)),
        editableValueKeys: z.array(z.string().min(1))
      })
      .optional()
  })
  .strict();

const diagramNodeParametersSchema = z
  .object({
    terraformBlockType: z.enum(["resource", "data"]).optional(),
    terraformSourceAuthority: z.literal("workspace-seed").optional(),
    resourceType: z.string(),
    resourceName: z.string(),
    fileName: z.string(),
    values: z.record(z.string(), z.unknown()),
    invalid: z.boolean().optional()
  })
  .superRefine((parameters, context) => {
    if (parameters.invalid === true) {
      return;
    }

    for (const key of ["resourceType", "resourceName", "fileName"] as const) {
      if (parameters[key].trim().length > 0) {
        continue;
      }

      context.addIssue({
        code: "custom",
        message: "Terraform identity is required for an editable resource.",
        path: [key]
      });
    }
  });

const diagramNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  kind: z.enum(["resource", "design"]),
  position: diagramPositionSchema,
  size: diagramSizeSchema,
  label: z.string(),
  iconUrl: z.string().min(1).optional(),
  locked: z.boolean(),
  zIndex: z.number().finite(),
  rotation: z.number().finite().optional(),
  style: diagramNodeStyleSchema.optional(),
  metadata: diagramNodeMetadataSchema.optional(),
  parameters: diagramNodeParametersSchema.optional()
});

const diagramEdgeStyleSchema = z.object({
  color: z.string().min(1).optional(),
  lineStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  width: z.enum(["thin", "medium", "thick"]).optional(),
  animated: z.boolean().optional()
});

const diagramEdgeMetadataSchema: z.ZodType<DiagramEdgeMetadata> = z
  .object({
    managedBy: z.literal("parameter-reference").optional(),
    parameterPath: z.string().min(1).optional(),
    presentationRole: z.enum(["primary", "detail", "summary"]).optional()
  })
  .strict();

const diagramEdgeRouteSchema: z.ZodType<DiagramEdgeRoute> = z
  .object({
    svgPath: z.string().min(1),
    sourcePoint: diagramPointSchema,
    targetPoint: diagramPointSchema,
    waypoints: z.array(diagramPointSchema),
    labelPosition: diagramPointSchema.optional(),
    arrowDirection: z
      .enum(["source-to-target", "target-to-source", "bidirectional", "none"])
      .optional(),
    arrowAngle: z.number().finite().optional()
  })
  .strict();

const diagramEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandleId: z.string().min(1).optional(),
  targetHandleId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  style: diagramEdgeStyleSchema.optional(),
  metadata: diagramEdgeMetadataSchema.optional(),
  route: diagramEdgeRouteSchema.optional(),
  zIndex: z.number().finite().optional()
});

const terraformSyncFileInputSchema = z
  .object({
    fileName: z.string().trim().min(1),
    terraformCode: z.string()
  })
  .strict();

export const diagramJsonSchema: z.ZodType<DiagramJson> = z.object({
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().positive()
  }),
  variables: z.array(diagramVariableSchema).optional(),
  presentation: diagramPresentationSchema.optional()
});

export const projectDraftQuerySchema = z.object({
  // Reserved for future draft listing/filtering parameters.
});

export const saveProjectDraftBodySchema = z.object({
  diagramJson: diagramJsonSchema,
  expectedRevision: z.number().int().positive().nullable(),
  terraformFiles: z.array(terraformSyncFileInputSchema).optional()
});

export const boardAutoOrganizeApplyBodySchema = z
  .object({
    sessionId: z.string().trim().min(1).max(160),
    candidateId: z.string().trim().min(1).max(160),
    sourceDiagram: diagramJsonSchema,
    sourceFingerprint: z.string().regex(/^[0-9a-f]{8}$/u),
    candidateDiagram: diagramJsonSchema,
    expectedRevision: z.number().int().positive().nullable(),
    terraformFiles: z.array(terraformSyncFileInputSchema)
  })
  .strict();
