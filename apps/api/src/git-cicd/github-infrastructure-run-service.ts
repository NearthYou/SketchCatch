import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import type {
  CompleteGitCicdInfrastructureRunRequest,
  CreateGitCicdInfrastructureRunRequest,
  GitCicdInfrastructureRunResponse,
  GitCicdPipelineRun,
  GitCicdPipelineRunStatus
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  deployments,
  gitCicdHandoffs,
  gitCicdMonitoringConfigs,
  gitCicdPipelineRuns,
  sourceRepositories
} from "../db/schema.js";
import {
  acquireProjectExecutionLease,
  assertCurrentProjectExecutionLease,
  heartbeatProjectExecutionLease,
  ProjectExecutionLeaseError,
  releaseProjectExecutionLease,
  type LeaseFence,
  type ProjectExecutionLeaseOptions,
  type ProjectExecutionLeaseRecord,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import type {
  GitHubActionsReadClient,
  GitHubWorkflowRunSummary
} from "../source-repositories/github-app-client.js";
import {
  isExpectedGitHubEnvironmentSubject,
  isExactGitHubWorkflowRef,
  type GitHubReleaseIdentity
} from "./github-oidc-release-identity.js";

const commitShaPattern = /^([0-9a-f]{40}|[0-9a-f]{64})$/u;
const githubRunIdPattern = /^\d+$/u;
const blockedStatusMessage =
  "현재 이 프로젝트에서 다른 배포가 진행 중입니다. 완료 후 다시 실행해 주세요.";

export type GitHubInfrastructureExecutionTarget = {
  projectId: string;
  sourceRepositoryId: string;
  installationId: string;
  repositoryOwner: string;
  repositoryName: string;
  githubRepositoryId: string;
  defaultBranch: string;
  monitorBranch: string | null;
  environmentName: string;
  infrastructureDeploymentId: string | null;
};

export type GitHubInfrastructureRunRecord = {
  id: string;
  projectId: string;
  infrastructureDeploymentId: string | null;
  sourceRepositoryId: string;
  handoffId: string | null;
  executionKind: "infra";
  commitSha: string;
  commitMessage: string;
  branch: string;
  repositoryId: string;
  workflowRef: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  workflowRunUrl: string;
  oidcSubject: string;
  environmentName: string;
  changeScope: "infra";
  status: GitCicdPipelineRunStatus;
  statusMessage: string;
  appUrl: string | null;
  apiUrl: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  upstreamOrderingToken: string;
  logRevision: string;
  lastRefreshedAt: Date;
  createdAt: Date;
};

export type GitHubExecutionRecoveryRecord = {
  id: string;
  projectId: string;
  repositoryId: string;
  workflowRunId: string;
};

export type GitHubInfrastructureRunRepository = {
  findExecutionTarget(input: {
    projectId: string;
    repositoryId: string;
  }): Promise<GitHubInfrastructureExecutionTarget | undefined>;
  findByWorkflowRun(input: {
    sourceRepositoryId: string;
    workflowRunId: string;
    workflowRunAttempt: number;
  }): Promise<GitHubInfrastructureRunRecord | undefined>;
  findById(runId: string): Promise<GitHubInfrastructureRunRecord | undefined>;
  findRecoveryCandidate(runId: string): Promise<GitHubExecutionRecoveryRecord | undefined>;
  create(input: GitHubInfrastructureRunRecord): Promise<GitHubInfrastructureRunRecord>;
  updateStatus(input: {
    runId: string;
    status: GitCicdPipelineRunStatus;
    statusMessage: string;
    startedAt?: Date | null;
    finishedAt: Date | null;
    lastRefreshedAt: Date;
  }): Promise<GitHubInfrastructureRunRecord | undefined>;
  markRecoveredTerminal(input: {
    runId: string;
    status: "failed" | "cancelled";
    statusMessage: string;
    finishedAt: Date;
  }): Promise<void>;
};

export type GitHubInfrastructureRunServiceOptions = {
  generateId?: () => string;
  now?: () => Date;
  leaseTtlMs?: number;
  githubActionsClient?: Pick<GitHubActionsReadClient, "getWorkflowRun">;
};

export class GitHubInfrastructureRunError extends Error {
  constructor(
    readonly errorCode:
      | "GITHUB_INFRASTRUCTURE_RUN_INVALID"
      | "GITHUB_INFRASTRUCTURE_PROJECT_NOT_READY"
      | "GITHUB_INFRASTRUCTURE_RUN_NOT_FOUND"
      | "GITHUB_INFRASTRUCTURE_RUN_TERMINAL",
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "GitHubInfrastructureRunError";
  }
}

export function createPostgresGitHubInfrastructureRunRepository(
  db: Database
): GitHubInfrastructureRunRepository {
  const findRun = async (
    condition: ReturnType<typeof eq> | ReturnType<typeof and>
  ): Promise<GitHubInfrastructureRunRecord | undefined> => {
    const [row] = await db
      .select({
        id: gitCicdPipelineRuns.id,
        projectId: gitCicdPipelineRuns.projectId,
        infrastructureDeploymentId: gitCicdPipelineRuns.infrastructureDeploymentId,
        sourceRepositoryId: gitCicdPipelineRuns.sourceRepositoryId,
        handoffId: gitCicdPipelineRuns.handoffId,
        executionKind: gitCicdPipelineRuns.executionKind,
        commitSha: gitCicdPipelineRuns.commitSha,
        commitMessage: gitCicdPipelineRuns.commitMessage,
        branch: gitCicdPipelineRuns.branch,
        repositoryId: gitCicdPipelineRuns.githubRepositoryId,
        workflowRef: gitCicdPipelineRuns.githubWorkflowRef,
        workflowRunId: gitCicdPipelineRuns.githubWorkflowRunId,
        workflowRunAttempt: gitCicdPipelineRuns.githubWorkflowRunAttempt,
        workflowRunUrl: gitCicdPipelineRuns.pipelineRunUrl,
        oidcSubject: gitCicdPipelineRuns.githubOidcSubject,
        environmentName: gitCicdPipelineRuns.githubEnvironment,
        changeScope: gitCicdPipelineRuns.changeScope,
        status: gitCicdPipelineRuns.status,
        statusMessage: gitCicdPipelineRuns.statusMessage,
        appUrl: gitCicdPipelineRuns.appUrl,
        apiUrl: gitCicdPipelineRuns.apiUrl,
        startedAt: gitCicdPipelineRuns.startedAt,
        finishedAt: gitCicdPipelineRuns.finishedAt,
        upstreamOrderingToken: gitCicdPipelineRuns.upstreamOrderingToken,
        logRevision: gitCicdPipelineRuns.logRevision,
        lastRefreshedAt: gitCicdPipelineRuns.lastRefreshedAt,
        createdAt: gitCicdPipelineRuns.createdAt
      })
      .from(gitCicdPipelineRuns)
      .where(condition)
      .limit(1);
    if (
      !row ||
      row.executionKind !== "infra" ||
      row.changeScope !== "infra" ||
      !row.repositoryId ||
      !row.workflowRef ||
      !row.workflowRunId ||
      !row.workflowRunAttempt ||
      !row.workflowRunUrl ||
      !row.oidcSubject ||
      !row.environmentName ||
      !row.statusMessage
    ) return undefined;
    return {
      ...row,
      executionKind: "infra",
      changeScope: "infra",
      repositoryId: row.repositoryId,
      workflowRef: row.workflowRef,
      workflowRunId: row.workflowRunId,
      workflowRunAttempt: row.workflowRunAttempt,
      workflowRunUrl: row.workflowRunUrl,
      oidcSubject: row.oidcSubject,
      environmentName: row.environmentName,
      statusMessage: row.statusMessage
    };
  };

  return {
    async findExecutionTarget(input) {
      const [source] = await db
        .select({
          projectId: sourceRepositories.projectId,
          sourceRepositoryId: sourceRepositories.id,
          installationId: sourceRepositories.githubInstallationId,
          repositoryOwner: sourceRepositories.owner,
          repositoryName: sourceRepositories.name,
          githubRepositoryId: sourceRepositories.githubRepositoryId,
          defaultBranch: sourceRepositories.defaultBranch,
          monitorBranch: gitCicdMonitoringConfigs.monitorBranch,
          monitoringEnabled: gitCicdMonitoringConfigs.enabled
        })
        .from(sourceRepositories)
        .leftJoin(
          gitCicdMonitoringConfigs,
          eq(gitCicdMonitoringConfigs.sourceRepositoryId, sourceRepositories.id)
        )
        .where(
          and(
            eq(sourceRepositories.projectId, input.projectId),
            eq(sourceRepositories.provider, "github"),
            eq(sourceRepositories.status, "active"),
            eq(sourceRepositories.githubRepositoryId, input.repositoryId)
          )
        )
        .limit(1);
      if (
        !source?.installationId ||
        !source.githubRepositoryId ||
        source.monitoringEnabled !== true
      ) return undefined;
      const [handoff] = await db
        .select({ environmentName: gitCicdHandoffs.environmentName })
        .from(gitCicdHandoffs)
        .where(
          and(
            eq(gitCicdHandoffs.projectId, input.projectId),
            eq(gitCicdHandoffs.sourceRepositoryId, source.sourceRepositoryId),
            notInArray(gitCicdHandoffs.status, ["draft", "cancelled"])
          )
        )
        .orderBy(desc(gitCicdHandoffs.createdAt))
        .limit(1);
      if (!handoff?.environmentName) return undefined;
      const [deployment] = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, input.projectId),
            eq(deployments.status, "SUCCESS")
          )
        )
        .orderBy(desc(deployments.completedAt), desc(deployments.createdAt))
        .limit(1);
      return {
        projectId: source.projectId,
        sourceRepositoryId: source.sourceRepositoryId,
        installationId: source.installationId,
        repositoryOwner: source.repositoryOwner,
        repositoryName: source.repositoryName,
        githubRepositoryId: source.githubRepositoryId,
        defaultBranch: source.defaultBranch,
        monitorBranch: source.monitorBranch,
        environmentName: handoff.environmentName,
        infrastructureDeploymentId: deployment?.id ?? null
      };
    },
    findByWorkflowRun(input) {
      return findRun(
        and(
          eq(gitCicdPipelineRuns.sourceRepositoryId, input.sourceRepositoryId),
          eq(gitCicdPipelineRuns.githubWorkflowRunId, input.workflowRunId),
          eq(gitCicdPipelineRuns.githubWorkflowRunAttempt, input.workflowRunAttempt),
          eq(gitCicdPipelineRuns.executionKind, "infra")
        )
      );
    },
    findById(runId) {
      return findRun(eq(gitCicdPipelineRuns.id, runId));
    },
    async findRecoveryCandidate(runId) {
      const [row] = await db
        .select({
          id: gitCicdPipelineRuns.id,
          projectId: gitCicdPipelineRuns.projectId,
          repositoryId: gitCicdPipelineRuns.githubRepositoryId,
          workflowRunId: gitCicdPipelineRuns.githubWorkflowRunId
        })
        .from(gitCicdPipelineRuns)
        .where(eq(gitCicdPipelineRuns.id, runId))
        .limit(1);
      if (!row?.repositoryId || !row.workflowRunId) return undefined;
      return {
        id: row.id,
        projectId: row.projectId,
        repositoryId: row.repositoryId,
        workflowRunId: row.workflowRunId
      };
    },
    async create(input) {
      const [claimed] = await db.insert(gitCicdPipelineRuns).values({
        id: input.id,
        projectId: input.projectId,
        sourceRepositoryId: input.sourceRepositoryId,
        infrastructureDeploymentId: input.infrastructureDeploymentId,
        handoffId: input.handoffId,
        executionKind: input.executionKind,
        commitSha: input.commitSha,
        commitMessage: input.commitMessage,
        branch: input.branch,
        releaseRequestKey: null,
        githubRepositoryId: input.repositoryId,
        githubWorkflowRef: input.workflowRef,
        githubWorkflowRunId: input.workflowRunId,
        githubWorkflowRunAttempt: input.workflowRunAttempt,
        githubOidcSubject: input.oidcSubject,
        githubEnvironment: input.environmentName,
        cancellationRequestedAt: null,
        changeScope: input.changeScope,
        status: input.status,
        statusMessage: input.statusMessage,
        pipelineRunUrl: input.workflowRunUrl,
        appUrl: input.appUrl,
        apiUrl: input.apiUrl,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        upstreamOrderingToken: input.upstreamOrderingToken,
        logRevision: input.logRevision,
        lastRefreshedAt: input.lastRefreshedAt,
        createdAt: input.createdAt
      }).onConflictDoUpdate({
        target: [
          gitCicdPipelineRuns.sourceRepositoryId,
          gitCicdPipelineRuns.githubWorkflowRunId,
          gitCicdPipelineRuns.githubWorkflowRunAttempt
        ],
        targetWhere: and(
          sql`${gitCicdPipelineRuns.githubWorkflowRunId} is not null`,
          sql`${gitCicdPipelineRuns.githubWorkflowRunAttempt} is not null`
        )!,
        set: {
          infrastructureDeploymentId: input.infrastructureDeploymentId,
          githubRepositoryId: input.repositoryId,
          githubWorkflowRef: input.workflowRef,
          githubOidcSubject: input.oidcSubject,
          githubEnvironment: input.environmentName,
          pipelineRunUrl: input.workflowRunUrl,
          branch: input.branch,
          commitSha: input.commitSha,
          status: input.status,
          statusMessage: input.statusMessage,
          lastRefreshedAt: input.lastRefreshedAt
        },
        setWhere: and(
          eq(gitCicdPipelineRuns.executionKind, "infra"),
          or(
            isNull(gitCicdPipelineRuns.githubRepositoryId),
            eq(gitCicdPipelineRuns.githubRepositoryId, input.repositoryId)
          )
        )!
      }).returning({ id: gitCicdPipelineRuns.id });
      const created = claimed
        ? await findRun(eq(gitCicdPipelineRuns.id, claimed.id))
        : undefined;
      if (!created) throw new Error("GitHub infrastructure run was not saved");
      return created;
    },
    async updateStatus(input) {
      await db
        .update(gitCicdPipelineRuns)
        .set({
          status: input.status,
          statusMessage: input.statusMessage,
          ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
          finishedAt: input.finishedAt,
          lastRefreshedAt: input.lastRefreshedAt
        })
        .where(
          and(
            eq(gitCicdPipelineRuns.id, input.runId),
            eq(gitCicdPipelineRuns.executionKind, "infra")
          )
        );
      return findRun(eq(gitCicdPipelineRuns.id, input.runId));
    },
    async markRecoveredTerminal(input) {
      await db
        .update(gitCicdPipelineRuns)
        .set({
          status: input.status,
          statusMessage: input.statusMessage,
          finishedAt: input.finishedAt,
          lastRefreshedAt: input.finishedAt
        })
        .where(eq(gitCicdPipelineRuns.id, input.runId));
    }
  };
}

