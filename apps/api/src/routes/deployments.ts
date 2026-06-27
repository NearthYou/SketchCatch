import { z } from "zod";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient } from "../db/client.js";
import type { DeployedResource, Deployment, DeploymentLog, TerraformOutput } from "@sketchcatch/types";
import type { FastifyReply, FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "../db/client.js";
import {
  runDeploymentInit as defaultRunDeploymentInit,
  type RunDeploymentInitInput,
  type RunDeploymentInitResult
} from "../deployments/deployment-init-service.js";
import {
  runDeploymentPlan as defaultRunDeploymentPlan,
  type RunDeploymentPlanInput,
  type RunDeploymentPlanResult
} from "../deployments/deployment-plan-service.js";
import {
  runDeploymentApply as defaultRunDeploymentApply,
  type RunDeploymentApplyInput,
  type RunDeploymentApplyResult
} from "../deployments/deployment-apply-service.js";
import {
  approveDeploymentPlan as defaultApproveDeploymentPlan,
  type ApproveDeploymentPlanInput
} from "../deployments/deployment-approval-service.js";
import {
  createDeployment,
  createPostgresDeploymentRepository,
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  listDeployedResources,
  listProjectDeployments,
  listDeploymentLogs,
  listTerraformOutputs,
  requestDeploymentCancellation,
  type DeploymentRecord,
  type DeploymentRepository,
  type DeploymentLogRecord,
  type ProjectAccessContext
} from "../deployments/deployment-service.js";
import {
  cancelTrackedDeploymentRun,
  startTrackedDeploymentRun
} from "../deployments/deployment-run-registry.js";

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

const deploymentLogStreamQuerySchema = z.object({
  sinceSequence: z.coerce.number().int().min(0).default(0),
  once: z.enum(["true", "false"]).optional()
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
  runDeploymentPlan?: (
    input: RunDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentPlanResult>;
  approveDeploymentPlan?: (
    input: ApproveDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<DeploymentRecord>;
  runDeploymentApply?: (
    input: RunDeploymentApplyInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentApplyResult>;
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
    currentPlanArtifactId: row.currentPlanArtifactId,
    stateObjectKey: row.stateObjectKey,
    resultWarningSummary: row.resultWarningSummary,
    status: row.status as Deployment["status"],
    activeStage: row.activeStage,
    planSummary: row.planSummary,
    isBlocked: row.isBlocked,
    blockedBy: row.blockedBy,
    blockedReason: row.blockedReason,
    failureStage: row.failureStage,
    errorSummary: row.errorSummary,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedByUserId: row.approvedByUserId,
    approvedTerraformArtifactId: row.approvedTerraformArtifactId,
    approvedPlanArtifactId: row.approvedPlanArtifactId,
    approvedTerraformArtifactHash: row.approvedTerraformArtifactHash,
    approvedTfplanHash: row.approvedTfplanHash,
    approvedAwsAccountId: row.approvedAwsAccountId,
    approvedAwsRegion: row.approvedAwsRegion,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toDeployedResource(row: DeployedResource): DeployedResource {
  return row;
}

function toTerraformOutput(row: TerraformOutput): TerraformOutput {
  return row;
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
          accessContext,
          startedFromStatus: deployment.status
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

  app.post("/deployments/:deploymentId/plan", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentPlan = options?.runDeploymentPlan ?? defaultRunDeploymentPlan;

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
        throw new DeploymentConflictError("Deployment plan is already running");
      }

      await requireNoRunningDeploymentInProject(deployment, repository);

      const runningDeployment = await repository.markDeploymentPlanRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment plan could not be started");
      }

      startDeploymentPlanJob(
        {
          deploymentId: params.deploymentId,
          accessContext,
          startedFromStatus: deployment.status
        },
        repository,
        runDeploymentPlan,
        request.log
      );

      return reply.status(202).send({
        deployment: toDeployment(runningDeployment)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/approve", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const approveDeploymentPlan =
      options?.approveDeploymentPlan ?? defaultApproveDeploymentPlan;

    try {
      const deployment = await approveDeploymentPlan(
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

  app.post("/deployments/:deploymentId/apply", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentApply = options?.runDeploymentApply ?? defaultRunDeploymentApply;

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      await requireDeploymentInitArtifact(deployment, repository);
      requireDeploymentCanStartApply(deployment);
      await requireNoRunningDeploymentInProject(deployment, repository);

      const runningDeployment = await repository.markDeploymentApplyRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment apply could not be started");
      }

      startDeploymentApplyJob(
        {
          deploymentId: params.deploymentId,
          accessContext,
          startedFromStatus: deployment.status
        },
        repository,
        runDeploymentApply,
        request.log
      );

      return reply.status(202).send({
        deployment: toDeployment(runningDeployment)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/cancel", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const cancellationRequestedDeployment = await requestDeploymentCancellation(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      const cancelledInMemory = cancelTrackedDeploymentRun(params.deploymentId);

      if (!cancelledInMemory) {
        const failedDeployment = await repository.failDeployment(params.deploymentId, {
          failureStage: cancellationRequestedDeployment.activeStage ?? "apply",
          errorSummary:
            "Cancellation was requested, but no active Terraform process was found on this server. The deployment was marked failed; verify AWS resources before retry."
        });

        if (!failedDeployment) {
          throw new DeploymentNotFoundError("Deployment not found");
        }

        return reply.status(202).send({
          deployment: toDeployment(failedDeployment)
        });
      }

      return reply.status(202).send({
        deployment: toDeployment(cancellationRequestedDeployment)
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

  app.get("/deployments/:deploymentId/logs/stream", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const query = deploymentLogStreamQuerySchema.parse(request.query);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );

      return streamDeploymentLogs({
        deploymentId: params.deploymentId,
        sinceSequence: query.sinceSequence,
        once: query.once === "true",
        repository,
        reply,
        request
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.get("/deployments/:deploymentId/resources", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const resources = await listDeployedResources(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );

      return reply.status(200).send({
        resources: resources.map(toDeployedResource)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.get("/deployments/:deploymentId/outputs", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const outputs = await listTerraformOutputs(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );

      return reply.status(200).send({
        outputs: outputs.map(toTerraformOutput)
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

async function streamDeploymentLogs(input: {
  deploymentId: string;
  sinceSequence: number;
  once: boolean;
  repository: DeploymentRepository;
  reply: FastifyReply;
  request: FastifyRequest;
}): Promise<void> {
  let lastSequence = input.sinceSequence;

  input.reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    Vary: "Cookie"
  });
  input.reply.hijack();

  const writeNewLogs = async () => {
    const logs = await input.repository.listDeploymentLogs(input.deploymentId);
    const nextLogs = logs.filter((log) => log.sequence > lastSequence);

    for (const log of nextLogs) {
      lastSequence = Math.max(lastSequence, log.sequence);
      input.reply.raw.write(`event: log\ndata: ${JSON.stringify(toDeploymentLog(log))}\n\n`);
    }
  };

  await writeNewLogs();

  if (input.once) {
    input.reply.raw.end();
    return;
  }

  const interval = setInterval(() => {
    input.reply.raw.write(": keep-alive\n\n");
    void writeNewLogs().catch((error) => {
      input.request.log.warn({ error, deploymentId: input.deploymentId }, "Deployment log stream failed");
    });
  }, 2_000);

  input.request.raw.on("close", () => {
    clearInterval(interval);
  });
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

async function requireNoRunningDeploymentInProject(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
): Promise<void> {
  const runningDeployment = await repository.findRunningDeploymentInProject(deployment.projectId);

  if (runningDeployment) {
    throw new DeploymentConflictError("Another deployment is already running for this project");
  }
}

function requireDeploymentCanStartApply(deployment: DeploymentRecord): void {
  if (deployment.status === "RUNNING") {
    throw new DeploymentConflictError("Deployment apply is already running");
  }

  if (deployment.status === "SUCCESS") {
    throw new DeploymentConflictError("Deployment apply has already completed");
  }

  if (!deployment.approvedAt || !deployment.approvedPlanArtifactId) {
    throw new DeploymentConflictError("Deployment approval is required before apply");
  }

  if (deployment.isBlocked) {
    throw new DeploymentConflictError("Blocked deployment cannot be applied");
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
  startTrackedDeploymentRun(input.deploymentId, async (abortSignal) => {
    await runDeploymentInit({ ...input, abortSignal }, repository).catch(() => {
      log.error({ deploymentId: input.deploymentId }, "Deployment init background job failed");
    });
  });
}

function startDeploymentPlanJob(
  input: RunDeploymentPlanInput,
  repository: DeploymentRepository,
  runDeploymentPlan: (
    input: RunDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentPlanResult>,
  log: FastifyRequest["log"]
): void {
  startTrackedDeploymentRun(input.deploymentId, async (abortSignal) => {
    await runDeploymentPlan({ ...input, abortSignal }, repository).catch(() => {
      log.error({ deploymentId: input.deploymentId }, "Deployment plan background job failed");
    });
  });
}

function startDeploymentApplyJob(
  input: RunDeploymentApplyInput,
  repository: DeploymentRepository,
  runDeploymentApply: (
    input: RunDeploymentApplyInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentApplyResult>,
  log: FastifyRequest["log"]
): void {
  startTrackedDeploymentRun(input.deploymentId, async (abortSignal) => {
    await runDeploymentApply({ ...input, abortSignal }, repository).catch(() => {
      log.error({ deploymentId: input.deploymentId }, "Deployment apply background job failed");
    });
  });
}
