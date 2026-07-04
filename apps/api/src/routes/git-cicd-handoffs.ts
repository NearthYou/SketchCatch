import { z } from "zod";
import type {
  GitCicdHandoff,
  GitCicdHandoffListResponse,
  GitCicdHandoffResponse
} from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  createGitCicdHandoff,
  createInternalGitCicdHandoffProvider,
  createPostgresGitCicdHandoffRepository,
  getGitCicdHandoff,
  GitCicdHandoffInvalidStatusTransitionError,
  GitCicdHandoffNotFoundError,
  GitCicdHandoffProviderMismatchError,
  listProjectGitCicdHandoffs,
  updateGitCicdHandoffStatus,
  type GitCicdHandoffProvider,
  type GitCicdHandoffRecord,
  type GitCicdHandoffRepository,
  type ProjectAccessContext
} from "../git-cicd/git-cicd-handoff-service.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const gitCicdHandoffStatusSchema = z.enum([
  "draft",
  "pr_created",
  "pipeline_running",
  "pipeline_success",
  "pipeline_failed",
  "cancelled"
]);
const sourceRepositoryProviderSchema = z.enum(["internal", "github"]);

const projectHandoffParamsSchema = z.object({
  projectId: z.uuid()
});

const handoffParamsSchema = z.object({
  handoffId: z.uuid()
});

const nameSchema = z.string().trim().min(1).max(120);
const branchSchema = z.string().trim().min(1).max(255);
const deploymentPlanSummarySchema = z
  .object({
    createCount: z.number().int().min(0),
    updateCount: z.number().int().min(0),
    deleteCount: z.number().int().min(0),
    replaceCount: z.number().int().min(0),
    blocked: z.boolean(),
    warnings: z.array(
      z
        .object({
          level: z.enum(["low", "medium", "high"]),
          message: z.string().trim().min(1).max(500)
        })
        .strict()
    )
  })
  .strict();

const createGitCicdHandoffBodySchema = z
  .object({
    architectureId: z.uuid(),
    terraformArtifactId: z.uuid(),
    sourceRepositoryId: z.string().trim().min(1).max(128),
    repositoryProvider: sourceRepositoryProviderSchema.optional(),
    repositoryOwner: nameSchema,
    repositoryName: nameSchema,
    targetBranch: branchSchema,
    sourceBranch: branchSchema.optional(),
    commitMessage: z.string().trim().min(1).max(500).optional(),
    pullRequestTitle: z.string().trim().min(1).max(255).optional(),
    planSummary: deploymentPlanSummarySchema.optional(),
    userAcceptedChangeId: z.string().trim().min(1).max(128)
  })
  .strict();

const updateGitCicdHandoffStatusBodySchema = z
  .object({
    status: gitCicdHandoffStatusSchema,
    pullRequestUrl: z.string().url().nullable().optional(),
    pipelineRunUrl: z.string().url().nullable().optional(),
    statusMessage: z.string().trim().min(1).max(500).nullable().optional()
  })
  .strict();

type GitCicdHandoffRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createGitCicdHandoffRepository?: (
    db: DatabaseClient["db"]
  ) => GitCicdHandoffRepository;
  gitCicdHandoffProvider?: GitCicdHandoffProvider;
};

type GitCicdHandoffRequestContext = {
  accessContext: ProjectAccessContext;
  repository: GitCicdHandoffRepository;
  provider: GitCicdHandoffProvider;
};

