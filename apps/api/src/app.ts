import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorCode } from "@sketchcatch/types";
import { startRefreshTokenCleanupJob } from "./auth/cleanup.js";
import { type DatabaseClient, getDatabaseClient } from "./db/client.js";
import { registerAiRoutes } from "./routes/ai.js";
import type { CreateLlmExplanation } from "./services/aiLlmExplanation.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerDeploymentRoutes } from "./routes/deployments.js";
import { registerTerraformRoutes } from "./routes/terraform.js";
import { registerAwsConnectionRoutes } from "./routes/aws-connections.js";
import {
  createInMemoryRateLimiter,
  type RateLimiter
} from "./rate-limit/in-memory-rate-limiter.js";

const allowedCorsOrigins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const corsAllowedMethods = "GET,POST,PUT,DELETE,OPTIONS";
const fallbackCorsAllowedHeaders = "content-type,authorization";

export type BuildAppOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createLlmExplanation?: CreateLlmExplanation;
  oauthCallbackRateLimiter?: RateLimiter;
  oauthStartRateLimiter?: RateLimiter;
};

// 테스트와 서버가 같은 앱을 쓰되, LLM 호출 계층은 옵션으로만 주입합니다.
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const getAppDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
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
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    trustProxy: true
  });
  const stopRefreshTokenCleanupJob =
    process.env.NODE_ENV === "test"
      ? undefined
      : startRefreshTokenCleanupJob(getAppDatabaseClient, {
          onError: (error) => {
            app.log.error({ error }, "Failed to clean stale refresh tokens");
          }
        });

  app.addHook("onClose", async () => {
    stopRefreshTokenCleanupJob?.();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "bad_request",
        message: error.message
      });
      return;
    }

    const statusCode = getErrorStatusCode(error);

    if (statusCode >= 500) {
      app.log.error(error instanceof Error ? error : getErrorMessage(error));
    }

    reply.status(statusCode).send({
      error: getErrorCode(statusCode, error),
      message: getErrorMessage(error)
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: "not_found",
      message: "Route not found"
    });
  });

  app.addHook("onRequest", async (request, reply) => {
    setCorsHeaders(request, reply);

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.register(registerHealthRoutes);
  app.register(registerAiRoutes, createAiRouteOptions(options));
  app.register(registerAuthRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  app.register(registerOAuthRoutes, {
    callbackRateLimiter: oauthCallbackRateLimiter,
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient,
    startRateLimiter: oauthStartRateLimiter
  });
  app.register(registerProjectRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  app.register(registerDeploymentRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  app.register(registerTerraformRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  app.register(registerAwsConnectionRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });

  return app;
}

// AI route 옵션은 undefined 필드를 넘기지 않게 분리해 exact optional 타입을 지킵니다.
function createAiRouteOptions(options: BuildAppOptions): { readonly prefix: "/api"; readonly createLlmExplanation?: CreateLlmExplanation } {
  if (options.createLlmExplanation === undefined) {
    return { prefix: "/api" };
  }

  return {
    prefix: "/api",
    createLlmExplanation: options.createLlmExplanation
  };
}

function setCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  const origin = firstHeaderValue(request.headers.origin);

  if (origin === undefined || !allowedCorsOrigins.has(origin)) {
    return;
  }

  const requestedHeaders =
    firstHeaderValue(request.headers["access-control-request-headers"]) ??
    fallbackCorsAllowedHeaders;

  reply.header("Access-Control-Allow-Origin", origin);
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
