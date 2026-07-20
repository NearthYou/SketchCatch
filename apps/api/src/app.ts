import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorCode } from "@sketchcatch/types";
import { startRefreshTokenCleanupJob } from "./auth/cleanup.js";
import { type DatabaseClient, getDatabaseClient } from "./db/client.js";
import { registerAiRoutes, type AiRouteOptions } from "./routes/ai.js";
import type { CostPricingRateProvider } from "./services/cost-analysis.js";
import type { CostUsageAnalysisProvider } from "./services/cost-usage-analysis.js";
import type { CreateLlmExplanation } from "./services/aiLlmExplanation.js";
import type { CreateSafetyFindingExplanation } from "./services/aiSafetyFindingExplanation.js";
import { registerHealthRoutes } from "./routes/health.js";
import { maskDeploymentMessage } from "./deployments/log-masking.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerProjectRoutes } from "./routes/projects.js";
import {
  registerProjectReleaseLedgerRoutes,
  type ProjectReleaseLedgerRouteOptions
} from "./routes/project-release-ledger.js";
import type { ProjectAssetStorage } from "./projects/project-asset-storage.js";
import {
  registerSourceRepositoryRoutes,
  type SourceRepositoryRouteOptions
} from "./routes/source-repositories.js";
import {
  registerRepositoryAnalysisRecordRoutes,
  type RepositoryAnalysisRecordRouteOptions
} from "./routes/repository-analysis-records.js";
import {
  registerProjectDeliveryProfileRoutes,
  type ProjectDeliveryProfileRouteOptions
} from "./routes/project-delivery-profile.js";
import { registerDeploymentRoutes } from "./routes/deployments.js";
import { registerLiveObservationV2Routes } from "./routes/live-observations-v2.js";
import { registerLiveObservationPublicCollectorRoutes } from "./routes/live-observation-public-collector.js";
import { registerGitCicdHandoffRoutes } from "./routes/git-cicd-handoffs.js";
import { registerGitCicdReadinessRoutes } from "./routes/git-cicd-readiness.js";
import {
  registerGitHubReleaseRunRoutes,
  type GitHubReleaseRunRouteOptions
} from "./routes/git-cicd-release-runs.js";
import {
  registerGitHubInfrastructureRunRoutes,
  type GitHubInfrastructureRunRouteOptions
} from "./routes/git-cicd-infrastructure-runs.js";
import { registerCostRoutes } from "./routes/costs.js";
import {
  registerNotificationRoutes,
  type NotificationRouteOptions
} from "./routes/notifications.js";
import {
  createDelegatingGitCicdHandoffProvider,
  createGitHubGitCicdHandoffProvider
} from "./git-cicd/git-cicd-handoff-service.js";
import { createGitHubAppGitProvider } from "./git-cicd/github-app-git-provider.js";
import { createGitHubActionsPipelineStatusProvider } from "./git-cicd/github-actions-pipeline-status-provider.js";
import { createGitHubActionsRunProvider } from "./git-cicd/github-actions-run-provider.js";
import {
  getRuntimeEnv,
  isLiveObservationEnabled,
  requireGitHubAppConfig,
  requireLiveObservationCapabilityKeyring,
  type RuntimeEnv
} from "./config/env.js";
import { createGitHubAppClient } from "./source-repositories/github-app-client.js";
import { registerTerraformRoutes, type TerraformRouteOptions } from "./routes/terraform.js";
import { registerAwsConnectionRoutes } from "./routes/aws-connections.js";
import {
  registerAwsImportAccessRoutes,
  type AwsImportAccessRouteOptions
} from "./routes/aws-import-access.js";
import {
  registerProjectBuildEnvironmentRoutes,
  type ProjectBuildEnvironmentRouteOptions
} from "./routes/project-build-environments.js";
import {
  registerReverseEngineeringRoutes,
  type ReverseEngineeringRouteOptions
} from "./routes/reverse-engineering.js";
import type { ProjectDeletionStorage } from "./projects/project-deletion-service.js";
import {
  createInMemoryRateLimiter,
  type RateLimiter
} from "./rate-limit/in-memory-rate-limiter.js";
import { createRuntimeCacheFromEnv, type RuntimeCache } from "./runtime-cache/index.js";
import {
  createLiveObservationV2Runtime,
  type LiveObservationV2Runtime
} from "./live-observations/live-observation-v2-runtime.js";
import { createDeploymentNotificationRuntime } from "./notifications/notification-runtime.js";
import { startNotificationOutboxJob } from "./notifications/notification-outbox-job.js";

