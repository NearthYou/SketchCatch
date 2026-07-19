import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  getDeploymentWorkerMode,
  requireS3BucketName,
  type DeploymentWorkerMode
} from "../config/env.js";
import { requireActiveUserId } from "../auth/current-user.js";
import { getDatabaseClient } from "../db/client.js";
import type {
  DeployedResource,
  Deployment,
  DeploymentFailureExplanationResponse,
  DeploymentLiveObservationArchitectureResponse,
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
import { DirectApplicationReleaseError } from "../deployments/direct-application-release-service.js";
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
import { isDeploymentDestroySourceStatus } from "../deployments/deployment-destroy-eligibility.js";
import {
  approveDeploymentPlan as defaultApproveDeploymentPlan,
  revokeDeploymentApproval as defaultRevokeDeploymentApproval,
  type ApproveDeploymentPlanInput
} from "../deployments/deployment-approval-service.js";
import {
  createDeployment,
  createPostgresDeploymentRepository,
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  getDeploymentDeployedAt,
  getDeploymentLiveObservationArchitecture,
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
import {
  createDeploymentPreparationKey,
  getDeploymentConsolePhase,
  resolveDeploymentPreparation,
  type DeploymentPreparationRepository
} from "../deployments/deployment-preparation-service.js";
import { createDeploymentFailureExplanation } from "../deployments/deployment-failure-explanation.js";
import { prepareInfrastructureRollback } from "../deployments/infrastructure-rollback-service.js";
import {
  cancelTrackedDeploymentRun,
  startTrackedDeploymentRun
} from "../deployments/deployment-run-registry.js";
import {
  cancelDeploymentJob,
  createDeploymentJob,
  createPostgresDeploymentJobRepository,
  DeploymentJobConflictError,
  failDeploymentJob,
  markDeploymentJobDispatching,
  markDeploymentJobRunning,
  recordDeploymentJobTaskArn,
  type DeploymentJobRecord,
  type DeploymentJobOperation,
  type DeploymentJobRepository
} from "../deployments/deployment-job-service.js";
import {
  createConfiguredDeploymentWorkerDispatcher,
  createLocalDeploymentWorkerDispatcher,
  type DeploymentWorkerDispatcher
} from "../deployments/deployment-worker-dispatcher.js";
import { TerraformArtifactSafetyError } from "../deployments/terraform-artifact-safety.js";
import type {
  CreateLlmExplanation,
  LlmExplanationInput
} from "../services/aiLlmExplanationTypes.js";
import {
  createS3DeploymentRetentionStorage,
  pruneProjectDeploymentStorage as defaultPruneProjectDeploymentStorage,
  type PruneProjectDeploymentStorageResult
} from "../deployments/deployment-retention.js";
import {
  createRuntimeCachedDeploymentRepository,
  writeDeploymentLogStreamCursor
} from "../deployments/deployment-runtime-cache.js";
import type { RuntimeCache } from "../runtime-cache/index.js";
import type { ProjectAssetStorage } from "../projects/project-asset-storage.js";
import { createAwsProjectBuildEnvironmentGateway } from "../build-environments/aws-project-build-environment-gateway.js";
import {
  ProjectBuildEnvironmentError,
  createPostgresProjectBuildEnvironmentRepository,
  prepareProjectBuildEnvironment as prepareProjectBuildEnvironmentService,
  verifyProjectRepositoryAccess as verifyProjectRepositoryAccessService
} from "../build-environments/project-build-environment-service.js";
import {
  acquireProjectExecutionLease,
  recordProjectExecutionCoordinates,
  recoverVerifiedTerminalProjectExecutionLease,
  releaseProjectExecutionLease,
  ProjectExecutionLeaseError,
  type LeaseFence,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";

type DeploymentRow = DeploymentRecord & {
  readonly currentPlanOperation?: Deployment["currentPlanOperation"];
};

type RepositoryAccessVerificationResult = {
  buildEnvironment: {
    repositoryVerificationStatus: "not_checked" | "verified" | "failed";
    repositoryVerificationStatusReason: string | null;
  } | null;
};

const createDeploymentParamsSchema = z.object({
  projectId: z.uuid()
});

const createDeploymentBodySchema = z
  .object({
    architectureId: z.uuid(),
    terraformArtifactId: z.uuid(),
    awsConnectionId: z.uuid(),
    liveProfile: z
      .enum(["practice", "demo_web_service", "demo_web_service_with_rds"])
      .default("practice"),
    scope: z.enum(["infrastructure", "application", "full_stack"]).optional(),
    targetKind: z.enum(["ecs_fargate", "lambda", "ec2_asg", "static_site"]).nullable().optional(),
    source: z.enum(["direct", "gitops"]).optional()
  })
  .strict();

const prepareDeploymentBodySchema = z
  .object({
    architectureId: z.uuid(),
    terraformArtifactId: z.uuid(),
    awsConnectionId: z.uuid(),
    draftRevision: z.number().int().positive(),
    scope: z.enum(["auto", "infrastructure", "application", "full_stack"])
  })
  .strict();

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
  createDeploymentJobRepository?: (db: DatabaseClient["db"]) => DeploymentJobRepository;
  workerDispatcher?: DeploymentWorkerDispatcher;
  workerDispatchMode?: DeploymentWorkerMode;
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
  prepareProjectBuildEnvironment?: (input: {
    architectureId: string;
    db: DatabaseClient["db"];
    projectId: string;
    userId: string;
  }) => Promise<void>;
  verifyProjectRepositoryAccess?: (input: {
    db: DatabaseClient["db"];
    projectId: string;
    userId: string;
  }) => Promise<RepositoryAccessVerificationResult>;
  retryApplicationFrontendRelease?: (input: {
    db: DatabaseClient["db"];
    deploymentId: string;
    userId: string;
  }) => Promise<void>;
  approveDeploymentPlan?: (
    input: ApproveDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<DeploymentRecord>;
  revokeDeploymentApproval?: (
    input: { deploymentId: string; accessContext: ProjectAccessContext },
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
  projectAssetStorage?: ProjectAssetStorage;
  runtimeCache?: RuntimeCache;
};

type DeploymentRequestContext = {
  accessContext: ProjectAccessContext;
  db: DatabaseClient["db"];
  jobRepository: DeploymentJobRepository;
  repository: DeploymentRepository;
};

type ReservedRouteExecutionLease = {
  fence: LeaseFence;
  repository: ProjectExecutionLeaseRepository;
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

  const repository =
    options?.createDeploymentRepository?.(client.db) ??
    createPostgresDeploymentRepository(client.db);

  return {
    accessContext: createUserProjectAccessContext(currentUserId),
    db: client.db,
    jobRepository:
      options?.createDeploymentJobRepository?.(client.db) ??
      createPostgresDeploymentJobRepository(client.db),
    repository: options?.runtimeCache
      ? createRuntimeCachedDeploymentRepository({
          repository,
          runtimeCache: options.runtimeCache
        })
      : repository
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

function createDeploymentWorkerDispatch(options: DeploymentRouteOptions | undefined): {
  dispatcher: DeploymentWorkerDispatcher;
  enabled: boolean;
} {
  const mode = options?.workerDispatchMode ?? getDeploymentWorkerMode();

  if (mode === "in_process") {
    return {
      dispatcher: createLocalDeploymentWorkerDispatcher(),
      enabled: false
    };
  }

  return {
    dispatcher:
      options?.workerDispatcher ??
      (mode === "ecs"
        ? createConfiguredDeploymentWorkerDispatcher()
        : createLocalDeploymentWorkerDispatcher()),
    enabled: true
  };
}

async function prepareEcsBuildEnvironmentForPlan(input: {
  db: DatabaseClient["db"];
  deployment: DeploymentRecord;
  options: DeploymentRouteOptions | undefined;
  userId: string;
}): Promise<void> {
  if (
    input.deployment.scope === "infrastructure" ||
    input.deployment.targetKind !== "ecs_fargate"
  ) {
    return;
  }

  const prepareProjectBuildEnvironment =
    input.options?.prepareProjectBuildEnvironment ??
    (async (preparation: {
      architectureId: string;
      db: DatabaseClient["db"];
      projectId: string;
      userId: string;
    }) => {
      await prepareProjectBuildEnvironmentService(
        {
          architectureId: preparation.architectureId,
          projectId: preparation.projectId,
          userId: preparation.userId
        },
        createPostgresProjectBuildEnvironmentRepository(preparation.db),
        createAwsProjectBuildEnvironmentGateway()
      );
    });
  await prepareProjectBuildEnvironment({
    architectureId: input.deployment.architectureId,
    db: input.db,
    projectId: input.deployment.projectId,
    userId: input.userId
  });

  const verifyProjectRepositoryAccess =
    input.options?.verifyProjectRepositoryAccess ??
    (async (verification: { db: DatabaseClient["db"]; projectId: string; userId: string }) =>
      verifyProjectRepositoryAccessService(
        {
          projectId: verification.projectId,
          userId: verification.userId
        },
        createPostgresProjectBuildEnvironmentRepository(verification.db),
        createAwsProjectBuildEnvironmentGateway()
      ));
  const verification = await verifyProjectRepositoryAccess({
    db: input.db,
    projectId: input.deployment.projectId,
    userId: input.userId
  });
  if (verification.buildEnvironment?.repositoryVerificationStatus !== "verified") {
    throw new ProjectBuildEnvironmentError(
      "REPOSITORY_ACCESS_VERIFICATION_REQUIRED",
      verification.buildEnvironment?.repositoryVerificationStatusReason ??
        "Repository checkout verification must succeed before Terraform Plan"
    );
  }
}

async function isMatchingActiveDeploymentOperation(input: {
  deployment: DeploymentRecord;
  operation: DeploymentJobOperation;
  jobRepository: DeploymentJobRepository;
}): Promise<boolean> {
  const activeJob = await input.jobRepository.findActiveDeploymentJob(input.deployment.id);

  if (!activeJob) {
    return false;
  }

  if (activeJob.operation === input.operation) {
    return true;
  }

  throw new DeploymentConflictError(`Deployment ${activeJob.operation} is already running`);
}

async function dispatchDeploymentWorkerJob(
  input: {
    failureStage: "init" | "plan" | "apply" | "application_release" | "rollback" | "destroy";
    job: DeploymentJobRecord;
    staleFailureMessage: string;
    leaseReservation?: ReservedRouteExecutionLease;
  },
  dispatcher: DeploymentWorkerDispatcher,
  jobRepository: DeploymentJobRepository,
  repository: DeploymentRepository
): Promise<void> {
  await markDeploymentJobDispatching({ jobId: input.job.id }, jobRepository);

  try {
    const dispatchResult = await dispatcher.dispatch({ job: input.job });

    if (!dispatchResult.taskArn) {
      throw new Error("Deployment worker dispatch did not return a task ARN");
    }

    if (input.leaseReservation) {
      await recordProjectExecutionCoordinates(
        {
          ...input.leaseReservation.fence,
          activeWorkerTaskArn: dispatchResult.taskArn
        },
        input.leaseReservation.repository
      );
    }

    await recordDeploymentJobTaskArn(
      { jobId: input.job.id, ecsTaskArn: dispatchResult.taskArn },
      jobRepository
    );

    await markDeploymentJobRunning(
      {
        jobId: input.job.id,
        ecsTaskArn: dispatchResult.taskArn
      },
      jobRepository
    );
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message : input.staleFailureMessage;
    await failDeploymentJob({ jobId: input.job.id, errorSummary }, jobRepository);
    await repository.failDeployment(input.job.deploymentId, {
      failureStage: input.failureStage,
      errorSummary,
      ...(input.leaseReservation
        ? { leaseFence: input.leaseReservation.fence, fenceCheckedAt: new Date() }
        : {})
    });
    throw error;
  }
}

async function reserveRouteExecutionLease(
  deployment: DeploymentRecord,
  holderId: string,
  repository: DeploymentRepository
): Promise<ReservedRouteExecutionLease | undefined> {
  const leaseRepository = repository.projectExecutionLeaseRepository;
  if (!leaseRepository) return undefined;
  const lease = await acquireProjectExecutionLease(
    {
      projectId: deployment.projectId,
      holderId,
      source: "direct"
    },
    leaseRepository
  );
  return {
    fence: {
      projectId: lease.projectId,
      holderId: lease.holderId,
      fencingVersion: lease.fencingVersion
    },
    repository: leaseRepository
  };
}

async function releaseReservedRouteExecutionLease(
  reservation: ReservedRouteExecutionLease | undefined
): Promise<void> {
  if (!reservation) return;
  await releaseProjectExecutionLease(reservation.fence, reservation.repository).catch(() => false);
}

async function failStoppedDeploymentWithRecoveredLease(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const failure = {
    failureStage: deployment.activeStage ?? ("apply" as const),
    errorSummary:
      "배포 워커 종료를 확인했습니다. Terraform 인프라 변경은 자동 롤백하지 않았으므로 현재 AWS 리소스와 state를 확인한 뒤 이전 버전 롤백 여부를 결정해 주세요."
  };
  const leaseRepository = repository.projectExecutionLeaseRepository;
  if (!leaseRepository) {
    const failed = await repository.failDeployment(deployment.id, failure);
    if (!failed) throw new DeploymentNotFoundError("Deployment not found");
    return failed;
  }
  const interrupted = await leaseRepository.find(deployment.projectId);
  if (!interrupted || interrupted.status !== "active") {
    const failed = await repository.failDeployment(deployment.id, failure);
    if (!failed) throw new DeploymentNotFoundError("Deployment not found");
    return failed;
  }
  if (
    interrupted.source !== "direct" ||
    (interrupted.holderId !== deployment.id && interrupted.holderId !== `destroy:${deployment.id}`)
  ) {
    throw new ProjectExecutionLeaseError(
      "LEASE_RECOVERY_REQUIRED",
      "중단된 배포가 현재 프로젝트 실행 잠금의 소유자가 아닙니다.",
      interrupted.source
    );
  }
  const recovered = await recoverVerifiedTerminalProjectExecutionLease(
    {
      projectId: interrupted.projectId,
      expectedHolderId: interrupted.holderId,
      expectedFencingVersion: interrupted.fencingVersion,
      expectedActiveCodeBuildId: interrupted.activeCodeBuildId,
      expectedActiveWorkerTaskArn: interrupted.activeWorkerTaskArn,
      holderId: `cancel:direct:${deployment.id}:${randomUUID()}`,
      source: "direct"
    },
    leaseRepository
  );
  const fence = {
    projectId: recovered.projectId,
    holderId: recovered.holderId,
    fencingVersion: recovered.fencingVersion
  };
  const failed = await repository.failDeployment(deployment.id, {
    ...failure,
    leaseFence: fence,
    fenceCheckedAt: new Date()
  });
  if (!failed) throw new DeploymentNotFoundError("Deployment not found");
  const released = await releaseProjectExecutionLease(fence, leaseRepository);
  if (!released) {
    throw new ProjectExecutionLeaseError(
      "LEASE_RECOVERY_REQUIRED",
      "중단된 배포 상태는 저장했지만 프로젝트 실행 잠금을 해제하지 못했습니다.",
      "direct"
    );
  }
  return failed;
}

function handleDeploymentError(error: unknown, reply: FastifyReply) {
  if (error instanceof ProjectExecutionLeaseError) {
    return reply.status(409).send({
      error: error.code,
      message: error.message,
      activeSource: error.activeSource
    });
  }
  if (error instanceof ProjectBuildEnvironmentError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message
    });
  }

  if (error instanceof DirectApplicationReleaseError) {
    return reply.status(409).send({
      error: error.code ?? "APPLICATION_RELEASE_FRONTEND_RETRY_FAILED",
      message: error.message
    });
  }

  if (error instanceof TerraformArtifactSafetyError) {
    return reply.status(409).send({
      error: "terraform_artifact_unsafe",
      message: error.message
    });
  }

  if (error instanceof DeploymentNotFoundError) {
    return reply.status(404).send({
      error: "not_found",
      message: error instanceof Error ? error.message : "Deployment not found"
    });
  }

  if (error instanceof DeploymentConflictError || error instanceof DeploymentJobConflictError) {
    return reply.status(409).send({
      error: "conflict",
      message: error.message
    });
  }

  throw error;
}

function requireDeploymentPreparationRepository(
  repository: DeploymentRepository
): DeploymentRepository & DeploymentPreparationRepository {
  if (!repository.findProjectDraftForPreparation || !repository.findProjectTargetForPreparation) {
    throw new Error("Deployment preparation repository is not configured");
  }

  return repository as DeploymentRepository & DeploymentPreparationRepository;
}

async function toDeployment(
  row: DeploymentRow,
  repository: DeploymentRepository
): Promise<Deployment> {
  const currentPlanOperation =
    row.currentPlanOperation ??
    (row.currentPlanArtifactId
      ? ((await repository.findDeploymentPlanArtifactById(row.currentPlanArtifactId))?.operation ??
        null)
      : null);

  return {
    id: row.id,
    projectId: row.projectId,
    architectureId: row.architectureId,
    terraformArtifactId: row.terraformArtifactId,
    awsConnectionId: row.awsConnectionId,
    awsAccountIdSnapshot: row.awsAccountIdSnapshot,
    awsRegionSnapshot: row.awsRegionSnapshot,
    awsConnectionNameSnapshot: row.awsConnectionNameSnapshot,
    liveProfile: row.liveProfile,
    scope: row.scope,
    targetKind: row.targetKind,
    source: row.source,
    releaseId: row.releaseId,
    releaseCandidateId: row.releaseCandidateId,
    rollbackOfDeploymentId: row.rollbackOfDeploymentId,
    rollbackTargetDeploymentId: row.rollbackTargetDeploymentId,
    consolePhase: getDeploymentConsolePhase(row),
    preparedDraftRevision: row.preparedDraftRevision,
    preparedSnapshotHash: row.preparedSnapshotHash,
    approvedPreparedSnapshotHash: row.approvedPreparedSnapshotHash,
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
          awsConnectionId: body.awsConnectionId,
          liveProfile: body.liveProfile,
          ...(body.scope !== undefined ? { scope: body.scope } : {}),
          ...(body.targetKind !== undefined ? { targetKind: body.targetKind } : {}),
          ...(body.source !== undefined ? { source: body.source } : {})
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
          request.log.warn(
            { error, projectId: params.projectId },
            "Failed to prune deployment history"
          );
        }
      }

      return reply.status(201).send({
        deployment: await toDeployment(deployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/projects/:projectId/deployments/prepare", async (request, reply) => {
    const params = createDeploymentParamsSchema.parse(request.params);
    const body = prepareDeploymentBodySchema.parse(request.body);
    const { accessContext, db, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const project = await repository.findAccessibleProject(params.projectId, accessContext);
      if (!project) {
        throw new DeploymentNotFoundError("Project not found");
      }

      const preparationRepository = requireDeploymentPreparationRepository(repository);
      const preparation = await resolveDeploymentPreparation(
        {
          projectId: params.projectId,
          awsConnectionId: body.awsConnectionId,
          draftRevision: body.draftRevision,
          requestedScope: body.scope
        },
        preparationRepository
      );
      const preparationKey = createDeploymentPreparationKey({
        awsConnectionId: body.awsConnectionId,
        deploymentTargetFingerprint: preparation.deploymentTargetFingerprint,
        preparedDraftRevision: preparation.preparedDraftRevision,
        preparedSnapshotHash: preparation.preparedSnapshotHash,
        projectId: params.projectId,
        scope: preparation.scope,
        targetKind: preparation.targetKind
      });
      const deployment = await createDeployment(
        {
          projectId: params.projectId,
          accessContext,
          architectureId: body.architectureId,
          terraformArtifactId: body.terraformArtifactId,
          awsConnectionId: body.awsConnectionId,
          liveProfile: preparation.liveProfile,
          scope: preparation.scope,
          targetKind: preparation.targetKind,
          source: "direct",
          preparedDraftRevision: preparation.preparedDraftRevision,
          preparedSnapshotHash: preparation.preparedSnapshotHash,
          preparationKey
        },
        repository
      );

      if (pruneProjectDeploymentStorage) {
        try {
          await pruneProjectDeploymentStorage({ db, projectId: params.projectId });
        } catch (error) {
          request.log.warn(
            { error, projectId: params.projectId },
            "Failed to prune deployment history"
          );
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
    "/deployments/:deploymentId/live-observation-architecture",
    async (
      request,
      reply
    ): Promise<DeploymentLiveObservationArchitectureResponse | FastifyReply> => {
      const params = deploymentParamsSchema.parse(request.params);
      const { accessContext, repository } = await getDeploymentRequestContext(
        request,
        options,
        getDeploymentDatabaseClient
      );

      try {
        return reply.status(200).send(
          await getDeploymentLiveObservationArchitecture(
            {
              deploymentId: params.deploymentId,
              accessContext
            },
            repository
          )
        );
      } catch (error) {
        return handleDeploymentError(error, reply);
      }
    }
  );

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

  app.post("/deployments/:deploymentId/infrastructure-rollback", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );

    try {
      const deployment = await prepareInfrastructureRollback(
        { deploymentId: params.deploymentId, accessContext },
        repository
      );
      return reply.status(201).send({
        deployment: await toDeployment(deployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/init", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, jobRepository, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentInit = options?.runDeploymentInit ?? defaultRunDeploymentInit;
    const workerDispatch = createDeploymentWorkerDispatch(options);

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
        if (
          workerDispatch.enabled &&
          (await isMatchingActiveDeploymentOperation({
            deployment,
            operation: "init",
            jobRepository
          }))
        ) {
          return reply.status(202).send({
            deployment: await toDeployment(deployment, repository)
          });
        }

        throw new DeploymentConflictError("Deployment init is already running");
      }

      const queuedJob = workerDispatch.enabled
        ? await createDeploymentJob(
            {
              deploymentId: params.deploymentId,
              operation: "init",
              accessContext,
              startedFromStatus: deployment.status
            },
            jobRepository
          )
        : undefined;

      const runningDeployment = await repository.markDeploymentInitRunning(deployment.id);

      if (!runningDeployment) {
        if (queuedJob) {
          await failDeploymentJob(
            {
              jobId: queuedJob.id,
              errorSummary: "Deployment init could not be started"
            },
            jobRepository
          );
        }
        throw new DeploymentConflictError("Deployment init could not be started");
      }

      if (queuedJob) {
        await dispatchDeploymentWorkerJob(
          {
            job: queuedJob,
            failureStage: "init",
            staleFailureMessage: "Deployment init ECS worker dispatch failed"
          },
          workerDispatch.dispatcher,
          jobRepository,
          repository
        );
      } else {
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
      }

      return reply.status(202).send({
        deployment: await toDeployment(runningDeployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/plan", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const { accessContext, db, jobRepository, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentPlan = options?.runDeploymentPlan ?? defaultRunDeploymentPlan;
    const workerDispatch = createDeploymentWorkerDispatch(options);
    let reservedLease: ReservedRouteExecutionLease | undefined;
    let executionHandedOff = false;
    let runningDeployment: DeploymentRecord | undefined;
    let routeFailureStage: "build_environment" | "plan" = "build_environment";

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
        const isSamePlanExecution =
          workerDispatch.enabled &&
          (await isMatchingActiveDeploymentOperation({
            deployment,
            operation: "plan",
            jobRepository
          }));

        if (isSamePlanExecution || deployment.activeStage === "plan") {
          return reply.status(202).send({
            deployment: await toDeployment(deployment, repository)
          });
        }

        throw new DeploymentConflictError("Another deployment operation is already running");
      }

      if (deployment.status === "SUCCESS" || deployment.status === "DESTROYED") {
        throw new DeploymentConflictError("Deployment cannot be replanned in this state");
      }

      await requireNoRunningDeploymentInProject(deployment, repository);
      reservedLease = await reserveRouteExecutionLease(deployment, deployment.id, repository);
      runningDeployment = await repository.markDeploymentPlanRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment plan could not be started");
      }

      await prepareEcsBuildEnvironmentForPlan({
        db,
        deployment,
        options,
        userId: accessContext.userId
      });
      routeFailureStage = "plan";

      const queuedJob = workerDispatch.enabled
        ? await createDeploymentJob(
            {
              deploymentId: params.deploymentId,
              operation: "plan",
              accessContext,
              startedFromStatus: deployment.status
            },
            jobRepository
          )
        : undefined;

      if (queuedJob) {
        await dispatchDeploymentWorkerJob(
          {
            job: queuedJob,
            failureStage: "plan",
            staleFailureMessage: "Deployment plan ECS worker dispatch failed",
            ...(reservedLease ? { leaseReservation: reservedLease } : {})
          },
          workerDispatch.dispatcher,
          jobRepository,
          repository
        );
      } else {
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
      }
      executionHandedOff = true;

      return reply.status(202).send({
        deployment: await toDeployment(runningDeployment, repository)
      });
    } catch (error) {
      if (!executionHandedOff) {
        if (runningDeployment) {
          await repository
            .failDeployment(runningDeployment.id, {
              failureStage: routeFailureStage,
              errorSummary:
                error instanceof ProjectBuildEnvironmentError
                  ? error.message
                  : "Deployment plan preparation failed"
            })
            .catch(() => undefined);
        }
        await releaseReservedRouteExecutionLease(reservedLease);
      }
      return handleDeploymentError(error, reply);
    }
  });

  app.post(
    "/deployments/:deploymentId/application-release/frontend/retry",
    async (request, reply) => {
      const params = deploymentParamsSchema.parse(request.params);
      const { accessContext, db, jobRepository, repository } = await getDeploymentRequestContext(
        request,
        options,
        getDeploymentDatabaseClient
      );
      const workerDispatch = createDeploymentWorkerDispatch(options);
      let reservedLease: ReservedRouteExecutionLease | undefined;
      let executionHandedOff = false;
      try {
        const deployment = await getDeployment(
          { deploymentId: params.deploymentId, accessContext },
          repository
        );
        if (
          !options?.retryApplicationFrontendRelease &&
          workerDispatch.enabled &&
          (await isMatchingActiveDeploymentOperation({
            deployment,
            operation: "retry_application_frontend",
            jobRepository
          }))
        ) {
          return reply.status(202).send({
            deployment: await toDeployment(deployment, repository)
          });
        }
        const release = await repository.findRelease?.(deployment.id);
        if (repository.findRelease && !release) {
          throw new DeploymentConflictError("재시도할 앱 릴리즈를 찾을 수 없습니다.");
        }
        reservedLease = await reserveRouteExecutionLease(
          deployment,
          release?.id ?? deployment.id,
          repository
        );
        if (options?.retryApplicationFrontendRelease) {
          await options.retryApplicationFrontendRelease({
            db,
            deploymentId: params.deploymentId,
            userId: accessContext.userId
          });
          await releaseReservedRouteExecutionLease(reservedLease);
          return reply.status(204).send();
        }
        if (!workerDispatch.enabled) {
          throw new DeploymentConflictError(
            "웹 배포 재시도는 신뢰된 ECS deployment worker가 필요합니다."
          );
        }
        const queuedJob = await createDeploymentJob(
          {
            deploymentId: deployment.id,
            operation: "retry_application_frontend",
            accessContext,
            startedFromStatus: deployment.status,
            startedFromFailureStage: deployment.failureStage
          },
          jobRepository
        );
        await dispatchDeploymentWorkerJob(
          {
            job: queuedJob,
            failureStage: "application_release",
            staleFailureMessage: "Application frontend retry worker dispatch failed",
            ...(reservedLease ? { leaseReservation: reservedLease } : {})
          },
          workerDispatch.dispatcher,
          jobRepository,
          repository
        );
        executionHandedOff = true;
        return reply.status(202).send({ deployment: await toDeployment(deployment, repository) });
      } catch (error) {
        if (!executionHandedOff) await releaseReservedRouteExecutionLease(reservedLease);
        return handleDeploymentError(error, reply);
      }
    }
  );

  app.post("/deployments/:deploymentId/approve", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    const body = approveDeploymentBodySchema.parse(request.body ?? {});
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const approveDeploymentPlan = options?.approveDeploymentPlan;

    try {
      const input = {
        deploymentId: params.deploymentId,
        accessContext,
        acknowledgedWarningIds: body.acknowledgedWarningIds
      };
      const deployment = approveDeploymentPlan
        ? await approveDeploymentPlan(input, repository)
        : await defaultApproveDeploymentPlan(input, repository, {
            ...(options?.projectAssetStorage
              ? { projectAssetStorage: options.projectAssetStorage }
              : {})
          });

      return reply.status(200).send({
        deployment: await toDeployment(deployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/revoke-approval", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const revokeApproval = options?.revokeDeploymentApproval;

    try {
      const input = {
        deploymentId: params.deploymentId,
        accessContext
      };
      const deployment = revokeApproval
        ? await revokeApproval(input, repository)
        : await defaultRevokeDeploymentApproval(input, repository);

      return reply.status(200).send({
        deployment: await toDeployment(deployment, repository)
      });
    } catch (error) {
      return handleDeploymentError(error, reply);
    }
  });
  const handleDeploymentExecute = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, jobRepository, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentApply = options?.runDeploymentApply ?? defaultRunDeploymentApply;
    const workerDispatch = createDeploymentWorkerDispatch(options);
    let reservedLease: ReservedRouteExecutionLease | undefined;
    let executionHandedOff = false;

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      await requireDeploymentInitArtifact(deployment, repository);
      if (
        deployment.status === "RUNNING" &&
        workerDispatch.enabled &&
        (await isMatchingActiveDeploymentOperation({
          deployment,
          operation: "apply",
          jobRepository
        }))
      ) {
        return reply.status(202).send({
          deployment: await toDeployment(deployment, repository)
        });
      }
      requireDeploymentCanStartApply(deployment);
      await requireNoRunningDeploymentInProject(deployment, repository);
      reservedLease = await reserveRouteExecutionLease(deployment, deployment.id, repository);

      const queuedJob = workerDispatch.enabled
        ? await createDeploymentJob(
            {
              deploymentId: params.deploymentId,
              operation: "apply",
              accessContext,
              startedFromStatus: deployment.status
            },
            jobRepository
          )
        : undefined;

      const runningDeployment = await repository.markDeploymentApplyRunning(deployment.id);

      if (!runningDeployment) {
        if (queuedJob) {
          await failDeploymentJob(
            {
              jobId: queuedJob.id,
              errorSummary: "Deployment apply could not be started"
            },
            jobRepository
          );
        }
        throw new DeploymentConflictError("Deployment apply could not be started");
      }

      if (queuedJob) {
        await dispatchDeploymentWorkerJob(
          {
            job: queuedJob,
            failureStage: "apply",
            staleFailureMessage: "Deployment apply ECS worker dispatch failed",
            ...(reservedLease ? { leaseReservation: reservedLease } : {})
          },
          workerDispatch.dispatcher,
          jobRepository,
          repository
        );
      } else {
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
      }
      executionHandedOff = true;

      return reply.status(202).send({
        deployment: await toDeployment(runningDeployment, repository)
      });
    } catch (error) {
      if (!executionHandedOff) await releaseReservedRouteExecutionLease(reservedLease);
      return handleDeploymentError(error, reply);
    }
  };

  app.post("/deployments/:deploymentId/apply", handleDeploymentExecute);
  app.post("/deployments/:deploymentId/execute", handleDeploymentExecute);

  app.post("/deployments/:deploymentId/destroy/plan", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, jobRepository, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentDestroyPlan =
      options?.runDeploymentDestroyPlan ?? defaultRunDeploymentDestroyPlan;
    const workerDispatch = createDeploymentWorkerDispatch(options);

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      await requireDeploymentInitArtifact(deployment, repository);
      if (
        deployment.status === "RUNNING" &&
        workerDispatch.enabled &&
        (await isMatchingActiveDeploymentOperation({
          deployment,
          operation: "destroy_plan",
          jobRepository
        }))
      ) {
        return reply.status(202).send({
          deployment: await toDeployment(deployment, repository)
        });
      }
      requireDeploymentCanStartDestroyPlan(deployment);
      await requireNoRunningDeploymentInProject(deployment, repository);

      const queuedJob = workerDispatch.enabled
        ? await createDeploymentJob(
            {
              deploymentId: params.deploymentId,
              operation: "destroy_plan",
              accessContext,
              startedFromStatus: deployment.status,
              startedFromFailureStage: deployment.failureStage
            },
            jobRepository
          )
        : undefined;

      const runningDeployment = await repository.markDeploymentPlanRunning(
        deployment.id,
        "destroy"
      );

      if (!runningDeployment) {
        if (queuedJob) {
          await failDeploymentJob(
            {
              jobId: queuedJob.id,
              errorSummary: "Deployment destroy plan could not be started"
            },
            jobRepository
          );
        }
        throw new DeploymentConflictError("Deployment destroy plan could not be started");
      }

      if (queuedJob) {
        await dispatchDeploymentWorkerJob(
          {
            job: queuedJob,
            failureStage: "plan",
            staleFailureMessage: "Deployment destroy plan ECS worker dispatch failed"
          },
          workerDispatch.dispatcher,
          jobRepository,
          repository
        );
      } else {
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
      }

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
    const { accessContext, jobRepository, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const runDeploymentDestroy = options?.runDeploymentDestroy ?? defaultRunDeploymentDestroy;
    const workerDispatch = createDeploymentWorkerDispatch(options);
    let reservedLease: ReservedRouteExecutionLease | undefined;
    let executionHandedOff = false;

    try {
      const deployment = await getDeployment(
        {
          deploymentId: params.deploymentId,
          accessContext
        },
        repository
      );
      await requireDeploymentInitArtifact(deployment, repository);
      if (
        deployment.status === "RUNNING" &&
        workerDispatch.enabled &&
        (await isMatchingActiveDeploymentOperation({
          deployment,
          operation: "destroy",
          jobRepository
        }))
      ) {
        return reply.status(202).send({
          deployment: await toDeployment(deployment, repository)
        });
      }
      await requireDeploymentCanStartDestroy(deployment, repository);
      await requireNoRunningDeploymentInProject(deployment, repository);
      const destroyHolderId =
        deployment.scope === "application"
          ? (await repository.findRelease?.(deployment.id))?.id
          : `destroy:${deployment.id}`;
      if (!destroyHolderId) {
        throw new DeploymentConflictError("정리할 앱 릴리즈를 찾을 수 없습니다.");
      }
      reservedLease = await reserveRouteExecutionLease(deployment, destroyHolderId, repository);

      const queuedJob = workerDispatch.enabled
        ? await createDeploymentJob(
            {
              deploymentId: params.deploymentId,
              operation: "destroy",
              accessContext,
              startedFromStatus: deployment.status,
              startedFromFailureStage: deployment.failureStage
            },
            jobRepository
          )
        : undefined;

      const runningDeployment = await repository.markDeploymentDestroyRunning(deployment.id);

      if (!runningDeployment) {
        if (queuedJob) {
          await failDeploymentJob(
            {
              jobId: queuedJob.id,
              errorSummary: "Deployment destroy could not be started"
            },
            jobRepository
          );
        }
        throw new DeploymentConflictError("Deployment destroy could not be started");
      }

      if (queuedJob) {
        await dispatchDeploymentWorkerJob(
          {
            job: queuedJob,
            failureStage: "destroy",
            staleFailureMessage: "Deployment destroy ECS worker dispatch failed",
            ...(reservedLease ? { leaseReservation: reservedLease } : {})
          },
          workerDispatch.dispatcher,
          jobRepository,
          repository
        );
      } else {
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
      }
      executionHandedOff = true;

      return reply.status(202).send({
        deployment: await toDeployment(runningDeployment, repository)
      });
    } catch (error) {
      if (!executionHandedOff) await releaseReservedRouteExecutionLease(reservedLease);
      return handleDeploymentError(error, reply);
    }
  });

  app.post("/deployments/:deploymentId/cancel", async (request, reply) => {
    const params = deploymentParamsSchema.parse(request.params);
    z.object({}).parse(request.body ?? {});
    const { accessContext, jobRepository, repository } = await getDeploymentRequestContext(
      request,
      options,
      getDeploymentDatabaseClient
    );
    const workerDispatch = createDeploymentWorkerDispatch(options);

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
        if (workerDispatch.enabled) {
          const activeJob = await jobRepository.findActiveDeploymentJob(params.deploymentId);

          if (activeJob) {
            const stopResult = await workerDispatch.dispatcher.stop({
              job: activeJob,
              reason: "SketchCatch deployment cancellation requested"
            });

            if (stopResult.errorSummary) {
              request.log.warn(
                {
                  deploymentId: params.deploymentId,
                  deploymentJobId: activeJob.id
                },
                stopResult.errorSummary
              );

              return reply.status(503).send({
                error: "worker_unavailable",
                message: stopResult.errorSummary
              });
            }
            const stopped = stopResult.stopped;

            await cancelDeploymentJob(
              {
                jobId: activeJob.id,
                errorSummary: stopped
                  ? "Cancellation was requested and the ECS worker reached STOPPED."
                  : "Cancellation was requested and no active ECS worker remained."
              },
              jobRepository
            );

            if (
              cancellationRequestedDeployment.activeStage === "preflight" ||
              cancellationRequestedDeployment.activeStage === "application_release" ||
              cancellationRequestedDeployment.activeStage === "rollback"
            ) {
              const recoveryJob = await createDeploymentJob(
                {
                  deploymentId: params.deploymentId,
                  operation: "recover_application_release",
                  accessContext,
                  startedFromStatus: cancellationRequestedDeployment.status,
                  startedFromFailureStage: cancellationRequestedDeployment.activeStage
                },
                jobRepository
              );
              await dispatchDeploymentWorkerJob(
                {
                  job: recoveryJob,
                  failureStage: "rollback",
                  staleFailureMessage: "Application release recovery worker dispatch failed"
                },
                workerDispatch.dispatcher,
                jobRepository,
                repository
              );
              return reply.status(202).send({
                deployment: await toDeployment(cancellationRequestedDeployment, repository)
              });
            }

            const stoppedDeployment = await failStoppedDeploymentWithRecoveredLease(
              cancellationRequestedDeployment,
              repository
            );
            return reply.status(202).send({
              deployment: await toDeployment(stoppedDeployment, repository)
            });
          }
        }

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
        runtimeCache: options?.runtimeCache,
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
  runtimeCache?: RuntimeCache | undefined;
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

      if (nextLogs.length > 0 && input.runtimeCache) {
        await writeDeploymentLogStreamCursor({
          deploymentId: input.deploymentId,
          lastSequence,
          runtimeCache: input.runtimeCache
        });
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

  if (deployment.scope !== "application" && !deployment.stateObjectKey) {
    throw new DeploymentConflictError("Terraform state is required before destroy");
  }

  if (isDeploymentDestroySourceStatus(deployment.status)) {
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
      log.error(
        { deploymentId: input.deploymentId },
        "Deployment destroy plan background job failed"
      );
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
