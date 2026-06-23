import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ArchitectureJson } from "@sketchcatch/types";
import { requireS3BucketName } from "../config/env.js";
import { getDatabaseClient } from "../db/client.js";
import {
  anonymousWorkspaces,
  architectures,
  projectAssets,
  projects,
  touchUpdatedAt
} from "../db/schema.js";
import { getS3Client } from "../s3/client.js";

const workspaceIdSchema = z.string().min(1).max(128);

const createProjectBodySchema = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema,
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional()
});

const routeParamsSchema = z.object({
  id: z.string().uuid()
});

const resourceNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "VPC",
    "SUBNET",
    "EC2",
    "RDS",
    "S3",
    "SECURITY_GROUP",
    "CLOUDFRONT",
    "LAMBDA",
    "UNKNOWN"
  ]),
  label: z.string().min(1).optional(),
  positionX: z.number(),
  positionY: z.number(),
  config: z.record(z.string(), z.unknown()).default({})
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

const createArchitectureBodySchema = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema,
  version: z.number().int().positive().optional(),
  source: z.string().min(1).max(64).default("manual"),
  architectureJson: architectureJsonSchema
});

const assetTypeSchema = z.enum([
  "diagram_png",
  "diagram_svg",
  "terraform_file",
  "project_export_zip",
  "thumbnail"
]);

const presignedUploadBodySchema = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema,
  architectureId: z.string().uuid().optional(),
  assetType: assetTypeSchema,
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().positive().optional()
});

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.post("/projects", async (request, reply) => {
    const body = createProjectBodySchema.parse(request.body);
    const { db } = getDatabaseClient();
    const projectId = randomUUID();

    await db
      .insert(anonymousWorkspaces)
      .values({
        id: body.clientGeneratedWorkspaceId
      })
      .onConflictDoUpdate({
        target: anonymousWorkspaces.id,
        set: touchUpdatedAt
      });

    const [project] = await db
      .insert(projects)
      .values({
        id: projectId,
        workspaceId: body.clientGeneratedWorkspaceId,
        name: body.name,
        description: body.description
      })
      .returning();

    return reply.status(201).send({
      project
    });
  });

  app.get("/projects/:id", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const { db } = getDatabaseClient();

    const [project] = await db.select().from(projects).where(eq(projects.id, params.id));

    if (!project) {
      return reply.status(404).send({
        error: "not_found",
        message: "Project not found"
      });
    }

    const [projectArchitectures, assets] = await Promise.all([
      db
        .select()
        .from(architectures)
        .where(eq(architectures.projectId, params.id))
        .orderBy(desc(architectures.createdAt)),
      db
        .select()
        .from(projectAssets)
        .where(eq(projectAssets.projectId, params.id))
        .orderBy(desc(projectAssets.createdAt))
    ]);

    return {
      project,
      architectures: projectArchitectures,
      assets
    };
  });

  app.post("/projects/:id/architectures", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const body = createArchitectureBodySchema.parse(request.body);
    const { db } = getDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.id, params.id), eq(projects.workspaceId, body.clientGeneratedWorkspaceId))
      );

    if (!project) {
      return reply.status(404).send({
        error: "not_found",
        message: "Project not found for workspace"
      });
    }

    const version =
      body.version ??
      Number(
        (
          await db
            .select({ nextVersion: sql<number>`coalesce(max(${architectures.version}), 0) + 1` })
            .from(architectures)
            .where(eq(architectures.projectId, params.id))
        )[0]?.nextVersion ?? 1
      );

    const [architecture] = await db
      .insert(architectures)
      .values({
        id: randomUUID(),
        projectId: params.id,
        version,
        source: body.source,
        architectureJson: body.architectureJson
      })
      .returning();

    await db.update(projects).set(touchUpdatedAt).where(eq(projects.id, params.id));

    return reply.status(201).send({
      architecture
    });
  });

  app.post("/projects/:id/assets/presigned-upload", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const body = presignedUploadBodySchema.parse(request.body);
    const { db } = getDatabaseClient();
    const bucketName = requireS3BucketName();
    const assetId = randomUUID();

    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.id, params.id), eq(projects.workspaceId, body.clientGeneratedWorkspaceId))
      );

    if (!project) {
      return reply.status(404).send({
        error: "not_found",
        message: "Project not found for workspace"
      });
    }

    if (body.architectureId) {
      const [architecture] = await db
        .select()
        .from(architectures)
        .where(
          and(eq(architectures.id, body.architectureId), eq(architectures.projectId, params.id))
        );

      if (!architecture) {
        return reply.status(404).send({
          error: "not_found",
          message: "Architecture not found for project"
        });
      }
    }

    const objectKey = buildObjectKey(params.id, body.assetType, assetId, body.fileName);

    const [asset] = await db
      .insert(projectAssets)
      .values({
        id: assetId,
        projectId: params.id,
        architectureId: body.architectureId,
        assetType: body.assetType,
        objectKey,
        fileName: body.fileName,
        contentType: body.contentType,
        byteSize: body.byteSize
      })
      .returning();

    const uploadUrl = await getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: body.contentType
      }),
      { expiresIn: 900 }
    );

    return reply.status(201).send({
      asset,
      upload: {
        method: "PUT",
        url: uploadUrl,
        headers: {
          "Content-Type": body.contentType
        },
        expiresInSeconds: 900
      }
    });
  });
}

function buildObjectKey(
  projectId: string,
  assetType: z.infer<typeof assetTypeSchema>,
  assetId: string,
  fileName: string
): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

  return `projects/${projectId}/assets/${assetType}/${assetId}-${safeFileName}`;
}
