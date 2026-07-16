import type { DiagramNodeMetadata } from "@sketchcatch/types";
import { z } from "zod";

type DiagramNodeModuleSource = NonNullable<DiagramNodeMetadata["moduleSource"]>;

export const diagramNodeModuleSourceSchema: z.ZodType<DiagramNodeModuleSource> = z
  .object({
    moduleId: z.string().min(1),
    moduleVersion: z.string().min(1),
    expandedAt: z.iso.datetime({ offset: true }),
    representativeTemplateId: z.string().min(1).optional(),
    referenceTemplateIds: z.array(z.string().min(1)).optional()
  })
  .strict();