export async function createGitHubInfrastructureRun(
  input: {
    projectId: string;
    request: CreateGitCicdInfrastructureRunRequest;
    identity: GitHubReleaseIdentity;
  },
  repository: GitHubInfrastructureRunRepository,
  leaseRepository: ProjectExecutionLeaseRepository,
  options: GitHubInfrastructureRunServiceOptions = {}
): Promise<GitCicdInfrastructureRunResponse & { created: boolean }> {
  validateCreateRequest(input.request);
  const target = await repository.findExecutionTarget({
    projectId: input.projectId,
    repositoryId: input.request.repositoryId
  });
  if (!target) throw projectNotReady();
  assertIdentityMatches(input.request, input.identity, target);
  const existing = await repository.findByWorkflowRun({
    sourceRepositoryId: target.sourceRepositoryId,
    workflowRunId: input.request.workflowRunId,
    workflowRunAttempt: input.request.workflowRunAttempt
  });
  if (existing) {
    assertStoredIdentityMatches(existing, input.identity);
    return { run: toPipelineRun(existing), created: false };
  }

  const currentTime = options.now?.() ?? new Date();
  const record = await repository.create({
    id: options.generateId?.() ?? randomUUID(),
    projectId: input.projectId,
    infrastructureDeploymentId: target.infrastructureDeploymentId,
    sourceRepositoryId: target.sourceRepositoryId,
    handoffId: null,
    executionKind: "infra",
    commitSha: input.request.commitSha,
    commitMessage: `GitHub infrastructure run ${input.request.workflowRunId}`,
    branch: branchFromRef(input.request.ref),
    repositoryId: input.request.repositoryId,
    workflowRef: input.request.workflow,
    workflowRunId: input.request.workflowRunId,
    workflowRunAttempt: input.request.workflowRunAttempt,
    workflowRunUrl: input.request.workflowRunUrl,
    oidcSubject: input.identity.subject,
    environmentName: input.identity.environment,
    changeScope: "infra",
    status: "detected",
    statusMessage: "인프라 실행을 등록했습니다.",
    appUrl: null,
    apiUrl: null,
    startedAt: null,
    finishedAt: null,
    upstreamOrderingToken: `${input.request.workflowRunId}:${input.request.workflowRunAttempt}`,
    logRevision: "",
    lastRefreshedAt: currentTime,
    createdAt: currentTime
  });

  let lease;
  let verifiedTerminal: VerifiedTerminalGitHubExecution | null = null;
  try {
    lease = await acquireProjectExecutionLease(
      { projectId: input.projectId, holderId: record.id, source: "gitops" },
      leaseRepository,
      createLeaseOptions(repository, options, (terminal) => {
        verifiedTerminal = terminal;
      })
    );
  } catch (error) {
    if (error instanceof ProjectExecutionLeaseError) {
      await repository.updateStatus({
        runId: record.id,
        status: "failed",
        statusMessage: blockedStatusMessage,
        finishedAt: currentTime,
        lastRefreshedAt: currentTime
      });
    }
    throw error;
  }
  if (verifiedTerminal) {
    try {
      await repository.markRecoveredTerminal(verifiedTerminal);
    } catch (error) {
      await releaseProjectExecutionLease(toFence(lease), leaseRepository, currentTime);
      throw error;
    }
  }
  const running = await repository.updateStatus({
    runId: record.id,
    status: "running",
    statusMessage: "인프라 실행을 시작했습니다.",
    startedAt: currentTime,
    finishedAt: null,
    lastRefreshedAt: currentTime
  });
  if (!running) {
    await releaseProjectExecutionLease(toFence(lease), leaseRepository, currentTime);
    throw runNotFound();
  }
  return { run: toPipelineRun(running), created: true };
}

