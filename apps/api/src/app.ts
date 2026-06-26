import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorCode } from "@sketchcatch/types";
import { startRefreshTokenCleanupJob } from "./auth/cleanup.js";
import { type DatabaseClient, getDatabaseClient } from "./db/client.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerDeploymentRoutes } from "./routes/deployments.js";

const allowedCorsOrigins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const corsAllowedMethods = "GET,POST,PUT,DELETE,OPTIONS";
const fallbackCorsAllowedHeaders = "content-type,authorization";

export type BuildAppOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const getAppDatabaseClient = options.getDatabaseClient ?? getDatabaseClient;
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
  app.register(registerAiRoutes, { prefix: "/api" });
  app.register(registerAuthRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  app.register(registerProjectRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });
  app.register(registerDeploymentRoutes, {
    prefix: "/api",
    getDatabaseClient: getAppDatabaseClient
  });

  return app;
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
