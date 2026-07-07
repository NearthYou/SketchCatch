import { z } from "zod";
import type {
  DeploymentPlanSummary,
  GitCicdAwsRoleDiffApplyResponse,
  GitCicdHandoff,
  GitCicdHandoffListResponse,
  GitCicdHandoffPipelineStatus,
  GitCicdHandoffPipelineStatusResponse,
  GitCicdHandoffResponse,
  GitCicdRepositorySettingsApplyResponse
} from "@sketchcatch/types";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  applyGitCicdAwsRoleDiff,
  AwsRoleDiffApplyError,
  createIamAwsRoleDiffGateway,
  type AwsRoleDiffGateway
} from "../git-cicd/aws-role-diff-apply-service.js";
import {
  readGitCicdPipelineStatusSnapshot,
  toGitCicdPipelineStatusFromRecord,
  writeGitCicdPipelineStatusSnapshot
} from "../git-cicd/git-cicd-handoff-runtime-cache.js";
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
import {
  applyGitCicdRepositorySettings,
  createGitHubRepositorySettingsApplier,
  GitCicdRepositorySettingsPermissionError,
  type GitCicdRepositorySettingsApplier
} from "../git-cicd/git-cicd-repository-settings-service.js";
import type { GitCicdPipelineStatusProvider } from "../git-cicd/github-actions-pipeline-status-provider.js";
import { createRuntimeCacheFromEnv, type RuntimeCache } from "../runtime-cache/index.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const gitCicdHandoffStatusSchema = z.enum([
  "draft",
  "pr_created",
  "pipeline_running",
  "pipeline_success",
  "pipeline_failed",
  "cancelled"
]);
const gitCicdDeploymentModeSchema = z.enum(["terraform_iac", "static_site", "infra_and_app"]);
const gitCicdPipelineDetailStatusSchema = z.enum([
  "not_started",
  "waiting_for_merge",
  "waiting_for_approval",
  "running",
  "success",
  "failed",
  "cancelled"
]);

const projectHandoffParamsSchema = z.object({
  projectId: z.uuid()
});

const handoffParamsSchema = z.object({
  handoffId: z.uuid()
});

const branchSchema = z.string().trim().min(1).max(255);
const terraformSourceLocationSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    line: z.number().int().min(1),
    column: z.number().int().min(1).optional(),
    resourceAddress: z.string().trim().min(1).max(255).optional(),
    terraformBlockType: z.string().trim().min(1).max(64).optional(),
    terraformBlockName: z.string().trim().min(1).max(128).optional()
  })
  .strict();
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
          id: z.string().trim().min(1).max(128),
          level: z.enum(["low", "medium", "high"]),
          category: z
            .enum([
              "cost",
              "security",
              "configuration",
              "permission",
              "network",
              "performance",
              "availability"
            ])
            .optional(),
          source: z.enum([
            "pre_deployment_check",
            "terraform_plan",
            "cost_risk",
            "approval_snapshot"
          ]),
          code: z.enum([
            "PUBLIC_RDS",
            "PUBLIC_SSH",
            "PUBLIC_S3",
            "IAM_WILDCARD",
            "DESTRUCTIVE_CHANGE",
            "UNSUPPORTED_RESOURCE",
            "UNKNOWN_TERRAFORM_ACTION",
            "MISSING_APPROVAL"
          ]),
          message: z.string().trim().min(1).max(500),
          relatedFindingId: z.string().trim().min(1).max(128).optional(),
          relatedResourceId: z.string().trim().min(1).max(128).optional(),
          sourceLocation: terraformSourceLocationSchema.optional(),
          requiresAcknowledgement: z.boolean(),
          blocksApproval: z.boolean()
        })
        .strict()
    )
  })
  .strict();

const createGitCicdHandoffBodySchema = z
  .object({
    architectureId: z.uuid(),
    terraformArtifactId: z.uuid(),
    handoffKind: z.enum(["terraform_iac", "static_site"]).default("terraform_iac"),
    sourceDeploymentId: z.uuid().nullable().optional(),
    deploymentMode: gitCicdDeploymentModeSchema.default("infra_and_app"),
    sourceRepositoryId: z.string().trim().min(1).max(128),
    targetBranch: branchSchema.optional(),
    sourceBranch: branchSchema.optional(),
    commitMessage: z.string().trim().min(1).max(500).optional(),
    pullRequestTitle: z.string().trim().min(1).max(255).optional(),
    environmentName: z.string().trim().min(1).max(128).optional(),
    rdsEnabled: z.boolean().optional(),
    awsRegion: z.string().trim().min(1).max(32).optional(),
    awsRoleArn: z.string().trim().min(1).max(2048).nullable().optional(),
    tfStateBucket: z.string().trim().min(3).max(63).optional(),
    releaseBucket: z.string().trim().min(3).max(63).optional(),
    staticSiteUrl: z.string().url().nullable().optional(),
    apiBaseUrl: z.string().url().nullable().optional(),
    approveAwsRoleDiff: z.boolean().optional(),
    planSummary: deploymentPlanSummarySchema.optional(),
    userAcceptedChangeId: z.string().trim().min(1).max(128)
  })
  .strict();

