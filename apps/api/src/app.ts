import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorCode, ApiErrorResponse } from "@sketchcatch/types";
import type { DatabaseClient } from "./db/client.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";

type HttpError = Error & {
  statusCode?: number;
  errorCode?: ApiErrorCode;
};

export type BuildAppOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test"
  });

  app.setErrorHandler((error, _request, reply) => {
    const typedError = error as HttpError;
    const statusCode = error instanceof ZodError ? 400 : (typedError.statusCode ?? 500);
    const response: ApiErrorResponse = {
      error: getErrorCode(statusCode, typedError.errorCode),
      message: typedError.message || "Unexpected error"
    };

    if (statusCode >= 500) {
      app.log.error(error);
    }

    reply.status(statusCode).send(response);
  });

  app.setNotFoundHandler((_request, reply) => {
    const response: ApiErrorResponse = {
      error: "not_found",
      message: "Route not found"
    };

    return reply.status(404).send(response);
  });

  app.register(registerHealthRoutes);
  app.register(registerAuthRoutes, {
    prefix: "/api",
    getDatabaseClient: options.getDatabaseClient
  });
  app.register(registerProjectRoutes, {
    prefix: "/api",
    getDatabaseClient: options.getDatabaseClient
  });

  return app;
}

function getErrorCode(statusCode: number, explicitErrorCode?: ApiErrorCode): ApiErrorCode {
  if (explicitErrorCode) {
    return explicitErrorCode;
  }

  if (statusCode >= 500) {
    return "internal_server_error";
  }

  return (
    {
      400: "bad_request",
      401: "unauthorized",
      404: "not_found",
      409: "conflict",
      429: "too_many_requests"
    } satisfies Partial<Record<number, ApiErrorCode>>
  )[statusCode] ?? "bad_request";
}
