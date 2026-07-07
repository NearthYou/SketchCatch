import { z } from "zod";
import type {
  GitHubAppExistingInstallationCallbackUrlResponse,
  GitHubAppInstallUrlResponse,
  ListGitHubInstallationRepositoriesResponse,
  SourceRepository,
  SourceRepositoryListResponse,
  SourceRepositoryResponse
} from "@sketchcatch/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  requireGitHubAppConfig,
  requireGitHubAppStateSecret
} from "../config/env.js";
import { createGitHubAppClient, type GitHubAppClient } from "../source-repositories/github-app-client.js";
import {
  connectGitHubSourceRepository,
  createGitHubExistingInstallationCallbackUrl,
  createGitHubInstallUrl,
  createPostgresSourceRepositoryRepository,
  listGitHubInstallationRepositories,
  listSourceRepositories,
  SourceRepositoryConflictError,
  SourceRepositoryNotFoundError,
  type SourceRepositoryRecord,
  type SourceRepositoryRepository,
  SourceRepositoryStateError
} from "../source-repositories/source-repository-service.js";
import type { ProjectAccessContext } from "../git-cicd/git-cicd-handoff-service.js";

const projectParamsSchema = z.object({
  projectId: z.uuid()
});

const projectSourceRepositoryParamsSchema = projectParamsSchema.extend({
  sourceRepositoryId: z.string().trim().min(1).max(128)
});

const listGitHubInstallationRepositoriesBodySchema = z
  .object({
    installationId: z.string().trim().min(1).max(128),
    state: z.string().trim().min(1)
  })
  .strict();

const connectGitHubRepositoryBodySchema = z
  .object({
    installationId: z.string().trim().min(1).max(128),
    githubRepositoryId: z.string().trim().min(1).max(128),
    state: z.string().trim().min(1)
  })
  .strict();

export type SourceRepositoryRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createSourceRepositoryRepository?: (
    db: DatabaseClient["db"]
  ) => SourceRepositoryRepository;
  githubAppClient?: GitHubAppClient;
  githubAppSlug?: string;
  githubAppStateSecret?: string;
  githubAppCallbackUrl?: string;
};

type SourceRepositoryRequestContext = {
  accessContext: ProjectAccessContext;
  repository: SourceRepositoryRepository;
};

type GitHubAppRouteRuntime = {
  appSlug: string;
  callbackUrl: string;
  stateSecret: string;
  githubAppClient: GitHubAppClient;
};

let cachedDefaultGitHubAppRouteRuntime: GitHubAppRouteRuntime | null = null;

export async function registerSourceRepositoryRoutes(
  app: FastifyInstance,
  options?: SourceRepositoryRouteOptions
): Promise<void> {
  const getSourceRepositoryDatabaseClient = options?.getDatabaseClient ?? getDatabaseClient;

  app.get("/projects/:projectId/source-repositories", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const { accessContext, repository } = await getSourceRepositoryRequestContext(
      request,
      options,
      getSourceRepositoryDatabaseClient
    );

    try {
      const repositories = await listSourceRepositories(
        {
          projectId: params.projectId,
          accessContext
        },
        repository
      );
      const response: SourceRepositoryListResponse = {
        repositories: repositories.map(toSourceRepository)
      };

      return reply.status(200).send(response);
    } catch (error) {
      return handleSourceRepositoryError(error, reply);
    }
  });

  app.post("/projects/:projectId/source-repositories/github/install-url", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const { accessContext, repository } = await getSourceRepositoryRequestContext(
      request,
      options,
      getSourceRepositoryDatabaseClient
    );

    try {
      const runtime = getGitHubAppRouteRuntime(options);
      const result = await createGitHubInstallUrl(
        {
          projectId: params.projectId,
          accessContext,
          appSlug: runtime.appSlug,
          stateSecret: runtime.stateSecret
        },
        repository
      );
      const response: GitHubAppInstallUrlResponse = {
        installUrl: result.installUrl,
        expiresAt: result.expiresAt.toISOString()
      };

      return reply.status(201).send(response);
    } catch (error) {
      return handleSourceRepositoryError(error, reply);
    }
  });

  app.post(
    "/projects/:projectId/source-repositories/github/existing-installation-callback-url",
    async (request, reply) => {
      const params = projectParamsSchema.parse(request.params);
      const { accessContext, repository } = await getSourceRepositoryRequestContext(
        request,
        options,
        getSourceRepositoryDatabaseClient
      );

      try {
        const runtime = getGitHubAppRouteRuntime(options);
        const result = await createGitHubExistingInstallationCallbackUrl(
          {
            projectId: params.projectId,
            accessContext,
            callbackUrl: runtime.callbackUrl,
            stateSecret: runtime.stateSecret
          },
          repository
        );
        const response: GitHubAppExistingInstallationCallbackUrlResponse = {
          callbackUrl: result.callbackUrl,
          expiresAt: result.expiresAt.toISOString()
        };

        return reply.status(201).send(response);
      } catch (error) {
        return handleSourceRepositoryError(error, reply);
      }
    }
  );

  app.post(
    "/projects/:projectId/source-repositories/github/:sourceRepositoryId/existing-installation-callback-url",
    async (request, reply) => {
      const params = projectSourceRepositoryParamsSchema.parse(request.params);
      const { accessContext, repository } = await getSourceRepositoryRequestContext(
        request,
        options,
        getSourceRepositoryDatabaseClient
      );

      try {
        const runtime = getGitHubAppRouteRuntime(options);
        const result = await createGitHubExistingInstallationCallbackUrl(
          {
            projectId: params.projectId,
            sourceRepositoryId: params.sourceRepositoryId,
            accessContext,
            callbackUrl: runtime.callbackUrl,
            stateSecret: runtime.stateSecret
          },
          repository
        );
        const response: GitHubAppExistingInstallationCallbackUrlResponse = {
          callbackUrl: result.callbackUrl,
          expiresAt: result.expiresAt.toISOString()
        };

        return reply.status(201).send(response);
      } catch (error) {
        return handleSourceRepositoryError(error, reply);
      }
    }
  );

  app.post("/source-repositories/github/installation-repositories", async (request, reply) => {
    const body = listGitHubInstallationRepositoriesBodySchema.parse(request.body);
    const { accessContext, repository } = await getSourceRepositoryRequestContext(
      request,
      options,
      getSourceRepositoryDatabaseClient
    );

    try {
      const runtime = getGitHubAppRouteRuntime(options);
      const result = await listGitHubInstallationRepositories(
        {
          installationId: body.installationId,
          state: body.state,
          accessContext,
          stateSecret: runtime.stateSecret
        },
        repository,
        runtime.githubAppClient
      );
      const response: ListGitHubInstallationRepositoriesResponse = result;

      return reply.status(200).send(response);
    } catch (error) {
      return handleSourceRepositoryError(error, reply);
    }
  });

  app.post("/projects/:projectId/source-repositories/github", async (request, reply) => {
    const params = projectParamsSchema.parse(request.params);
    const body = connectGitHubRepositoryBodySchema.parse(request.body);
    const { accessContext, repository } = await getSourceRepositoryRequestContext(
      request,
      options,
      getSourceRepositoryDatabaseClient
    );

    try {
      const runtime = getGitHubAppRouteRuntime(options);
      const sourceRepository = await connectGitHubSourceRepository(
        {
          projectId: params.projectId,
          installationId: body.installationId,
          githubRepositoryId: body.githubRepositoryId,
          state: body.state,
          accessContext,
          stateSecret: runtime.stateSecret
        },
        repository,
        runtime.githubAppClient
      );
      const response: SourceRepositoryResponse = {
        repository: toSourceRepository(sourceRepository)
      };

      return reply.status(201).send(response);
    } catch (error) {
      return handleSourceRepositoryError(error, reply);
    }
  });
}