const updateGitCicdHandoffStatusBodySchema = z
  .object({
    status: gitCicdHandoffStatusSchema,
    pullRequestUrl: z.string().url().nullable().optional(),
    pipelineRunUrl: z.string().url().nullable().optional(),
    pullRequestNumber: z.number().int().positive().nullable().optional(),
    pullRequestHeadSha: z.string().trim().min(1).max(64).nullable().optional(),
    mergeCommitSha: z.string().trim().min(1).max(64).nullable().optional(),
    infraPipelineRunUrl: z.string().url().nullable().optional(),
    infraPipelineStatus: gitCicdPipelineDetailStatusSchema.optional(),
    appPipelineRunUrl: z.string().url().nullable().optional(),
    appPipelineStatus: gitCicdPipelineDetailStatusSchema.optional(),
    destroyPipelineRunUrl: z.string().url().nullable().optional(),
    destroyPipelineStatus: gitCicdPipelineDetailStatusSchema.optional(),
    statusMessage: z.string().trim().min(1).max(500).nullable().optional()
  })
  .strict();

type GitCicdHandoffRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createGitCicdHandoffRepository?: (
    db: DatabaseClient["db"]
  ) => GitCicdHandoffRepository;
  gitCicdHandoffProvider?: GitCicdHandoffProvider;
  gitCicdPipelineStatusProvider?: GitCicdPipelineStatusProvider;
  gitCicdRepositorySettingsApplier?: GitCicdRepositorySettingsApplier;
  awsRoleDiffGateway?: AwsRoleDiffGateway;
  runtimeCache?: RuntimeCache;
};

type GitCicdHandoffRequestContext = {
  accessContext: ProjectAccessContext;
  repository: GitCicdHandoffRepository;
  provider: GitCicdHandoffProvider;
};

type GitCicdHandoffBody = z.infer<typeof createGitCicdHandoffBodySchema>;

function toDeploymentPlanSummary(
  planSummary: GitCicdHandoffBody["planSummary"]
): DeploymentPlanSummary | undefined {
  if (!planSummary) {
    return undefined;
  }

  return {
    ...planSummary,
    warnings: planSummary.warnings.map((warning) => ({
      id: warning.id,
      level: warning.level,
      ...(warning.category !== undefined ? { category: warning.category } : {}),
      source: warning.source,
      code: warning.code,
      message: warning.message,
      ...(warning.relatedFindingId !== undefined ? { relatedFindingId: warning.relatedFindingId } : {}),
      ...(warning.relatedResourceId !== undefined
        ? { relatedResourceId: warning.relatedResourceId }
        : {}),
      ...(warning.sourceLocation !== undefined
        ? {
            sourceLocation: {
              fileName: warning.sourceLocation.fileName,
              line: warning.sourceLocation.line,
              ...(warning.sourceLocation.column !== undefined
                ? { column: warning.sourceLocation.column }
                : {}),
              ...(warning.sourceLocation.resourceAddress !== undefined
                ? { resourceAddress: warning.sourceLocation.resourceAddress }
                : {}),
              ...(warning.sourceLocation.terraformBlockType !== undefined
                ? { terraformBlockType: warning.sourceLocation.terraformBlockType }
                : {}),
              ...(warning.sourceLocation.terraformBlockName !== undefined
                ? { terraformBlockName: warning.sourceLocation.terraformBlockName }
                : {})
            }
          }
        : {}),
      requiresAcknowledgement: warning.requiresAcknowledgement,
      blocksApproval: warning.blocksApproval
    }))
  };
}