const allowedCorsOrigins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const corsAllowedMethods = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const fallbackCorsAllowedHeaders = "content-type,authorization";
const sensitiveHeaderRedactionPaths = [
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  "request.headers.authorization",
  "request.headers.cookie",
  'request.headers["set-cookie"]',
  "res.headers.authorization",
  "res.headers.cookie",
  'res.headers["set-cookie"]',
  "response.headers.authorization",
  "response.headers.cookie",
  'response.headers["set-cookie"]'
];

export function createApiLoggerOptions(
  options: {
    nodeEnv?: string | undefined;
    stream?: { write(message: string): void } | undefined;
  } = {}
) {
  if ((options.nodeEnv ?? process.env.NODE_ENV) === "test") {
    return false;
  }

  return {
    redact: {
      censor: "[REDACTED]",
      paths: [...sensitiveHeaderRedactionPaths]
    },
    ...(options.stream === undefined ? {} : { stream: options.stream })
  };
}

export type BuildAppOptions = {
  getDatabaseClient?: () => DatabaseClient;
  analyzePreDeploymentCheck?: AiRouteOptions["analyzePreDeploymentCheck"];
  createArchitectureDraftResponse?: AiRouteOptions["createArchitectureDraftResponse"];
  createLlmExplanation?: CreateLlmExplanation;
  createSafetyFindingExplanation?: CreateSafetyFindingExplanation;
  safetyExplanationTimeoutMs?: AiRouteOptions["safetyExplanationTimeoutMs"];
  pricingRateProvider?: CostPricingRateProvider;
  costUsageProvider?: CostUsageAnalysisProvider;
  oauthCallbackRateLimiter?: RateLimiter;
  oauthStartRateLimiter?: RateLimiter;
  passwordResetRequestEmailRateLimiter?: RateLimiter;
  passwordResetRequestIpRateLimiter?: RateLimiter;
  projectAssetStorage?: ProjectAssetStorage;
  projectDeletionStorage?: ProjectDeletionStorage;
  projectReleaseLedgerRoutes?: Pick<ProjectReleaseLedgerRouteOptions, "createRepository">;
  projectBuildEnvironmentRoutes?: Pick<
    ProjectBuildEnvironmentRouteOptions,
    "createRepository" | "gateway" | "generateId" | "now"
  >;
  gitHubReleaseRunRoutes?: Pick<
    GitHubReleaseRunRouteOptions,
    "repository" | "executor" | "verifyIdentity" | "now" | "generateId"
  >;
  gitHubInfrastructureRunRoutes?: Pick<
    GitHubInfrastructureRunRouteOptions,
    | "repository"
    | "executionLeaseRepository"
    | "githubActionsClient"
    | "verifyIdentity"
    | "now"
    | "generateId"
  >;
  sourceRepositoryRoutes?: Pick<
    SourceRepositoryRouteOptions,
    | "createSourceRepositoryRepository"
    | "githubAppClient"
    | "githubAppSlug"
    | "githubAppStateSecret"
    | "githubRepositoryEvidenceReader"
    | "sourceRepositoryAnalysisRateLimiter"
  >;
  repositoryAnalysisRecordRoutes?: Pick<RepositoryAnalysisRecordRouteOptions, "createService">;
  projectDeliveryProfileRoutes?: Pick<ProjectDeliveryProfileRouteOptions, "getProfile">;
  runtimeCache?: RuntimeCache;
  runtimeEnv?: RuntimeEnv;
  liveObservationV2Runtime?: LiveObservationV2Runtime;
  notificationRoutes?: Pick<
    NotificationRouteOptions,
    "createService" | "pushConfig" | "requireUserId"
  >;
  validateTerraformPreviewCode?: TerraformRouteOptions["validateTerraformPreviewCode"];
  reverseEngineeringServiceOptions?: ReverseEngineeringRouteOptions["serviceOptions"];
  awsImportAccessRoutes?: Pick<AwsImportAccessRouteOptions, "createService">;
};

