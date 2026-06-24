import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { DatabaseClient } from "./db/client.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";

export type BuildAppOptions = {
  getDatabaseClient?: () => DatabaseClient;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test"
  });

  app.setErrorHandler((error, _request, reply) => {
    const typedError = error as { message?: string; statusCode?: number; errorCode?: string };
    const statusCode = error instanceof ZodError ? 400 : (typedError.statusCode ?? 500);
    const errorCode =
      typedError.errorCode ??
      (statusCode >= 500
        ? "internal_server_error"
        : statusCode === 401
          ? "unauthorized"
          : statusCode === 404
            ? "not_found"
            : "bad_request");

    if (statusCode >= 500) {
      app.log.error(error);
    }

    reply.status(statusCode).send({
      error: errorCode,
      message: typedError.message ?? "Unexpected error"
    });
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
