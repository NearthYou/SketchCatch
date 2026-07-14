import { z } from "zod";
import type { DiagramEdgeMetadata, DiagramJson, DiagramNodeMetadata } from "@sketchcatch/types";

const diagramPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

const diagramSizeSchema = z.object({
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
});

const diagramNodeStyleSchema = z.object({
  textColor: z.string().min(1).optional(),
  borderColor: z.string().min(1).optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional()
});

const diagramNodeMetadataSchema: z.ZodType<DiagramNodeMetadata> = z
  .object({
    parentAreaNodeId: z.string().min(1).optional(),
    presentationArea: z.boolean().optional(),
    presentationCatalogItemId: z.string().min(1).optional(),
    reverseEngineering: z
      .object({
        source: z.literal("aws_scan"),
        protectedValueKeys: z.array(z.string().min(1)),
        editableValueKeys: z.array(z.string().min(1))
      })
      .optional()
  })
  .strict();

const diagramNodeParametersSchema = z.object({
  terraformBlockType: z.enum(["resource", "data"]).optional(),
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
  position: diagramPositionSchema,
  size: diagramSizeSchema,
  label: z.string().min(1),
  iconUrl: z.string().min(1).optional(),
  locked: z.boolean(),
  zIndex: z.number().finite(),
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

const diagramEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandleId: z.string().min(1).optional(),
  targetHandleId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  style: diagramEdgeStyleSchema.optional(),
  metadata: diagramEdgeMetadataSchema.optional()
});

export const diagramJsonSchema: z.ZodType<DiagramJson> = z.object({
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().positive()
  })
});

export const projectDraftQuerySchema = z.object({
  // Reserved for future draft listing/filtering parameters.
});

export const saveProjectDraftBodySchema = z.object({
  diagramJson: diagramJsonSchema,
  terraformFiles: z
    .array(
      z
        .object({
          fileName: z.string().trim().min(1),
          terraformCode: z.string()
        })
        .strict()
    )
    .optional()
});