// 테스트와 서버가 같은 앱을 쓰되, LLM 호출 계층은 옵션으로만 주입합니다.
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const getAppDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
  const runtimeEnv = options.runtimeEnv ?? getRuntimeEnv();
  const liveObservationEnabled = isLiveObservationEnabled(runtimeEnv);
  const liveObservationKeyring = liveObservationEnabled
    ? requireLiveObservationCapabilityKeyring(runtimeEnv)
    : undefined;
  const oauthStartRateLimiter =
    options.oauthStartRateLimiter ??
    createInMemoryRateLimiter({
      limit: 30,
      windowMs: 5 * 60 * 1000
    });
  const oauthCallbackRateLimiter =
    options.oauthCallbackRateLimiter ??
    createInMemoryRateLimiter({
      limit: 60,
      windowMs: 5 * 60 * 1000
    });
  const passwordResetRequestIpRateLimiter =
    options.passwordResetRequestIpRateLimiter ??
    createInMemoryRateLimiter({
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
  const passwordResetRequestEmailRateLimiter =
    options.passwordResetRequestEmailRateLimiter ??
    createInMemoryRateLimiter({
      limit: 3,
      windowMs: 60 * 60 * 1000
    });
  const app = Fastify({
    logger: createApiLoggerOptions(),
    trustProxy: 1
  });
  const runtimeCache =
    options.runtimeCache ??
    createRuntimeCacheFromEnv({
      env: runtimeEnv,
      onDegraded: (error) => {
        app.log.warn({ error }, "Runtime Cache degraded; continuing with fallback state");
      }
    });
  const liveObservationV2Runtime = liveObservationEnabled
    ? (options.liveObservationV2Runtime ??
      createLiveObservationV2Runtime({
        getDatabaseClient: getAppDatabaseClient,
        keyring: liveObservationKeyring!,
        runtimeCache,
        runtimeEnv
      }))
    : undefined;
  const notificationRuntime = createDeploymentNotificationRuntime({
    getDatabaseClient: getAppDatabaseClient,
    runtimeEnv,
    onDispatchError: ({ outboxId, code }) => {
      app.log.warn({ outboxId, code }, "Web Push delivery will be retried");
    }
  });
  const githubAppClient = createLazyGitHubAppClient();
  const stopRefreshTokenCleanupJob =
    process.env.NODE_ENV === "test"
      ? undefined
      : startRefreshTokenCleanupJob(getAppDatabaseClient, {
          onError: (error) => {
            app.log.error({ error }, "Failed to clean stale refresh tokens");
          }
        });
  const stopNotificationOutboxJob =
    process.env.NODE_ENV === "test" || !notificationRuntime.pushEnabled
      ? undefined
      : startNotificationOutboxJob(notificationRuntime.createService, {
          onError: (error) => {
            app.log.error({ error }, "Notification outbox dispatch failed");
          }
        });

  app.addHook("onClose", async () => {
    stopRefreshTokenCleanupJob?.();
    stopNotificationOutboxJob?.();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "bad_request",
        message: maskDeploymentMessage(error.message)
      });
      return;
    }

    const statusCode = getErrorStatusCode(error);

    if (statusCode >= 500) {
      app.log.error(
        {
          errorMessage: maskDeploymentMessage(getErrorMessage(error)),
          errorName: error instanceof Error ? error.name : "UnknownError",
          ...getErrorCauseLogFields(error),
          method: request.method,
          path: request.url.split("?", 1)[0],
          requestId: request.id
        },
        "API request failed"
      );
    }

    reply.status(statusCode).send({
      error: getErrorCode(statusCode, error),
      message: getResponseErrorMessage(statusCode, error)
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: "not_found",
      message: "Route not found"
    });
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    setCorsHeaders(request, reply);

    if (request.method === "OPTIONS") {
      if (request.url.startsWith("/api/live-observations/public/")) {
        return;
      }

      return reply.status(204).send();
    }
  });

  app.register(registerHealthRoutes);
  app.register(registerAiRoutes, createAiRouteOptions(options, runtimeCache, getAppDatabaseClient));
  app.register(registerAuthRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    passwordResetRequestEmailRateLimiter,
    passwordResetRequestIpRateLimiter
  });
  app.register(registerOAuthRoutes, {
    callbackRateLimiter: oauthCallbackRateLimiter,
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    startRateLimiter: oauthStartRateLimiter
  });
  app.register(registerProjectRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    projectAssetStorage: options.projectAssetStorage,
    projectDeletionStorage: options.projectDeletionStorage
  });
  app.register(registerProjectReleaseLedgerRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    ...options.projectReleaseLedgerRoutes
  });
  app.register(registerNotificationRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    createService: options.notificationRoutes?.createService ?? notificationRuntime.createService,
    pushConfig: options.notificationRoutes?.pushConfig ?? notificationRuntime.pushConfig,
    ...(options.notificationRoutes?.requireUserId
      ? { requireUserId: options.notificationRoutes.requireUserId }
      : {})
  });
  app.register(registerSourceRepositoryRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    ...options.sourceRepositoryRoutes
  });
  app.register(registerRepositoryAnalysisRecordRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    ...options.repositoryAnalysisRecordRoutes
  });
  app.register(registerProjectDeliveryProfileRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    ...options.projectDeliveryProfileRoutes
  });
  app.register(registerDeploymentRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    projectAssetStorage: options.projectAssetStorage,
    runtimeCache
  });
  app.register(
    registerLiveObservationV2Routes,
    liveObservationV2Runtime
      ? {
          prefix: "/api",
          enabled: true,
          liveObservationService: liveObservationV2Runtime.liveObservationService,
          prepareDeploymentManifest: liveObservationV2Runtime.prepareDeploymentManifest,
          requireDeploymentAccess: liveObservationV2Runtime.requireDeploymentAccess,
          refreshObservation: liveObservationV2Runtime.refreshObservation
        }
      : {
          prefix: "/api",
          enabled: false
        }
  );
  if (liveObservationV2Runtime) {
    app.register(registerLiveObservationPublicCollectorRoutes, {
      prefix: "/api",
      collector: liveObservationV2Runtime.collector,
      enabled: true
    });
  }
  app.register(registerGitCicdReadinessRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  app.register(registerGitCicdHandoffRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    gitCicdHandoffProvider: createDelegatingGitCicdHandoffProvider({
      githubProvider: createGitHubGitCicdHandoffProvider(
        createGitHubAppGitProvider({ githubAppClient })
      )
    }),
    gitCicdPipelineStatusProvider: createGitHubActionsPipelineStatusProvider({ githubAppClient }),
    gitCicdRunProvider: createGitHubActionsRunProvider(githubAppClient),
    runtimeCache
  });
  app.register(registerGitHubReleaseRunRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    ...options.gitHubReleaseRunRoutes
  });
  app.register(registerGitHubInfrastructureRunRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    githubActionsClient: githubAppClient,
    ...options.gitHubInfrastructureRunRoutes
  });
  app.register(registerCostRoutes, createCostRouteOptions(options, getAppDatabaseClient));
  app.register(registerTerraformRoutes, createTerraformRouteOptions(options, getAppDatabaseClient));
  app.register(registerAwsConnectionRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  // gg: AWS import-access command는 기존 connection route와 분리된 인증 plugin으로 등록합니다.
  app.register(registerAwsImportAccessRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    ...options.awsImportAccessRoutes
  });
  app.register(registerProjectBuildEnvironmentRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    ...options.projectBuildEnvironmentRoutes
  });
  app.register(registerReverseEngineeringRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    serviceOptions: options.reverseEngineeringServiceOptions
  });

  return app;
}

