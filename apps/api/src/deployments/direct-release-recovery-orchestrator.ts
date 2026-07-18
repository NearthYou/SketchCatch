import {
  BatchGetBuildsCommand,
  CodeBuildClient,
  StopBuildCommand
} from "@aws-sdk/client-codebuild";
import { and, asc, eq, inArray, notInArray, or } from "drizzle-orm";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import type { Database } from "../db/client.js";
import type { DeploymentFailureStage, DeploymentStatus } from "@sketchcatch/types";
import {
  applicationReleases,
  applicationReleaseSteps,
  deployments,
  projects,
  releaseCandidates
} from "../db/schema.js";
import { createAwsEcsFargateReleaseGateway } from "../releases/aws-ecs-fargate-release-gateway.js";
import {
  acquireProjectExecutionLease,
  createPostgresProjectExecutionLeaseRepository,
  recordProjectExecutionCoordinates,
  recoverVerifiedTerminalProjectExecutionLease,
  releaseProjectExecutionLease
} from "../releases/project-execution-lease-service.js";
import { createPostgresTrustedReleaseRepository } from "../releases/trusted-release-step-repository.js";
import type { DirectApplicationReleaseContext } from "./direct-application-release-service.js";
import { createPostgresDirectApplicationReleaseRepository } from "./direct-application-release-service.js";
import {
  recoverInterruptedDirectApplicationRelease,
  type InterruptedDirectApplicationReleaseData
} from "./direct-release-recovery.js";
import { createPostgresDeploymentRepository } from "./deployment-service.js";
import { resolvePersistedEcsReleaseBaseline } from "./aws-codebuild-direct-application-release-gateway.js";
import { maskDeploymentMessage } from "./log-masking.js";
import type { ProjectExecutionLeaseRepository } from "../releases/project-execution-lease-service.js";
import {
  createDeploymentJob,
  DeploymentJobConflictError,
  failDeploymentJob,
  markDeploymentJobDispatching,
  markDeploymentJobRunning,
  recordDeploymentJobTaskArn,
  type DeploymentJobRepository
} from "./deployment-job-service.js";
import type { DeploymentWorkerDispatcher } from "./deployment-worker-dispatcher.js";

export type InterruptedDirectReleaseDescriptor = {
  deploymentId: string;
  userId: string;
  deploymentStatus: DeploymentStatus;
  activeStage: DeploymentFailureStage | null;
  failureStage: DeploymentFailureStage | null;
};

export type InterruptedDirectReleaseRecoveryStore = {
  listInterrupted(input: {
    excludeDeploymentIds: readonly string[];
  }): Promise<InterruptedDirectReleaseDescriptor[]>;
  load(
    descriptor: InterruptedDirectReleaseDescriptor
  ): Promise<InterruptedDirectApplicationReleaseData>;
};

export type DirectCodeBuildExecutionState = "active" | "terminal" | "unknown";

export type DirectReleaseRecoveryBatchDependencies = {
  store: InterruptedDirectReleaseRecoveryStore;
  leaseRepository: Pick<ProjectExecutionLeaseRepository, "find">;
  inspectCodeBuild(input: {
    context: DirectApplicationReleaseContext;
    buildId: string;
  }): Promise<DirectCodeBuildExecutionState>;
  stopCodeBuild?(input: {
    context: DirectApplicationReleaseContext;
    buildId: string;
  }): Promise<void>;
  recoverRelease(
    data: InterruptedDirectApplicationReleaseData,
    verification: {
      codeBuildTerminalConfirmed: boolean;
      workerTerminalConfirmed: boolean;
    }
  ): Promise<void>;
  onRecoveryError?: (input: { deploymentId: string; error: unknown }) => void;
};

