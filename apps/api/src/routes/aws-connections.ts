import { z, ZodError } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import {
  getRuntimeEnv,
  requireSketchCatchAwsCallerPrincipalArns
} from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import { publishAwsConnectionCloudFormationTemplateToS3 } from "../aws-connections/aws-connection-template-storage.js";
import {
  AwsCodeConnectionError,
  createAwsCodeConnection,
  createAwsCodeConnectionGateway,
  createPostgresAwsCodeConnectionRepository,
  getAwsCodeConnection,
  refreshAwsCodeConnection,
  type AwsCodeConnectionGateway,
  type AwsCodeConnectionRepository
} from "../aws-connections/aws-codeconnection-service.js";
import {
  AwsConnectionConflictError,
  AwsConnectionDeleteConflictError,
  AwsConnectionDeletionConfirmationError,
  AwsConnectionCloudFormationTemplateError,
  AwsConnectionNotFoundError,
  AwsConnectionVerificationError,
  type AwsConnectionCloudFormationTemplatePublisher,
  createAwsConnection,
  createPostgresAwsConnectionRepository,
  deleteAwsConnection,
  getAwsConnectionCloudFormationTemplate,
  getAwsConnectionDeletionPreview,
  isRecommendedAwsConnectionRoleArn,
  listAwsConnections,
  pruneStaleAwsConnections as defaultPruneStaleAwsConnections,
  recommendedAwsConnectionRoleName,
  testStoredAwsConnection,
  verifyAwsConnection,
  verifyAwsConnectionCreatedRole,
  type PruneStaleAwsConnectionsInput,
  type PruneStaleAwsConnectionsResult,
  type AwsConnectionRepository
} from "../aws-connections/aws-connection-service.js";
import { createAwsConnectionManagedCleanup } from "../aws-connections/aws-connection-managed-cleanup.js";
import {
  AwsConnectionTestError,
  createAwsConnectionTester,
  type AwsConnectionTester
} from "../aws-connections/aws-connection-test-service.js";
import type { FastifyInstance, FastifyReply } from "fastify";
import { maskDeploymentMessage } from "../deployments/log-masking.js";
import { getDeveloperErrorMessage } from "../network/developer-error-message.js";
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
    message: `AWS Role ARN must use ${recommendedAwsConnectionRoleName} or ${recommendedAwsConnectionRoleName}-<connection>`
  });

const awsConnectionParamsSchema = z.object({
  connectionId: z.uuid()
});

const cloudFormationTemplateParamsSchema = awsConnectionParamsSchema;

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

const deleteAwsConnectionBodySchema = z.object({
  confirmedManagedCleanup: z.literal(true),
  confirmationToken: z.string().regex(/^[a-f0-9]{64}$/u)
});

