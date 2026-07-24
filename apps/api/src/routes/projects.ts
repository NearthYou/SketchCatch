import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  ApiErrorResponse,
  ArchitectureJson,
  ProjectDraftConflictResponse
} from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { createAwsConnectionManagedCleanup } from "../aws-connections/aws-connection-managed-cleanup.js";
import type { CleanupAwsConnectionManagedResources } from "../aws-connections/aws-connection-service.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { defaultTerraformArtifactMaxBytes } from "../deployments/terraform-workspace.js";
import {
  deleteProjectRecords,
  getProjectDeletePreview,
  type ProjectDeletionStorage
} from "../projects/project-deletion-service.js";
import { createProjectAssetStorage } from "../projects/project-asset-storage-factory.js";
import type { ProjectAssetStorage } from "../projects/project-asset-storage.js";
import {
  cleanupSupersededProjectThumbnails,
  compareProjectThumbnailsNewestFirst
} from "../projects/project-thumbnail-cleanup.js";
import {
  architectures,
  projectAssets,
  projectDrafts,
  projects,
  touchUpdatedAt
} from "../db/schema.js";
import { toProjectDraft } from "../modules/projects/project-drafts.js";
import {
  ProjectDraftRevisionMissingError,
  saveProjectDraftRevision
} from "../modules/projects/project-draft-save-service.js";
import { ReverseEngineeringImportDecisionMutationError } from "../reverse-engineering/reverse-engineering-import-decision-save-policy.js";
import { ReverseEngineeringImportDecisionValidationError } from "../reverse-engineering/reverse-engineering-import-decision.js";
import {
  applyExistingReverseEngineeringDraft,
  ExistingReverseEngineeringDraftMismatchError
} from "../reverse-engineering/existing-reverse-engineering-draft-apply-service.js";
import {
  applyBoardAutoOrganizeDraft,
  BoardAutoOrganizeSemanticMismatchError,
  BoardAutoOrganizeSourceMismatchError
} from "../modules/projects/board-auto-organize-apply-service.js";
import {
  sanitizeAwsProjectArchitectureRead,
  sanitizeAwsProjectDiagramRead
} from "../reverse-engineering/aws-project-read-sanitizer.js";
import {
  claimReverseEngineeringPreviewProject,
  createPostgresReverseEngineeringPreviewClaimRepository,
  ReverseEngineeringPreviewClaimConflictError,
  ReverseEngineeringPreviewClaimNotFoundError
} from "../reverse-engineering/reverse-engineering-preview-claim-service.js";
import {
  hasReverseEngineeringSourceProvenance,
  resolveVerifiedImportTargets,
  ReverseEngineeringImportTargetVerificationError
} from "../reverse-engineering/reverse-engineering-import-targets.js";
import { createPostgresReverseEngineeringRepository } from "../reverse-engineering/reverse-engineering-service.js";
import {
  assertTerraformBaseFilesDoNotContainImportBlocks,
  createTerraformArtifactBundleWithImports,
  terraformArtifactBundleContentType,
  terraformArtifactBundleFileName,
  terraformImportsFileName
} from "../services/terraform/terraform-import-artifact.js";
import {
  architectureJsonSchema,
  boardAutoOrganizeApplyBodySchema,
  diagramJsonSchema,
  reverseEngineeringDraftApplyBodySchema,
  reverseEngineeringImportDecisionRequestSchema,
  saveProjectDraftBodySchema
} from "./project-draft-schemas.js";

const createProjectBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional()
});

const deleteProjectBodySchema = z
  .object({
    action: z
      .enum(["delete_project", "delete_project_only", "delete_project_with_managed_cleanup"])
      .default("delete_project")
  })
  .default({ action: "delete_project" });

const routeParamsSchema = z.object({
  id: z.string().uuid()
});

const assetRouteParamsSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid()
});

const reverseEngineeringSourceSchema = z.object({
  sourceScanId: z.string().min(1),
  draftId: z.string().min(1),
  sourceNodeIds: z.array(z.string().min(1)).optional(),
  sourceKind: z.enum(["saved_scan", "preview_scan"]).optional()
});

const reverseEngineeringPreviewClaimSchema = z.object({
  previewId: z.uuid(),
  draftId: z.string().min(1),
  sourceNodeIds: z.array(z.string().min(1)).min(1),
  importDecision: reverseEngineeringImportDecisionRequestSchema
});

