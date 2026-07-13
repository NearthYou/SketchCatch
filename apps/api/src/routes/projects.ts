import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3ServiceException
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ApiErrorResponse, ArchitectureJson } from "@sketchcatch/types";
import { RESOURCE_TYPES } from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { requireS3BucketName } from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { defaultTerraformArtifactMaxBytes } from "../deployments/terraform-workspace.js";
import {
  createS3ProjectDeletionStorage,
  deleteProjectRecords,
  getProjectDeletePreview,
  type ProjectDeletionStorage
} from "../projects/project-deletion-service.js";
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

const deleteProjectBodySchema = z
  .object({
    action: z.enum(["delete_project", "delete_project_only"]).default("delete_project")
  })
  .default({ action: "delete_project" });

const routeParamsSchema = z.object({
  id: z.string().uuid()
});

const assetRouteParamsSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid()
});

const resourceNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(RESOURCE_TYPES),
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

const reverseEngineeringSourceSchema = z.object({
  sourceScanId: z.string().min(1),
  draftId: z.string().min(1)
});

const createArchitectureBodySchema = z.object({
  version: z.number().int().positive().optional(),
  source: z.string().min(1).max(64).default("manual"),
  reverseEngineering: reverseEngineeringSourceSchema.optional(),
  architectureJson: architectureJsonSchema
});

const assetTypeSchema = z.enum([
  "diagram_png",
  "diagram_svg",
  "terraform_file",
  "project_export_zip",
  "thumbnail"
]);

const presignedUploadBodySchema = z
  .object({
    architectureId: z.string().uuid().optional(),
    assetType: assetTypeSchema,
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(120),
    byteSize: z.number().int().positive().optional()
  })
  .superRefine((body, ctx) => {
    if (body.assetType !== "terraform_file") {
      return;
    }

    if (body.byteSize === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["byteSize"],
        message: "Terraform file byteSize is required"
      });
      return;
    }

    if (body.byteSize > defaultTerraformArtifactMaxBytes) {
      ctx.addIssue({
        code: "custom",
        path: ["byteSize"],
        message: `Terraform file must be ${defaultTerraformArtifactMaxBytes} bytes or smaller`
      });
    }
  });

type ProjectRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  projectAssetStorage?: ProjectAssetStorage;
  projectDeletionStorage?: ProjectDeletionStorage;
};