export async function recoverInterruptedDirectReleaseBatch(
  input: {
    excludeDeploymentIds: readonly string[];
    onlyDeploymentIds?: readonly string[];
    stopActiveCodeBuild?: boolean;
  },
  dependencies: DirectReleaseRecoveryBatchDependencies
): Promise<{ recoveredDeploymentIds: string[]; retryDeploymentIds: string[] }> {
  const excluded = new Set(input.excludeDeploymentIds);
  const included = input.onlyDeploymentIds ? new Set(input.onlyDeploymentIds) : null;
  const descriptors = await dependencies.store.listInterrupted(input);
  const recoveredDeploymentIds: string[] = [];
  const retryDeploymentIds: string[] = [];

  for (const descriptor of descriptors) {
    if (excluded.has(descriptor.deploymentId)) continue;
    if (included && !included.has(descriptor.deploymentId)) continue;
    if (!isApplicationReleaseRecoveryDescriptor(descriptor)) continue;
    try {
      const data = await dependencies.store.load(descriptor);
      const lease = await dependencies.leaseRepository.find(data.context.deployment.projectId);
      let codeBuildTerminalConfirmed = false;
      if (lease?.activeCodeBuildId) {
        if (input.stopActiveCodeBuild) {
          if (!dependencies.stopCodeBuild) {
            throw new Error("Direct release CodeBuild cancellation is unavailable");
          }
          await dependencies.stopCodeBuild({
            context: data.context,
            buildId: lease.activeCodeBuildId
          });
        } else {
          const state = await dependencies.inspectCodeBuild({
            context: data.context,
            buildId: lease.activeCodeBuildId
          });
          if (state !== "terminal") {
            retryDeploymentIds.push(descriptor.deploymentId);
            continue;
          }
        }
        codeBuildTerminalConfirmed = true;
      }
      await dependencies.recoverRelease(data, {
        codeBuildTerminalConfirmed,
        workerTerminalConfirmed: true
      });
      recoveredDeploymentIds.push(descriptor.deploymentId);
    } catch (error) {
      dependencies.onRecoveryError?.({ deploymentId: descriptor.deploymentId, error });
      retryDeploymentIds.push(descriptor.deploymentId);
    }
  }

  return { recoveredDeploymentIds, retryDeploymentIds };
}

export function createPostgresInterruptedDirectReleaseRecoveryStore(
  db: Database
): InterruptedDirectReleaseRecoveryStore {
  const releaseRepository = createPostgresDirectApplicationReleaseRepository(db);
  return {
    async listInterrupted(input) {
      const filters = [
        eq(applicationReleases.source, "direct"),
        eq(applicationReleases.runtimeTargetKind, "ecs_fargate"),
        or(
          and(eq(applicationReleases.status, "pending"), eq(deployments.status, "RUNNING")),
          and(
            eq(applicationReleases.status, "retrying"),
            eq(deployments.status, "PARTIALLY_FAILED")
          )
        )!
      ];
      if (input.excludeDeploymentIds.length > 0) {
        filters.push(notInArray(deployments.id, [...input.excludeDeploymentIds]));
      }
      return db
        .select({
          deploymentId: deployments.id,
          userId: projects.userId,
          deploymentStatus: deployments.status,
          activeStage: deployments.activeStage,
          failureStage: deployments.failureStage
        })
        .from(applicationReleases)
        .innerJoin(deployments, eq(deployments.id, applicationReleases.deploymentId))
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .where(and(...filters));
    },

    async load(descriptor) {
      const context = await releaseRepository.findContext(
        descriptor.deploymentId,
        descriptor.userId
      );
      const release = await releaseRepository.findRelease(descriptor.deploymentId);
      const [releaseRow] = await db
        .select({
          baselineReleaseId: applicationReleases.baselineReleaseId,
          releaseCandidateId: applicationReleases.releaseCandidateId
        })
        .from(applicationReleases)
        .where(
          and(
            eq(applicationReleases.deploymentId, descriptor.deploymentId),
            eq(applicationReleases.source, "direct"),
            inArray(applicationReleases.status, ["pending", "retrying"])
          )
        );
      if (!context || !release || !releaseRow?.releaseCandidateId) {
        throw new Error("Interrupted Direct application release snapshot is incomplete");
      }
      const [candidate] = await db
        .select()
        .from(releaseCandidates)
        .where(
          and(
            eq(releaseCandidates.id, releaseRow.releaseCandidateId),
            eq(releaseCandidates.projectId, context.deployment.projectId),
            eq(releaseCandidates.deploymentId, descriptor.deploymentId)
          )
        );
      if (!candidate) {
        throw new Error("Interrupted Direct ReleaseCandidate is missing");
      }
      const steps = await db
        .select({
          step: applicationReleaseSteps.step,
          status: applicationReleaseSteps.status,
          evidence: applicationReleaseSteps.evidence
        })
        .from(applicationReleaseSteps)
        .where(eq(applicationReleaseSteps.releaseId, release.id))
        .orderBy(asc(applicationReleaseSteps.sequence));
      const [baseline] = releaseRow.baselineReleaseId
        ? await db
            .select()
            .from(applicationReleases)
            .where(eq(applicationReleases.id, releaseRow.baselineReleaseId))
            .limit(1)
        : [];
      const baselineRelease = resolvePersistedEcsReleaseBaseline({
        baselineReleaseId: releaseRow.baselineReleaseId,
        baseline,
        projectId: context.deployment.projectId,
        deploymentTargetFingerprint: release.deploymentTargetFingerprint
      });
      return {
        context,
        release,
        candidate: {
          id: candidate.id,
          commitSha: candidate.commitSha,
          compositeDigest: candidate.compositeDigest,
          configFingerprint: candidate.configFingerprint,
          apiOciDigest: candidate.apiOciDigest,
          apiArchiveDigest: candidate.apiArchiveDigest,
          apiArchiveByteSize: candidate.apiArchiveByteSize,
          frontendArchiveDigest: candidate.frontendArchiveDigest,
          frontendArchiveByteSize: candidate.frontendArchiveByteSize,
          frontendManifestDigest: candidate.frontendManifestDigest,
          frontendIndexDigest: candidate.frontendIndexDigest,
          apiArchiveObjectKey: candidate.apiArchiveObjectKey,
          apiArchiveObjectVersionId: candidate.apiArchiveObjectVersionId,
          frontendArchiveObjectKey: candidate.frontendArchiveObjectKey,
          frontendArchiveObjectVersionId: candidate.frontendArchiveObjectVersionId,
          frontendManifestObjectKey: candidate.frontendManifestObjectKey,
          frontendManifestObjectVersionId: candidate.frontendManifestObjectVersionId,
          manifestObjectKey: candidate.manifestObjectKey,
          manifestObjectVersionId: candidate.manifestObjectVersionId,
          expiresAt: candidate.expiresAt
        },
        steps,
        baselineRelease: baselineRelease
          ? {
              id: baselineRelease.releaseId,
              taskDefinitionArn: baselineRelease.taskDefinitionArn,
              imageDigest: baselineRelease.imageDigest
            }
          : null
      };
    }
  };
}

