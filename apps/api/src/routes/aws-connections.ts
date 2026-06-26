import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import { requireSketchCatchAwsCallerPrincipalArn } from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  AwsConnectionNotFoundError,
  AwsConnectionVerificationError,
  createAwsConnection,
  createPostgresAwsConnectionRepository,
  verifyAwsConnection,
  type AwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
import {
  AwsConnectionTestError,
  createAwsConnectionTester,
  type AwsConnectionTester
} from "../aws-connections/aws-connection-test-service.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";

const awsRegionSchema = z.literal("ap-northeast-2");
const awsRoleArnSchema = z
  .string()
  .trim()
  .regex(/^arn:aws(?:-[a-z]+)?:iam::\d{12}:role\/[\w+=,.@/-]+$/);

const createAwsConnectionParamsSchema = z.object({
  projectId: z.uuid()
});

const verifyAwsConnectionParamsSchema = z.object({
  projectId: z.uuid(),
  connectionId: z.uuid()
});

const createAwsConnectionBodySchema = z.object({
  region: awsRegionSchema
});

const testAwsConnectionBodySchema = z.object({
  roleArn: awsRoleArnSchema,
  externalId: z.string().trim().min(2).max(1224),
  region: awsRegionSchema
});

const verifyAwsConnectionBodySchema = z.object({
  roleArn: awsRoleArnSchema
});

export type AwsConnectionRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createAwsConnectionRepository?: (db: DatabaseClient["db"]) => AwsConnectionRepository;
  awsConnectionConfig?: {
    callerPrincipalArn: string;
  };
  awsConnectionTester?: AwsConnectionTester;
  generateAwsConnectionId?: () => string;
  generateAwsExternalId?: () => string;
  now?: () => Date;
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

  app.post("/aws/connections/test", async (request, reply) => {
    const body = testAwsConnectionBodySchema.parse(request.body);
    const client = getAwsConnectionDatabaseClient();
    await requireActiveUserId(request, () => client);
    const tester = options?.awsConnectionTester ?? createAwsConnectionTester();

    try {
      const result = await tester.testConnection(body);

      return reply.status(200).send(result);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.post(
    "/projects/:projectId/aws-connections/:connectionId/verify",
    async (request, reply) => {
      const params = verifyAwsConnectionParamsSchema.parse(request.params);
      const body = verifyAwsConnectionBodySchema.parse(request.body);
      const client = getAwsConnectionDatabaseClient();
      const currentUserId = await requireActiveUserId(request, () => client);
      const repository =
        options?.createAwsConnectionRepository?.(client.db) ??
        createPostgresAwsConnectionRepository(client.db);
      const tester = options?.awsConnectionTester ?? createAwsConnectionTester();

      try {
        const verifyOptions: {
          now?: () => Date;
        } = {};

        if (options?.now) {
          verifyOptions.now = options.now;
        }

        const result = await verifyAwsConnection(
          {
            projectId: params.projectId,
            connectionId: params.connectionId,
            accessContext: createUserProjectAccessContext(currentUserId),
            roleArn: body.roleArn
          },
          repository,
          tester,
          verifyOptions
        );

        return reply.status(200).send(result);
      } catch (error) {
        return handleAwsConnectionError(error, reply);
      }
    }
  );
}

function handleAwsConnectionError(error: unknown, reply: FastifyReply) {
  if (error instanceof AwsConnectionNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error.message
    });
  }

  if (error instanceof AwsConnectionTestError) {
    return reply.status(400).send({
      error: "bad_request",
      message: error.message
    });
  }

  if (error instanceof AwsConnectionVerificationError) {
    return reply.status(400).send({
      error: "bad_request",
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
