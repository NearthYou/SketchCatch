import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ApiErrorResponse, ArchitectureJson } from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { requireS3BucketName } from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  architectures,
  projectAssets,
  projectDrafts,
  projects,
  touchUpdatedAt
} from "../db/schema.js";
import { getNextDraftRevision, toProjectDraft } from "../modules/projects/project-drafts.js";
import { getS3Client } from "../s3/client.js";
import { saveProjectDraftBodySchema } from "./project-draft-schemas.js";

const createProjectBodySchema = z.object({
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
  architectureId: z.string().uuid().optional(),
  assetType: assetTypeSchema,
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().positive().optional()
});

type ProjectRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export async function registerProjectRoutes(
  app: FastifyInstance,
  options: ProjectRouteOptions = {}
): Promise<void> {
  const getProjectDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;

  app.get("/projects", async (request) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const { db } = getProjectDatabaseClient();

    const userProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, currentUserId))
      .orderBy(desc(projects.updatedAt));

    return {
      projects: userProjects
    };
  });

  app.post("/projects", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const body = createProjectBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .insert(projects)
      .values({
        id: randomUUID(),
        userId: currentUserId,
        name: body.name,
        description: body.description ?? null
      })
      .returning();

    return reply.status(201).send({
      project
    });
  });

  app.get("/projects/:id", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
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
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const body = createArchitectureBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
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

    await db
      .update(projects)
      .set(touchUpdatedAt)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    return reply.status(201).send({
      architecture
    });
  });

  app.get("/projects/:id/draft", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    const [draft] = await db
      .select()
      .from(projectDrafts)
      .where(eq(projectDrafts.projectId, params.id));

    return {
      draft: draft ? toProjectDraft(draft) : null
    };
  });

  app.put("/projects/:id/draft", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const body = saveProjectDraftBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    const [existingDraft] = await db
      .select({ revision: projectDrafts.revision })
      .from(projectDrafts)
      .where(eq(projectDrafts.projectId, params.id));
    const now = new Date();
    const revision = getNextDraftRevision(existingDraft?.revision);

    const [draft] = await db
      .insert(projectDrafts)
      .values({
        projectId: params.id,
        diagramJson: body.diagramJson,
        revision,
        serverSavedAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: projectDrafts.projectId,
        set: {
          diagramJson: body.diagramJson,
          revision,
          serverSavedAt: now,
          updatedAt: now
        }
      })
      .returning();

    if (!draft) {
      throw new Error("Failed to save project draft");
    }

    await db
      .update(projects)
      .set(touchUpdatedAt)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    return {
      draft: toProjectDraft(draft)
    };
  });

  app.post("/projects/:id/assets/presigned-upload", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const body = presignedUploadBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();
    const assetId = randomUUID();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    if (body.architectureId) {
      const [architecture] = await db
        .select()
        .from(architectures)
        .where(
          and(eq(architectures.id, body.architectureId), eq(architectures.projectId, params.id))
        );

      if (!architecture) {
        return sendNotFound(reply, "프로젝트에 연결된 아키텍처를 찾을 수 없습니다.");
      }
    }

    const bucketName = requireS3BucketName();
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

function sendNotFound(reply: FastifyReply, message: string): FastifyReply {
  const response: ApiErrorResponse = {
    error: "not_found",
    message
  };

  return reply.status(404).send(response);
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