export type AwsConnectionRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createAwsConnectionRepository?: (db: DatabaseClient["db"]) => AwsConnectionRepository;
  createAwsCodeConnectionRepository?: (
    db: DatabaseClient["db"]
  ) => AwsCodeConnectionRepository;
  awsCodeConnectionGateway?: AwsCodeConnectionGateway;
  awsConnectionConfig?: {
    callerPrincipalArns: readonly string[];
  };
  cloudFormationTemplatePublisher?: AwsConnectionCloudFormationTemplatePublisher | null;
  awsConnectionTester?: AwsConnectionTester;
  awsConnectionRateLimiter?: RateLimiter;
  generateAwsConnectionId?: () => string;
  generateAwsCodeConnectionId?: () => string;
  generateAwsExternalId?: () => string;
  pruneStaleAwsConnections?: (
    input: PruneStaleAwsConnectionsInput,
    repository: AwsConnectionRepository
  ) => Promise<PruneStaleAwsConnectionsResult>;
  now?: () => Date;
  cleanupManagedAwsResources?: ReturnType<typeof createAwsConnectionManagedCleanup>;
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

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "bad_request",
        message: error.message
      });
    }

    const authenticationError = getAwsConnectionAuthenticationError(error);
    if (authenticationError) {
      return reply.status(authenticationError.statusCode).send({
        error: authenticationError.errorCode,
        message: authenticationError.message
      });
    }

    return handleAwsConnectionError(error, reply);
  });

  app.get("/aws/connections", async (request, reply) => {
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);

    try {
      const awsConnectionSettings = await listAwsConnections(
        {
          accessContext: createUserProjectAccessContext(currentUserId)
        },
        repository
      );

      return reply.status(200).send(awsConnectionSettings);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.post("/aws/connections/:connectionId/codeconnection", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsCodeConnectionRepository?.(client.db) ??
      createPostgresAwsCodeConnectionRepository(client.db);

    try {
      const result = await createAwsCodeConnection(
        { connectionId: params.connectionId, userId: currentUserId },
        repository,
        options?.awsCodeConnectionGateway ?? createAwsCodeConnectionGateway(),
        {
          ...(options?.generateAwsCodeConnectionId
            ? { generateId: options.generateAwsCodeConnectionId }
            : {}),
          ...(options?.now ? { now: options.now } : {})
        }
      );
      return reply.status(201).send(result);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.get("/aws/connections/:connectionId/codeconnection", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsCodeConnectionRepository?.(client.db) ??
      createPostgresAwsCodeConnectionRepository(client.db);

    try {
      const result = await getAwsCodeConnection(
        { connectionId: params.connectionId, userId: currentUserId },
        repository
      );
      return reply.status(200).send(result);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.post(
    "/aws/connections/:connectionId/codeconnection/refresh",
    async (request, reply) => {
      const params = awsConnectionParamsSchema.parse(request.params);
      const client = getAwsConnectionDatabaseClient();
      const currentUserId = await requireActiveUserId(request, () => client);
      const repository =
        options?.createAwsCodeConnectionRepository?.(client.db) ??
        createPostgresAwsCodeConnectionRepository(client.db);

      try {
        const result = await refreshAwsCodeConnection(
          { connectionId: params.connectionId, userId: currentUserId },
          repository,
          options?.awsCodeConnectionGateway ?? createAwsCodeConnectionGateway(),
          options?.now ? { now: options.now } : {}
        );
        return reply.status(200).send(result);
      } catch (error) {
        return handleAwsConnectionError(error, reply);
      }
    }
  );

  app.post("/aws/connections", async (request, reply) => {
    const body = createAwsConnectionBodySchema.parse(request.body);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);
    const accessContext = createUserProjectAccessContext(currentUserId);

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
          accessContext,
          region: body.region,
          callerPrincipalArns:
            options?.awsConnectionConfig?.callerPrincipalArns ??
            requireSketchCatchAwsCallerPrincipalArns()
        },
        repository,
        createOptions
      );

      try {
        await (options?.pruneStaleAwsConnections ?? defaultPruneStaleAwsConnections)(
          {
            accessContext,
            protectedConnectionIds: [result.awsConnection.id]
          },
          repository
        );
      } catch (error) {
        request.log.warn({ error, userId: currentUserId }, "Failed to prune AWS connections");
      }

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

  app.get("/aws/connections/:connectionId/deletion-preview", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);

    try {
      const preview = await getAwsConnectionDeletionPreview(
        {
          connectionId: params.connectionId,
          accessContext: createUserProjectAccessContext(currentUserId)
        },
        repository
      );
      return reply.status(200).send(preview);
    } catch (error) {
      return handleAwsConnectionError(error, reply);
    }
  });

  app.delete("/aws/connections/:connectionId", async (request, reply) => {
    const params = awsConnectionParamsSchema.parse(request.params);
    const body = deleteAwsConnectionBodySchema.parse(request.body);
    const client = getAwsConnectionDatabaseClient();
    const currentUserId = await requireActiveUserId(request, () => client);
    const repository =
      options?.createAwsConnectionRepository?.(client.db) ??
      createPostgresAwsConnectionRepository(client.db);

    try {
      await deleteAwsConnection(
        {
          connectionId: params.connectionId,
          accessContext: createUserProjectAccessContext(currentUserId),
          confirmedManagedCleanup: body.confirmedManagedCleanup,
          confirmationToken: body.confirmationToken
        },
        repository,
        {
          cleanupManagedResources:
            options?.cleanupManagedAwsResources ?? createAwsConnectionManagedCleanup()
        }
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
          cloudFormationTemplatePublisher?: AwsConnectionCloudFormationTemplatePublisher;
        } = {};

        if (options?.now) {
          templateOptions.now = options.now;
        }

        const cloudFormationTemplatePublisher =
          options?.cloudFormationTemplatePublisher !== undefined
            ? options.cloudFormationTemplatePublisher
            : createS3CloudFormationTemplatePublisher(getRuntimeEnv().s3BucketName);

        if (cloudFormationTemplatePublisher) {
          templateOptions.cloudFormationTemplatePublisher = cloudFormationTemplatePublisher;
        }

        const result = await getAwsConnectionCloudFormationTemplate(
          {
            connectionId: params.connectionId,
            accessContext: createUserProjectAccessContext(currentUserId),
            callerPrincipalArns:
              options?.awsConnectionConfig?.callerPrincipalArns ??
              requireSketchCatchAwsCallerPrincipalArns()
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

}

function getAwsConnectionAuthenticationError(error: unknown): {
  statusCode: 401;
  errorCode: "unauthorized";
  message: string;
} | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as {
    statusCode?: unknown;
    errorCode?: unknown;
  };
  if (candidate.statusCode !== 401 || candidate.errorCode !== "unauthorized") {
    return null;
  }

  return {
    statusCode: 401,
    errorCode: "unauthorized",
    message: "인증이 필요합니다."
  };
}

function createS3CloudFormationTemplatePublisher(
  bucketName: string | undefined
): AwsConnectionCloudFormationTemplatePublisher | undefined {
  if (!bucketName) {
    return undefined;
  }

  return async ({ connectionId, templateBody, expiresInSeconds }) =>
    publishAwsConnectionCloudFormationTemplateToS3({
      bucketName,
      connectionId,
      templateBody,
      expiresInSeconds
    });
}

function handleAwsConnectionError(error: unknown, reply: FastifyReply) {
  if (error instanceof AwsCodeConnectionError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message
    });
  }

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

  if (error instanceof AwsConnectionConflictError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  if (error instanceof AwsConnectionDeletionConfirmationError) {
    return reply.status(400).send({
      error: "bad_request",
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

  reply.request.log.error(
    {
      errorMessage: maskDeploymentMessage(
        error instanceof Error ? error.message : "Unknown AWS connection error"
      ),
      errorName: error instanceof Error ? error.name : "UnknownError",
      requestId: reply.request.id
    },
    "AWS connection request failed"
  );
  return reply.status(500).send({
    error: "internal_server_error",
    message: getDeveloperErrorMessage(error, "AWS 연결 요청을 처리하지 못했습니다.")
  });
}

function createUserProjectAccessContext(userId: string): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}