type SharedGitHubAppClient = ReturnType<typeof createGitHubAppClient>;

function createLazyGitHubAppClient(): SharedGitHubAppClient {
  let client: SharedGitHubAppClient | undefined;
  const getClient = () => {
    if (!client) {
      const config = requireGitHubAppConfig();
      client = createGitHubAppClient({ appId: config.appId, privateKey: config.privateKey });
    }
    return client;
  };
  return new Proxy({} as SharedGitHubAppClient, {
    get(_target, property) {
      return Reflect.get(getClient(), property);
    }
  });
}

// AI route 옵션은 undefined 필드를 넘기지 않게 분리해 exact optional 타입을 지킵니다.
function createAiRouteOptions(
  options: BuildAppOptions,
  runtimeCache: RuntimeCache,
  getDatabaseClient: () => DatabaseClient
): AiRouteOptions & { readonly prefix: "/api" } {
  return {
    prefix: "/api",
    runtimeCache,
    getDatabaseClient,
    ...(options.sourceRepositoryRoutes?.createSourceRepositoryRepository
      ? {
          createSourceRepositoryRepository:
            options.sourceRepositoryRoutes.createSourceRepositoryRepository
        }
      : {}),
    ...(options.analyzePreDeploymentCheck !== undefined
      ? { analyzePreDeploymentCheck: options.analyzePreDeploymentCheck }
      : {}),
    ...(options.createArchitectureDraftResponse !== undefined
      ? { createArchitectureDraftResponse: options.createArchitectureDraftResponse }
      : {}),
    ...(options.createLlmExplanation === undefined
      ? {}
      : { createLlmExplanation: options.createLlmExplanation }),
    ...(options.createSafetyFindingExplanation === undefined
      ? {}
      : { createSafetyFindingExplanation: options.createSafetyFindingExplanation }),
    ...(options.safetyExplanationTimeoutMs === undefined
      ? {}
      : { safetyExplanationTimeoutMs: options.safetyExplanationTimeoutMs }),
    ...(options.pricingRateProvider === undefined
      ? {}
      : { pricingRateProvider: options.pricingRateProvider })
  };
}

