import { z } from "zod";
import type {
  AnalyzeSourceRepositoryResponse,
  GitHubAppExistingInstallationCallbackUrlResponse,
  GitHubAppInstallUrlResponse,
  GitHubInstallationUserAuthorizationUrlResponse,
  ListGitHubInstalledRepositoriesResponse,
  ListGitHubInstallationsResponse,
  ListGitHubInstallationRepositoriesResponse,
  RecommendRepositoryTemplateResponse,
  SourceRepository,
  SourceRepositoryListResponse,
  SourceRepositoryResponse
} from "@sketchcatch/types";
import { REPOSITORY_DEPLOYMENT_TYPES } from "@sketchcatch/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  requireGitHubAppConfig,
  requireGitHubAppUserAuthorizationConfig,
  requireGitHubAppStateSecret
} from "../config/env.js";
import {
  createGitHubAppClient,
  GitHubApiRequestError,
  type GitHubAppClient,
  type GitHubRepositoryEvidenceReader
} from "../source-repositories/github-app-client.js";
import {
  analyzeSourceRepository,
  connectGitHubSourceRepository,
  completeGitHubInstallationUserAuthorization,
  createGitHubAccountInstallUrl,
  createGitHubExistingInstallationCallbackUrl,
  createGitHubInstallUrl,
  createGitHubInstallationUserAuthorization,
  createPostgresSourceRepositoryRepository,
  listGitHubAccountInstallations,
  listGitHubInstalledRepositories,
  listGitHubInstallationRepositories,
  listSourceRepositories,
  recommendSourceRepositoryTemplate,
  SourceRepositoryConflictError,
  SourceRepositoryNotFoundError,
  type SourceRepositoryRecord,
  type SourceRepositoryRepository,
  SourceRepositoryStateError
} from "../source-repositories/source-repository-service.js";
import {
  clearGitHubAppUserAuthorizationCookie,
  readGitHubAppUserAuthorizationCookie,
  setGitHubAppUserAuthorizationCookie,
  verifyGitHubAppUserAuthorization,
  type GitHubAppUserAuthorizationConfig
} from "../source-repositories/github-app-user-authorization.js";
import type { ProjectAccessContext } from "../git-cicd/git-cicd-handoff-service.js";
import {
  createInMemoryRateLimiter,
  type RateLimiter
} from "../rate-limit/in-memory-rate-limiter.js";

const projectParamsSchema = z.object({
  projectId: z.uuid()
});

const projectSourceRepositoryParamsSchema = projectParamsSchema.extend({
  sourceRepositoryId: z.uuid()
});

const githubInstallationSetupStateBodySchema = z
  .object({
    installationId: z.string().trim().min(1).max(128),
    state: z.string().trim().min(1)
  })
  .strict();

const githubUserAuthorizationCallbackQuerySchema = z
  .object({
    code: z.string().trim().min(1).optional(),
    error: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional()
  })
  .passthrough();

const connectGitHubRepositoryBodySchema = z
  .object({
    installationId: z.string().trim().min(1).max(128),
    githubRepositoryId: z.string().trim().min(1).max(128),
    state: z.string().trim().min(1)
  })
  .strict();

const repositoryAnalysisAnswerSchema = z.object({
  questionId: z.string().trim().min(1).max(80),
  value: z.union([z.string().trim().min(1).max(200), z.boolean()])
});

const recommendRepositoryTemplateBodySchema = z
  .object({
    deploymentType: z.enum(REPOSITORY_DEPLOYMENT_TYPES),
    usesCiCd: z.boolean(),
    answers: z.array(repositoryAnalysisAnswerSchema).max(5)
  })
  .strict();

export type SourceRepositoryRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createSourceRepositoryRepository?: (
    db: DatabaseClient["db"]
  ) => SourceRepositoryRepository;
  githubAppClient?: GitHubAppClient;
  githubRepositoryEvidenceReader?: GitHubRepositoryEvidenceReader;
  githubAppSlug?: string;
  githubAppStateSecret?: string;
  githubAppCallbackUrl?: string;
  githubAppUserAuthorizationConfig?: GitHubAppUserAuthorizationConfig;
  githubAppUserAuthorizationFetch?: typeof fetch;
  sourceRepositoryAnalysisRateLimiter?: RateLimiter;
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
  githubRepositoryEvidenceReader: GitHubRepositoryEvidenceReader | null;
};