export async function heartbeatGitHubInfrastructureRun(
  input: { runId: string; identity: GitHubReleaseIdentity },
  repository: GitHubInfrastructureRunRepository,
  leaseRepository: ProjectExecutionLeaseRepository,
  options: Pick<GitHubInfrastructureRunServiceOptions, "now" | "leaseTtlMs"> = {}
): Promise<GitCicdInfrastructureRunResponse> {
  const record = await requireAuthorizedRunningRecord(input, repository);
  const fence = await requireCurrentFence(record, leaseRepository, options.now?.() ?? new Date());
  await heartbeatProjectExecutionLease(fence, leaseRepository, {
    ...(options.now ? { now: options.now } : {}),
    ...(options.leaseTtlMs === undefined ? {} : { ttlMs: options.leaseTtlMs })
  });
  const refreshedAt = options.now?.() ?? new Date();
  const saved = await repository.updateStatus({
    runId: record.id,
    status: "running",
    statusMessage: record.statusMessage,
    finishedAt: null,
    lastRefreshedAt: refreshedAt
  });
  if (!saved) throw runNotFound();
  return { run: toPipelineRun(saved) };
}

export async function completeGitHubInfrastructureRun(
  input: {
    runId: string;
    identity: GitHubReleaseIdentity;
    request: CompleteGitCicdInfrastructureRunRequest;
  },
  repository: GitHubInfrastructureRunRepository,
  leaseRepository: ProjectExecutionLeaseRepository,
  options: Pick<GitHubInfrastructureRunServiceOptions, "now" | "leaseTtlMs"> = {}
): Promise<GitCicdInfrastructureRunResponse> {
  const record = await requireAuthorizedRecord(input, repository);
  const terminalStatus = toTerminalStatus(input.request.conclusion);
  if (isTerminal(record.status)) {
    if (record.status !== terminalStatus) throw runTerminal();
    await releaseOwnedLeaseIfPresent(record, leaseRepository, options.now?.() ?? new Date());
    return { run: toPipelineRun(record) };
  }
  if (record.status !== "running") throw runTerminal();
  if (input.request.conclusion === "succeeded" && input.request.stage !== "infra_apply") {
    throw invalidCompletion("인프라 Apply 완료 단계에서만 성공으로 종료할 수 있습니다.");
  }
  const currentTime = options.now?.() ?? new Date();
  const fence = await requireCurrentFence(record, leaseRepository, currentTime);
  await heartbeatProjectExecutionLease(fence, leaseRepository, {
    now: () => currentTime,
    ...(options.leaseTtlMs === undefined ? {} : { ttlMs: options.leaseTtlMs })
  });
  const saved = await repository.updateStatus({
    runId: record.id,
    status: terminalStatus,
    statusMessage: terminalStatusMessage(input.request),
    finishedAt: currentTime,
    lastRefreshedAt: currentTime
  });
  if (!saved) throw runNotFound();
  const released = await releaseProjectExecutionLease(fence, leaseRepository, currentTime);
  if (!released) {
    throw new ProjectExecutionLeaseError(
      "LEASE_FENCE_REJECTED",
      "This execution no longer owns the project release lease"
    );
  }
  return { run: toPipelineRun(saved) };
}