const createArchitectureBodySchema = z.object({
  version: z.number().int().positive().optional(),
  source: z.string().min(1).max(64).default("manual"),
  reverseEngineering: reverseEngineeringSourceSchema.optional(),
  architectureJson: architectureJsonSchema
});

const createReverseEngineeringProjectBodySchema = createProjectBodySchema.extend({
  diagramJson: diagramJsonSchema,
  architectureJson: architectureJsonSchema,
  reverseEngineering: reverseEngineeringPreviewClaimSchema
});

const assetTypeSchema = z.enum([
  "diagram_png",
  "diagram_svg",
  "terraform_file",
  "project_export_zip",
  "thumbnail"
]);

export const defaultProjectThumbnailMaxBytes = 2 * 1024 * 1024;
const projectThumbnailContentTypes = new Set(["image/png", "image/webp"]);

const presignedUploadBodySchema = z
  .object({
    architectureId: z.string().uuid().optional(),
    assetType: assetTypeSchema,
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(120),
    byteSize: z.number().int().positive().optional()
  })
  .superRefine((body, ctx) => {
    if (body.assetType === "thumbnail") {
      if (body.byteSize === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["byteSize"],
          message: "Thumbnail byteSize is required"
        });
      } else if (body.byteSize > defaultProjectThumbnailMaxBytes) {
        ctx.addIssue({
          code: "custom",
          path: ["byteSize"],
          message: `Thumbnail must be ${defaultProjectThumbnailMaxBytes} bytes or smaller`
        });
      }

      if (!projectThumbnailContentTypes.has(body.contentType)) {
        ctx.addIssue({
          code: "custom",
          path: ["contentType"],
          message: "Thumbnail contentType must be image/png or image/webp"
        });
      }

      return;
    }

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

export type ProjectRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  projectAssetStorage?: ProjectAssetStorage;
  projectDeletionStorage?: ProjectDeletionStorage;
  cleanupManagedResources?: CleanupAwsConnectionManagedResources;
  applyExistingReverseEngineeringDraft?: typeof applyExistingReverseEngineeringDraft;
};

