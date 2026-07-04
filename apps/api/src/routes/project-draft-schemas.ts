import { z } from "zod";
import type { DiagramJson, DiagramNodeMetadata } from "@sketchcatch/types";

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

const awsRegionCodeSchema = z.enum([
  "ap-northeast-2",
  "ap-northeast-1",
  "ap-southeast-1",
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1"
]);
const awsAvailabilityZoneCodeSchema = z.string().min(1).regex(/^[a-z]{2}-[a-z]+-\d[a-z]$/);

const diagramNodeMetadataSchema: z.ZodType<DiagramNodeMetadata> = z.object({
  awsAvailabilityZone: awsAvailabilityZoneCodeSchema.optional(),
  awsRegion: awsRegionCodeSchema.optional(),
  parentAreaNodeId: z.string().min(1).optional()
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
  metadata: diagramNodeMetadataSchema.optional(),
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
