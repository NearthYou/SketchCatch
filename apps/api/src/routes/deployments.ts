import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient } from "../db/client.js";
import type { Deployment, DeploymentLog } from "@sketchcatch/types";
import type { FastifyReply, FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "../db/client.js";
import {
  runDeploymentInit as defaultRunDeploymentInit,
  type RunDeploymentInitInput,
  type RunDeploymentInitResult
} from "../deployments/deployment-init-service.js";
import {
  createDeployment,
  createPostgresDeploymentRepository,
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  listProjectDeployments,
  listDeploymentLogs,
  type DeploymentRecord,
  type DeploymentRepository,
  type DeploymentLogRecord,
  type ProjectAccessContext
} from "../deployments/deployment-service.js";

type DeploymentRow = DeploymentRecord;

const createDeploymentParamsSchema = z.object({
  projectId: z.uuid()
});

const createDeploymentBodySchema = z.object({
  architectureId: z.uuid(),
  terraformArtifactId: z.uuid(),
  awsConnectionId: z.uuid()
});

const deploymentParamsSchema = z.object({
  deploymentId: z.uuid()
});

const listDeploymentsParamsSchema = z.object({
  projectId: z.uuid()
});

type DeploymentRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createDeploymentRepository?: (db: DatabaseClient["db"]) => DeploymentRepository;
  runDeploymentInit?: (
    input: RunDeploymentInitInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentInitResult>;
};

type DeploymentRequestContext = {
  accessContext: ProjectAccessContext;
  repository: DeploymentRepository;
};

async function getDeploymentRequestContext(
  request: FastifyRequest,
  options: DeploymentRouteOptions | undefined,
  getDeploymentDatabaseClient: () => DatabaseClient
): Promise<DeploymentRequestContext> {
  const client = getDeploymentDatabaseClient();
  const currentUserId = await requireActiveUserId(request, () => client);

  return {
    accessContext: createUserProjectAccessContext(currentUserId),
    repository:
      options?.createDeploymentRepository?.(client.db) ??
      createPostgresDeploymentRepository(client.db)
  };
}

function handleDeploymentError(error: unknown, reply: FastifyReply) {
  if (error instanceof DeploymentNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error instanceof Error ? error.message : "Deployment not found"
    });
  }

  if (error instanceof DeploymentConflictError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  throw error;
}

function toDeployment(row: DeploymentRow): Deployment {
  return {
    id: row.id,
    projectId: row.projectId,
    architectureId: row.architectureId,
    terraformArtifactId: row.terraformArtifactId,
    awsConnectionId: row.awsConnectionId,
    status: row.status as Deployment["status"],
    planSummary: row.planSummary,
    isBlocked: row.isBlocked,
    blockedBy: row.blockedBy,
    blockedReason: row.blockedReason,
    failureStage: row.failureStage,
    errorSummary: row.errorSummary,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedByUserId: row.approvedByUserId,
    approvedTerraformArtifactId: row.approvedTerraformArtifactId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toDeploymentLog(row: DeploymentLogRecord): DeploymentLog {
  return {
    id: row.id,
    deploymentId: row.deploymentId,
    sequence: row.sequence,
    stage: row.stage,
    level: row.level,
    message: row.message,
    relatedResourceId: row.relatedResourceId,
    createdAt: row.createdAt.toISOString()
  };
}

export async function registerDeploymentRoutes(
  app: FastifyInstance,
  options?: DeploymentRouteOptions
): Promise<void> {
  const getDeploymentDatabaseClient = options?.getDatabaseClient ?? getDatabaseClient;

  app.post("/projects/:projectId/deployments", async (request, reply) => {
    const params = createDeploymentParamsSchema.parse(request.params);
    const body = createDeploymentBodySchema.parse(request.body);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const deployment = await createDeployment(
        {
          projectId: params.projectId,
          accessContext,
          architectureId: body.architectureId,
          terraformArtifactId: body.terraformArtifactId,
          awsConnectionId: body.awsConnectionId
        },
        repository
      );

      return reply.status(201).send({
        deployment: toDeployment(deployment)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.get("/projects/:projectId/deployments", async (request, reply) => {
    const params = listDeploymentsParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const deployments = await listProjectDeployments(
        {
          projectId: params.projectId,
          accessContext
        },
        repository
      );

      return reply.status(200).send({
        deployments: deployments.map(toDeployment)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.get("/deployments/:deploymentId", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );

      return reply.status(200).send({
        deployment: toDeployment(deployment)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/init", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentInit = options?.runDeploymentInit ?? defaultRunDeploymentInit;

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      await requireDeploymentInitArtifact(deployment, repository);

      if (deployment.status === "RUNNING") {
        throw new DeploymentConflictError("Deployment init is already running");
      }

      const runningDeployment = await repository.markDeploymentInitRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment init could not be started");
      }

      startDeploymentInitJob(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository,
        runDeploymentInit,
        request.log
      );

      return reply.status(202).send({
        deployment: toDeployment(runningDeployment)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.get("/deployments/:deploymentId/logs", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const logs = await listDeploymentLogs(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );

      return reply.status(200).send({
        logs: logs.map(toDeploymentLog)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });
}

function createUserProjectAccessContext(userId: string): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}

async function requireDeploymentInitArtifact(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
): Promise<void> {
  const artifact = await repository.findTerraformArtifactById(deployment.terraformArtifactId);

  if (!artifact || artifact.id !== deployment.terraformArtifactId) {
    throw new DeploymentNotFoundError("Terraform artifact not found for deployment");
  }

  if (
    artifact.projectId !== deployment.projectId ||
    artifact.architectureId !== deployment.architectureId
  ) {
    throw new DeploymentNotFoundError("Terraform artifact does not match deployment");
  }
}

function startDeploymentInitJob(
  input: RunDeploymentInitInput,
  repository: DeploymentRepository,
  runDeploymentInit: (
    input: RunDeploymentInitInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentInitResult>,
  log: FastifyRequest["log"]
): void {
  void runDeploymentInit(input, repository).catch(() => {
    log.error({ deploymentId: input.deploymentId }, "Deployment init background job failed");
  });
}