export async function registerGitCicdHandoffRoutes(
  app: FastifyInstance,
  options?: GitCicdHandoffRouteOptions
): Promise<void> {
  const getGitCicdDatabaseClient = options?.getDatabaseClient ?? getDatabaseClient;

  app.post("/projects/:projectId/git-cicd-handoffs", async (request, reply) => {
    const params = projectHandoffParamsSchema.parse(request.params);
    const body = createGitCicdHandoffBodySchema.parse(request.body);
    const { accessContext, repository, provider } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const handoff = await createGitCicdHandoff(
        {
          projectId: params.projectId,
          accessContext,
          architectureId: body.architectureId,
          terraformArtifactId: body.terraformArtifactId,
          sourceRepositoryId: body.sourceRepositoryId,
          repositoryProvider: body.repositoryProvider,
          repositoryOwner: body.repositoryOwner,
          repositoryName: body.repositoryName,
          targetBranch: body.targetBranch,
          sourceBranch: body.sourceBranch,
          commitMessage: body.commitMessage,
          pullRequestTitle: body.pullRequestTitle,
          planSummary: body.planSummary,
          userAcceptedChangeId: body.userAcceptedChangeId
        },
        repository,
        provider
      );
      const response: GitCicdHandoffResponse = {
        handoff: toGitCicdHandoff(handoff)
      };

      return reply.status(201).send(response);
    } catch (error) {
      return handleGitCicdHandoffError(error, reply);
    }
  });

  app.get("/projects/:projectId/git-cicd-handoffs", async (request, reply) => {
    const params = projectHandoffParamsSchema.parse(request.params);
    const { accessContext, repository } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const handoffs = await listProjectGitCicdHandoffs(
        {
          projectId: params.projectId,
          accessContext
        },
        repository
      );
      const response: GitCicdHandoffListResponse = {
        handoffs: handoffs.map(toGitCicdHandoff)
      };

      return reply.status(200).send(response);
    } catch (error) {
      return handleGitCicdHandoffError(error, reply);
    }
  });

  app.get("/git-cicd-handoffs/:handoffId", async (request, reply) => {
    const params = handoffParamsSchema.parse(request.params);
    const { accessContext, repository } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const handoff = await getGitCicdHandoff(
        {
          handoffId: params.handoffId,
          accessContext
        },
        repository
      );
      const response: GitCicdHandoffResponse = {
        handoff: toGitCicdHandoff(handoff)
      };

      return reply.status(200).send(response);
    } catch (error) {
      return handleGitCicdHandoffError(error, reply);
    }
  });

  app.patch("/git-cicd-handoffs/:handoffId/status", async (request, reply) => {
    const params = handoffParamsSchema.parse(request.params);
    const body = updateGitCicdHandoffStatusBodySchema.parse(request.body);
    const { accessContext, repository } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const handoff = await updateGitCicdHandoffStatus(
        {
          handoffId: params.handoffId,
          accessContext,
          status: body.status,
          pullRequestUrl: body.pullRequestUrl,
          pipelineRunUrl: body.pipelineRunUrl,
          statusMessage: body.statusMessage
        },
        repository
      );
      const response: GitCicdHandoffResponse = {
        handoff: toGitCicdHandoff(handoff)
      };

      return reply.status(200).send(response);
    } catch (error) {
      return handleGitCicdHandoffError(error, reply);
    }
  });
}

function toGitCicdHandoff(row: GitCicdHandoffRecord): GitCicdHandoff {
  return {
    id: row.id,
    projectId: row.projectId,
    architectureId: row.architectureId,
    terraformArtifactId: row.terraformArtifactId,
    sourceRepositoryId: row.sourceRepositoryId,
    repositoryProvider: row.repositoryProvider,
    repositoryOwner: row.repositoryOwner,
    repositoryName: row.repositoryName,
    targetBranch: row.targetBranch,
    sourceBranch: row.sourceBranch,
    commitMessage: row.commitMessage,
    pullRequestTitle: row.pullRequestTitle,
    pullRequestUrl: row.pullRequestUrl,
    pipelineRunUrl: row.pipelineRunUrl,
    status: row.status,
    statusMessage: row.statusMessage,
    userAcceptedChangeId: row.userAcceptedChangeId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function getGitCicdHandoffRequestContext(
  request: FastifyRequest,
  options: GitCicdHandoffRouteOptions | undefined,
  getGitCicdDatabaseClient: () => DatabaseClient
): Promise<GitCicdHandoffRequestContext> {
  const client = getGitCicdDatabaseClient();
  const currentUserId = await requireActiveUserId(request, () => client);

  return {
    accessContext: {
      kind: "user",
      userId: currentUserId
    },
    repository:
      options?.createGitCicdHandoffRepository?.(client.db) ??
      createPostgresGitCicdHandoffRepository(client.db),
    provider: options?.gitCicdHandoffProvider ?? createInternalGitCicdHandoffProvider()
  };
}

function handleGitCicdHandoffError(error: unknown, reply: FastifyReply) {
  if (error instanceof GitCicdHandoffNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error.message
    });
  }

  if (error instanceof GitCicdHandoffInvalidStatusTransitionError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  if (error instanceof GitCicdHandoffProviderMismatchError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  throw error;
}
