import { z } from "zod";
import type { DiagramJson } from "@sketchcatch/types";

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
  borderColor: z.string().min(1).optional()
});

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
  parameters: diagramNodeParametersSchema.optional()
});

const diagramEdgeStyleSchema = z.object({
  color: z.string().min(1).optional(),
  width: z.enum(["thin", "medium", "thick"]).optional(),
  animated: z.boolean().optional()
});

const diagramEdgeSchema = z.object({
  id: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  sourceHandleId: z.string().min(1).optional(),
  targetHandleId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  style: diagramEdgeStyleSchema.optional()
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
  diagramJson: diagramJsonSchema
});