function createCostRouteOptions(
  options: BuildAppOptions,
  getDatabaseClient: () => DatabaseClient
): {
  readonly prefix: "/api";
  readonly getDatabaseClient: () => DatabaseClient;
  readonly pricingRateProvider?: CostPricingRateProvider;
  readonly costUsageProvider?: CostUsageAnalysisProvider;
} {
  return {
    prefix: "/api",
    getDatabaseClient,
    ...(options.pricingRateProvider === undefined
      ? {}
      : { pricingRateProvider: options.pricingRateProvider }),
    ...(options.costUsageProvider === undefined
      ? {}
      : { costUsageProvider: options.costUsageProvider })
  };
}

function createTerraformRouteOptions(
  options: BuildAppOptions,
  getDatabaseClient: () => DatabaseClient
): TerraformRouteOptions & { readonly prefix: "/api" } {
  return {
    prefix: "/api",
    getDatabaseClient,
    ...(options.validateTerraformPreviewCode !== undefined
      ? { validateTerraformPreviewCode: options.validateTerraformPreviewCode }
      : {})
  };
}

function setCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  const origin = firstHeaderValue(request.headers.origin);
  const configuredPublicBaseUrl = process.env.SKETCHCATCH_PUBLIC_BASE_URL?.trim();
  const configuredPublicOrigin =
    configuredPublicBaseUrl && URL.canParse(configuredPublicBaseUrl)
      ? new URL(configuredPublicBaseUrl).origin
      : undefined;

  if (
    origin === undefined ||
    (!allowedCorsOrigins.has(origin) && origin !== configuredPublicOrigin)
  ) {
    return;
  }

  const requestedHeaders =
    firstHeaderValue(request.headers["access-control-request-headers"]) ??
    fallbackCorsAllowedHeaders;

  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Credentials", "true");
  reply.header("Access-Control-Allow-Methods", corsAllowedMethods);
  reply.header("Access-Control-Allow-Headers", requestedHeaders);
  reply.header("Vary", "Origin");
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getErrorStatusCode(error: unknown): number {
  if (hasStatusCode(error)) {
    return error.statusCode;
  }

  return 500;
}

function getErrorCode(statusCode: number, error: unknown): ApiErrorCode {
  if (hasErrorCode(error)) {
    return error.errorCode;
  }

  return statusCode >= 500 ? "internal_server_error" : "bad_request";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}
function getErrorCauseLogFields(error: unknown): {
  readonly errorCauseMessage?: string;
  readonly errorCauseName?: string;
  readonly errorCauseRequestId?: string;
  readonly errorCauseStatusCode?: number;
} {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause === undefined) {
    return {};
  }

  const fields: {
    errorCauseMessage: string;
    errorCauseName: string;
    errorCauseRequestId?: string;
    errorCauseStatusCode?: number;
  } = {
    errorCauseMessage: maskDeploymentMessage(getErrorMessage(cause)),
    errorCauseName: cause instanceof Error ? cause.name : "UnknownError"
  };

  if (typeof cause !== "object" || cause === null || !("$metadata" in cause)) {
    return fields;
  }

  const metadata = cause.$metadata;
  if (typeof metadata !== "object" || metadata === null) {
    return fields;
  }

  if ("requestId" in metadata && typeof metadata.requestId === "string") {
    fields.errorCauseRequestId = metadata.requestId;
  }
  if ("httpStatusCode" in metadata && typeof metadata.httpStatusCode === "number") {
    fields.errorCauseStatusCode = metadata.httpStatusCode;
  }

  return fields;
}

function getResponseErrorMessage(statusCode: number, error: unknown): string {
  if (hasExposedMessage(error)) {
    return maskDeploymentMessage(getErrorMessage(error));
  }

  if (statusCode >= 500 && process.env.NODE_ENV === "production") {
    return "Internal server error";
  }

  return maskDeploymentMessage(getErrorMessage(error));
}

function hasExposedMessage(error: unknown): error is { readonly exposeMessage: true } {
  return (
    typeof error === "object" &&
    error !== null &&
    "exposeMessage" in error &&
    error.exposeMessage === true
  );
}

function hasStatusCode(error: unknown): error is { readonly statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  );
}

function hasErrorCode(error: unknown): error is { readonly errorCode: ApiErrorCode } {
  return (
    typeof error === "object" &&
    error !== null &&
    "errorCode" in error &&
    typeof error.errorCode === "string"
  );
}