export function createEcsInterruptedDirectReleaseRecoveryDispatcher(input: {
  store: Pick<InterruptedDirectReleaseRecoveryStore, "listInterrupted">;
  jobs: DeploymentJobRepository;
  dispatcher: DeploymentWorkerDispatcher;
  logger?: { warn(messageOrObject: unknown, message?: string): void };
}) {
  return async (recoveryInput: {
    excludeDeploymentIds: readonly string[];
    onlyDeploymentIds?: readonly string[];
  }) => {
    const excluded = new Set(recoveryInput.excludeDeploymentIds);
    const included = recoveryInput.onlyDeploymentIds
      ? new Set(recoveryInput.onlyDeploymentIds)
      : null;
    const protectedDeploymentIds: string[] = [];
    const retryDeploymentIds: string[] = [];
    const descriptors = await input.store.listInterrupted(recoveryInput);

    for (const descriptor of descriptors) {
      if (excluded.has(descriptor.deploymentId)) continue;
      if (included && !included.has(descriptor.deploymentId)) continue;
      if (!isApplicationReleaseRecoveryDescriptor(descriptor)) continue;
      let job: Awaited<ReturnType<typeof createDeploymentJob>> | undefined;
      try {
        job = await createDeploymentJob(
          {
            deploymentId: descriptor.deploymentId,
            operation: "recover_application_release",
            accessContext: { kind: "user", userId: descriptor.userId },
            startedFromStatus: descriptor.deploymentStatus,
            startedFromFailureStage: descriptor.failureStage
          },
          input.jobs
        );
        await markDeploymentJobDispatching({ jobId: job.id }, input.jobs);
        const dispatched = await input.dispatcher.dispatch({ job });
        if (!dispatched.taskArn) {
          throw new Error("Application release recovery worker did not return a task ARN");
        }
        await recordDeploymentJobTaskArn(
          { jobId: job.id, ecsTaskArn: dispatched.taskArn },
          input.jobs
        );
        await markDeploymentJobRunning(
          { jobId: job.id, ecsTaskArn: dispatched.taskArn },
          input.jobs
        );
        protectedDeploymentIds.push(descriptor.deploymentId);
      } catch (error) {
        if (error instanceof DeploymentJobConflictError) {
          protectedDeploymentIds.push(descriptor.deploymentId);
          continue;
        }
        if (job) {
          await failDeploymentJob(
            {
              jobId: job.id,
              errorSummary: "Application release recovery worker dispatch failed"
            },
            input.jobs
          ).catch(() => undefined);
        }
        retryDeploymentIds.push(descriptor.deploymentId);
        input.logger?.warn(
          {
            deploymentId: descriptor.deploymentId,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorSummary: maskDeploymentMessage(
              error instanceof Error ? error.message : "Unknown recovery dispatch error"
            )
          },
          "Interrupted Direct application release was queued for a recovery retry"
        );
      }
    }

    return {
      recoveredDeploymentIds: [],
      protectedDeploymentIds,
      retryDeploymentIds
    };
  };
}