async function releaseOwnedLeaseIfPresent(
  record: GitHubInfrastructureRunRecord,
  leaseRepository: ProjectExecutionLeaseRepository,
  now: Date
): Promise<void> {
  const current = await leaseRepository.find(record.projectId);
  if (current?.status !== "active" || current.holderId !== record.id) return;
  await releaseProjectExecutionLease(
    {
      projectId: record.projectId,
      holderId: record.id,
      fencingVersion: current.fencingVersion
    },
    leaseRepository,
    now
  );
}

async function requireAuthorizedRunningRecord(
  input: { runId: string; identity: GitHubReleaseIdentity },
  repository: GitHubInfrastructureRunRepository
): Promise<GitHubInfrastructureRunRecord> {
  const record = await requireAuthorizedRecord(input, repository);
  if (record.status !== "running") throw runTerminal();
  return record;
}

async function requireAuthorizedRecord(
  input: { runId: string; identity: GitHubReleaseIdentity },
  repository: GitHubInfrastructureRunRepository
): Promise<GitHubInfrastructureRunRecord> {
  const record = await repository.findById(input.runId);
  if (!record) throw runNotFound();
  assertStoredIdentityMatches(record, input.identity);
  return record;
}

async function requireCurrentFence(
  record: GitHubInfrastructureRunRecord,
  leaseRepository: ProjectExecutionLeaseRepository,
  now: Date
): Promise<LeaseFence> {
  const current = await leaseRepository.find(record.projectId);
  const fence = {
    projectId: record.projectId,
    holderId: record.id,
    fencingVersion: current?.fencingVersion ?? -1
  };
  await assertCurrentProjectExecutionLease(fence, leaseRepository, now);
  return fence;
}

