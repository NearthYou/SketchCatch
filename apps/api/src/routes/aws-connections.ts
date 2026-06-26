import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import { requireSketchCatchAwsCallerPrincipalArn } from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  AwsConnectionNotFoundError,
  createAwsConnection,
  createPostgresAwsConnectionRepository,
  type AwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";

const createAwsConnectionParamsSchema = z.object({
  projectId: z.uuid()
});

const createAwsConnectionBodySchema = z.object({
  region: z.string().trim().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/)
});

export type AwsConnectionRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createAwsConnectionRepository?: (db: DatabaseClient["db"]) => AwsConnectionRepository;
  awsConnectionConfig?: {
    callerPrincipalArn: string;
  };
  generateAwsConnectionId?: () => string;
  generateAwsExternalId?: () => string;
};

export async function registerAwsConnectionRoutes(
  app: FastifyInstance,
  options?: AwsConnectionRouteOptions
): Promise<void> {
  const getAwsConnectionDatabaseClient = options?.getDatabaseClient ?? getDatabaseClient;

  app.post("/projects/:projectId/aws-connections", async (request, reply) => {
    const params = createAwsConnectionParamsSchema.parse(request.params);
    const body = createAwsConnectionBodySchema.parse(request.body);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);

    try {
      const createOptions: {
        generateId?: () => string;
        generateExternalId?: () => string;
      } = {};

      if (options?.generateAwsConnectionId) {
        createOptions.generateId = options.generateAwsConnectionId;
      }

      if (options?.generateAwsExternalId) {
        createOptions.generateExternalId = options.generateAwsExternalId;
      }

      const result = await createAwsConnection(
        {
          projectId: params.projectId,
          accessContext: createUserProjectAccessContext(currentUserId),
          region: body.region,
          callerPrincipalArn:
            options?.awsConnectionConfig?.callerPrincipalArn ??
            requireSketchCatchAwsCallerPrincipalArn()
        },
        repository,
        createOptions
      );

      return reply.status(201).send(result);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });
}

function handleAwsConnectionError(error: unknown, reply: FastifyReply) {
  if (error instanceof AwsConnectionNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error.message
    });
  }

  throw error;
}

function createUserProjectAccessContext(userId: string): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}