function isApplicationReleaseRecoveryDescriptor(
  descriptor: InterruptedDirectReleaseDescriptor
): boolean {
  return (
    descriptor.activeStage === "application_release" ||
    (descriptor.deploymentStatus === "PARTIALLY_FAILED" &&
      descriptor.failureStage === "application_release")
  );
}

export function createInterruptedDirectApplicationReleaseRecovery(input: {
  db: Database;
  logger?: { warn(messageOrObject: unknown, message?: string): void };
}) {
  const leaseRepository = createPostgresProjectExecutionLeaseRepository(input.db);
  const trustedRepository = createPostgresTrustedReleaseRepository(input.db);
  const releaseRepository = createPostgresDirectApplicationReleaseRepository(input.db);
  const deploymentRepository = createPostgresDeploymentRepository(input.db);
  const store = createPostgresInterruptedDirectReleaseRecoveryStore(input.db);

  return (recoveryInput: {
    excludeDeploymentIds: readonly string[];
    onlyDeploymentIds?: readonly string[];
    stopActiveCodeBuild?: boolean;
    recoveryWorkerTaskArn?: string | null;
  }) =>
    recoverInterruptedDirectReleaseBatch(recoveryInput, {
      store,
      leaseRepository,
      inspectCodeBuild: inspectDirectCodeBuildExecution,
      stopCodeBuild: stopDirectCodeBuildExecution,
      recoverRelease: async (data, verification) => {
        await recoverInterruptedDirectApplicationRelease(
          data,
          {
            leaseRepository,
            trustedRepository,
            gateway: createAwsEcsFargateReleaseGateway(),
            releaseRepository,
            deploymentRepository,
            cancellationRequested: recoveryInput.stopActiveCodeBuild === true,
            ...verification
          },
          {
            ...(recoveryInput.recoveryWorkerTaskArn !== undefined
              ? { recoveryWorkerTaskArn: recoveryInput.recoveryWorkerTaskArn }
              : {})
          }
        );
      },
      onRecoveryError: ({ deploymentId, error }) => {
        input.logger?.warn(
          {
            deploymentId,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorSummary: maskDeploymentMessage(
              error instanceof Error ? error.message : "Unknown Direct release recovery error"
            )
          },
          "Interrupted Direct application release recovery was deferred"
        );
      }
    });
}