export async function registerGitCicdHandoffRoutes(
  app: FastifyInstance,
  options?: GitCicdHandoffRouteOptions
): Promise<void> {
  const getGitCicdDatabaseClient = options?.getDatabaseClient ?? getDatabaseClient;
  const runtimeCache = options?.runtimeCache ?? createRuntimeCacheFromEnv();

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
          handoffKind: body.handoffKind,
          sourceDeploymentId: body.sourceDeploymentId,
          deploymentMode: body.deploymentMode,
          sourceRepositoryId: body.sourceRepositoryId,
          targetBranch: body.targetBranch,
          sourceBranch: body.sourceBranch,
          commitMessage: body.commitMessage,
          pullRequestTitle: body.pullRequestTitle,
          environmentName: body.environmentName,
          rdsEnabled: body.rdsEnabled,
          awsRegion: body.awsRegion,
          awsRoleArn: body.awsRoleArn,
          tfStateBucket: body.tfStateBucket,
          releaseBucket: body.releaseBucket,
          staticSiteUrl: body.staticSiteUrl,
          apiBaseUrl: body.apiBaseUrl,
          approveAwsRoleDiff: body.approveAwsRoleDiff,
          planSummary: toDeploymentPlanSummary(body.planSummary),
          userAcceptedChangeId: body.userAcceptedChangeId
        },
        repository,
        provider
      );
      const response: GitCicdHandoffResponse = {
        handoff: toGitCicdHandoff(handoff)
      };

      await writeGitCicdPipelineStatusSnapshot({ handoff, runtimeCache });

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

  app.get("/git-cicd-handoffs/:handoffId/pipeline-status", async (request, reply) => {
    const params = handoffParamsSchema.parse(request.params);
    const { accessContext, repository } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const pipelineStatus = await getGitCicdPipelineStatus(
        {
          handoffId: params.handoffId,
          accessContext
        },
        repository,
        runtimeCache,
        options?.gitCicdPipelineStatusProvider
      );
      const response: GitCicdHandoffPipelineStatusResponse = {
        pipelineStatus
      };

      return reply.status(200).send(response);
    } catch (error) {
      return handleGitCicdHandoffError(error, reply);
    }
  });

  app.post("/git-cicd-handoffs/:handoffId/repository-settings/apply", async (request, reply) => {
    const params = handoffParamsSchema.parse(request.params);
    const { accessContext, repository } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const response: GitCicdRepositorySettingsApplyResponse =
        await applyGitCicdRepositorySettings(
          {
            handoffId: params.handoffId,
            accessContext
          },
          repository,
          options?.gitCicdRepositorySettingsApplier ?? createGitHubRepositorySettingsApplier()
        );

      return reply.status(200).send(response);
    } catch (error) {
      return handleGitCicdHandoffError(error, reply);
    }
  });

  app.post("/git-cicd-handoffs/:handoffId/aws-role-diff/apply", async (request, reply) => {
    const params = handoffParamsSchema.parse(request.params);
    const { accessContext, repository } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const response: GitCicdAwsRoleDiffApplyResponse = await applyGitCicdAwsRoleDiff(
        {
          handoffId: params.handoffId,
          accessContext
        },
        repository,
        options?.awsRoleDiffGateway ?? createIamAwsRoleDiffGateway()
      );

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
          pullRequestNumber: body.pullRequestNumber,
          pullRequestHeadSha: body.pullRequestHeadSha,
          mergeCommitSha: body.mergeCommitSha,
          infraPipelineRunUrl: body.infraPipelineRunUrl,
          infraPipelineStatus: body.infraPipelineStatus,
          appPipelineRunUrl: body.appPipelineRunUrl,
          appPipelineStatus: body.appPipelineStatus,
          destroyPipelineRunUrl: body.destroyPipelineRunUrl,
          destroyPipelineStatus: body.destroyPipelineStatus,
          statusMessage: body.statusMessage
        },
        repository
      );
      const response: GitCicdHandoffResponse = {
        handoff: toGitCicdHandoff(handoff)
      };

      await writeGitCicdPipelineStatusSnapshot({ handoff, runtimeCache });

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
    handoffKind: row.handoffKind,
    sourceDeploymentId: row.sourceDeploymentId,
    deploymentMode: row.deploymentMode,
    requiresEnvironmentApproval: row.requiresEnvironmentApproval,
    sourceRepositoryId: row.sourceRepositoryId,
    repositoryProvider: row.repositoryProvider,
    repositoryOwner: row.repositoryOwner,
    repositoryName: row.repositoryName,
    targetBranch: row.targetBranch,
    sourceBranch: row.sourceBranch,
    commitMessage: row.commitMessage,
    pullRequestTitle: row.pullRequestTitle,
    pullRequestUrl: row.pullRequestUrl,
    pullRequestNumber: row.pullRequestNumber,
    pullRequestHeadSha: row.pullRequestHeadSha,
    mergeCommitSha: row.mergeCommitSha,
    environmentName: row.environmentName,
    pipelineRunUrl: row.pipelineRunUrl,
    infraPipelineRunUrl: row.infraPipelineRunUrl,
    infraPipelineStatus: row.infraPipelineStatus,
    appPipelineRunUrl: row.appPipelineRunUrl,
    appPipelineStatus: row.appPipelineStatus,
    destroyPipelineRunUrl: row.destroyPipelineRunUrl,
    destroyPipelineStatus: row.destroyPipelineStatus,
    staticSiteUrl: row.staticSiteUrl,
    apiBaseUrl: row.apiBaseUrl,
    repositorySettingsPreview: row.repositorySettingsPreview,
    awsRoleDiff: row.awsRoleDiff,
    githubOAuthRequired: row.githubOAuthRequired,
    status: row.status,
    statusMessage: row.statusMessage,
    userAcceptedChangeId: row.userAcceptedChangeId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function getGitCicdPipelineStatus(
  input: {
    readonly handoffId: string;
    readonly accessContext: ProjectAccessContext;
  },
  repository: GitCicdHandoffRepository,
  runtimeCache: RuntimeCache,
  pipelineStatusProvider: GitCicdPipelineStatusProvider | undefined
): Promise<GitCicdHandoffPipelineStatus> {
  if (!pipelineStatusProvider) {
    return getCachedOrStoredGitCicdPipelineStatus(input, repository, runtimeCache);
  }

  const handoff = await getGitCicdHandoff(input, repository);

  if (pipelineStatusProvider && shouldRefreshGitHubPipelineStatus(handoff)) {
    const sourceRepository = await repository.findSourceRepositoryById(
      handoff.sourceRepositoryId,
      handoff.projectId
    );
    const update =
      sourceRepository !== undefined
        ? await pipelineStatusProvider.refreshPipelineStatus({ handoff, sourceRepository })
        : null;

    if (update) {
      const updatedHandoff = await updateGitCicdHandoffStatus(
        {
          handoffId: handoff.id,
          accessContext: input.accessContext,
          status: update.status,
          pullRequestUrl: update.pullRequestUrl,
          pipelineRunUrl: update.pipelineRunUrl,
          pullRequestNumber: update.pullRequestNumber,
          pullRequestHeadSha: update.pullRequestHeadSha,
          mergeCommitSha: update.mergeCommitSha,
          infraPipelineRunUrl: update.infraPipelineRunUrl,
          infraPipelineStatus: update.infraPipelineStatus,
          appPipelineRunUrl: update.appPipelineRunUrl,
          appPipelineStatus: update.appPipelineStatus,
          destroyPipelineRunUrl: update.destroyPipelineRunUrl,
          destroyPipelineStatus: update.destroyPipelineStatus,
          statusMessage: update.statusMessage
        },
        repository
      );

      await writeGitCicdPipelineStatusSnapshot({ handoff: updatedHandoff, runtimeCache });

      return toGitCicdPipelineStatusFromRecord(updatedHandoff);
    }
  }

  const cachedStatus = await readGitCicdPipelineStatusSnapshot({
    handoffId: input.handoffId,
    runtimeCache
  });

  if (cachedStatus) {
    const project = await repository.findAccessibleProject(
      cachedStatus.projectId,
      input.accessContext
    );

    if (project) {
      return cachedStatus;
    }
  }

  await writeGitCicdPipelineStatusSnapshot({ handoff, runtimeCache });

  return toGitCicdPipelineStatusFromRecord(handoff);
}