export type ProjectAssetStorage = {
  createUploadUrl(input: {
    bucketName: string;
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;
  putObject(input: {
    bucketName: string;
    objectKey: string;
    contentType: string;
    body: string | Buffer;
  }): Promise<void>;
  deleteObject(input: { bucketName: string; objectKey: string }): Promise<void>;
  objectExists(input: {
    bucketName: string;
    objectKey: string;
    byteSize: number | null;
  }): Promise<boolean>;
};

export async function registerProjectRoutes(
  app: FastifyInstance,
  options: ProjectRouteOptions = {}
): Promise<void> {
  const getProjectDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const getProjectAssetStorage = () =>
    options.projectAssetStorage ?? createDefaultProjectAssetStorage();

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

  app.get("/projects/:id/delete-preview", async (request) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const { db } = getProjectDatabaseClient();
    const preview = await getProjectDeletePreview({
      db,
      projectId: params.id,
      userId: currentUserId
    });

    return {
      preview
    };
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
        .where(
          and(eq(projectAssets.projectId, params.id), eq(projectAssets.uploadStatus, "uploaded"))
        )
        .orderBy(desc(projectAssets.createdAt))
    ]);

    return {
      project,
      architectures: projectArchitectures,
      assets
    };
  });

  app.delete("/projects/:id", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const body = deleteProjectBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    const result = await deleteProjectRecords({
      action: body.action,
      db,
      projectId: params.id,
      storage: options.projectDeletionStorage ?? createDefaultProjectDeletionStorage(),
      userId: currentUserId
    });

    if (result.cleanup.failedObjectCount > 0) {
      request.log.warn(
        {
          failedObjectCount: result.cleanup.failedObjectCount,
          projectId: params.id,
          s3Status: result.cleanup.s3Status
        },
        "Failed to delete some project S3 objects"
      );
    }

    return reply.status(200).send(result);
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
        architectureJson: attachReverseEngineeringSource(
          body.architectureJson,
          body.reverseEngineering
        )
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
        id: randomUUID(),
        projectId: params.id,
        diagramJson: body.diagramJson,
        terraformFiles: body.terraformFiles ?? null,
        revision,
        serverSavedAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: projectDrafts.projectId,
        set: {
          diagramJson: body.diagramJson,
          terraformFiles: body.terraformFiles ?? null,
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

    const objectKey = buildObjectKey(params.id, body.assetType, assetId, body.fileName);
    const expiresInSeconds = 900;

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
        byteSize: body.byteSize,
        uploadStatus: "pending"
      })
      .returning();

    const response = {
      asset,
      upload: {
        method: "PUT",
        url: `/api/projects/${params.id}/assets/${assetId}/upload-content`,
        headers: {
          "Content-Type": body.contentType
        },
        expiresInSeconds
      }
    };

    return reply.status(201).send(response);
  });

  app.put(
    "/projects/:id/assets/:assetId/upload-content",
    { bodyLimit: defaultTerraformArtifactMaxBytes },
    async (request, reply) => {
      const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
      const params = assetRouteParamsSchema.parse(request.params);
      const { db } = getProjectDatabaseClient();

      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

      if (!project) {
        return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
      }

      const [asset] = await db
        .select()
        .from(projectAssets)
        .where(and(eq(projectAssets.id, params.assetId), eq(projectAssets.projectId, params.id)));

      if (!asset || asset.uploadStatus !== "pending") {
        return sendNotFound(reply, "업로드 대기 중인 파일 기록을 찾을 수 없습니다.");
      }

      if (asset.assetType !== "terraform_file") {
        return sendBadRequest(reply, "API 업로드는 Terraform artifact에만 사용할 수 있습니다.");
      }

      if (typeof request.body !== "string" && !Buffer.isBuffer(request.body)) {
        return sendBadRequest(reply, "업로드할 파일 본문이 비어 있습니다.");
      }

      const body = request.body;
      const byteSize = Buffer.isBuffer(body)
        ? body.byteLength
        : Buffer.byteLength(body, "utf-8");

      if (asset.byteSize !== null && byteSize !== asset.byteSize) {
        return sendConflict(reply, "업로드된 파일 크기가 요청한 artifact 크기와 다릅니다.");
      }

      await getProjectAssetStorage().putObject({
        bucketName: requireS3BucketName(),
        objectKey: asset.objectKey,
        contentType: asset.contentType,
        body
      });

      const [confirmedAsset] = await db
        .update(projectAssets)
        .set({ uploadStatus: "uploaded" })
        .where(and(eq(projectAssets.id, params.assetId), eq(projectAssets.projectId, params.id)))
        .returning();

      if (!confirmedAsset) {
        return sendNotFound(reply, "업로드된 파일 기록을 찾을 수 없습니다.");
      }

      return reply.status(204).send();
    }
  );

  app.post("/projects/:id/assets/:assetId/confirm-upload", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = assetRouteParamsSchema.parse(request.params);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    const [asset] = await db
      .select()
      .from(projectAssets)
      .where(and(eq(projectAssets.id, params.assetId), eq(projectAssets.projectId, params.id)));

    if (!asset) {
      return sendNotFound(reply, "업로드된 파일 기록을 찾을 수 없습니다.");
    }

    if (asset.uploadStatus === "uploaded") {
      const response = { asset };

      return response;
    }

    const bucketName = requireS3BucketName();
    const uploaded = await getProjectAssetStorage().objectExists({
      bucketName,
      objectKey: asset.objectKey,
      byteSize: asset.byteSize
    });

    if (!uploaded) {
      return sendConflict(reply, "S3에서 업로드된 파일을 확인하지 못했습니다.");
    }

    const [confirmedAsset] = await db
      .update(projectAssets)
      .set({ uploadStatus: "uploaded" })
      .where(and(eq(projectAssets.id, params.assetId), eq(projectAssets.projectId, params.id)))
      .returning();

    if (!confirmedAsset) {
      return sendNotFound(reply, "업로드된 파일 기록을 찾을 수 없습니다.");
    }

    const response = { asset: confirmedAsset };

    return response;
  });

  app.post("/projects/:id/assets/:assetId/abort-upload", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = assetRouteParamsSchema.parse(request.params);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    const [asset] = await db
      .select()
      .from(projectAssets)
      .where(and(eq(projectAssets.id, params.assetId), eq(projectAssets.projectId, params.id)));

    if (!asset || asset.uploadStatus !== "pending") {
      return reply.status(204).send();
    }

    try {
      await getProjectAssetStorage().deleteObject({
        bucketName: requireS3BucketName(),
        objectKey: asset.objectKey
      });
    } catch (error) {
      request.log.warn(
        { error, objectKey: asset.objectKey, projectId: params.id },
        "Failed to delete aborted project asset object"
      );
    }

    await db
      .delete(projectAssets)
      .where(
        and(
          eq(projectAssets.id, params.assetId),
          eq(projectAssets.projectId, params.id),
          eq(projectAssets.uploadStatus, "pending")
        )
      );

    return reply.status(204).send();
  });
}