// gg: 새 Reverse Engineering Project는 server-owned preview claim 경계를 통해서만 등록합니다.
export async function registerProjectRoutes(
  app: FastifyInstance,
  options: ProjectRouteOptions = {}
): Promise<void> {
  const getProjectDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const projectAssetStorage = options.projectAssetStorage ?? createProjectAssetStorage();
  const projectDeletionStorage =
    options.projectDeletionStorage ?? createProjectDeletionStorage(projectAssetStorage);
  const cleanupManagedResources =
    options.cleanupManagedResources ?? createAwsConnectionManagedCleanup();
  const applyExistingReverseEngineeringDraftService =
    options.applyExistingReverseEngineeringDraft ?? applyExistingReverseEngineeringDraft;

  app.addContentTypeParser(
    ["image/png", "image/webp"],
    { bodyLimit: defaultProjectThumbnailMaxBytes, parseAs: "buffer" },
    (_request, body, done) => done(null, body)
  );

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

  // gg: 새 Reverse Engineering Board는 owner preview claim·Project·Draft·Snapshot·Scan을 하나로 만듭니다.
  app.post("/projects/reverse-engineering", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const body = createReverseEngineeringProjectBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();

    try {
      const created = await claimReverseEngineeringPreviewProject(
        {
          userId: currentUserId,
          name: body.name,
          description: body.description ?? null,
          diagramJson: body.diagramJson,
          architectureJson: body.architectureJson,
          reverseEngineering: {
            previewId: body.reverseEngineering.previewId,
            publicDraftId: body.reverseEngineering.draftId,
            sourceNodeIds: body.reverseEngineering.sourceNodeIds,
            importDecision: body.reverseEngineering.importDecision
          }
        },
        createPostgresReverseEngineeringPreviewClaimRepository(db)
      );

      return reply.status(201).send(created);
    } catch (error) {
      if (error instanceof ReverseEngineeringPreviewClaimNotFoundError) {
        return sendNotFound(reply, error.message);
      }

      if (error instanceof ReverseEngineeringPreviewClaimConflictError) {
        return sendConflict(reply, error.message);
      }

      if (error instanceof ReverseEngineeringImportDecisionValidationError) {
        return sendBadRequest(reply, error.message);
      }

      throw error;
    }
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
      architectures: projectArchitectures.map((architecture) => ({
        ...architecture,
        architectureJson: sanitizeAwsProjectArchitectureRead(architecture.architectureJson, {
          source: architecture.source
        })
      })),
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
      storage: projectDeletionStorage,
      cleanupManagedResources,
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

    if (!result.managedCleanupCompleted) {
      request.log.warn(
        { projectId: params.id },
        "AWS managed project build cleanup was incomplete; local project records were deleted"
      );
    }

    return reply.status(200).send({
      deleted: result.deleted,
      cleanup: result.cleanup
    });
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

    const publicDraft = draft ? toProjectDraft(draft) : null;

    return reply.header("Cache-Control", "private, no-store").send({
      draft: publicDraft
        ? {
            ...publicDraft,
            diagramJson: sanitizeAwsProjectDiagramRead(publicDraft.diagramJson)
          }
        : null
    });
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

    try {
      const result = await saveProjectDraftRevision({
        db,
        input: body,
        projectId: params.id,
        userId: currentUserId
      });

      if (result.status === "conflict") {
        return sendProjectDraftConflict(reply, result.currentDraft);
      }

      return { draft: toProjectDraft(result.draft) };
    } catch (error) {
      if (error instanceof ProjectDraftRevisionMissingError) {
        return sendConflict(reply, error.message);
      }

      if (error instanceof ReverseEngineeringImportDecisionMutationError) {
        return sendConflict(reply, error.message);
      }

      throw error;
    }
  });

  // gg: 기존 Project의 Reverse 후보는 저장 Scan과 현재 revision을 서버에서 다시 확인합니다.
  app.post("/projects/:id/draft/reverse-engineering/apply", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const body = reverseEngineeringDraftApplyBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    try {
      const result = await applyExistingReverseEngineeringDraftService({
        ...body,
        db,
        projectId: params.id,
        userId: currentUserId
      });

      if (result.status === "conflict") {
        return sendProjectDraftConflict(reply, result.currentDraft);
      }

      return { draft: toProjectDraft(result.draft) };
    } catch (error) {
      if (error instanceof ExistingReverseEngineeringDraftMismatchError) {
        return error.reason === "candidate_mismatch" || error.reason === "invalid_request"
          ? sendBadRequest(reply, error.message)
          : sendConflict(reply, error.message);
      }

      if (error instanceof ReverseEngineeringImportDecisionValidationError) {
        return sendBadRequest(reply, error.message);
      }

      if (error instanceof ProjectDraftRevisionMissingError) {
        return sendConflict(reply, error.message);
      }

      if (error instanceof ReverseEngineeringImportDecisionMutationError) {
        return sendConflict(reply, error.message);
      }

      throw error;
    }
  });

  // 자동 정리 적용은 일반 Draft 저장과 같은 소유권·revision CAS를 재사용합니다.
  app.post("/projects/:id/draft/auto-organize/apply", async (request, reply) => {
    const currentUserId = await requireActiveUserId(request, getProjectDatabaseClient);
    const params = routeParamsSchema.parse(request.params);
    const body = boardAutoOrganizeApplyBodySchema.parse(request.body);
    const { db } = getProjectDatabaseClient();

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, params.id), eq(projects.userId, currentUserId)));

    if (!project) {
      return sendNotFound(reply, "프로젝트를 찾을 수 없습니다.");
    }

    try {
      const result = await applyBoardAutoOrganizeDraft({
        candidateDiagram: body.candidateDiagram,
        db,
        expectedRevision: body.expectedRevision,
        projectId: params.id,
        sourceDiagram: body.sourceDiagram,
        sourceFingerprint: body.sourceFingerprint,
        terraformFiles: body.terraformFiles,
        userId: currentUserId
      });

      if (result.status === "conflict") {
        return sendProjectDraftConflict(reply, result.currentDraft);
      }

      return { draft: toProjectDraft(result.draft) };
    } catch (error) {
      if (error instanceof BoardAutoOrganizeSourceMismatchError) {
        return sendConflict(reply, error.message);
      }

      if (error instanceof BoardAutoOrganizeSemanticMismatchError) {
        return sendBadRequest(reply, error.message);
      }

      if (error instanceof ProjectDraftRevisionMissingError) {
        return sendConflict(reply, error.message);
      }

      if (error instanceof ReverseEngineeringImportDecisionMutationError) {
        return sendConflict(reply, error.message);
      }

      throw error;
    }
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
    { bodyLimit: Math.max(defaultTerraformArtifactMaxBytes, defaultProjectThumbnailMaxBytes) },
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

      if (asset.assetType !== "terraform_file" && asset.assetType !== "thumbnail") {
        return sendBadRequest(reply, "이 asset type은 API 업로드를 지원하지 않습니다.");
      }

      if (typeof request.body !== "string" && !Buffer.isBuffer(request.body)) {
        return sendBadRequest(reply, "업로드할 파일 본문이 비어 있습니다.");
      }

      const body = request.body;
      const byteSize = Buffer.isBuffer(body) ? body.byteLength : Buffer.byteLength(body, "utf-8");

      if (asset.byteSize !== null && byteSize !== asset.byteSize) {
        return sendConflict(reply, "업로드된 파일 크기가 요청한 artifact 크기와 다릅니다.");
      }

      if (asset.assetType === "thumbnail") {
        const requestContentType = request.headers["content-type"]?.split(";", 1)[0]?.trim();

        if (
          !Buffer.isBuffer(body) ||
          byteSize > defaultProjectThumbnailMaxBytes ||
          !projectThumbnailContentTypes.has(asset.contentType) ||
          requestContentType !== asset.contentType
        ) {
          return sendBadRequest(
            reply,
            "Thumbnail은 등록한 형식과 일치하는 PNG 또는 WebP여야 합니다."
          );
        }
      }

      let storedBody: Buffer | string = body;
      let storedContentType = asset.contentType;
      let storedFileName = asset.fileName;
      let storedByteSize = byteSize;

      if (asset.assetType === "terraform_file") {
        const [draft] = await db
          .select({
            diagramJson: projectDrafts.diagramJson,
            terraformFiles: projectDrafts.terraformFiles
          })
          .from(projectDrafts)
          .where(eq(projectDrafts.projectId, params.id));

        if (draft) {
          try {
            const hasReverseEngineeringSource = hasReverseEngineeringSourceProvenance(
              draft.diagramJson
            );

            if (hasReverseEngineeringSource) {
              if (!draft.terraformFiles || draft.terraformFiles.length === 0) {
                return sendConflict(
                  reply,
                  "저장된 Project Draft의 Terraform 파일을 확인할 수 없습니다."
                );
              }

              if (draft.terraformFiles.some((file) => file.fileName === terraformImportsFileName)) {
                return sendBadRequest(reply, "imports.tf는 서버가 생성하는 예약 파일입니다.");
              }

              try {
                assertTerraformBaseFilesDoNotContainImportBlocks(draft.terraformFiles);
              } catch (error) {
                return sendBadRequest(
                  reply,
                  error instanceof Error
                    ? error.message
                    : "Terraform import block이 허용되지 않습니다."
                );
              }

              const targets = await resolveVerifiedImportTargets(
                {
                  projectId: params.id,
                  accessContext: { kind: "user", userId: currentUserId },
                  diagramJson: draft.diagramJson
                },
                createPostgresReverseEngineeringRepository(db)
              );

              const uploadedTerraformCode = Buffer.isBuffer(body) ? body.toString("utf8") : body;
              const persistedTerraformCode = draft.terraformFiles
                .map((file) => file.terraformCode.trim())
                .filter(Boolean)
                .join("\n\n");

              if (uploadedTerraformCode.trim() !== persistedTerraformCode.trim()) {
                return sendConflict(reply, "업로드 Terraform이 저장된 Project Draft와 다릅니다.");
              }

              storedBody = JSON.stringify(
                createTerraformArtifactBundleWithImports(draft.terraformFiles, targets)
              );
              storedContentType = terraformArtifactBundleContentType;
              storedFileName = terraformArtifactBundleFileName;
              storedByteSize = Buffer.byteLength(storedBody);

              if (storedByteSize > defaultTerraformArtifactMaxBytes) {
                return sendBadRequest(
                  reply,
                  `Terraform artifact bundle must be ${defaultTerraformArtifactMaxBytes} bytes or smaller`
                );
              }
            }
          } catch (error) {
            if (error instanceof ReverseEngineeringImportTargetVerificationError) {
              return sendConflict(reply, error.message);
            }
            throw error;
          }
        }
      }

      const candidateObjectKey = buildUploadAttemptObjectKey(asset.objectKey);

      const uploadedCandidate = await projectAssetStorage.putObject({
        objectKey: candidateObjectKey,
        contentType: storedContentType,
        body: storedBody
      });
      const candidateVersionId = uploadedCandidate?.versionId;

      let confirmedAsset: typeof projectAssets.$inferSelect | undefined;

      try {
        [confirmedAsset] = await db
          .update(projectAssets)
          .set({
            objectKey: candidateObjectKey,
            uploadStatus: "uploaded",
            fileName: storedFileName,
            contentType: storedContentType,
            byteSize: storedByteSize
          })
          .where(
            and(
              eq(projectAssets.id, params.assetId),
              eq(projectAssets.projectId, params.id),
              eq(projectAssets.uploadStatus, "pending")
            )
          )
          .returning();
      } catch (finalizeError) {
        let currentAsset: typeof projectAssets.$inferSelect | undefined;

        try {
          [currentAsset] = await db
            .select()
            .from(projectAssets)
            .where(
              and(eq(projectAssets.id, params.assetId), eq(projectAssets.projectId, params.id))
            );
        } catch (rereadError) {
          request.log.warn(
            {
              error: rereadError,
              finalizeError,
              objectKey: candidateObjectKey,
              projectId: params.id
            },
            "Project asset upload outcome remained ambiguous after finalize failure"
          );
          throw finalizeError;
        }

        if (
          currentAsset?.uploadStatus === "uploaded" &&
          currentAsset.objectKey === candidateObjectKey
        ) {
          return reply.status(204).send();
        }

        await cleanupProjectAssetUploadCandidate({
          log: request.log,
          objectKey: candidateObjectKey,
          projectId: params.id,
          storage: projectAssetStorage,
          versionId: candidateVersionId
        });

        if (currentAsset?.uploadStatus === "uploaded") {
          return sendConflict(reply, "같은 파일의 다른 업로드가 먼저 완료되었습니다.");
        }

        throw finalizeError;
      }

      if (!confirmedAsset) {
        await cleanupProjectAssetUploadCandidate({
          log: request.log,
          objectKey: candidateObjectKey,
          projectId: params.id,
          storage: projectAssetStorage,
          versionId: candidateVersionId
        });

        return sendConflict(reply, "같은 파일의 다른 업로드가 먼저 완료되었습니다.");
      }

      return reply.status(204).send();
    }
  );

  app.get("/projects/:id/thumbnail", async (request, reply) => {
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

    const assets = await db
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.projectId, params.id))
      .orderBy(desc(projectAssets.createdAt));
    const thumbnail = assets
      .filter((asset) => asset.assetType === "thumbnail" && asset.uploadStatus === "uploaded")
      .sort(compareProjectThumbnailsNewestFirst)[0];

    if (!thumbnail) {
      return sendNotFound(reply, "저장된 보드 캡처를 찾을 수 없습니다.");
    }

    const object = await projectAssetStorage.getObject({
      objectKey: thumbnail.objectKey
    });

    return reply
      .header("Cache-Control", "private, no-store")
      .type(thumbnail.contentType)
      .send(object);
  });

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
      if (asset.assetType === "thumbnail") {
        await pruneUploadedProjectThumbnails({
          db,
          log: request.log,
          projectId: params.id,
          storage: projectAssetStorage
        });
      }

      const response = { asset };

      return response;
    }

    const uploaded = await projectAssetStorage.objectExists({
      objectKey: asset.objectKey,
      byteSize: asset.byteSize
    });

    if (!uploaded) {
      return sendConflict(reply, "스토리지에서 업로드된 파일을 확인하지 못했습니다.");
    }

    const [confirmedAsset] = await db
      .update(projectAssets)
      .set({ uploadStatus: "uploaded" })
      .where(and(eq(projectAssets.id, params.assetId), eq(projectAssets.projectId, params.id)))
      .returning();

    if (!confirmedAsset) {
      return sendNotFound(reply, "업로드된 파일 기록을 찾을 수 없습니다.");
    }

    if (confirmedAsset.assetType === "thumbnail") {
      await pruneUploadedProjectThumbnails({
        db,
        log: request.log,
        projectId: params.id,
        storage: projectAssetStorage
      });
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
      await projectAssetStorage.deleteObject({
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

  const sourceNodeIds = reverseEngineering.sourceNodeIds
    ? new Set(reverseEngineering.sourceNodeIds)
    : null;

  return {
    ...architectureJson,
    nodes: architectureJson.nodes.map((node) =>
      sourceNodeIds && !sourceNodeIds.has(node.id)
        ? node
        : {
            ...node,
            config: {
              ...node.config,
              reverseEngineeringSourceScanId: reverseEngineering.sourceScanId,
              reverseEngineeringDraftId: reverseEngineering.draftId,
              ...(reverseEngineering.sourceKind
                ? { reverseEngineeringSourceKind: reverseEngineering.sourceKind }
                : {})
            }
          }
    )
  };
}

// confirm된 Project 캡처 중 canonical 최신 한 장만 남기고 cleanup 실패는 저장 성공과 분리합니다.
async function pruneUploadedProjectThumbnails({
  db,
  log,
  projectId,
  storage
}: {
  readonly db: DatabaseClient["db"];
  readonly log: FastifyRequest["log"];
  readonly projectId: string;
  readonly storage: ProjectAssetStorage;
}): Promise<void> {
  try {
    await cleanupSupersededProjectThumbnails({
      listUploaded: async () =>
        db
          .select({
            createdAt: projectAssets.createdAt,
            id: projectAssets.id,
            objectKey: projectAssets.objectKey
          })
          .from(projectAssets)
          .where(
            and(
              eq(projectAssets.projectId, projectId),
              eq(projectAssets.assetType, "thumbnail"),
              eq(projectAssets.uploadStatus, "uploaded")
            )
          ),
      deleteObject: async (objectKey) => {
        await storage.deleteObject({ objectKey });
      },
      deleteRow: async (assetId) => {
        await db
          .delete(projectAssets)
          .where(and(eq(projectAssets.id, assetId), eq(projectAssets.projectId, projectId)));
      },
      onDeleteError: (error, thumbnail) => {
        log.warn(
          { error, objectKey: thumbnail.objectKey, projectId },
          "Failed to prune superseded project thumbnail"
        );
      }
    });
  } catch (error) {
    log.warn({ error, projectId }, "Failed to list superseded project thumbnails");
  }
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

function sendProjectDraftConflict(
  reply: FastifyReply,
  draft: typeof projectDrafts.$inferSelect
): FastifyReply {
  const response: ProjectDraftConflictResponse = {
    error: "conflict",
    message: "다른 탭에서 이 프로젝트가 변경되었습니다.",
    currentRevision: draft.revision,
    currentServerSavedAt: draft.serverSavedAt.toISOString()
  };

  return reply.status(409).send(response);
}

function createProjectDeletionStorage(storage: ProjectAssetStorage): ProjectDeletionStorage {
  const deletePrefix = storage.deletePrefix?.bind(storage);

  return {
    async deleteObject(objectKey) {
      await storage.deleteObject({ objectKey });
    },
    async deleteObjectVersion(objectKey, versionId) {
      if (storage.deleteObjectVersion) {
        await storage.deleteObjectVersion({ objectKey, versionId });
        return;
      }
      await storage.deleteObject({ objectKey });
    },
    ...(deletePrefix
      ? {
          async deletePrefix(input: { prefix: string }) {
            await deletePrefix(input);
          }
        }
      : {})
  };
}

function buildObjectKey(
  projectId: string,
  assetType: z.infer<typeof assetTypeSchema>,
  assetId: string,
  fileName: string
): string {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);

  return `projects/${projectId}/assets/${assetType}/${assetId}-${safeFileName}`;
}

/** gg: 동시 PUT을 별도 객체에 기록해 DB가 선택한 한 객체만 최종본으로 연결합니다. */
function buildUploadAttemptObjectKey(objectKey: string): string {
  const lastSeparatorIndex = objectKey.lastIndexOf("/");
  const parentPrefix = lastSeparatorIndex === -1 ? "" : objectKey.slice(0, lastSeparatorIndex + 1);

  return `${parentPrefix}.attempt-${randomUUID()}`;
}

/** gg: 실패한 후보는 S3 VersionId가 있으면 실제 버전을, 아니면 일반 객체를 최선 노력으로 지웁니다. */
async function cleanupProjectAssetUploadCandidate(input: {
  log: FastifyRequest["log"];
  objectKey: string;
  projectId: string;
  storage: ProjectAssetStorage;
  versionId: string | undefined;
}): Promise<void> {
  try {
    if (input.versionId && input.storage.deleteObjectVersion) {
      await input.storage.deleteObjectVersion({
        objectKey: input.objectKey,
        versionId: input.versionId
      });
      return;
    }

    await input.storage.deleteObject({ objectKey: input.objectKey });
  } catch (error) {
    input.log.warn(
      { error, objectKey: input.objectKey, projectId: input.projectId },
      "Failed to delete a losing project asset upload"
    );
  }
}
