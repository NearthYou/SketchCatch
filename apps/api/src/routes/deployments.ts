import { z } from "zod";
import { requireS3BucketName } from "../config/env.js";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient } from "../db/client.js";
import type {
  DeployedResource,
  Deployment,
  DeploymentFailureExplanationResponse,
  DeploymentLog,
  Project,
  RecentSuccessfulDeploymentProject,
  RecentSuccessfulDeploymentProjectListResponse,
  TerraformOutput
} from "@sketchcatch/types";
import type { FastifyReply, FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "../db/client.js";
import { getS3Client } from "../s3/client.js";
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
  runDeploymentDestroyPlan as defaultRunDeploymentDestroyPlan,
  type RunDeploymentDestroyPlanInput,
  type RunDeploymentDestroyPlanResult
} from "../deployments/deployment-destroy-plan-service.js";
import {
  runDeploymentDestroy as defaultRunDeploymentDestroy,
  type RunDeploymentDestroyInput,
  type RunDeploymentDestroyResult
} from "../deployments/deployment-destroy-service.js";
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
  getDeploymentDeployedAt,
  listDeployedResources,
  listProjectDeployments,
  listDeploymentLogs,
  listRecentSuccessfulDeploymentProjects,
  listTerraformOutputs,
  type DeploymentProjectRecord,
  requestDeploymentCancellation,
  type DeploymentRecord,
  type DeploymentRepository,
  type DeploymentLogRecord,
  type ProjectAccessContext
} from "../deployments/deployment-service.js";
import { createDeploymentFailureExplanation } from "../deployments/deployment-failure-explanation.js";
import {
  cancelTrackedDeploymentRun,
  startTrackedDeploymentRun
} from "../deployments/deployment-run-registry.js";
import type {
  CreateLlmExplanation,
  LlmExplanationInput
} from "../services/aiLlmExplanationTypes.js";
import {
  createS3DeploymentRetentionStorage,
  pruneProjectDeploymentStorage as defaultPruneProjectDeploymentStorage,
  type PruneProjectDeploymentStorageResult
} from "../deployments/deployment-retention.js";

type DeploymentRow = DeploymentRecord & {
  readonly currentPlanOperation?: Deployment["currentPlanOperation"];
};

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

const approveDeploymentBodySchema = z.object({
  acknowledgedWarningIds: z.array(z.string().min(1)).default([])
});

const deploymentLogStreamQuerySchema = z.object({
  sinceSequence: z.coerce.number().int().min(0).default(0),
  once: z.enum(["true", "false"]).optional()
});
const maxActiveDeploymentLogStreams = 50;
const maxDeploymentLogStreamDurationMs = 5 * 60 * 1000;
const maxDeploymentLogStreamBatchSize = 200;
let activeDeploymentLogStreamCount = 0;

const listDeploymentsParamsSchema = z.object({
  projectId: z.uuid()
});