function createLeaseOptions(
  repository: GitHubInfrastructureRunRepository,
  options: GitHubInfrastructureRunServiceOptions,
  onVerifiedTerminal: (terminal: VerifiedTerminalGitHubExecution) => void
): ProjectExecutionLeaseOptions {
  return {
    ...(options.now ? { now: options.now } : {}),
    ...(options.leaseTtlMs === undefined ? {} : { ttlMs: options.leaseTtlMs }),
    ...(options.githubActionsClient
      ? {
          inspectExpiredExecution: async (lease: ProjectExecutionLeaseRecord) => {
            const inspection = await inspectExpiredGitHubExecution(
              lease,
              repository,
              options.githubActionsClient!,
              options.now?.() ?? new Date()
            );
            if (inspection.terminal) onVerifiedTerminal(inspection.terminal);
            return inspection.state;
          }
        }
      : {})
  };
}

async function inspectExpiredGitHubExecution(
  lease: ProjectExecutionLeaseRecord,
  repository: GitHubInfrastructureRunRepository,
  githubActionsClient: Pick<GitHubActionsReadClient, "getWorkflowRun">,
  now: Date
): Promise<{
  state: "terminal" | "active" | "unknown";
  terminal: VerifiedTerminalGitHubExecution | null;
}> {
  if (lease.source !== "gitops") return { state: "unknown", terminal: null };
  const oldRecord = await repository.findRecoveryCandidate(lease.holderId);
  if (!oldRecord) return { state: "unknown", terminal: null };
  const target = await repository.findExecutionTarget({
    projectId: oldRecord.projectId,
    repositoryId: oldRecord.repositoryId
  });
  if (!target) return { state: "unknown", terminal: null };
  try {
    const githubRun = await githubActionsClient.getWorkflowRun({
      installationId: target.installationId,
      owner: target.repositoryOwner,
      name: target.repositoryName,
      runId: parseGitHubRunId(oldRecord.workflowRunId)
    });
    if (githubRun.status !== "completed") return { state: "active", terminal: null };
    return {
      state: "terminal",
      terminal: {
        runId: oldRecord.id,
        status: githubRun.conclusion === "cancelled" ? "cancelled" : "failed",
        statusMessage: staleTerminalStatusMessage(githubRun),
        finishedAt: now
      }
    };
  } catch {
    return { state: "unknown", terminal: null };
  }
}

