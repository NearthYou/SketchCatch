import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import {
  getRuntimeEnv,
  requireCloudFormationTemplateTokenSecret,
  requireSketchCatchAwsCallerPrincipalArn
} from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  AwsConnectionDeleteConflictError,
  AwsConnectionCloudFormationTemplateError,
  AwsConnectionNotFoundError,
  AwsConnectionVerificationError,
  createAwsConnection,
  createPostgresAwsConnectionRepository,
  deleteAwsConnection,
  getAwsConnectionCloudFormationTemplate,
  isRecommendedAwsConnectionRoleArn,
  listAwsConnections,
  recommendedAwsConnectionRoleName,
  renderAwsConnectionCloudFormationTemplateFromToken,
  testStoredAwsConnection,
  verifyAwsConnection,
  verifyAwsConnectionCreatedRole,
  type AwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
import {
  AwsConnectionTestError,
  createAwsConnectionTester,
  type AwsConnectionTester
} from "../aws-connections/aws-connection-test-service.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ProjectAccessContext } from "../deployments/deployment-service.js";
import {
  createInMemoryRateLimiter,
  type RateLimiter
} from "../rate-limit/in-memory-rate-limiter.js";

const awsRegionSchema = z.literal("ap-northeast-2");
const awsRoleArnSchema = z
  .string()
  .trim()
  .max(2048)
  .regex(/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/)
  .refine(isRecommendedAwsConnectionRoleArn, {
    message: `AWS Role ARN must use ${recommendedAwsConnectionRoleName}`
  });

const awsConnectionParamsSchema = z.object({
  connectionId: z.uuid()
});

const cloudFormationTemplateParamsSchema = awsConnectionParamsSchema;

const publicCloudFormationTemplateQuerySchema = z.object({
  token: z.string().trim().min(1).max(4096)
});

const createAwsConnectionBodySchema = z.object({
  region: awsRegionSchema
});

const testAwsConnectionBodySchema = z.object({
  roleArn: awsRoleArnSchema
});

const verifyAwsConnectionBodySchema = z.object({
  roleArn: awsRoleArnSchema
});

const verifyAwsConnectionCreatedRoleBodySchema = z.object({
  accountId: z.string().trim().regex(/^\d{12}$/, {
    message: "AWS account ID must be 12 digits"
  })
});

export type AwsConnectionRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createAwsConnectionRepository?: (db: DatabaseClient["db"]) => AwsConnectionRepository;
  awsConnectionConfig?: {
    callerPrincipalArn: string;
    publicBaseUrl?: string | undefined;
  };
  cloudFormationTemplateTokenSecret?: string;
  awsConnectionTester?: AwsConnectionTester;
  awsConnectionRateLimiter?: RateLimiter;
  generateAwsConnectionId?: () => string;
  generateAwsExternalId?: () => string;
  now?: () => Date;
};

const defaultAwsConnectionRateLimiter = createInMemoryRateLimiter({
  limit: 30,
  windowMs: 60_000
});

