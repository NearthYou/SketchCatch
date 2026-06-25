import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type {
  ArchitectureJson,
  CreateArchitectureSnapshotRequest,
  CreateProjectAssetUploadRequest,
  CreateProjectRequest,
  ProjectAssetUploadResponse,
  ProjectListResponse
} from "@sketchcatch/types";
import { requireS3BucketName } from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  buildProjectAssetObjectKey,
  createProjectAssetUpload
} from "../modules/projects/project-assets.js";
import {
  createProjectRepository,
  OwnedProjectNotFoundError,
  type ProjectRepository
} from "../modules/projects/project-repository.js";
import {
  resolveProjectOwner,
  type ProjectOwnerResolver
} from "../modules/projects/project-owner.js";
import { projectDraftQuerySchema, saveProjectDraftBodySchema } from "./project-draft-schemas.js";

export type { ProjectOwnerResolver } from "../modules/projects/project-owner.js";

const workspaceIdSchema = z.string().min(1).max(128);

const listProjectsQuerySchema = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema.optional()
});

const createProjectBodySchema: z.ZodType<CreateProjectRequest> = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema.optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional()
});

const routeParamsSchema = z.object({
  id: z.string().uuid()
});

const resourceNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["VPC", "EC2", "RDS", "S3", "LAMBDA", "UNKNOWN"]),
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

const createArchitectureBodySchema: z.ZodType<CreateArchitectureSnapshotRequest> = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema.optional(),
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

const presignedUploadBodySchema: z.ZodType<CreateProjectAssetUploadRequest> = z.object({
  clientGeneratedWorkspaceId: workspaceIdSchema.optional(),
  architectureId: z.string().uuid().optional(),
  assetType: assetTypeSchema,
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().positive().optional()
});

export type ProjectRouteOptions = {
  getDatabaseClient?: (() => DatabaseClient) | undefined;
  resolveProjectOwner?: ProjectOwnerResolver | undefined;
};

export async function registerProjectRoutes(
  app: FastifyInstance,
  options: ProjectRouteOptions = {}
): Promise<void> {
  const resolveDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const resolveRepository = (): ProjectRepository => createProjectRepository(resolveDatabaseClient());

  app.post("/projects", async (request, reply) => {
    const body = createProjectBodySchema.parse(request.body);
    const owner = await resolveProjectOwner(
      request,
      options.resolveProjectOwner,
      body.clientGeneratedWorkspaceId
    );

    if (!owner?.workspaceId) {
      return sendMissingProjectOwner(reply);
    }

    const project = await resolveRepository().createProject({
      owner,
      name: body.name,
      description: body.description
    });

    return reply.status(201).send({
      project
    });
  });

  app.get("/projects", async (request, reply) => {
    const query = listProjectsQuerySchema.parse(request.query);
    const owner = await resolveProjectOwner(
      request,
      options.resolveProjectOwner,
      query.clientGeneratedWorkspaceId
    );

    if (!owner) {
      return sendMissingProjectOwner(reply);
    }

    const response: ProjectListResponse = {
      projects: await resolveRepository().listProjects(owner)
    };

    return reply.status(200).send(response);
  });

  app.get("/projects/:id", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const query = listProjectsQuerySchema.parse(request.query);
    const owner = await resolveProjectOwner(
      request,
      options.resolveProjectOwner,
      query.clientGeneratedWorkspaceId
    );

    if (!owner) {
      return sendMissingProjectOwner(reply);
    }

    const projectDetails = await resolveRepository().getProjectDetails({
      owner,
      projectId: params.id
    });

    if (!projectDetails) {
      return reply.status(404).send({
        error: "not_found",
        message: "Project not found"
      });
    }

    return reply.status(200).send(projectDetails);
  });

  app.post("/projects/:id/architectures", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const body = createArchitectureBodySchema.parse(request.body);
    const owner = await resolveProjectOwner(
      request,
      options.resolveProjectOwner,
      body.clientGeneratedWorkspaceId
    );

    if (!owner) {
      return sendMissingProjectOwner(reply);
    }

    const architecture = await resolveRepository().createArchitectureSnapshot({
      owner,
      projectId: params.id,
      version: body.version,
      source: body.source ?? "manual",
      architectureJson: body.architectureJson
    });

    if (!architecture) {
      return reply.status(404).send({
        error: "not_found",
        message: "Project not found for workspace"
      });
    }

    return reply.status(201).send({
      architecture
    });
  });

  app.get("/projects/:id/draft", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const query = projectDraftQuerySchema.parse(request.query);
    const owner = await resolveProjectOwner(
      request,
      options.resolveProjectOwner,
      query.clientGeneratedWorkspaceId
    );

    if (!owner) {
      return sendMissingProjectOwner(reply);
    }

    try {
      const draft = await resolveRepository().getProjectDraft({
        owner,
        projectId: params.id
      });

      return reply.status(200).send({
        draft
      });
    } catch (error) {
      if (error instanceof OwnedProjectNotFoundError) {
        return reply.status(404).send({
          error: "not_found",
          message: "Project not found for workspace"
        });
      }

      throw error;
    }
  });

  app.put("/projects/:id/draft", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const body = saveProjectDraftBodySchema.parse(request.body);
    const owner = await resolveProjectOwner(
      request,
      options.resolveProjectOwner,
      body.clientGeneratedWorkspaceId
    );

    if (!owner) {
      return sendMissingProjectOwner(reply);
    }

    const draft = await resolveRepository().saveProjectDraft({
      owner,
      projectId: params.id,
      diagramJson: body.diagramJson
    });

    if (!draft) {
      return reply.status(404).send({
        error: "not_found",
        message: "Project not found for workspace"
      });
    }

    return reply.status(200).send({
      draft
    });
  });

  app.post("/projects/:id/assets/presigned-upload", async (request, reply) => {
    const params = routeParamsSchema.parse(request.params);
    const body = presignedUploadBodySchema.parse(request.body);
    const owner = await resolveProjectOwner(
      request,
      options.resolveProjectOwner,
      body.clientGeneratedWorkspaceId
    );

    if (!owner) {
      return sendMissingProjectOwner(reply);
    }

    const bucketName = requireS3BucketName();
    const repository = resolveRepository();
    const projectDetails = await repository.getProjectDetails({
      owner,
      projectId: params.id
    });

    if (!projectDetails) {
      return reply.status(404).send({
        error: "not_found",
        message: "Project not found for workspace"
      });
    }

    const assetId = randomUUID();
    const objectKey = buildProjectAssetObjectKey({
      projectId: params.id,
      assetType: body.assetType,
      assetId,
      fileName: body.fileName
    });
    const asset = await repository.createProjectAsset({
      owner,
      projectId: params.id,
      architectureId: body.architectureId,
      assetId,
      assetType: body.assetType,
      objectKey,
      fileName: body.fileName,
      contentType: body.contentType,
      byteSize: body.byteSize
    });

    if (!asset) {
      return reply.status(404).send({
        error: "not_found",
        message: "Architecture not found for project"
      });
    }

    const response: ProjectAssetUploadResponse = {
      asset,
      upload: await createProjectAssetUpload({
        bucketName,
        objectKey,
        contentType: body.contentType
      })
    };

    return reply.status(201).send(response);
  });
}

function sendMissingProjectOwner(reply: FastifyReply) {
  return reply.status(400).send({
    error: "bad_request",
    message: "Project owner is required"
  });
}
