import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type {
  ApplicationReleaseFailureStage,
  ApplicationReleaseProviderRevision,
  ConfirmedBuildConfig,
  FrontendReleaseEvidence,
  JsonValue,
  ProjectDeploymentRuntimeConfig
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { getDatabaseClient } from "../db/client.js";
import { getDeploymentWorkerMode } from "../config/env.js";
import {
  applicationReleases,
  awsCodeConnections,
  awsConnections,
  gitCicdPipelineRuns,
  projectBuildEnvironments,
  projectDeploymentTargets,
  projectExecutionLeases,
  releaseCandidates,
  sourceRepositories
} from "../db/schema.js";
import {
  createAwsCodeBuildDirectApplicationReleaseGateway
} from "../deployments/aws-codebuild-direct-application-release-gateway.js";
import type {
  ApplicationReleaseRecord,
  DirectApplicationArtifact,
  DirectApplicationReleaseContext,
  DirectApplicationReleaseGateway
} from "../deployments/direct-application-release-service.js";
import {
  acquireProjectExecutionLease,
  createPostgresProjectExecutionLeaseRepository,
  recoverVerifiedTerminalProjectExecutionLease,
  recordProjectExecutionCoordinates,
  releaseProjectExecutionLease,
  type ProjectExecutionLeaseRecord,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import {
  GitHubReleaseRunError,
  type GitHubReleaseRunExecutor
} from "./github-release-run-service.js";
import {
  createGitHubInterruptedCodeBuildController,
  createGitHubReleaseRunRecoveryController
} from "./github-release-run-recovery.js";
import {
  createConfiguredGitHubReleaseWorkerDispatcher,
  type GitHubReleaseWorkerDispatcher
} from "./github-release-worker-dispatcher.js";

type GitHubReleaseExecutionContext = {
  runId: string;
  projectId: string;
  commitSha: string;
  sourceRepository: NonNullable<DirectApplicationReleaseContext["sourceRepository"]>;
  buildEnvironment: NonNullable<DirectApplicationReleaseContext["buildEnvironment"]>;
  target: DirectApplicationReleaseContext["target"];
  connection: DirectApplicationReleaseContext["connection"];
};

type GitHubReleaseCompletion = Awaited<
  ReturnType<DirectApplicationReleaseGateway["deployArtifact"]>
>;

type GitHubExecutionFence = {
  projectId: string;
  holderId: string;
  fencingVersion: number;
};

export type GitHubReleaseExecutionRepository = {
  claim(runId: string, now: Date): Promise<GitHubReleaseExecutionContext | undefined>;
  createPendingRelease(input: {
    context: GitHubReleaseExecutionContext;
    artifact: Awaited<ReturnType<DirectApplicationReleaseGateway["prepareArtifact"]>>;
    now: Date;
  }): Promise<void>;
  complete(input: {
    runId: string;
    result: GitHubReleaseCompletion;
    now: Date;
    fence?: GitHubExecutionFence;
  }): Promise<void>;
  fail(input: {
    runId: string;
    errorSummary: string;
    cancelled: boolean;
    now: Date;
    fence?: GitHubExecutionFence;
  }): Promise<void>;
  prepareFrontendRetry?(input: {
    runId: string;
    now: Date;
  }): Promise<{ runId: string; projectId: string; releaseId: string } | undefined>;
  findFrontendRetryRelease?(runId: string): Promise<ApplicationReleaseRecord | undefined>;
  failFrontendRetry?(input: {
    runId: string;
    errorSummary: string;
    now: Date;
  }): Promise<void>;
  listInterrupted?(): Promise<ReadonlyArray<{
    runId: string;
    projectId: string;
    pipelineStatus: "queued" | "running";
    cancellationRequestedAt: Date | null;
    releaseId?: string | null;
    releaseStatus?: string | null;
  }>>;
};

export type GitHubReleaseRecoveryResult =
  | { kind: "completion"; result: GitHubReleaseCompletion }
  | { kind: "failure"; cancelled: boolean; errorSummary: string };

export type GitHubReleaseRecoveryController = {
  recover(input: {
    runId: string;
    projectId: string;
    cancellationRequested: boolean;
  }): Promise<GitHubReleaseRecoveryResult>;
};

export type GitHubInterruptedCodeBuildController = {
  stopAndConfirm(input: {
    runId: string;
    projectId: string;
    buildId: string;
  }): Promise<void>;
};

export function createPostgresGitHubReleaseExecutionRepository(
  db: Database
): GitHubReleaseExecutionRepository {
  return {
    async claim(runId, now) {
      const [claimed] = await db
        .update(gitCicdPipelineRuns)
        .set({
          status: "running",
          statusMessage: "코드를 사전 검증하고 승인된 Artifact를 만들고 있습니다.",
          startedAt: now,
          lastRefreshedAt: now
        })
        .where(
          and(
            eq(gitCicdPipelineRuns.id, runId),
            eq(gitCicdPipelineRuns.status, "queued")
          )
        )
        .returning({ id: gitCicdPipelineRuns.id });
      if (!claimed) return undefined;

      const [row] = await db
        .select({
          runId: gitCicdPipelineRuns.id,
          projectId: gitCicdPipelineRuns.projectId,
          commitSha: gitCicdPipelineRuns.commitSha,
          sourceRepositoryProvider: sourceRepositories.provider,
          sourceRepositoryInstallationId: sourceRepositories.githubInstallationId,
          sourceRepositoryOwner: sourceRepositories.owner,
          sourceRepositoryName: sourceRepositories.name,
          buildEnvironmentId: projectBuildEnvironments.id,
          buildEnvironmentAwsConnectionId: projectBuildEnvironments.awsConnectionId,
          buildEnvironmentAwsCodeConnectionId: projectBuildEnvironments.awsCodeConnectionId,
          buildEnvironmentCodeConnectionArn: awsCodeConnections.connectionArn,
          buildEnvironmentProjectName: projectBuildEnvironments.codeBuildProjectName,
          buildEnvironmentServiceRoleArn: projectBuildEnvironments.codeBuildServiceRoleArn,
          buildEnvironmentPermissionsBoundaryArn: projectBuildEnvironments.permissionsBoundaryArn,
          buildEnvironmentSourceUrl: projectBuildEnvironments.sourceRepositoryUrl,
          buildEnvironmentFingerprint: projectBuildEnvironments.runtimeFingerprint,
          buildEnvironmentStatus: projectBuildEnvironments.status,
          runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
          confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig,
          runtimeConfig: projectDeploymentTargets.runtimeConfig,
          accountId: awsConnections.accountId,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region
        })
        .from(gitCicdPipelineRuns)
        .innerJoin(
          sourceRepositories,
          eq(sourceRepositories.id, gitCicdPipelineRuns.sourceRepositoryId)
        )
        .innerJoin(
          projectBuildEnvironments,
          eq(projectBuildEnvironments.projectId, gitCicdPipelineRuns.projectId)
        )
        .innerJoin(
          awsCodeConnections,
          eq(awsCodeConnections.id, projectBuildEnvironments.awsCodeConnectionId)
        )
        .innerJoin(
          projectDeploymentTargets,
          eq(projectDeploymentTargets.projectId, gitCicdPipelineRuns.projectId)
        )
        .innerJoin(
          awsConnections,
          eq(awsConnections.id, projectDeploymentTargets.connectionId)
        )
        .where(
          and(
            eq(gitCicdPipelineRuns.id, runId),
            eq(sourceRepositories.status, "active"),
            eq(projectBuildEnvironments.status, "ready"),
            eq(awsCodeConnections.status, "AVAILABLE"),
            eq(awsConnections.status, "verified")
          )
        );
      if (
        !row ||
        row.sourceRepositoryProvider !== "github" ||
        !row.sourceRepositoryInstallationId ||
        !row.buildEnvironmentId ||
        !row.buildEnvironmentAwsConnectionId ||
        !row.buildEnvironmentAwsCodeConnectionId ||
        !row.buildEnvironmentCodeConnectionArn ||
        !row.buildEnvironmentProjectName ||
        !row.buildEnvironmentServiceRoleArn ||
        !row.buildEnvironmentPermissionsBoundaryArn ||
        !row.buildEnvironmentSourceUrl ||
        !row.buildEnvironmentFingerprint ||
        row.buildEnvironmentStatus !== "ready" ||
        row.runtimeTargetKind !== "ecs_fargate" ||
        !row.confirmedBuildConfig ||
        !row.runtimeConfig ||
        row.runtimeConfig.runtimeTargetKind !== "ecs_fargate" ||
        !row.accountId ||
        !row.roleArn
      ) {
        await markRunFailed(db, runId, "GitHub 릴리즈 실행 환경이 준비되지 않았습니다.", now);
        return undefined;
      }
      const confirmedBuildConfig: ConfirmedBuildConfig = {
        ...row.confirmedBuildConfig,
        confirmedCommitSha: row.commitSha,
        confirmedAt: now.toISOString()
      };
      const runtimeConfig: ProjectDeploymentRuntimeConfig = row.runtimeConfig;
      return {
        runId: row.runId,
        projectId: row.projectId,
        commitSha: row.commitSha,
        sourceRepository: {
          provider: "github",
          installationId: row.sourceRepositoryInstallationId,
          owner: row.sourceRepositoryOwner,
          name: row.sourceRepositoryName
        },
        buildEnvironment: {
          id: row.buildEnvironmentId,
          awsConnectionId: row.buildEnvironmentAwsConnectionId,
          awsCodeConnectionId: row.buildEnvironmentAwsCodeConnectionId,
          codeConnectionArn: row.buildEnvironmentCodeConnectionArn,
          codeBuildProjectName: row.buildEnvironmentProjectName,
          codeBuildServiceRoleArn: row.buildEnvironmentServiceRoleArn,
          permissionsBoundaryArn: row.buildEnvironmentPermissionsBoundaryArn,
          sourceRepositoryUrl: row.buildEnvironmentSourceUrl,
          runtimeFingerprint: row.buildEnvironmentFingerprint,
          status: "ready"
        },
        target: {
          runtimeTargetKind: "ecs_fargate",
          confirmedBuildConfig,
          runtimeConfig
        },
        connection: {
          accountId: row.accountId,
          roleArn: row.roleArn,
          externalId: row.externalId,
          region: row.region
        }
      };
    },

    async createPendingRelease(input) {
      const candidateId = readArtifactMetadata(input.artifact.metadata, "releaseCandidateId");
      if (!candidateId) throw new Error("Release candidate ID is missing after preflight");
      const [candidate] = await db
        .select()
        .from(releaseCandidates)
        .where(
          and(
            eq(releaseCandidates.id, candidateId),
            eq(releaseCandidates.pipelineRunId, input.context.runId),
            eq(releaseCandidates.projectId, input.context.projectId),
            eq(releaseCandidates.status, "pending")
          )
        );
      if (!candidate || candidate.expiresAt <= input.now) {
        throw new Error("Release candidate changed or expired before activation");
      }
      const [baseline] = await db
        .select({ id: applicationReleases.id })
        .from(applicationReleases)
        .where(
          and(
            eq(applicationReleases.projectId, input.context.projectId),
            eq(applicationReleases.runtimeTargetKind, "ecs_fargate"),
            eq(applicationReleases.status, "succeeded")
          )
        )
        .orderBy(desc(applicationReleases.completedAt), desc(applicationReleases.createdAt))
        .limit(1);
      await db.insert(applicationReleases).values({
        id: crypto.randomUUID(),
        projectId: input.context.projectId,
        deploymentId: null,
        pipelineRunId: input.context.runId,
        source: "gitops",
        runtimeTargetKind: "ecs_fargate",
        version: `git-${input.context.commitSha.slice(0, 12)}`,
        commitSha: input.context.commitSha,
        artifactDigestAlgorithm: "sha256",
        artifactDigest: candidate.compositeDigest,
        releaseCandidateId: candidate.id,
        compositeDigest: {
          algorithm: "sha256",
          value: candidate.compositeDigest,
          apiOciDigest: candidate.apiOciDigest,
          frontendManifestDigest: candidate.frontendManifestDigest
        },
        providerRevision: null,
        frontendEvidence: null,
        failureStage: null,
        baselineReleaseId: baseline?.id ?? null,
        outputUrl: null,
        status: "pending",
        healthEvidence: null,
        rollbackEvidence: null,
        startedAt: input.now,
        completedAt: null,
        createdAt: input.now,
        updatedAt: input.now
      });
    },

    async complete(input) {
      const releaseStatus =
        input.result.status === "partially_failed"
          ? "partially_failed"
          : input.result.status === "partially_cancelled"
            ? "partially_cancelled"
            : input.result.status === "cancelled"
              ? "cancelled"
          : input.result.status === "rolled_back"
            ? "rolled_back"
            : "succeeded";
      const pipelineStatus =
        input.result.status === "succeeded"
          ? "succeeded"
          : input.result.status === "cancelled" || input.result.status === "partially_cancelled"
            ? "cancelled"
            : "failed";
      const message =
        input.result.status === "succeeded"
          ? "앱 릴리즈와 Health Check가 완료됐습니다."
          : input.result.status === "partially_cancelled"
            ? "웹 활성화 이후 취소되어 부분 취소로 기록했습니다."
            : input.result.status === "cancelled"
              ? "앱 릴리즈를 안전하게 취소하고 ECS를 복구했습니다."
          : input.result.status === "partially_failed"
            ? "API는 배포됐지만 웹 배포 단계가 실패했습니다. 웹 배포만 재시도할 수 있습니다."
            : "ECS 배포가 실패해 직전 정상 버전으로 복구했습니다.";
      const values = completionValues(input.result);
      await db.transaction(async (transaction) => {
        if (input.fence) {
          await requireGitHubExecutionFence(transaction as unknown as Database, input.fence, input.now);
        }
        const [release] = await transaction
          .select({ id: applicationReleases.id })
          .from(applicationReleases)
          .where(eq(applicationReleases.pipelineRunId, input.runId))
          .for("update");
        if (!release) throw new Error("GitHub application release was not created");
        const updated = await transaction
          .update(applicationReleases)
          .set({
            ...values,
            status: releaseStatus,
            completedAt: input.now,
            updatedAt: input.now
          })
          .where(
            and(
              eq(applicationReleases.id, release.id),
              inArray(applicationReleases.status, [
                "pending",
                "building",
                "deploying",
                "partially_failed",
                "partially_cancelled"
              ])
            )
          )
          .returning({ id: applicationReleases.id });
        if (updated.length !== 1) {
          throw new Error("GitHub application release terminal transition was rejected");
        }
        await transaction
          .update(gitCicdPipelineRuns)
          .set({
            status: pipelineStatus,
            statusMessage: message,
            appUrl: input.result.outputUrl,
            apiUrl: input.result.outputUrl,
            finishedAt: input.now,
            lastRefreshedAt: input.now
          })
          .where(eq(gitCicdPipelineRuns.id, input.runId));
      });
    },

    async fail(input) {
      await db.transaction(async (transaction) => {
        if (input.fence) {
          await requireGitHubExecutionFence(transaction as unknown as Database, input.fence, input.now);
        }
        await transaction
          .update(applicationReleases)
          .set({
            status: input.cancelled ? "cancelled" : "failed",
            completedAt: input.now,
            updatedAt: input.now
          })
          .where(
            and(
              eq(applicationReleases.pipelineRunId, input.runId),
              inArray(applicationReleases.status, ["pending", "building", "deploying"])
            )
          );
        await transaction
          .update(releaseCandidates)
          .set({ status: input.cancelled ? "cancelled" : "failed", updatedAt: input.now })
          .where(
            and(
              eq(releaseCandidates.pipelineRunId, input.runId),
              inArray(releaseCandidates.status, ["building", "pending", "activating"])
            )
          );
        await transaction
          .update(gitCicdPipelineRuns)
          .set({
            status: input.cancelled ? "cancelled" : "failed",
            statusMessage: input.errorSummary,
            finishedAt: input.now,
            lastRefreshedAt: input.now
          })
          .where(eq(gitCicdPipelineRuns.id, input.runId));
      });
    },

    async prepareFrontendRetry(input) {
      return db.transaction(async (transaction) => {
        const [retryable] = await transaction
          .select({
            releaseId: applicationReleases.id,
            projectId: applicationReleases.projectId
          })
          .from(applicationReleases)
          .innerJoin(
            releaseCandidates,
            eq(releaseCandidates.id, applicationReleases.releaseCandidateId)
          )
          .where(
            and(
              eq(applicationReleases.pipelineRunId, input.runId),
              eq(applicationReleases.source, "gitops"),
              eq(applicationReleases.status, "partially_failed"),
              inArray(applicationReleases.failureStage, [
                "frontend_upload",
                "frontend_activation",
                "cloudfront_invalidation",
                "public_health"
              ]),
              eq(releaseCandidates.status, "partially_failed"),
              gt(releaseCandidates.frontendRetryExpiresAt, input.now)
            )
          );
        if (!retryable) return undefined;
        const [queued] = await transaction
          .update(gitCicdPipelineRuns)
          .set({
            status: "queued",
            statusMessage: "동일한 Artifact로 웹 배포 단계만 재시도할 준비를 하고 있습니다.",
            finishedAt: null,
            cancellationRequestedAt: null,
            lastRefreshedAt: input.now
          })
          .where(
            and(
              eq(gitCicdPipelineRuns.id, input.runId),
              eq(gitCicdPipelineRuns.status, "failed")
            )
          )
          .returning({ id: gitCicdPipelineRuns.id });
        return queued
          ? {
              runId: queued.id,
              projectId: retryable.projectId,
              releaseId: retryable.releaseId
            }
          : undefined;
      });
    },

    async findFrontendRetryRelease(runId) {
      const [release] = await db
        .select()
        .from(applicationReleases)
        .where(
          and(
            eq(applicationReleases.pipelineRunId, runId),
            eq(applicationReleases.source, "gitops"),
            eq(applicationReleases.status, "partially_failed")
          )
        );
      return release;
    },

    async failFrontendRetry(input) {
      await db.transaction(async (transaction) => {
        const [release] = await transaction
          .select({
            id: applicationReleases.id,
            releaseCandidateId: applicationReleases.releaseCandidateId
          })
          .from(applicationReleases)
          .where(eq(applicationReleases.pipelineRunId, input.runId));
        if (release) {
          await transaction
            .update(applicationReleases)
            .set({
              status: "partially_failed",
              completedAt: input.now,
              updatedAt: input.now
            })
            .where(
              and(
                eq(applicationReleases.id, release.id),
                eq(applicationReleases.status, "retrying")
              )
            );
          if (release.releaseCandidateId) {
            await transaction
              .update(releaseCandidates)
              .set({ status: "partially_failed", updatedAt: input.now })
              .where(
                and(
                  eq(releaseCandidates.id, release.releaseCandidateId),
                  eq(releaseCandidates.status, "activating")
                )
              );
          }
        }
        await transaction
          .update(gitCicdPipelineRuns)
          .set({
            status: "failed",
            statusMessage: input.errorSummary,
            finishedAt: input.now,
            lastRefreshedAt: input.now
          })
          .where(eq(gitCicdPipelineRuns.id, input.runId));
      });
    },

    async listInterrupted() {
      return db
        .select({
          runId: gitCicdPipelineRuns.id,
          projectId: gitCicdPipelineRuns.projectId,
          pipelineStatus: gitCicdPipelineRuns.status,
          cancellationRequestedAt: gitCicdPipelineRuns.cancellationRequestedAt,
          releaseId: applicationReleases.id,
          releaseStatus: applicationReleases.status
        })
        .from(gitCicdPipelineRuns)
        .leftJoin(
          applicationReleases,
          eq(applicationReleases.pipelineRunId, gitCicdPipelineRuns.id)
        )
        .where(
          and(
            eq(gitCicdPipelineRuns.changeScope, "app"),
            inArray(gitCicdPipelineRuns.status, ["queued", "running"])
          )
        ) as Promise<ReadonlyArray<{
          runId: string;
          projectId: string;
          pipelineStatus: "queued" | "running";
          cancellationRequestedAt: Date | null;
          releaseId: string | null;
          releaseStatus: string | null;
        }>>;
    }
  };
}

export function createGitHubReleaseRunExecutor(options: {
  db?: Database;
  repository?: GitHubReleaseExecutionRepository;
  gateway?: DirectApplicationReleaseGateway;
  executionLeaseRepository?: ProjectExecutionLeaseRepository;
  recoveryController?: GitHubReleaseRecoveryController;
  interruptedCodeBuildController?: GitHubInterruptedCodeBuildController;
  workerDispatcher?: GitHubReleaseWorkerDispatcher;
  dispatchToWorker?: boolean;
  now?: () => Date;
} = {}): GitHubReleaseRunExecutor & {
  executeNow(runId: string): Promise<void>;
  executeFrontendRetryNow(runId: string): Promise<void>;
  recoverInterruptedRuns(runId?: string): Promise<void>;
} {
  const defaultDb = options.db ?? (options.repository ? undefined : getDatabaseClient().db);
  const shouldDispatchToWorker =
    options.dispatchToWorker ?? options.repository === undefined;
  const repository = options.repository ?? createPostgresGitHubReleaseExecutionRepository(defaultDb!);
  const executionLeaseRepository =
    options.executionLeaseRepository ??
    (defaultDb ? createPostgresProjectExecutionLeaseRepository(defaultDb) : undefined);
  const gateway = options.gateway ?? createAwsCodeBuildDirectApplicationReleaseGateway();
  const now = options.now ?? (() => new Date());
  const recoveryController =
    options.recoveryController ??
    (!shouldDispatchToWorker && defaultDb && executionLeaseRepository
      ? createGitHubReleaseRunRecoveryController({
          db: defaultDb,
          leaseRepository: executionLeaseRepository,
          acceptPreparedRecoveryLease: true,
          now
        })
      : undefined);
  const interruptedCodeBuildController =
    options.interruptedCodeBuildController ??
    (defaultDb
      ? createGitHubInterruptedCodeBuildController({ db: defaultDb, now })
      : undefined);
  const workerDispatcher =
    options.workerDispatcher ??
    (shouldDispatchToWorker && defaultDb && getDeploymentWorkerMode() === "ecs"
      ? createConfiguredGitHubReleaseWorkerDispatcher()
      : undefined);
  const active = new Map<string, AbortController>();

  const executeNow = async (runId: string): Promise<void> => {
    if (active.has(runId)) return;
    const abortController = new AbortController();
    let projectId: string | undefined;
    let gatewayContext: DirectApplicationReleaseContext | undefined;
    let artifact: DirectApplicationArtifact | undefined;
    active.set(runId, abortController);
    try {
      const context = await repository.claim(runId, now());
      if (!context) return;
      projectId = context.projectId;
      gatewayContext = {
        sourceRepository: context.sourceRepository,
        buildEnvironment: context.buildEnvironment,
        deployment: {
          id: context.runId,
          projectId: context.projectId,
          scope: "application",
          source: "gitops",
          targetKind: "ecs_fargate"
        },
        target: context.target,
        connection: context.connection
      };
      artifact = await gateway.prepareArtifact(gatewayContext, abortController.signal);
      await repository.createPendingRelease({ context, artifact, now: now() });
      const result = await gateway.deployArtifact({
        context: gatewayContext,
        artifact,
        abortSignal: abortController.signal
      });
      const fence = await requireOwnedGitHubFence(
        context.projectId,
        runId,
        executionLeaseRepository
      );
      await repository.complete({ runId, result, now: now(), ...(fence ? { fence } : {}) });
      if (result.status === "succeeded" || result.status === "rolled_back" || result.status === "cancelled") {
        await gateway
          .cleanupArtifact?.({
            context: gatewayContext,
            artifact,
            mode: result.status === "succeeded" ? "success" : "terminal_failure"
          })
          .catch(() => undefined);
      }
    } catch (error) {
      const cancelled = abortController.signal.aborted;
      const fence = projectId
        ? await findOwnedGitHubFence(projectId, runId, executionLeaseRepository)
        : undefined;
      if (projectId && executionLeaseRepository && !fence) {
        return;
      }
      await repository.fail({
        runId,
        errorSummary: cancelled
          ? "GitHub 앱 릴리즈가 취소됐습니다."
          : safeErrorSummary(error),
        cancelled,
        now: now(),
        ...(fence ? { fence } : {})
      });
      if (gatewayContext && artifact) {
        await gateway
          .cleanupArtifact?.({
            context: gatewayContext,
            artifact,
            mode: "terminal_failure"
          })
          .catch(() => undefined);
      }
    } finally {
      if (projectId && executionLeaseRepository) {
        const lease = await executionLeaseRepository.find(projectId).catch(() => undefined);
        if (lease?.holderId === runId) {
          await releaseProjectExecutionLease(
            {
              projectId,
              holderId: runId,
              fencingVersion: lease.fencingVersion
            },
            executionLeaseRepository
          ).catch(() => false);
        }
      }
      active.delete(runId);
    }
  };

  const executeFrontendRetryNow = async (runId: string): Promise<void> => {
    if (active.has(runId)) return;
    active.set(runId, new AbortController());
    try {
      if (!repository.findFrontendRetryRelease || !gateway.retryFrontend) {
        throw new Error("GitHub frontend retry worker is not configured");
      }
      const context = await repository.claim(runId, now());
      if (!context) return;
      const release = await repository.findFrontendRetryRelease(runId);
      if (!release) throw new Error("Retryable GitHub frontend release was not found");
      await gateway.retryFrontend({
        context: {
          sourceRepository: context.sourceRepository,
          buildEnvironment: context.buildEnvironment,
          deployment: {
            id: context.runId,
            projectId: context.projectId,
            scope: "application",
            source: "gitops",
            targetKind: "ecs_fargate"
          },
          target: context.target,
          connection: context.connection
        },
        release
      });
    } catch (error) {
      await repository.failFrontendRetry?.({
        runId,
        errorSummary: safeErrorSummary(error),
        now: now()
      });
    } finally {
      active.delete(runId);
    }
  };

  type InterruptedRun = Awaited<
    ReturnType<NonNullable<GitHubReleaseExecutionRepository["listInterrupted"]>>
  >[number];

  const releaseOwnedLease = async (run: InterruptedRun): Promise<void> => {
    if (!executionLeaseRepository) return;
    const lease = await executionLeaseRepository.find(run.projectId).catch(() => undefined);
    if (
      lease?.status === "active" &&
      (lease.holderId === run.runId ||
        lease.holderId === run.releaseId ||
        lease.holderId.startsWith(`recovery:${run.runId}:`))
    ) {
      await releaseProjectExecutionLease(
        {
          projectId: run.projectId,
          holderId: lease.holderId,
          fencingVersion: lease.fencingVersion
        },
        executionLeaseRepository,
        now()
      ).catch(() => false);
    }
  };

  const failQueuedRun = async (run: InterruptedRun, errorSummary: string): Promise<void> => {
    await repository.fail({
      runId: run.runId,
      errorSummary,
      cancelled: run.cancellationRequestedAt !== null,
      now: now()
    });
    await releaseOwnedLease(run);
  };

  const failQueuedFrontendRetry = async (
    run: InterruptedRun,
    errorSummary: string
  ): Promise<void> => {
    if (repository.failFrontendRetry) {
      await repository.failFrontendRetry({ runId: run.runId, errorSummary, now: now() });
    } else {
      await repository.fail({
        runId: run.runId,
        errorSummary,
        cancelled: false,
        now: now()
      });
    }
    await releaseOwnedLease(run);
  };

  const dispatchWorker = async (input: {
    run: InterruptedRun;
    mode: "execute" | "recover" | "retry_frontend";
    lease: ProjectExecutionLeaseRecord;
  }): Promise<void> => {
    if (!workerDispatcher || !executionLeaseRepository) {
      throw new Error(
        "신뢰된 GitHub 릴리즈 워커가 설정되지 않아 실행을 시작하지 않았습니다."
      );
    }
    const dispatched = await workerDispatcher.dispatch({
      runId: input.run.runId,
      projectId: input.run.projectId,
      mode: input.mode
    });
    try {
      const current = await executionLeaseRepository.find(input.run.projectId);
      if (
        !current ||
        current.status !== "active" ||
        current.holderId !== input.lease.holderId ||
        current.fencingVersion !== input.lease.fencingVersion
      ) {
        throw new Error("GitHub 릴리즈 워커가 프로젝트 실행 잠금을 잃었습니다.");
      }
      await recordProjectExecutionCoordinates(
        {
          projectId: current.projectId,
          holderId: current.holderId,
          fencingVersion: current.fencingVersion,
          activeWorkerTaskArn: dispatched.taskArn
        },
        executionLeaseRepository,
        now()
      );
    } catch (error) {
      await workerDispatcher.stopAndConfirm({
        taskArn: dispatched.taskArn,
        reason: "SketchCatch GitHub release lost its project lease"
      });
      throw error;
    }
  };

  const dispatchQueuedRun = async (run: InterruptedRun): Promise<void> => {
    if (!executionLeaseRepository) {
      throw new Error("GitHub 릴리즈 프로젝트 실행 잠금 저장소가 준비되지 않았습니다.");
    }
    const lease = await executionLeaseRepository.find(run.projectId);
    if (
      !lease ||
      lease.status !== "active" ||
      lease.holderId !== run.runId ||
      lease.expiresAt <= now()
    ) {
      throw new Error("GitHub 릴리즈 프로젝트 실행 잠금이 만료되거나 변경됐습니다.");
    }
    await dispatchWorker({ run, mode: "execute", lease });
  };

  const dispatchQueuedFrontendRetry = async (run: InterruptedRun): Promise<void> => {
    if (!run.releaseId || run.releaseStatus !== "partially_failed") {
      throw new Error("GitHub 웹 재시도 릴리즈 좌표가 유효하지 않습니다.");
    }
    if (!executionLeaseRepository) {
      throw new Error("GitHub 웹 재시도 프로젝트 실행 잠금 저장소가 준비되지 않았습니다.");
    }
    const existing = await executionLeaseRepository.find(run.projectId);
    if (
      existing?.status === "active" &&
      existing.holderId !== run.releaseId
    ) {
      throw new Error("다른 배포 실행이 프로젝트 실행 잠금을 사용 중입니다.");
    }
    const acquired = await acquireProjectExecutionLease(
      {
        projectId: run.projectId,
        holderId: run.releaseId,
        source: "gitops"
      },
      executionLeaseRepository,
      { now }
    );
    const lease = await executionLeaseRepository.find(acquired.projectId);
    if (
      !lease ||
      lease.status !== "active" ||
      lease.holderId !== run.releaseId ||
      lease.expiresAt <= now()
    ) {
      throw new Error("GitHub 웹 재시도 프로젝트 실행 잠금이 만료되거나 변경됐습니다.");
    }
    await dispatchWorker({ run, mode: "retry_frontend", lease });
  };

  const retryFrontend = async (runId: string): Promise<void> => {
    if (
      !repository.prepareFrontendRetry ||
      !repository.failFrontendRetry ||
      !executionLeaseRepository
    ) {
      throw new GitHubReleaseRunError(
        "GITHUB_RELEASE_FRONTEND_RETRY_UNAVAILABLE",
        "신뢰된 웹 릴리즈 재시도 워커가 준비되지 않았습니다.",
        503
      );
    }
    const prepared = await repository.prepareFrontendRetry({ runId, now: now() });
    if (!prepared) {
      throw new GitHubReleaseRunError(
        "GITHUB_RELEASE_FRONTEND_RETRY_NOT_ALLOWED",
        "같은 Artifact를 재사용할 수 있는 웹 부분 실패 상태가 아닙니다.",
        409
      );
    }
    let lease: ProjectExecutionLeaseRecord | undefined;
    try {
      const acquired = await acquireProjectExecutionLease(
        {
          projectId: prepared.projectId,
          holderId: prepared.releaseId,
          source: "gitops"
        },
        executionLeaseRepository,
        { now }
      );
      lease = await executionLeaseRepository.find(acquired.projectId);
      if (!lease) throw new Error("GitHub frontend retry lease was not saved");
      if (shouldDispatchToWorker) {
        await dispatchWorker({
          run: {
            runId: prepared.runId,
            projectId: prepared.projectId,
            pipelineStatus: "queued",
            cancellationRequestedAt: null
          },
          mode: "retry_frontend",
          lease
        });
      } else {
        await executeFrontendRetryNow(prepared.runId);
      }
    } catch (error) {
      await repository.failFrontendRetry({
        runId: prepared.runId,
        errorSummary: safeErrorSummary(error),
        now: now()
      });
      if (lease) {
        await releaseProjectExecutionLease(
          {
            projectId: lease.projectId,
            holderId: lease.holderId,
            fencingVersion: lease.fencingVersion
          },
          executionLeaseRepository,
          now()
        ).catch(() => false);
      }
      throw error;
    }
  };

  const dispatchRecoveryRun = async (run: InterruptedRun): Promise<void> => {
    if (!workerDispatcher || !executionLeaseRepository) return;
    let interruptedLease = await executionLeaseRepository
      .find(run.projectId)
      .catch(() => undefined);
    if (
      interruptedLease?.status === "active" &&
      interruptedLease.holderId !== run.runId &&
      interruptedLease.holderId !== run.releaseId &&
      !interruptedLease.holderId.startsWith(`recovery:${run.runId}:`)
    ) {
      return;
    }

    if (interruptedLease?.status === "active" && interruptedLease.activeWorkerTaskArn) {
      const workerState = await workerDispatcher.inspect({
        taskArn: interruptedLease.activeWorkerTaskArn
      });
      if (workerState === "UNKNOWN") return;
      if (
        workerState === "ACTIVE" &&
        interruptedLease.expiresAt > now() &&
        !run.cancellationRequestedAt
      ) {
        return;
      }
      if (workerState === "ACTIVE") {
        await workerDispatcher.stopAndConfirm({
          taskArn: interruptedLease.activeWorkerTaskArn,
          reason: run.cancellationRequestedAt
            ? "SketchCatch GitHub release cancellation requested"
            : "SketchCatch GitHub release lease expired"
        });
      }
    } else if (interruptedLease?.status === "active") {
      const discovered = await workerDispatcher.inspectRun?.({ runId: run.runId });
      if (!discovered || discovered.state === "UNKNOWN") return;
      if (
        discovered.state === "ACTIVE" &&
        interruptedLease.expiresAt > now() &&
        !run.cancellationRequestedAt
      ) {
        return;
      }
      if (discovered.state === "ACTIVE" && discovered.taskArn) {
        await workerDispatcher.stopAndConfirm({
          taskArn: discovered.taskArn,
          reason: run.cancellationRequestedAt
            ? "SketchCatch GitHub release cancellation requested"
            : "SketchCatch GitHub release lease expired"
        });
      }
    }

    if (interruptedLease?.status === "active" && interruptedLease.activeCodeBuildId) {
      if (!interruptedCodeBuildController) {
        throw new Error("Interrupted CodeBuild cannot be verified terminal");
      }
      await interruptedCodeBuildController.stopAndConfirm({
        runId: run.runId,
        projectId: run.projectId,
        buildId: interruptedLease.activeCodeBuildId
      });
      await recordProjectExecutionCoordinates(
        {
          projectId: interruptedLease.projectId,
          holderId: interruptedLease.holderId,
          fencingVersion: interruptedLease.fencingVersion,
          activeCodeBuildId: null
        },
        executionLeaseRepository,
        now()
      );
      interruptedLease = await executionLeaseRepository.find(run.projectId).catch(() => undefined);
    }

    const recoveryHolderId = `recovery:${run.runId}:${crypto.randomUUID()}`;
    let recoveryLease: ProjectExecutionLeaseRecord | undefined;
    if (interruptedLease?.status === "active") {
      const recovered = await recoverVerifiedTerminalProjectExecutionLease(
        {
          projectId: run.projectId,
          expectedHolderId: interruptedLease.holderId,
          expectedFencingVersion: interruptedLease.fencingVersion,
          expectedActiveCodeBuildId: interruptedLease.activeCodeBuildId,
          expectedActiveWorkerTaskArn: interruptedLease.activeWorkerTaskArn,
          holderId: recoveryHolderId,
          source: "gitops"
        },
        executionLeaseRepository,
        { now }
      );
      recoveryLease = await executionLeaseRepository.find(recovered.projectId);
    } else {
      const acquired = await acquireProjectExecutionLease(
        { projectId: run.projectId, holderId: recoveryHolderId, source: "gitops" },
        executionLeaseRepository,
        { now }
      );
      recoveryLease = await executionLeaseRepository.find(acquired.projectId);
    }
    if (!recoveryLease) {
      throw new Error("GitHub 릴리즈 복구 잠금을 준비하지 못했습니다.");
    }
    await dispatchWorker({ run, mode: "recover", lease: recoveryLease });
  };

  const recoverInCurrentWorker = async (run: InterruptedRun): Promise<void> => {
    if (!recoveryController) return;
    let result: GitHubReleaseRecoveryResult;
    try {
      result = await recoveryController.recover({
        runId: run.runId,
        projectId: run.projectId,
        cancellationRequested: run.cancellationRequestedAt !== null
      });
    } catch {
      return;
    }
    const fence = await findRecoveryGitHubFence(
      run.projectId,
      run.runId,
      run.releaseId,
      executionLeaseRepository
    );
    if (executionLeaseRepository && !fence) {
      return;
    }
    if (result.kind === "completion") {
      await repository.complete({
        runId: run.runId,
        result: result.result,
        now: now(),
        ...(fence ? { fence } : {})
      });
    } else {
      await repository.fail({
        runId: run.runId,
        errorSummary: result.errorSummary,
        cancelled: result.cancelled,
        now: now(),
        ...(fence ? { fence } : {})
      });
    }
    await releaseOwnedLease(run);
  };

  const recoverInterruptedRuns = async (onlyRunId?: string): Promise<void> => {
    if (!repository.listInterrupted) return;
    const interrupted = (await repository.listInterrupted()).filter(
      (run) => !onlyRunId || run.runId === onlyRunId
    );
    for (const run of interrupted) {
      if (run.pipelineStatus === "queued") {
        const frontendRetryQueued =
          Boolean(run.releaseId) && run.releaseStatus === "partially_failed";
        if (run.cancellationRequestedAt && frontendRetryQueued) {
          await failQueuedFrontendRetry(
            run,
            "웹 배포 재시도가 시작되기 전에 취소되어 기존 API와 URL을 유지했습니다."
          );
        } else if (run.cancellationRequestedAt) {
          await failQueuedRun(run, "GitHub 릴리즈가 시작되기 전에 취소되었습니다.");
        } else if (frontendRetryQueued && shouldDispatchToWorker) {
          try {
            await dispatchQueuedFrontendRetry(run);
          } catch (error) {
            await failQueuedFrontendRetry(run, safeErrorSummary(error));
          }
        } else if (frontendRetryQueued) {
          await executeFrontendRetryNow(run.runId);
        } else if (shouldDispatchToWorker) {
          try {
            await dispatchQueuedRun(run);
          } catch (error) {
            await failQueuedRun(run, safeErrorSummary(error));
          }
        } else {
          await executeNow(run.runId);
        }
        continue;
      }
      if (shouldDispatchToWorker) {
        await dispatchRecoveryRun(run).catch(() => undefined);
      } else {
        await recoverInCurrentWorker(run);
      }
    }
  };

  return {
    enqueue(runId) {
      queueMicrotask(() => {
        if (!shouldDispatchToWorker) {
          void executeNow(runId);
          return;
        }
        void (async () => {
          const interrupted = await repository.listInterrupted?.();
          const run = interrupted?.find((candidate) => candidate.runId === runId);
          if (!run) return;
          try {
            await dispatchQueuedRun(run);
          } catch (error) {
            await failQueuedRun(run, safeErrorSummary(error));
          }
        })();
      });
    },
    async cancel(runId, _projectId) {
      const controller = active.get(runId);
      if (controller) {
        controller.abort();
        return;
      }
      await recoverInterruptedRuns(runId);
    },
    retryFrontend,
    executeNow,
    executeFrontendRetryNow,
    recoverInterruptedRuns
  };
}

function completionValues(result: GitHubReleaseCompletion): {
  providerRevision: ApplicationReleaseProviderRevision;
  outputUrl: string;
  healthEvidence: JsonValue;
  rollbackEvidence: JsonValue | null;
  frontendEvidence: FrontendReleaseEvidence | null;
  failureStage: ApplicationReleaseFailureStage | null;
} {
  return {
    providerRevision: result.providerRevision,
    outputUrl: result.outputUrl,
    healthEvidence: result.healthEvidence,
    rollbackEvidence: result.rollbackEvidence,
    frontendEvidence: result.frontendEvidence ?? null,
    failureStage: result.failureStage ?? null
  };
}

async function findOwnedGitHubFence(
  projectId: string,
  holderId: string,
  repository: ProjectExecutionLeaseRepository | undefined
): Promise<GitHubExecutionFence | undefined> {
  if (!repository) return undefined;
  const lease = await repository.find(projectId);
  if (lease?.status !== "active" || lease.holderId !== holderId) return undefined;
  return {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
}

async function requireOwnedGitHubFence(
  projectId: string,
  holderId: string,
  repository: ProjectExecutionLeaseRepository | undefined
): Promise<GitHubExecutionFence | undefined> {
  const fence = await findOwnedGitHubFence(projectId, holderId, repository);
  if (repository && !fence) {
    throw new Error("GitHub release no longer owns its project execution fence");
  }
  return fence;
}

async function findRecoveryGitHubFence(
  projectId: string,
  runId: string,
  releaseId: string | null | undefined,
  repository: ProjectExecutionLeaseRepository | undefined
): Promise<GitHubExecutionFence | undefined> {
  if (!repository) return undefined;
  const lease = await repository.find(projectId);
  if (
    lease?.status !== "active" ||
    (lease.holderId !== runId &&
      lease.holderId !== releaseId &&
      !lease.holderId.startsWith(`recovery:${runId}:`))
  ) {
    return undefined;
  }
  return {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
}

async function requireGitHubExecutionFence(
  db: Database,
  fence: GitHubExecutionFence,
  now: Date
): Promise<void> {
  const [current] = await db
    .select({ projectId: projectExecutionLeases.projectId })
    .from(projectExecutionLeases)
    .where(
      and(
        eq(projectExecutionLeases.projectId, fence.projectId),
        eq(projectExecutionLeases.holderId, fence.holderId),
        eq(projectExecutionLeases.fencingVersion, fence.fencingVersion),
        eq(projectExecutionLeases.status, "active"),
        gt(projectExecutionLeases.expiresAt, now)
      )
    )
    .for("update");
  if (!current) throw new Error("GitHub release execution fence is no longer current");
}

function readArtifactMetadata(
  metadata: Record<string, string | number | boolean | null>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

async function markRunFailed(
  db: Database,
  runId: string,
  errorSummary: string,
  now: Date
): Promise<void> {
  await db
    .update(gitCicdPipelineRuns)
    .set({
      status: "failed",
      statusMessage: errorSummary,
      finishedAt: now,
      lastRefreshedAt: now
    })
    .where(eq(gitCicdPipelineRuns.id, runId));
}

function safeErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/gu, " ").trim().slice(0, 500);
  }
  return "GitHub 앱 릴리즈에 실패했습니다.";
}