export async function registerAwsConnectionRoutes(
  app: FastifyInstance,
  options?: AwsConnectionRouteOptions
): Promise<void> {
  const getAwsConnectionDatabaseClient = options?.getDatabaseClient ?? getDatabaseClient;

  app.get("/aws/connections", async (request, reply) => {
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);

    try {
      const awsConnections = await listAwsConnections(
        {
          accessContext: createUserProjectAccessContext(currentUserId)
        },
        repository
      );

      return reply.status(200).send({
        awsConnections
      });
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.post("/aws/connections", async (request, reply) => {
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

  app.post("/aws/connections/:connectionId/test", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const body = testAwsConnectionBodySchema.parse(request.body);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);
    const tester = options?.awsConnectionTester ?? createAwsConnectionTester();
    const rateLimitResult = (
      options?.awsConnectionRateLimiter ?? defaultAwsConnectionRateLimiter
    ).consume(`aws-connection-test:${currentUserId}`);

    if (!rateLimitResult.allowed) {
      return reply
        .status(429)
        .header("Retry-After", String(rateLimitResult.retryAfterSeconds))
        .send({
          error: "too_many_requests",
          message: "Too many AWS connection attempts"
        });
    }

    try {
      const result = await testStoredAwsConnection(
        {
          connectionId: params.connectionId,
          accessContext: createUserProjectAccessContext(currentUserId),
          roleArn: body.roleArn
        },
        repository,
        tester
      );

      return reply.status(200).send(result);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.post("/aws/connections/:connectionId/verify", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const body = verifyAwsConnectionBodySchema.parse(request.body);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);
    const tester = options?.awsConnectionTester ?? createAwsConnectionTester();
    const rateLimitResult = (
      options?.awsConnectionRateLimiter ?? defaultAwsConnectionRateLimiter
    ).consume(`aws-connection-verify:${currentUserId}`);

    if (!rateLimitResult.allowed) {
      return reply
        .status(429)
        .header("Retry-After", String(rateLimitResult.retryAfterSeconds))
        .send({
          error: "too_many_requests",
          message: "Too many AWS connection attempts"
        });
    }

    try {
      const verifyOptions: {
        now?: () => Date;
      } = {};

      if (options?.now) {
        verifyOptions.now = options.now;
      }

      const result = await verifyAwsConnection(
        {
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
  });

  app.post("/aws/connections/:connectionId/verify-created-role", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const body = verifyAwsConnectionCreatedRoleBodySchema.parse(request.body);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);
    const tester = options?.awsConnectionTester ?? createAwsConnectionTester();
    const rateLimitResult = (
      options?.awsConnectionRateLimiter ?? defaultAwsConnectionRateLimiter
    ).consume(`aws-connection-verify:${currentUserId}`);

    if (!rateLimitResult.allowed) {
      return reply
        .status(429)
        .header("Retry-After", String(rateLimitResult.retryAfterSeconds))
        .send({
          error: "too_many_requests",
          message: "Too many AWS connection attempts"
        });
    }

    try {
      const verifyOptions: {
        now?: () => Date;
      } = {};

      if (options?.now) {
        verifyOptions.now = options.now;
      }

      const result = await verifyAwsConnectionCreatedRole(
        {
          connectionId: params.connectionId,
          accessContext: createUserProjectAccessContext(currentUserId),
          accountId: body.accountId
        },
        repository,
        tester,
        verifyOptions
      );

      return reply.status(200).send(result);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.delete("/aws/connections/:connectionId", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);

    try {
      await deleteAwsConnection(
        {
          connectionId: params.connectionId,
          accessContext: createUserProjectAccessContext(currentUserId)
        },
        repository
      );

      return reply.status(204).send();
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.get(
    "/aws/connections/:connectionId/cloudformation-template",
    async (request, reply) => {
      const params = cloudFormationTemplateParamsSchema.parse(request.params);
      const client = getAwsConnectionDatabaseClient();
      const currentUserId = await requireActiveUserId(request, () => client);
      const repository =
        options?.createAwsConnectionRepository?.(client.db) ??
        createPostgresAwsConnectionRepository(client.db);

      try {
        const templateOptions: {
          now?: () => Date;
        } = {};

        if (options?.now) {
          templateOptions.now = options.now;
        }

        const result = await getAwsConnectionCloudFormationTemplate(
          {
            connectionId: params.connectionId,
            accessContext: createUserProjectAccessContext(currentUserId),
            callerPrincipalArn:
              options?.awsConnectionConfig?.callerPrincipalArn ??
              requireSketchCatchAwsCallerPrincipalArn(),
            publicBaseUrl:
              options?.awsConnectionConfig?.publicBaseUrl ??
              getRuntimeEnv().sketchcatchPublicBaseUrl,
            tokenSecret:
              options?.cloudFormationTemplateTokenSecret ??
              requireCloudFormationTemplateTokenSecret()
          },
          repository,
          templateOptions
        );

        return reply.status(200).send(result);
      } catch (error) {
        return handleAwsConnectionError(error, reply);
      }
    }
  );

  app.get("/aws/connections/cloudformation-template", async (request, reply) => {
    const query = publicCloudFormationTemplateQuerySchema.parse(request.query);
    const client = getAwsConnectionDatabaseClient();
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);

    try {
      const templateBody = await renderAwsConnectionCloudFormationTemplateFromToken(
        query.token,
        options?.cloudFormationTemplateTokenSecret ?? requireCloudFormationTemplateTokenSecret(),
        repository,
        options?.now?.()
      );

      return reply.status(200).type("application/x-yaml").send(templateBody);
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

  if (error instanceof AwsConnectionDeleteConflictError) {
    return reply.status(409).send({
      error: "conflict",
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

  if (error instanceof AwsConnectionCloudFormationTemplateError) {
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
