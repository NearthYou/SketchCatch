import Fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerDeploymentRoutes } from "./routes/deployments.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test"
  });

  app.setErrorHandler((error, _request, reply) => {
    const typedError = error as { message?: string; statusCode?: number };
    const statusCode = typedError.statusCode ?? 500;

    if (statusCode >= 500) {
      app.log.error(error);
    }

    reply.status(statusCode).send({
      error: statusCode >= 500 ? "internal_server_error" : "bad_request",
      message: typedError.message ?? "Unexpected error"
    });
  });

  app.register(registerHealthRoutes);
  app.register(registerProjectRoutes, { prefix: "/api" });
  app.register(registerDeploymentRoutes, { prefix: "/api" });

  return app;
}