type VerifiedTerminalGitHubExecution = Parameters<
  GitHubInfrastructureRunRepository["markRecoveredTerminal"]
>[0];

function validateCreateRequest(request: CreateGitCicdInfrastructureRunRequest): void {
  if (
    !commitShaPattern.test(request.commitSha) ||
    !githubRunIdPattern.test(request.repositoryId) ||
    !githubRunIdPattern.test(request.workflowRunId) ||
    !Number.isSafeInteger(request.workflowRunAttempt) ||
    request.workflowRunAttempt <= 0 ||
    !/^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(request.ref)
  ) throw invalidRequest("GitHub workflow 실행 정보 형식이 올바르지 않습니다.");
  let url: URL;
  try {
    url = new URL(request.workflowRunUrl);
  } catch {
    throw invalidRequest("GitHub workflow URL 형식이 올바르지 않습니다.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.search ||
    url.hash
  ) throw invalidRequest("GitHub workflow URL 형식이 올바르지 않습니다.");
}

function assertIdentityMatches(
  request: CreateGitCicdInfrastructureRunRequest,
  identity: GitHubReleaseIdentity,
  target: GitHubInfrastructureExecutionTarget
): void {
  const repository = `${target.repositoryOwner}/${target.repositoryName}`;
  if (
    normalizeRepository(request.repository) !== normalizeRepository(repository) ||
    normalizeRepository(identity.repository) !== normalizeRepository(repository) ||
    request.repositoryId !== target.githubRepositoryId ||
    identity.repositoryId !== target.githubRepositoryId
  ) throw invalidRequest("GitHub Repository 정보가 연결된 프로젝트와 일치하지 않습니다.");
  if (
    request.commitSha !== identity.commitSha ||
    request.ref !== identity.ref ||
    branchFromRef(request.ref) !== (target.monitorBranch ?? target.defaultBranch)
  ) throw invalidRequest("GitHub commit 또는 branch 정보가 OIDC 신원과 일치하지 않습니다.");
  if (
    !isExactGitHubWorkflowRef({
      workflowRef: request.workflow,
      repository,
      workflowPath: ".github/workflows/sketchcatch-infra.yml",
      ref: request.ref
    }) ||
    !isExactGitHubWorkflowRef({
      workflowRef: identity.workflowRef,
      repository,
      workflowPath: ".github/workflows/sketchcatch-infra.yml",
      ref: request.ref
    })
  ) throw invalidRequest("GitHub Infra workflow 정보가 OIDC 신원과 일치하지 않습니다.");
  if (
    request.workflowRunId !== identity.workflowRunId ||
    request.workflowRunAttempt !== identity.workflowRunAttempt ||
    identity.environment !== target.environmentName ||
    !isExpectedGitHubEnvironmentSubject({
      subject: identity.subject,
      repository: identity.repository,
      repositoryId: identity.repositoryId,
      environment: identity.environment
    })
  ) throw invalidRequest("GitHub workflow run 신원이 OIDC 정보와 일치하지 않습니다.");
  const workflowRunUrl = new URL(request.workflowRunUrl);
  const expectedPath = `/${target.repositoryOwner}/${target.repositoryName}/actions/runs/${request.workflowRunId}`;
  if (workflowRunUrl.pathname.toLowerCase() !== expectedPath.toLowerCase()) {
    throw invalidRequest("GitHub workflow URL이 실행 신원과 일치하지 않습니다.");
  }
}

function assertStoredIdentityMatches(
  record: GitHubInfrastructureRunRecord,
  identity: GitHubReleaseIdentity
): void {
  if (
    record.repositoryId !== identity.repositoryId ||
    record.commitSha !== identity.commitSha ||
    `refs/heads/${record.branch}` !== identity.ref ||
    record.workflowRef !== identity.workflowRef ||
    record.workflowRunId !== identity.workflowRunId ||
    record.workflowRunAttempt !== identity.workflowRunAttempt ||
    record.oidcSubject !== identity.subject ||
    record.environmentName !== identity.environment
  ) throw invalidRequest("GitHub workflow run 신원이 저장된 실행과 일치하지 않습니다.");
}

function toPipelineRun(record: GitHubInfrastructureRunRecord): GitCicdPipelineRun {
  return {
    id: record.id,
    projectId: record.projectId,
    infrastructureDeploymentId: record.infrastructureDeploymentId,
    sourceRepositoryId: record.sourceRepositoryId,
    handoffId: record.handoffId,
    executionKind: record.executionKind,
    githubWorkflowRunId: record.workflowRunId,
    githubWorkflowRunAttempt: record.workflowRunAttempt,
    commitSha: record.commitSha,
    commitMessage: record.commitMessage,
    branch: record.branch,
    changeScope: record.changeScope,
    status: record.status,
    statusMessage: record.statusMessage,
    pipelineRunUrl: record.workflowRunUrl,
    appUrl: record.appUrl,
    apiUrl: record.apiUrl,
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    upstreamOrderingToken: record.upstreamOrderingToken,
    logRevision: record.logRevision,
    lastRefreshedAt: record.lastRefreshedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    stages: []
  };
}

function terminalStatusMessage(request: CompleteGitCicdInfrastructureRunRequest): string {
  if (request.conclusion === "succeeded") return "인프라 배포가 완료되었습니다.";
  if (request.conclusion === "cancelled") return "인프라 배포가 취소되었습니다.";
  switch (request.stage) {
    case "configuration":
      return "인프라 배포 준비에 실패했습니다. GitHub Actions 설정과 AWS 연결을 확인해 주세요.";
    case "infra_plan":
      return "인프라 Plan 생성에 실패했습니다. Terraform Apply는 실행되지 않았습니다.";
    case "infra_apply":
      return "인프라 적용 중 실패했습니다. 일부 리소스가 변경되었을 수 있으므로 실행 로그를 확인해 주세요.";
  }
}

function staleTerminalStatusMessage(run: GitHubWorkflowRunSummary): string {
  return run.conclusion === "cancelled"
    ? "이전 인프라 workflow가 GitHub에서 취소된 것을 확인했습니다."
    : "이전 인프라 workflow가 종료되어 새 실행을 시작합니다.";
}

function toTerminalStatus(
  conclusion: CompleteGitCicdInfrastructureRunRequest["conclusion"]
): "succeeded" | "failed" | "cancelled" {
  return conclusion;
}

function isTerminal(status: GitCicdPipelineRunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function parseGitHubRunId(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Invalid GitHub run id");
  return number;
}

function toFence(lease: { projectId: string; holderId: string; fencingVersion: number }): LeaseFence {
  return {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
}

function branchFromRef(ref: string): string {
  return ref.slice("refs/heads/".length);
}

function normalizeRepository(value: string): string {
  return value.trim().toLowerCase().replace(/\.git$/u, "");
}

function invalidRequest(message: string): GitHubInfrastructureRunError {
  return new GitHubInfrastructureRunError(
    "GITHUB_INFRASTRUCTURE_RUN_INVALID",
    message,
    401
  );
}

function invalidCompletion(message: string): GitHubInfrastructureRunError {
  return new GitHubInfrastructureRunError(
    "GITHUB_INFRASTRUCTURE_RUN_INVALID",
    message,
    400
  );
}

function projectNotReady(): GitHubInfrastructureRunError {
  return new GitHubInfrastructureRunError(
    "GITHUB_INFRASTRUCTURE_PROJECT_NOT_READY",
    "GitHub Infra workflow를 실행할 프로젝트 연결이 준비되지 않았습니다.",
    409
  );
}

function runNotFound(): GitHubInfrastructureRunError {
  return new GitHubInfrastructureRunError(
    "GITHUB_INFRASTRUCTURE_RUN_NOT_FOUND",
    "GitHub 인프라 실행을 찾을 수 없습니다.",
    404
  );
}

function runTerminal(): GitHubInfrastructureRunError {
  return new GitHubInfrastructureRunError(
    "GITHUB_INFRASTRUCTURE_RUN_TERMINAL",
    "이미 종료되었거나 현재 프로젝트 실행 권한을 잃은 인프라 실행입니다.",
    409
  );
}