async function getCachedOrStoredGitCicdPipelineStatus(
  input: {
    readonly handoffId: string;
    readonly accessContext: ProjectAccessContext;
  },
  repository: GitCicdHandoffRepository,
  runtimeCache: RuntimeCache
): Promise<GitCicdHandoffPipelineStatus> {
  const cachedStatus = await readGitCicdPipelineStatusSnapshot({
    handoffId: input.handoffId,
    runtimeCache
  });

  if (cachedStatus) {
    const project = await repository.findAccessibleProject(
      cachedStatus.projectId,
      input.accessContext
    );

    if (project) {
      return cachedStatus;
    }
  }

  const handoff = await getGitCicdHandoff(input, repository);

  await writeGitCicdPipelineStatusSnapshot({ handoff, runtimeCache });

  return toGitCicdPipelineStatusFromRecord(handoff);
}

function shouldRefreshGitHubPipelineStatus(handoff: GitCicdHandoffRecord): boolean {
  return (
    handoff.repositoryProvider === "github" &&
    (handoff.status === "pr_created" || handoff.status === "pipeline_running")
  );
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

  if (error instanceof GitCicdRepositorySettingsPermissionError) {
    return reply.status(409).send({
      error: "github_oauth_required",
      message: error.message
    });
  }

  if (error instanceof AwsRoleDiffApplyError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  throw error;
}
