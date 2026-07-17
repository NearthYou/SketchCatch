import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { createAwsProjectBuildEnvironmentGateway } from "../build-environments/aws-project-build-environment-gateway.js";
import {
  ProjectBuildEnvironmentError,
  createPostgresProjectBuildEnvironmentRepository,
  deleteProjectBuildEnvironment,
  getProjectBuildEnvironment,
  prepareProjectBuildEnvironment,
  verifyProjectBuildEnvironment,
  type ProjectBuildEnvironmentGateway,
  type ProjectBuildEnvironmentRepository
} from "../build-environments/project-build-environment-service.js";

const paramsSchema = z.object({ projectId: z.uuid() });

export type ProjectBuildEnvironmentRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createRepository?: (db: DatabaseClient["db"]) => ProjectBuildEnvironmentRepository;
  gateway?: ProjectBuildEnvironmentGateway;
  generateId?: () => string;
  now?: () => Date;
};

export async function registerProjectBuildEnvironmentRoutes(
  app: FastifyInstance,
  options: ProjectBuildEnvironmentRouteOptions = {}
): Promise<void> {
  const getClient = options.getDatabaseClient ?? getDatabaseClient;
  const getDependencies = async (request: Parameters<typeof requireActiveUserId>[0]) => {
    const client = getClient();
    const userId = await requireActiveUserId(request, () => client);
    const repository =
      options.createRepository?.(client.db) ??
      createPostgresProjectBuildEnvironmentRepository(client.db);
    return {
      userId,
      repository,
      gateway: options.gateway ?? createAwsProjectBuildEnvironmentGateway()
    };
  };

  app.post("/projects/:projectId/build-environment/prepare", async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const dependencies = await getDependencies(request);
    try {
      const result = await prepareProjectBuildEnvironment(
        { projectId: params.projectId, userId: dependencies.userId },
        dependencies.repository,
        dependencies.gateway,
        {
          ...(options.generateId ? { generateId: options.generateId } : {}),
          ...(options.now ? { now: options.now } : {})
        }
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleProjectBuildEnvironmentError(error, reply);
    }
  });

  app.get("/projects/:projectId/build-environment", async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const dependencies = await getDependencies(request);
    try {
      const result = await getProjectBuildEnvironment(
        { projectId: params.projectId, userId: dependencies.userId },
        dependencies.repository
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleProjectBuildEnvironmentError(error, reply);
    }
  });

  app.post("/projects/:projectId/build-environment/verify", async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const dependencies = await getDependencies(request);
    try {
      const result = await verifyProjectBuildEnvironment(
        { projectId: params.projectId, userId: dependencies.userId },
        dependencies.repository,
        dependencies.gateway,
        options.now ? { now: options.now } : {}
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleProjectBuildEnvironmentError(error, reply);
    }
  });

  app.delete("/projects/:projectId/build-environment", async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const dependencies = await getDependencies(request);
    try {
      await deleteProjectBuildEnvironment(
        { projectId: params.projectId, userId: dependencies.userId },
        dependencies.repository,
        dependencies.gateway
      );
      return reply.status(204).send();
    } catch (error) {
      return handleProjectBuildEnvironmentError(error, reply);
    }
  });
}

function handleProjectBuildEnvironmentError(
  error: unknown,
  reply: FastifyReply
): FastifyReply {
  if (error instanceof ProjectBuildEnvironmentError) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }
  throw error;
}
