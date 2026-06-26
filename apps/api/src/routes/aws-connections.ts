import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import {
  getRuntimeEnv,
  requireCloudFormationTemplateTokenSecret,
  requireSketchCatchAwsCallerPrincipalArn
} from "../config/env.js";
import { getDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  AwsConnectionCloudFormationTemplateError,
  AwsConnectionNotFoundError,
  AwsConnectionVerificationError,
  createAwsConnection,
  createPostgresAwsConnectionRepository,
  getAwsConnectionCloudFormationTemplate,
  isRecommendedAwsConnectionRoleArn,
  recommendedAwsConnectionRoleName,
  renderAwsConnectionCloudFormationTemplateFromToken,
  testStoredAwsConnection,
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

const createAwsConnectionParamsSchema = z.object({
  projectId: z.uuid()
});

const verifyAwsConnectionParamsSchema = z.object({
  projectId: z.uuid(),
  connectionId: z.uuid()
});

const cloudFormationTemplateParamsSchema = z.object({
  projectId: z.uuid(),
  connectionId: z.uuid()
});

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

  app.post("/projects/:projectId/aws-connections/:connectionId/test", async (request, reply) => {
    const params = verifyAwsConnectionParamsSchema.parse(request.params);
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
          projectId: params.projectId,
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

  app.post("/projects/:projectId/aws-connections/:connectionId/verify", async (request, reply) => {
    const params = verifyAwsConnectionParamsSchema.parse(request.params);
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
  });

  app.get(
    "/projects/:projectId/aws-connections/:connectionId/cloudformation-template",
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
            projectId: params.projectId,
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