// Reverse Engineering으로 적용한 보드가 어떤 scan/draft에서 왔는지 node마다 남깁니다.
function attachReverseEngineeringSource(
  architectureJson: ArchitectureJson,
  reverseEngineering: z.infer<typeof reverseEngineeringSourceSchema> | undefined
): ArchitectureJson {
  if (!reverseEngineering) {
    return architectureJson;
  }

  return {
    ...architectureJson,
    nodes: architectureJson.nodes.map((node) => ({
      ...node,
      config: {
        ...node.config,
        reverseEngineeringSourceScanId: reverseEngineering.sourceScanId,
        reverseEngineeringDraftId: reverseEngineering.draftId
      }
    }))
  };
}

function sendNotFound(reply: FastifyReply, message: string): FastifyReply {
  const response: ApiErrorResponse = {
    error: "not_found",
    message
  };

  return reply.status(404).send(response);
}

function sendBadRequest(reply: FastifyReply, message: string): FastifyReply {
  const response: ApiErrorResponse = {
    error: "bad_request",
    message
  };

  return reply.status(400).send(response);
}

function sendConflict(reply: FastifyReply, message: string): FastifyReply {
  const response: ApiErrorResponse = {
    error: "conflict",
    message
  };

  return reply.status(409).send(response);
}

function createDefaultProjectAssetStorage(): ProjectAssetStorage {
  const s3Client = getS3Client();

  return {
    async createUploadUrl(input) {
      return getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          ContentType: input.contentType
        }),
        { expiresIn: input.expiresInSeconds }
      );
    },
    async putObject(input) {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType
        })
      );
    },
    async deleteObject(input) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey
        })
      );
    },
    async objectExists(input) {
      try {
        const object = await s3Client.send(
          new HeadObjectCommand({
            Bucket: input.bucketName,
            Key: input.objectKey
          })
        );

        if (input.byteSize !== null) {
          return object.ContentLength === input.byteSize;
        }

        return true;
      } catch (error) {
        if (isS3ObjectMissingError(error)) {
          return false;
        }

        throw error;
      }
    }
  };
}

function createDefaultProjectDeletionStorage(): ProjectDeletionStorage {
  return {
    async deleteObject(objectKey) {
      const storage = createS3ProjectDeletionStorage({
        bucketName: requireS3BucketName(),
        s3Client: getS3Client()
      });

      await storage.deleteObject(objectKey);
    }
  };
}

function isS3ObjectMissingError(error: unknown): boolean {
  if (error instanceof S3ServiceException) {
    return error.$metadata.httpStatusCode === 404 || error.name === "NotFound";
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotFound" || error.name === "NoSuchKey")
  );
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
