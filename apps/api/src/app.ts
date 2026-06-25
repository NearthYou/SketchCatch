import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { registerAiRoutes } from "./routes/ai.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerDeploymentRoutes } from "./routes/deployments.js";

const allowedCorsOrigins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
const corsAllowedMethods = "GET,POST,OPTIONS";
const fallbackCorsAllowedHeaders = "content-type";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test"
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
      error: statusCode >= 500 ? "internal_server_error" : "bad_request",
      message: getErrorMessage(error)
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
  app.register(registerProjectRoutes, { prefix: "/api" });
  app.register(registerDeploymentRoutes, { prefix: "/api" });

  return app;
}

function setCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  const origin = firstHeaderValue(request.headers.origin);

  if (origin === undefined || !allowedCorsOrigins.has(origin)) {
    return;
  }

  const requestedHeaders =
    firstHeaderValue(request.headers["access-control-request-headers"]) ?? fallbackCorsAllowedHeaders;

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