type DeploymentRouteOptions = {
  getDatabaseClient?: () => DatabaseClient;
  createDeploymentRepository?: (db: DatabaseClient["db"]) => DeploymentRepository;
  pruneProjectDeploymentStorage?: (input: {
    db: DatabaseClient["db"];
    projectId: string;
  }) => Promise<PruneProjectDeploymentStorageResult>;
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
  runDeploymentDestroyPlan?: (
    input: RunDeploymentDestroyPlanInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentDestroyPlanResult>;
  runDeploymentDestroy?: (
    input: RunDeploymentDestroyInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentDestroyResult>;
  createLlmExplanation?: CreateLlmExplanation;
};

type DeploymentRequestContext = {
  accessContext: ProjectAccessContext;
  db: DatabaseClient["db"];
  repository: DeploymentRepository;
};

export type DeploymentLogStreamWritable = {
  readonly writableEnded: boolean;
  readonly destroyed: boolean;
  write(chunk: string): boolean;
};

export type DeploymentLogStreamWriteResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error?: unknown;
    };

export function writeDeploymentLogStreamChunk(input: {
  raw: DeploymentLogStreamWritable;
  chunk: string;
}): DeploymentLogStreamWriteResult {
  if (input.raw.writableEnded || input.raw.destroyed) {
    return { ok: false };
  }

  try {
    input.raw.write(input.chunk);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

async function getDeploymentRequestContext(
  request: FastifyRequest,
  options: DeploymentRouteOptions | undefined,
  getDeploymentDatabaseClient: () => DatabaseClient
): Promise<DeploymentRequestContext> {
  const client = getDeploymentDatabaseClient();
  const currentUserId = await requireActiveUserId(request, () => client);

  return {
    accessContext: createUserProjectAccessContext(currentUserId),
    db: client.db,
    repository:
      options?.createDeploymentRepository?.(client.db) ??
      createPostgresDeploymentRepository(client.db)
  };
}

function createDefaultProjectDeploymentStoragePruner(
  options: DeploymentRouteOptions | undefined
): DeploymentRouteOptions["pruneProjectDeploymentStorage"] | undefined {
  if (options?.pruneProjectDeploymentStorage) {
    return options.pruneProjectDeploymentStorage;
  }

  if (options?.createDeploymentRepository) {
    return undefined;
  }

  return ({ db, projectId }) =>
    defaultPruneProjectDeploymentStorage({
      db,
      projectId,
      storage: createS3DeploymentRetentionStorage({
        bucketName: requireS3BucketName(),
        s3Client: getS3Client()
      })
    });
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

async function toDeployment(
  row: DeploymentRow,
  repository: DeploymentRepository
): Promise<Deployment> {
  const currentPlanOperation =
    row.currentPlanOperation ??
    (row.currentPlanArtifactId
      ? (await repository.findDeploymentPlanArtifactById(row.currentPlanArtifactId))?.operation ?? null
      : null);

  return {
    id: row.id,
    projectId: row.projectId,
    architectureId: row.architectureId,
    terraformArtifactId: row.terraformArtifactId,
    awsConnectionId: row.awsConnectionId,
    currentPlanArtifactId: row.currentPlanArtifactId,
    currentPlanOperation,
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

function toProject(row: DeploymentProjectRecord["project"]): Project {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function toRecentSuccessfulDeploymentProject(
  row: DeploymentProjectRecord,
  repository: DeploymentRepository
): Promise<RecentSuccessfulDeploymentProject> {
  return {
    project: toProject(row.project),
    deployment: await toDeployment(row.deployment, repository),
    deployedAt: getDeploymentDeployedAt(row.deployment).toISOString()
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
  const pruneProjectDeploymentStorage = createDefaultProjectDeploymentStoragePruner(options);
  const createLlmExplanation =
    options?.createLlmExplanation ?? createDefaultDeploymentFailureLlmExplanation;

  app.post("/projects/:projectId/deployments", async (request, reply) => {
    const params = createDeploymentParamsSchema.parse(request.params);
    const body = createDeploymentBodySchema.parse(request.body);
    const { accessContext, db, repository } = await getDeploymentRequestContext(
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

      if (pruneProjectDeploymentStorage) {
        try {
          const pruneResult = await pruneProjectDeploymentStorage({
            db,
            projectId: params.projectId
          });

          if (pruneResult.failedObjectKeys.length > 0) {
            request.log.warn(
              {
                failedObjectKeyCount: pruneResult.failedObjectKeys.length,
                projectId: params.projectId
              },
              "Failed to prune some deployment S3 objects"
            );
          }
        } catch (error) {
          request.log.warn({ error, projectId: params.projectId }, "Failed to prune deployment history");
        }
      }

      return reply.status(201).send({
        deployment: await toDeployment(deployment, repository)
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
        deployments: await Promise.all(
          deployments.map((deployment) => toDeployment(deployment, repository))
        )
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.get("/deployments/recent-successful-projects", async (request, reply) => {
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    const rows = await listRecentSuccessfulDeploymentProjects({ accessContext }, repository);
    const response: RecentSuccessfulDeploymentProjectListResponse = {
      items: await Promise.all(
        rows.map((row) => toRecentSuccessfulDeploymentProject(row, repository))
      )
    };

    return reply.status(200).send(response);
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
        deployment: await toDeployment(deployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.get(
    "/deployments/:deploymentId/failure-explanation",
    async (request, reply): Promise<DeploymentFailureExplanationResponse | FastifyReply> => {
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

        if (deployment.status !== "FAILED") {
          throw new DeploymentConflictError(
            "Deployment failure explanation is only available for failed deployments"
          );
        }

        const logs = await listDeploymentLogs(
          {
            deploymentId: params.deploymentId,
            accessContext
          },
          repository
        );

        return reply.status(200).send({
          explanation: await createDeploymentFailureExplanation({
            deployment,
            logs,
            createLlmExplanation
          })
        });
      } catch (error) {
        return handleDeploymentError(error, reply);
      }
    }
  );

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
        deployment: await toDeployment(runningDeployment, repository)
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

      if (deployment.status === "SUCCESS" || deployment.status === "DESTROYED") {
        throw new DeploymentConflictError("Deployment cannot be replanned in this state");
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
        deployment: await toDeployment(runningDeployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/approve", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const body = approveDeploymentBodySchema.parse(request.body ?? {});
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
          accessContext,
          acknowledgedWarningIds: body.acknowledgedWarningIds
        },
        repository
      );

      return reply.status(200).send({
        deployment: await toDeployment(deployment, repository)
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
        deployment: await toDeployment(runningDeployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/destroy/plan", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentDestroyPlan =
      options?.runDeploymentDestroyPlan ?? defaultRunDeploymentDestroyPlan;

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      await requireDeploymentInitArtifact(deployment, repository);
      requireDeploymentCanStartDestroyPlan(deployment);
      await requireNoRunningDeploymentInProject(deployment, repository);

      const runningDeployment = await repository.markDeploymentPlanRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment destroy plan could not be started");
      }

      startDeploymentDestroyPlanJob(
        {
          deploymentId: params.deploymentId,
          accessContext,
          startedFromStatus: deployment.status,
          startedFromFailureStage: deployment.failureStage,
          startedFromErrorSummary: deployment.errorSummary
        },
        repository,
        runDeploymentDestroyPlan,
        request.log
      );

      return reply.status(202).send({
        deployment: await toDeployment(runningDeployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/destroy", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentDestroy = options?.runDeploymentDestroy ?? defaultRunDeploymentDestroy;

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      await requireDeploymentInitArtifact(deployment, repository);
      await requireDeploymentCanStartDestroy(deployment, repository);
      await requireNoRunningDeploymentInProject(deployment, repository);

      const runningDeployment = await repository.markDeploymentDestroyRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment destroy could not be started");
      }

      startDeploymentDestroyJob(
        {
          deploymentId: params.deploymentId,
          accessContext,
          startedFromStatus: deployment.status,
          startedFromFailureStage: deployment.failureStage
        },
        repository,
        runDeploymentDestroy,
        request.log
      );

      return reply.status(202).send({
        deployment: await toDeployment(runningDeployment, repository)
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
          deployment: await toDeployment(failedDeployment, repository)
        });
      }

      return reply.status(202).send({
        deployment: await toDeployment(cancellationRequestedDeployment, repository)
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

async function createDefaultDeploymentFailureLlmExplanation(input: LlmExplanationInput) {
  const { createConfiguredOpenAiExplanation } = await import("../services/aiLlmExplanation.js");

  return createConfiguredOpenAiExplanation()(input);
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
  let polling = false;
  let closed = false;

  if (!input.once && activeDeploymentLogStreamCount >= maxActiveDeploymentLogStreams) {
    input.reply.status(429).send({
      error: "too_many_requests",
      message: "Too many deployment log streams are open"
    });
    return;
  }

  if (!input.once) {
    activeDeploymentLogStreamCount += 1;
  }

  input.reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    Vary: "Cookie"
  });
  input.reply.hijack();

  const timers: {
    interval?: NodeJS.Timeout;
    streamTimeout?: NodeJS.Timeout;
  } = {};
  const closeStream = () => {
    if (closed) {
      return;
    }

    closed = true;

    if (timers.interval) {
      clearInterval(timers.interval);
    }

    if (timers.streamTimeout) {
      clearTimeout(timers.streamTimeout);
    }

    if (!input.once) {
      activeDeploymentLogStreamCount = Math.max(0, activeDeploymentLogStreamCount - 1);
    }

    if (!input.reply.raw.writableEnded && !input.reply.raw.destroyed) {
      input.reply.raw.end();
    }
  };

  const writeNewLogs = async () => {
    if (polling || closed) {
      return;
    }

    polling = true;

    try {
      const nextLogs = await input.repository.listDeploymentLogs(input.deploymentId, {
        afterSequence: lastSequence,
        limit: maxDeploymentLogStreamBatchSize
      });

      for (const log of nextLogs) {
        lastSequence = Math.max(lastSequence, log.sequence);
        const writeResult = writeDeploymentLogStreamChunk({
          raw: input.reply.raw,
          chunk: `event: log\ndata: ${JSON.stringify(toDeploymentLog(log))}\n\n`
        });

        if (!writeResult.ok) {
          if (writeResult.error) {
            input.request.log.warn(
              { error: writeResult.error, deploymentId: input.deploymentId },
              "Deployment log stream write failed"
            );
          }

          closeStream();
          return;
        }
      }
    } finally {
      polling = false;
    }
  };

  await writeNewLogs().catch((error) => {
    input.request.log.warn(
      { error, deploymentId: input.deploymentId },
      "Deployment log stream failed"
    );
    closeStream();
  });

  if (closed) {
    return;
  }

  if (input.once) {
    closeStream();
    return;
  }

  timers.interval = setInterval(() => {
    if (closed) {
      return;
    }

    const writeResult = writeDeploymentLogStreamChunk({
      raw: input.reply.raw,
      chunk: ": keep-alive\n\n"
    });

    if (!writeResult.ok) {
      if (writeResult.error) {
        input.request.log.warn(
          { error: writeResult.error, deploymentId: input.deploymentId },
          "Deployment log stream keep-alive failed"
        );
      }

      closeStream();
      return;
    }

    void writeNewLogs().catch((error) => {
      input.request.log.warn(
        { error, deploymentId: input.deploymentId },
        "Deployment log stream failed"
      );
      closeStream();
    });
  }, 2_000);
  timers.streamTimeout = setTimeout(() => {
    closeStream();
  }, maxDeploymentLogStreamDurationMs);

  input.request.raw.on("close", () => {
    closeStream();
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

  if (deployment.status === "FAILED" || deployment.status === "CANCELLED") {
    throw new DeploymentConflictError("Deployment must be replanned and approved before apply");
  }

  if (!deployment.approvedAt || !deployment.approvedPlanArtifactId) {
    throw new DeploymentConflictError("Deployment approval is required before apply");
  }

  if (deployment.isBlocked) {
    throw new DeploymentConflictError("Blocked deployment cannot be applied");
  }
}

function requireDeploymentCanStartDestroyPlan(deployment: DeploymentRecord): void {
  if (deployment.status === "RUNNING") {
    throw new DeploymentConflictError("Deployment destroy plan is already running");
  }

  if (!deployment.stateObjectKey) {
    throw new DeploymentConflictError("Terraform state is required before destroy");
  }

  if (deployment.status === "SUCCESS") {
    return;
  }

  if (
    deployment.status === "FAILED" &&
    (deployment.failureStage === "apply" || deployment.failureStage === "destroy")
  ) {
    return;
  }

  throw new DeploymentConflictError("Deployment cannot be destroyed in this state");
}

async function requireDeploymentCanStartDestroy(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
): Promise<void> {
  requireDeploymentCanStartDestroyPlan(deployment);

  if (!deployment.approvedAt || !deployment.approvedPlanArtifactId) {
    throw new DeploymentConflictError("Deployment approval is required before destroy");
  }

  if (deployment.isBlocked) {
    throw new DeploymentConflictError("Blocked deployment cannot be destroyed");
  }

  if (!deployment.currentPlanArtifactId) {
    throw new DeploymentConflictError("Terraform Destroy Plan must be completed before destroy");
  }

  const currentPlanArtifact = await repository.findDeploymentPlanArtifactById(
    deployment.currentPlanArtifactId
  );

  if (!currentPlanArtifact || currentPlanArtifact.operation !== "destroy") {
    throw new DeploymentConflictError("Terraform destroy plan is required before destroy");
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

function startDeploymentDestroyPlanJob(
  input: RunDeploymentDestroyPlanInput,
  repository: DeploymentRepository,
  runDeploymentDestroyPlan: (
    input: RunDeploymentDestroyPlanInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentDestroyPlanResult>,
  log: FastifyRequest["log"]
): void {
  startTrackedDeploymentRun(input.deploymentId, async (abortSignal) => {
    await runDeploymentDestroyPlan({ ...input, abortSignal }, repository).catch(() => {
      log.error({ deploymentId: input.deploymentId }, "Deployment destroy plan background job failed");
    });
  });
}

function startDeploymentDestroyJob(
  input: RunDeploymentDestroyInput,
  repository: DeploymentRepository,
  runDeploymentDestroy: (
    input: RunDeploymentDestroyInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentDestroyResult>,
  log: FastifyRequest["log"]
): void {
  startTrackedDeploymentRun(input.deploymentId, async (abortSignal) => {
    await runDeploymentDestroy({ ...input, abortSignal }, repository).catch(() => {
      log.error({ deploymentId: input.deploymentId }, "Deployment destroy background job failed");
    });
  });
}