export async function stopDirectCodeBuildExecution(input: {
  context: DirectApplicationReleaseContext;
  buildId: string;
}): Promise<void> {
  const credentials = await createAwsSdkStsGateway().assumeRole({
    roleArn: input.context.connection.roleArn,
    externalId: input.context.connection.externalId,
    region: input.context.connection.region,
    roleSessionName: `sketchcatch-cancel-${input.context.deployment.id}`
  });
  const client = new CodeBuildClient({
    region: input.context.connection.region,
    credentials
  });
  try {
    const initial = await client.send(new BatchGetBuildsCommand({ ids: [input.buildId] }));
    if (initial.builds?.[0]?.buildStatus === "IN_PROGRESS") {
      await client.send(new StopBuildCommand({ id: input.buildId }));
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = await client.send(new BatchGetBuildsCommand({ ids: [input.buildId] }));
      const status = result.builds?.[0]?.buildStatus;
      if (status && status !== "IN_PROGRESS") return;
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error("Direct release CodeBuild did not reach a terminal state after cancellation");
  } finally {
    client.destroy();
  }
}

export async function recoverInterruptedDirectPreflightCancellation(input: {
  db: Database;
  deploymentId: string;
  userId: string;
  recoveryWorkerTaskArn: string | null;
}): Promise<boolean> {
  const releaseRepository = createPostgresDirectApplicationReleaseRepository(input.db);
  const context = await releaseRepository.findContext(input.deploymentId, input.userId);
  if (!context) throw new Error("Direct preflight recovery context is unavailable");
  const [existingRelease] = await input.db
    .select({ id: applicationReleases.id })
    .from(applicationReleases)
    .where(eq(applicationReleases.deploymentId, input.deploymentId))
    .limit(1);
  if (existingRelease) return false;

  const leaseRepository = createPostgresProjectExecutionLeaseRepository(input.db);
  const interruptedLease = await leaseRepository.find(context.deployment.projectId);
  if (
    interruptedLease?.status === "active" &&
    (interruptedLease.source !== "direct" ||
      (interruptedLease.holderId !== input.deploymentId &&
        !interruptedLease.holderId.startsWith(`recovery:direct:${input.deploymentId}:`)))
  ) {
    throw new Error("Direct preflight recovery no longer owns the project lease");
  }
  if (interruptedLease?.status === "active" && interruptedLease.activeCodeBuildId) {
    await stopDirectCodeBuildExecution({
      context,
      buildId: interruptedLease.activeCodeBuildId
    });
  }

  const holderId = `recovery:direct:${input.deploymentId}:${crypto.randomUUID()}`;
  const lease =
    interruptedLease?.status === "active"
      ? await recoverVerifiedTerminalProjectExecutionLease(
          {
            projectId: interruptedLease.projectId,
            expectedHolderId: interruptedLease.holderId,
            expectedFencingVersion: interruptedLease.fencingVersion,
            expectedActiveCodeBuildId: interruptedLease.activeCodeBuildId,
            expectedActiveWorkerTaskArn: interruptedLease.activeWorkerTaskArn,
            holderId,
            source: "direct"
          },
          leaseRepository
        )
      : await acquireProjectExecutionLease(
          {
            projectId: context.deployment.projectId,
            holderId,
            source: "direct"
          },
          leaseRepository
        );
  const fence = {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
  try {
    if (input.recoveryWorkerTaskArn) {
      await recordProjectExecutionCoordinates(
        { ...fence, activeWorkerTaskArn: input.recoveryWorkerTaskArn },
        leaseRepository
      );
    }
    await input.db
      .update(releaseCandidates)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(releaseCandidates.deploymentId, input.deploymentId),
          inArray(releaseCandidates.status, ["building", "pending"])
        )
      );
    const deploymentRepository = createPostgresDeploymentRepository(input.db);
    const cancelled = await deploymentRepository.cancelDeployment(input.deploymentId, {
      errorSummary: "코드 사전 검증 단계에서 배포 취소를 완료했습니다."
    });
    if (!cancelled) throw new Error("Direct preflight deployment cancellation was not saved");
    return true;
  } finally {
    await releaseProjectExecutionLease(fence, leaseRepository).catch(() => false);
  }
}

export async function inspectDirectCodeBuildExecution(input: {
  context: DirectApplicationReleaseContext;
  buildId: string;
}): Promise<DirectCodeBuildExecutionState> {
  const credentials = await createAwsSdkStsGateway().assumeRole({
    roleArn: input.context.connection.roleArn,
    externalId: input.context.connection.externalId,
    region: input.context.connection.region,
    roleSessionName: `sketchcatch-recovery-${input.context.deployment.id}`
  });
  const client = new CodeBuildClient({
    region: input.context.connection.region,
    credentials
  });
  try {
    const result = await client.send(new BatchGetBuildsCommand({ ids: [input.buildId] }));
    const status = result.builds?.[0]?.buildStatus;
    if (!status) return "unknown";
    return status === "IN_PROGRESS" ? "active" : "terminal";
  } finally {
    client.destroy();
  }
}