let cachedDefaultGitHubAppRouteRuntime: GitHubAppRouteRuntime | null = null;
const defaultSourceRepositoryAnalysisRateLimiter = createInMemoryRateLimiter({
  limit: 10,
  windowMs: 60_000
});

// Source Repository 연결과 마지막 Repository Analysis 조회/실행 계약을 등록한다.
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

  app.post(
    "/projects/:projectId/source-repositories/:sourceRepositoryId/analyze",
    async (request, reply) => {
      const params = projectSourceRepositoryParamsSchema.parse(request.params);
      const { accessContext, repository } = await getSourceRepositoryRequestContext(
        request,
        options,
        getSourceRepositoryDatabaseClient
      );
      const rateLimitResult = (
        options?.sourceRepositoryAnalysisRateLimiter ??
        defaultSourceRepositoryAnalysisRateLimiter
      ).consume(`source-repository-analysis:${accessContext.userId}:${params.projectId}`);

      if (!rateLimitResult.allowed) {
        return reply
          .status(429)
          .header("Retry-After", String(rateLimitResult.retryAfterSeconds))
          .send({
            error: "too_many_requests",
            message: "Too many repository analysis requests"
          });
      }

      try {
        const runtime = getGitHubAppRouteRuntime(options);
        const response: AnalyzeSourceRepositoryResponse = await analyzeSourceRepository(
          {
            projectId: params.projectId,
            sourceRepositoryId: params.sourceRepositoryId,
            accessContext
          },
          repository,
          requireGitHubRepositoryEvidenceReader(runtime)
        );

        return reply.status(200).send(response);
      } catch (error) {
        if (error instanceof Error) {
          return handleSourceRepositoryError(error, reply);
        }

        throw error;
      }
    }
  );

  app.post(
    "/projects/:projectId/source-repositories/:sourceRepositoryId/template-recommendation",
    async (request, reply) => {
      const params = projectSourceRepositoryParamsSchema.parse(request.params);
      const body = recommendRepositoryTemplateBodySchema.parse(request.body);
      const { accessContext, repository } = await getSourceRepositoryRequestContext(
        request,
        options,
        getSourceRepositoryDatabaseClient
      );

      try {
        const response: RecommendRepositoryTemplateResponse = await recommendSourceRepositoryTemplate(
          {
            projectId: params.projectId,
            sourceRepositoryId: params.sourceRepositoryId,
            accessContext,
            deploymentType: body.deploymentType,
            usesCiCd: body.usesCiCd,
            answers: body.answers
          },
          repository
        );

        return reply.status(200).send(response);
      } catch (error) {
        return handleSourceRepositoryError(error, reply);
      }
    }
  );

  app.get("/source-repositories/github/installations", async (request, reply) => {
    const { accessContext, repository } = await getSourceRepositoryRequestContext(
      request,
      options,
      getSourceRepositoryDatabaseClient
    );

    try {
      const runtime = getGitHubAppRouteRuntime(options);
      const result = await listGitHubAccountInstallations(
        { accessContext },
        repository,
        runtime.githubAppClient
      );
      const response: ListGitHubInstallationsResponse = result;

      return reply.status(200).send(response);
    } catch (error) {
      return handleSourceRepositoryError(error, reply);
    }
  });

  app.post("/source-repositories/github/install-url", async (request, reply) => {
    const { accessContext } = await getSourceRepositoryRequestContext(
      request,
      options,
      getSourceRepositoryDatabaseClient
    );

    try {
      const runtime = getGitHubAppRouteRuntime(options);
      const result = await createGitHubAccountInstallUrl({
        accessContext,
        appSlug: runtime.appSlug,
        stateSecret: runtime.stateSecret
      });
      const response: GitHubAppInstallUrlResponse = {
        installUrl: result.installUrl,
        expiresAt: result.expiresAt.toISOString()
      };

      return reply.status(201).send(response);
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

  app.post(
    "/source-repositories/github/user-authorization-url",
    async (request, reply) => {
      const body = githubInstallationSetupStateBodySchema.parse(request.body);
      const { accessContext, repository } = await getSourceRepositoryRequestContext(
        request,
        options,
        getSourceRepositoryDatabaseClient
      );

      try {
        const runtime = getGitHubAppRouteRuntime(options);
        const userAuthorizationConfig =
          options?.githubAppUserAuthorizationConfig ??
          requireGitHubAppUserAuthorizationConfig();
        const result = await createGitHubInstallationUserAuthorization(
          {
            installationId: body.installationId,
            setupState: body.state,
            accessContext,
            stateSecret: runtime.stateSecret,
            config: userAuthorizationConfig
          },
          repository
        );
        setGitHubAppUserAuthorizationCookie(
          reply,
          result.cookie,
          runtime.stateSecret
        );
        const response: GitHubInstallationUserAuthorizationUrlResponse = {
          authorizationUrl: result.authorizationUrl,
          expiresAt: result.expiresAt.toISOString()
        };
        return reply.status(201).send(response);
      } catch (error) {
        return handleSourceRepositoryError(error, reply);
      }
    }
  );

  app.get(
    "/source-repositories/github/user-authorization/callback",
    async (request, reply) => {
      const query = githubUserAuthorizationCallbackQuerySchema.parse(request.query);
      const runtime = getGitHubAppRouteRuntime(options);

      try {
        if (query.error || !query.code || !query.state) {
          throw new SourceRepositoryStateError("GIT_APP_USER_AUTHORIZATION_CANCELLED");
        }
        const cookie = readGitHubAppUserAuthorizationCookie(
          request,
          runtime.stateSecret
        );
        if (!cookie) {
          throw new SourceRepositoryStateError("GIT_APP_USER_AUTHORIZATION_INVALID");
        }
        const authorization = await verifyGitHubAppUserAuthorization({
          state: query.state,
          stateSecret: runtime.stateSecret,
          cookie
        });
        const client = getSourceRepositoryDatabaseClient();
        const repository =
          options?.createSourceRepositoryRepository?.(client.db) ??
          createPostgresSourceRepositoryRepository(client.db);
        const accessContext: ProjectAccessContext = {
          kind: "user",
          userId: authorization.userId
        };
        const userAuthorizationConfig =
          options?.githubAppUserAuthorizationConfig ??
          requireGitHubAppUserAuthorizationConfig();
        const result = await completeGitHubInstallationUserAuthorization(
          {
            code: query.code,
            authorizationState: query.state,
            cookie,
            accessContext,
            stateSecret: runtime.stateSecret,
            config: userAuthorizationConfig,
            ...(options?.githubAppUserAuthorizationFetch
              ? { fetcher: options.githubAppUserAuthorizationFetch }
              : {})
          },
          repository
        );
        clearGitHubAppUserAuthorizationCookie(reply);
        const callbackUrl = new URL(runtime.callbackUrl);
        callbackUrl.searchParams.set("installation_id", result.installationId);
        callbackUrl.searchParams.set("state", result.setupState);
        callbackUrl.searchParams.set("authorization", "verified");
        return reply.redirect(callbackUrl.toString());
      } catch (error) {
        clearGitHubAppUserAuthorizationCookie(reply);
        return handleSourceRepositoryError(error, reply);
      }
    }
  );

  app.post("/source-repositories/github/installation-repositories", async (request, reply) => {
    const body = githubInstallationSetupStateBodySchema.parse(request.body);
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

  app.post(
    "/projects/:projectId/source-repositories/github/installed-repositories",
    async (request, reply) => {
      const params = projectParamsSchema.parse(request.params);
      const { accessContext, repository } = await getSourceRepositoryRequestContext(
        request,
        options,
        getSourceRepositoryDatabaseClient
      );

      try {
        const runtime = getGitHubAppRouteRuntime(options);
        const result = await listGitHubInstalledRepositories(
          {
            projectId: params.projectId,
            accessContext,
            stateSecret: runtime.stateSecret
          },
          repository,
          runtime.githubAppClient
        );
        const response: ListGitHubInstalledRepositoriesResponse = {
          projectId: result.projectId,
          state: result.state,
          expiresAt: result.expiresAt.toISOString(),
          repositories: result.repositories
        };

        return reply.status(200).send(response);
      } catch (error) {
        return handleSourceRepositoryError(error, reply);
      }
    }
  );

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

// route별 GitHub App 의존성을 한 runtime으로 묶고 기본 client를 재사용한다.
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
      githubAppClient: options.githubAppClient,
      githubRepositoryEvidenceReader: options.githubRepositoryEvidenceReader ?? null
    };
  }

  if (!cachedDefaultGitHubAppRouteRuntime) {
    const config = requireGitHubAppConfig();
    const githubAppClient = createGitHubAppClient({
      appId: config.appId,
      privateKey: config.privateKey
    });

    cachedDefaultGitHubAppRouteRuntime = {
      appSlug: config.appSlug,
      callbackUrl: config.callbackUrl,
      stateSecret: requireGitHubAppStateSecret(),
      githubAppClient,
      githubRepositoryEvidenceReader: githubAppClient
    };
  }

  return {
    appSlug: options?.githubAppSlug ?? cachedDefaultGitHubAppRouteRuntime.appSlug,
    callbackUrl: options?.githubAppCallbackUrl ?? cachedDefaultGitHubAppRouteRuntime.callbackUrl,
    stateSecret:
      options?.githubAppStateSecret ?? cachedDefaultGitHubAppRouteRuntime.stateSecret,
    githubAppClient:
      options?.githubAppClient ?? cachedDefaultGitHubAppRouteRuntime.githubAppClient,
    githubRepositoryEvidenceReader:
      options?.githubRepositoryEvidenceReader ??
      cachedDefaultGitHubAppRouteRuntime.githubRepositoryEvidenceReader
  };
}

// 분석 route에 정적 evidence reader가 없으면 설정 충돌로 명확히 중단한다.
function requireGitHubRepositoryEvidenceReader(
  runtime: GitHubAppRouteRuntime
): GitHubRepositoryEvidenceReader {
  if (!runtime.githubRepositoryEvidenceReader) {
    throw new SourceRepositoryConflictError("GitHub repository analysis is not configured");
  }

  return runtime.githubRepositoryEvidenceReader;
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

// RDS에 저장된 마지막 Repository Analysis를 SourceRepository 조회 응답에 복원합니다.
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
    analysis:
      row.analysisResult && row.analysisRevision && row.analyzedAt
        ? {
            repositoryRevision: row.analysisRevision,
            analyzedAt: row.analyzedAt.toISOString(),
            aiHandoff: row.analysisResult
          }
        : null,
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

// GitHub App와 Source Repository 내부 오류를 안정적인 사용자 응답 코드로 바꿉니다.
function handleSourceRepositoryError(error: unknown, reply: FastifyReply) {
  if (isSourceRepositorySchemaMismatchError(error)) {
    return reply.status(503).send({
      error: "service_unavailable",
      message: "DATABASE_MIGRATION_REQUIRED"
    });
  }

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

  if (error instanceof GitHubApiRequestError) {
    const message =
      error.statusCode === 401 || error.statusCode === 403
        ? "GIT_APP_AUTHENTICATION_FAILED"
        : "GIT_APP_REPOSITORY_ACCESS_UNAVAILABLE";

    return reply.status(409).send({
      error: "conflict",
      message
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

function isSourceRepositorySchemaMismatchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = getPostgresErrorCode(error);

  return (
    (code === "42P01" || code === "42703") &&
    error.message.startsWith("Failed query:") &&
    error.message.includes('"source_repositories"')
  );
}

function getPostgresErrorCode(error: Error): string | null {
  const cause = error.cause;

  if (hasPostgresErrorCode(cause)) {
    return cause.code;
  }

  if (hasPostgresErrorCode(error)) {
    return error.code;
  }

  return null;
}

function hasPostgresErrorCode(value: unknown): value is { readonly code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { readonly code?: unknown }).code === "string"
  );
}
