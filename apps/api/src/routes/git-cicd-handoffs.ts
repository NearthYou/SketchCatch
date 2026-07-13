import { z } from "zod";
import type {
  GitCicdAwsRoleDiffApplyResponse,
  GitCicdGitHubOAuthStartResponse,
  GitCicdHandoff,
  GitCicdHandoffListResponse,
  GitCicdHandoffPipelineStatus,
  GitCicdHandoffPipelineStatusResponse,
  GitCicdHandoffResponse,
  GitCicdMonitoringConfig,
  GitCicdMonitoringConfigResponse,
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
  GitCicdHandoffProviderConflictError,
  GitCicdHandoffProviderPermissionError,
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
import {
  applyGitHubOAuthRepositorySettings,
  completeGitHubRepositorySettingsOAuthCallback,
  createGitHubRepositorySettingsOAuthStart
} from "../git-cicd/github-oauth-repository-settings.js";
import type { GitCicdPipelineStatusProvider } from "../git-cicd/github-actions-pipeline-status-provider.js";
import {
  createGitHubMonitoringProviderFromEnv,
  createPostgresGitCicdMonitoringRepository,
  getGitCicdMonitoringConfig,
  GitCicdMonitoringNotFoundError,
  GitCicdMonitoringValidationError,
  updateGitCicdMonitoringConfig,
  type GitCicdMonitoringConfigRecord,
  type GitCicdMonitoringProvider,
  type GitCicdMonitoringRepository
} from "../git-cicd/git-cicd-monitoring-service.js";
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

const githubOAuthCallbackQuerySchema = z
  .object({
    code: z.string().trim().min(1).optional(),
    error: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional()
  })
  .passthrough();

const branchSchema = z.string().trim().min(1).max(255);

const monitoringParamsSchema = z
  .object({
    projectId: z.uuid(),
    sourceRepositoryId: z.string().trim().min(1).max(128)
  })
  .strict();

const monitoredPathSchema = z
  .object({
    mode: z.enum(["repository_root", "subdirectory"]),
    path: z.string().trim().max(1024)
  })
  .strict();

const updateMonitoringBodySchema = z
  .object({
    enabled: z.boolean(),
    monitorBranch: branchSchema,
    appPath: monitoredPathSchema,
    infraPath: monitoredPathSchema,
    userAcceptedChangeId: z.string().trim().min(1).max(128)
  })
  .strict();

const createGitCicdHandoffBodySchema = z
  .object({
    architectureId: z.uuid(),
    terraformArtifactId: z.uuid(),
    handoffKind: z.enum(["terraform_iac", "static_site"]).default("terraform_iac"),
    sourceDeploymentId: z.uuid(),
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
  createGitCicdMonitoringRepository?: (
    db: DatabaseClient["db"]
  ) => GitCicdMonitoringRepository;
  gitCicdMonitoringProvider?: GitCicdMonitoringProvider;
  gitCicdHandoffProvider?: GitCicdHandoffProvider;
  gitCicdPipelineStatusProvider?: GitCicdPipelineStatusProvider;
  gitCicdRepositorySettingsApplier?: GitCicdRepositorySettingsApplier;
  createGitHubOAuthRepositorySettingsApplier?: (
    accessToken: string
  ) => GitCicdRepositorySettingsApplier;
  githubOAuthFetch?: typeof fetch;
  awsRoleDiffGateway?: AwsRoleDiffGateway;
  runtimeCache?: RuntimeCache;
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
  const runtimeCache = options?.runtimeCache ?? createRuntimeCacheFromEnv();

  app.get(
    "/projects/:projectId/source-repositories/:sourceRepositoryId/cicd-monitoring",
    async (request, reply) => {
      const params = monitoringParamsSchema.parse(request.params);
      const client = getGitCicdDatabaseClient();
      const accessContext = {
        kind: "user",
        userId: await requireActiveUserId(request, () => client)
      } as const;
      const repository =
        options?.createGitCicdMonitoringRepository?.(client.db) ??
        createPostgresGitCicdMonitoringRepository(client.db);

      try {
        const config = await getGitCicdMonitoringConfig(
          { ...params, accessContext },
          repository
        );
        const response: GitCicdMonitoringConfigResponse = {
          config: toGitCicdMonitoringConfig(config)
        };
        return reply.status(200).send(response);
      } catch (error) {
        return handleGitCicdMonitoringError(error, reply);
      }
    }
  );

  app.put(
    "/projects/:projectId/source-repositories/:sourceRepositoryId/cicd-monitoring",
    async (request, reply) => {
      const params = monitoringParamsSchema.parse(request.params);
      const body = updateMonitoringBodySchema.parse(request.body);
      const client = getGitCicdDatabaseClient();
      const accessContext = {
        kind: "user",
        userId: await requireActiveUserId(request, () => client)
      } as const;
      const repository =
        options?.createGitCicdMonitoringRepository?.(client.db) ??
        createPostgresGitCicdMonitoringRepository(client.db);
      const provider =
        options?.gitCicdMonitoringProvider ?? createGitHubMonitoringProviderFromEnv();

      try {
        const config = await updateGitCicdMonitoringConfig(
          { ...params, ...body, accessContext },
          repository,
          provider
        );
        const response: GitCicdMonitoringConfigResponse = {
          config: toGitCicdMonitoringConfig(config)
        };
        return reply.status(200).send(response);
      } catch (error) {
        return handleGitCicdMonitoringError(error, reply);
      }
    }
  );

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

  app.post("/git-cicd-handoffs/:handoffId/github-oauth/start", async (request, reply) => {
    const params = handoffParamsSchema.parse(request.params);
    const { accessContext, repository } = await getGitCicdHandoffRequestContext(
      request,
      options,
      getGitCicdDatabaseClient
    );

    try {
      const response: GitCicdGitHubOAuthStartResponse =
        await createGitHubRepositorySettingsOAuthStart(
          {
            handoffId: params.handoffId,
            accessContext
          },
          repository,
          runtimeCache
        );

      return reply.status(201).send(response);
    } catch (error) {
      return handleGitCicdHandoffError(error, reply);
    }
  });

  app.get("/git-cicd-handoffs/github-oauth/callback", async (request, reply) => {
    const query = githubOAuthCallbackQuerySchema.parse(request.query);

    if (query.error || !query.code || !query.state) {
      request.log.error(
        {
          oauthError: query.error,
          hasCode: Boolean(query.code),
          hasState: Boolean(query.state)
        },
        "GitHub OAuth callback query error or missing parameters"
      );

      return reply.redirect("/workspace?gitCicdGitHubOAuth=failed");
    }

    try {
      await completeGitHubRepositorySettingsOAuthCallback({
        code: query.code,
        state: query.state,
        runtimeCache,
        ...(options?.githubOAuthFetch ? { fetcher: options.githubOAuthFetch } : {})
      });

      return reply.redirect("/workspace?gitCicdGitHubOAuth=ready");
    } catch (error) {
      request.log.error(error, "GitHub OAuth callback failed");

      return reply.redirect("/workspace?gitCicdGitHubOAuth=failed");
    }
  });

  app.post(
    "/git-cicd-handoffs/:handoffId/repository-settings/apply-with-github-oauth",
    async (request, reply) => {
      const params = handoffParamsSchema.parse(request.params);
      const { accessContext, repository } = await getGitCicdHandoffRequestContext(
        request,
        options,
        getGitCicdDatabaseClient
      );

      try {
        const response: GitCicdRepositorySettingsApplyResponse =
          await applyGitHubOAuthRepositorySettings(
            {
              handoffId: params.handoffId,
              accessContext,
              runtimeCache,
              ...(options?.createGitHubOAuthRepositorySettingsApplier
                ? { createApplier: options.createGitHubOAuthRepositorySettingsApplier }
                : {})
            },
            repository
          );

        return reply.status(200).send(response);
      } catch (error) {
        return handleGitCicdHandoffError(error, reply);
      }
    }
  );

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

  if (error instanceof GitCicdHandoffProviderConflictError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  if (error instanceof GitCicdHandoffProviderPermissionError) {
    return reply.status(409).send({
      error: "github_oauth_required",
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

function handleGitCicdMonitoringError(error: unknown, reply: FastifyReply) {
  if (error instanceof GitCicdMonitoringNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error.message
    });
  }
  if (error instanceof GitCicdMonitoringValidationError) {
    return reply.status(error.code === "GITHUB_PERMISSION_REQUIRED" ? 403 : 422).send({
      error: "validation_failed",
      code: error.code,
      message: error.message
    });
  }
  throw error;
}

function toGitCicdMonitoringConfig(
  row: GitCicdMonitoringConfigRecord
): GitCicdMonitoringConfig {
  return {
    sourceRepositoryId: row.sourceRepositoryId,
    enabled: row.enabled,
    monitorBranch: row.monitorBranch,
    appPath: row.appPath,
    infraPath: row.infraPath,
    validationStatus: row.validationStatus,
    validationMessage: row.validationMessage,
    validatedAt: row.validatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}