function getGitHubAppRouteRuntime(
  options: SourceRepositoryRouteOptions | undefined
): GitHubAppRouteRuntime {
  if (
    options?.githubAppClient &&
    options.githubAppSlug &&
    options.githubAppStateSecret &&
    options.githubAppCallbackUrl
  ) {
    return {
      appSlug: options.githubAppSlug,
      callbackUrl: options.githubAppCallbackUrl,
      stateSecret: options.githubAppStateSecret,
      githubAppClient: options.githubAppClient
    };
  }

  if (!cachedDefaultGitHubAppRouteRuntime) {
    const config = requireGitHubAppConfig();

    cachedDefaultGitHubAppRouteRuntime = {
      appSlug: config.appSlug,
      callbackUrl: config.callbackUrl,
      stateSecret: requireGitHubAppStateSecret(),
      githubAppClient: createGitHubAppClient({
        appId: config.appId,
        privateKey: config.privateKey
      })
    };
  }

  return {
    appSlug: options?.githubAppSlug ?? cachedDefaultGitHubAppRouteRuntime.appSlug,
    callbackUrl: options?.githubAppCallbackUrl ?? cachedDefaultGitHubAppRouteRuntime.callbackUrl,
    stateSecret:
      options?.githubAppStateSecret ?? cachedDefaultGitHubAppRouteRuntime.stateSecret,
    githubAppClient:
      options?.githubAppClient ?? cachedDefaultGitHubAppRouteRuntime.githubAppClient
  };
}

async function getSourceRepositoryRequestContext(
  request: FastifyRequest,
  options: SourceRepositoryRouteOptions | undefined,
  getSourceRepositoryDatabaseClient: () => DatabaseClient
): Promise<SourceRepositoryRequestContext> {
  const client = getSourceRepositoryDatabaseClient();
  const currentUserId = await requireActiveUserId(request, () => client);

  return {
    accessContext: {
      kind: "user",
      userId: currentUserId
    },
    repository:
      options?.createSourceRepositoryRepository?.(client.db) ??
      createPostgresSourceRepositoryRepository(client.db)
  };
}

function toSourceRepository(row: SourceRepositoryRecord): SourceRepository {
  return {
    id: row.id,
    projectId: row.projectId,
    provider: row.provider,
    status: row.status,
    githubInstallationId: row.githubInstallationId,
    githubRepositoryId: row.githubRepositoryId,
    owner: row.owner,
    name: row.name,
    defaultBranch: row.defaultBranch,
    repositoryUrl: row.repositoryUrl,
    visibility: toSourceRepositoryVisibility(row.visibility),
    archived: row.archived,
    disconnectedAt: row.disconnectedAt ? row.disconnectedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toSourceRepositoryVisibility(
  visibility: string | null
): SourceRepository["visibility"] {
  if (visibility === "public" || visibility === "private" || visibility === "internal") {
    return visibility;
  }

  return null;
}

function handleSourceRepositoryError(error: unknown, reply: FastifyReply) {
  if (error instanceof SourceRepositoryNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error.message
    });
  }

  if (error instanceof SourceRepositoryStateError) {
    return reply.status(400).send({
      error: "bad_request",
      message: error.message
    });
  }

  if (error instanceof SourceRepositoryConflictError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  if (error instanceof Error && error.message.startsWith("GIT_APP_")) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  throw error;
}
