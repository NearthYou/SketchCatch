import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type {
  ApplicationReleaseFailureStage,
  ApplicationReleaseStatus,
  CreateGitCicdReleaseRunRequest,
  GitCicdPipelineRunStatus,
  GitCicdReleaseRun,
  GitCicdReleaseRunStatus
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  deployments,
  gitCicdHandoffs,
  gitCicdMonitoringConfigs,
  gitCicdPipelineRuns,
  projectBuildEnvironments,
  projectDeploymentTargets,
  projects,
  sourceRepositories
} from "../db/schema.js";
import {
  isExpectedGitHubEnvironmentSubject,
  isExactGitHubWorkflowRef,
  type GitHubReleaseIdentity
} from "./github-oidc-release-identity.js";

const commitShaPattern = /^([0-9a-f]{40}|[0-9a-f]{64})$/u;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{8,160}$/u;

export type GitHubReleaseProjectContext = {
  projectId: string;
  sourceRepositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  githubRepositoryId: string | null;
  defaultBranch: string;
  monitorBranch: string | null;
  monitoringEnabled: boolean;
  buildEnvironmentReady: boolean;
  runtimeTargetKind: string | null;
  environmentName: string | null;
};

export type GitHubReleaseRunRecord = {
  id: string;
  projectId: string;
  infrastructureDeploymentId: string | null;
  sourceRepositoryId: string;
  commitSha: string;
  branch: string;
  repositoryId: string;
  workflowRef: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  workflowRunUrl: string | null;
  oidcSubject: string;
  environmentName: string;
  pipelineStatus: GitCicdPipelineRunStatus;
  statusMessage: string | null;
  releaseId: string | null;
  releaseStatus: ApplicationReleaseStatus | null;
  outputUrl: string | null;
  failureStage: ApplicationReleaseFailureStage | null;
  cancellationRequestedAt: Date | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type GitHubReleaseRunRepository = {
  findProjectContext(projectId: string): Promise<GitHubReleaseProjectContext | undefined>;
  findByRequestKey(requestKey: string): Promise<GitHubReleaseRunRecord | undefined>;
  findWorkflowRunRecordId(input: {
    sourceRepositoryId: string;
    workflowRunId: string;
    workflowRunAttempt: number;
  }): Promise<string | undefined>;
  findById(runId: string): Promise<GitHubReleaseRunRecord | undefined>;
  findByIdForOwner(input: {
    runId: string;
    userId: string;
  }): Promise<GitHubReleaseRunRecord | undefined>;
  create(input: {
    id: string;
    projectId: string;
    sourceRepositoryId: string;
    requestKey: string;
    request: CreateGitCicdReleaseRunRequest;
    identity: GitHubReleaseIdentity;
    branch: string;
    now: Date;
  }): Promise<GitHubReleaseRunRecord>;
  requestCancellation(input: {
    runId: string;
    requestedAt: Date;
  }): Promise<GitHubReleaseRunRecord | undefined>;
};

export type GitHubReleaseRunExecutor = {
  enqueue(runId: string): void;
  cancel(runId: string, projectId?: string): Promise<void>;
  retryFrontend?(runId: string, projectId?: string): Promise<void>;
  recoverInterruptedRuns?(runId?: string): Promise<void>;
};

export class GitHubReleaseRunError extends Error {
  constructor(
    readonly errorCode:
      | "GITHUB_RELEASE_REQUEST_INVALID"
      | "GITHUB_RELEASE_PROJECT_NOT_FOUND"
      | "GITHUB_RELEASE_PROJECT_NOT_READY"
      | "GITHUB_RELEASE_RUN_NOT_FOUND"
      | "GITHUB_RELEASE_RUN_TERMINAL"
      | "GITHUB_RELEASE_FRONTEND_RETRY_NOT_ALLOWED"
      | "GITHUB_RELEASE_FRONTEND_RETRY_UNAVAILABLE",
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "GitHubReleaseRunError";
  }
}

export function createPostgresGitHubReleaseRunRepository(
  db: Database
): GitHubReleaseRunRepository {
  const findRun = async (
    where: ReturnType<typeof eq> | ReturnType<typeof and>
  ): Promise<GitHubReleaseRunRecord | undefined> => {
    const [row] = await db
      .select({
        id: gitCicdPipelineRuns.id,
        projectId: gitCicdPipelineRuns.projectId,
        infrastructureDeploymentId: gitCicdPipelineRuns.infrastructureDeploymentId,
        sourceRepositoryId: gitCicdPipelineRuns.sourceRepositoryId,
        commitSha: gitCicdPipelineRuns.commitSha,
        branch: gitCicdPipelineRuns.branch,
        repositoryId: gitCicdPipelineRuns.githubRepositoryId,
        workflowRef: gitCicdPipelineRuns.githubWorkflowRef,
        workflowRunId: gitCicdPipelineRuns.githubWorkflowRunId,
        workflowRunAttempt: gitCicdPipelineRuns.githubWorkflowRunAttempt,
        workflowRunUrl: gitCicdPipelineRuns.pipelineRunUrl,
        oidcSubject: gitCicdPipelineRuns.githubOidcSubject,
        environmentName: gitCicdPipelineRuns.githubEnvironment,
        pipelineStatus: gitCicdPipelineRuns.status,
        statusMessage: gitCicdPipelineRuns.statusMessage,
        releaseId: applicationReleases.id,
        releaseStatus: applicationReleases.status,
        outputUrl: applicationReleases.outputUrl,
        failureStage: applicationReleases.failureStage,
        cancellationRequestedAt: gitCicdPipelineRuns.cancellationRequestedAt,
        createdAt: gitCicdPipelineRuns.createdAt,
        finishedAt: gitCicdPipelineRuns.finishedAt
      })
      .from(gitCicdPipelineRuns)
      .leftJoin(
        applicationReleases,
        eq(applicationReleases.pipelineRunId, gitCicdPipelineRuns.id)
      )
      .where(where)
      .orderBy(desc(gitCicdPipelineRuns.createdAt))
      .limit(1);
    if (
      !row?.repositoryId ||
      !row.workflowRef ||
      !row.workflowRunId ||
      !row.workflowRunAttempt ||
      !row.oidcSubject ||
      !row.environmentName
    ) return undefined;
    return {
      ...row,
      repositoryId: row.repositoryId,
      workflowRef: row.workflowRef,
      workflowRunId: row.workflowRunId,
      workflowRunAttempt: row.workflowRunAttempt,
      oidcSubject: row.oidcSubject,
      environmentName: row.environmentName
    };
  };

  return {
    async findProjectContext(projectId) {
      const [row] = await db
        .select({
          projectId: sourceRepositories.projectId,
          sourceRepositoryId: sourceRepositories.id,
          repositoryOwner: sourceRepositories.owner,
          repositoryName: sourceRepositories.name,
          githubRepositoryId: sourceRepositories.githubRepositoryId,
          defaultBranch: sourceRepositories.defaultBranch,
          monitorBranch: gitCicdMonitoringConfigs.monitorBranch,
          monitoringEnabled: gitCicdMonitoringConfigs.enabled,
          buildEnvironmentStatus: projectBuildEnvironments.status,
          runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind
        })
        .from(sourceRepositories)
        .leftJoin(
          gitCicdMonitoringConfigs,
          eq(gitCicdMonitoringConfigs.sourceRepositoryId, sourceRepositories.id)
        )
        .leftJoin(
          projectBuildEnvironments,
          eq(projectBuildEnvironments.projectId, sourceRepositories.projectId)
        )
        .leftJoin(
          projectDeploymentTargets,
          eq(projectDeploymentTargets.projectId, sourceRepositories.projectId)
        )
        .where(
          and(
            eq(sourceRepositories.projectId, projectId),
            eq(sourceRepositories.provider, "github"),
            eq(sourceRepositories.status, "active")
          )
        );
      if (!row) return undefined;
      const [handoff] = await db
        .select({ environmentName: gitCicdHandoffs.environmentName })
        .from(gitCicdHandoffs)
        .where(
          and(
            eq(gitCicdHandoffs.projectId, row.projectId),
            eq(gitCicdHandoffs.sourceRepositoryId, row.sourceRepositoryId),
            notInArray(gitCicdHandoffs.status, ["draft", "cancelled"])
          )
        )
        .orderBy(desc(gitCicdHandoffs.createdAt))
        .limit(1);
      return {
        projectId: row.projectId,
        sourceRepositoryId: row.sourceRepositoryId,
        repositoryOwner: row.repositoryOwner,
        repositoryName: row.repositoryName,
        githubRepositoryId: row.githubRepositoryId,
        defaultBranch: row.defaultBranch,
        monitorBranch: row.monitorBranch,
        monitoringEnabled: row.monitoringEnabled === true,
        buildEnvironmentReady: row.buildEnvironmentStatus === "ready",
        runtimeTargetKind: row.runtimeTargetKind,
        environmentName: handoff?.environmentName ?? null
      };
    },
    findByRequestKey(requestKey) {
      return findRun(eq(gitCicdPipelineRuns.releaseRequestKey, requestKey));
    },
    async findWorkflowRunRecordId(input) {
      const [row] = await db
        .select({ id: gitCicdPipelineRuns.id })
        .from(gitCicdPipelineRuns)
        .where(
          and(
            eq(gitCicdPipelineRuns.sourceRepositoryId, input.sourceRepositoryId),
            eq(gitCicdPipelineRuns.githubWorkflowRunId, input.workflowRunId),
            eq(gitCicdPipelineRuns.githubWorkflowRunAttempt, input.workflowRunAttempt),
            eq(gitCicdPipelineRuns.executionKind, "app")
          )
        )
        .limit(1);
      return row?.id;
    },
    findById(runId) {
      return findRun(eq(gitCicdPipelineRuns.id, runId));
    },
    async findByIdForOwner(input) {
      const [row] = await db
        .select({ id: gitCicdPipelineRuns.id })
        .from(gitCicdPipelineRuns)
        .innerJoin(projects, eq(projects.id, gitCicdPipelineRuns.projectId))
        .where(
          and(
            eq(gitCicdPipelineRuns.id, input.runId),
            eq(projects.userId, input.userId)
          )
        );
      return row ? findRun(eq(gitCicdPipelineRuns.id, row.id)) : undefined;
    },
    async create(input) {
      const [infrastructureDeployment] = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, input.projectId),
            eq(deployments.status, "SUCCESS"),
            inArray(deployments.scope, ["full_stack", "infrastructure"])
          )
        )
        .orderBy(desc(deployments.completedAt), desc(deployments.createdAt))
        .limit(1);
      if (!infrastructureDeployment) {
        throw new GitHubReleaseRunError(
          "GITHUB_RELEASE_PROJECT_NOT_READY",
          "GitHub 릴리즈에 연결할 성공한 ECS/Fargate 인프라 배포가 없습니다.",
          409
        );
      }
      const [claimed] = await db.insert(gitCicdPipelineRuns).values({
        id: input.id,
        projectId: input.projectId,
        sourceRepositoryId: input.sourceRepositoryId,
        infrastructureDeploymentId: infrastructureDeployment.id,
        handoffId: null,
        executionKind: "app",
        commitSha: input.request.commitSha,
        commitMessage: `GitHub release request ${input.request.workflowRunId}`,
        branch: input.branch,
        releaseRequestKey: input.requestKey,
        githubRepositoryId: input.request.repositoryId,
        githubWorkflowRef: input.request.workflow,
        githubWorkflowRunId: input.request.workflowRunId,
        githubWorkflowRunAttempt: input.request.workflowRunAttempt,
        githubOidcSubject: input.identity.subject,
        githubEnvironment: input.identity.environment,
        cancellationRequestedAt: null,
        changeScope: "app",
        status: "queued",
        statusMessage: "SketchCatch에서 코드 사전 검증을 준비하고 있습니다.",
        pipelineRunUrl: input.request.workflowRunUrl,
        appUrl: null,
        apiUrl: null,
        startedAt: null,
        finishedAt: null,
        upstreamOrderingToken: `${input.request.workflowRunId}:${input.request.workflowRunAttempt}`,
        logRevision: "",
        lastRefreshedAt: input.now,
        createdAt: input.now
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
          infrastructureDeploymentId: infrastructureDeployment.id,
          releaseRequestKey: input.requestKey,
          githubRepositoryId: input.request.repositoryId,
          githubWorkflowRef: input.request.workflow,
          githubOidcSubject: input.identity.subject,
          githubEnvironment: input.identity.environment,
          pipelineRunUrl: input.request.workflowRunUrl,
          branch: input.branch,
          commitSha: input.request.commitSha,
          status: "queued",
          statusMessage: "SketchCatch에서 코드 사전 검증을 준비하고 있습니다.",
          lastRefreshedAt: input.now
        },
        setWhere: and(
          eq(gitCicdPipelineRuns.executionKind, "app"),
          or(
            isNull(gitCicdPipelineRuns.releaseRequestKey),
            eq(gitCicdPipelineRuns.releaseRequestKey, input.requestKey)
          )
        )!
      }).returning({ id: gitCicdPipelineRuns.id });
      const created = claimed
        ? await findRun(eq(gitCicdPipelineRuns.id, claimed.id))
        : await findRun(eq(gitCicdPipelineRuns.releaseRequestKey, input.requestKey));
      if (!created) throw new Error("GitHub release run was not saved");
      return created;
    },
    async requestCancellation(input) {
      await db
        .update(gitCicdPipelineRuns)
        .set({
          cancellationRequestedAt: input.requestedAt,
          statusMessage: "취소 요청을 안전하게 처리하고 있습니다.",
          lastRefreshedAt: input.requestedAt
        })
        .where(
          and(
            eq(gitCicdPipelineRuns.id, input.runId),
            eq(gitCicdPipelineRuns.changeScope, "app")
          )
        );
      return findRun(eq(gitCicdPipelineRuns.id, input.runId));
    }
  };
}

export async function createGitHubReleaseRun(
  input: {
    projectId: string;
    requestKey: string;
    request: CreateGitCicdReleaseRunRequest;
    identity: GitHubReleaseIdentity;
  },
  repository: GitHubReleaseRunRepository,
  executor: GitHubReleaseRunExecutor,
  options: {
    generateId?: () => string;
    now?: () => Date;
    reserveExecution?: (input: { projectId: string; runId: string }) => Promise<void>;
    releaseReservedExecution?: (input: { projectId: string; runId: string }) => Promise<void>;
  } = {}
): Promise<{ run: GitCicdReleaseRun; created: boolean }> {
  validateRequest(input);
  const context = await repository.findProjectContext(input.projectId);
  if (!context) {
    throw new GitHubReleaseRunError(
      "GITHUB_RELEASE_PROJECT_NOT_FOUND",
      "GitHub Repository가 연결된 프로젝트를 찾을 수 없습니다.",
      404
    );
  }
  assertProjectReady(context);
  assertIdentityMatches(input.request, input.identity, context);
  if (input.requestKey !== createCanonicalReleaseRequestKey(input.identity)) {
    throw invalidRequest();
  }
  const existingByKey = await repository.findByRequestKey(input.requestKey);
  if (existingByKey) {
    assertStoredRequestMatches(existingByKey, input, context);
    return { run: toGitHubReleaseRun(existingByKey), created: false };
  }

  const existingWorkflowRunId = await repository.findWorkflowRunRecordId({
    sourceRepositoryId: context.sourceRepositoryId,
    workflowRunId: input.request.workflowRunId,
    workflowRunAttempt: input.request.workflowRunAttempt
  });
  const runId = existingWorkflowRunId ?? options.generateId?.() ?? randomUUID();
  await options.reserveExecution?.({ projectId: input.projectId, runId });
  let reservedRunId = runId;
  let record: GitHubReleaseRunRecord;
  try {
    record = await repository.create({
      id: runId,
      projectId: input.projectId,
      sourceRepositoryId: context.sourceRepositoryId,
      requestKey: input.requestKey,
      request: input.request,
      identity: input.identity,
      branch: branchFromRef(input.request.ref),
      now: options.now?.() ?? new Date()
    });
    if (record.id !== reservedRunId) {
      await options.releaseReservedExecution?.({
        projectId: input.projectId,
        runId: reservedRunId
      });
      await options.reserveExecution?.({ projectId: input.projectId, runId: record.id });
      reservedRunId = record.id;
    }
  } catch (error) {
    await options
      .releaseReservedExecution?.({ projectId: input.projectId, runId: reservedRunId })
      .catch(() => undefined);
    throw error;
  }
  executor.enqueue(record.id);
  return { run: toGitHubReleaseRun(record), created: true };
}

export function createCanonicalReleaseRequestKey(identity: GitHubReleaseIdentity): string {
  return [
    identity.repositoryId,
    identity.commitSha.toLowerCase(),
    identity.workflowRunId,
    String(identity.workflowRunAttempt)
  ].join(":");
}

export async function getGitHubReleaseRun(
  input: { runId: string; identity: GitHubReleaseIdentity },
  repository: GitHubReleaseRunRepository
): Promise<GitCicdReleaseRun> {
  const record = await repository.findById(input.runId);
  if (!record) throw runNotFound();
  const context = await repository.findProjectContext(record.projectId);
  if (
    !context ||
    normalizeRepository(input.identity.repository) !==
      normalizeRepository(`${context.repositoryOwner}/${context.repositoryName}`) ||
    input.identity.repositoryId !== context.githubRepositoryId ||
    !storedIdentityMatches(record, input.identity)
  ) {
    throw runNotFound();
  }
  return toGitHubReleaseRun(record);
}

function assertStoredRequestMatches(
  record: GitHubReleaseRunRecord,
  input: {
    projectId: string;
    request: CreateGitCicdReleaseRunRequest;
    identity: GitHubReleaseIdentity;
  },
  context: GitHubReleaseProjectContext
): void {
  if (
    record.projectId !== input.projectId ||
    record.sourceRepositoryId !== context.sourceRepositoryId ||
    record.repositoryId !== input.request.repositoryId ||
    record.commitSha !== input.request.commitSha ||
    record.branch !== branchFromRef(input.request.ref) ||
    record.workflowRef !== input.request.workflow ||
    record.workflowRunId !== input.request.workflowRunId ||
    record.workflowRunAttempt !== input.request.workflowRunAttempt ||
    record.workflowRunUrl !== input.request.workflowRunUrl ||
    !storedIdentityMatches(record, input.identity)
  ) {
    throw invalidRequest();
  }
}

function storedIdentityMatches(
  record: GitHubReleaseRunRecord,
  identity: GitHubReleaseIdentity
): boolean {
  return (
    record.repositoryId === identity.repositoryId &&
    record.commitSha === identity.commitSha &&
    `refs/heads/${record.branch}` === identity.ref &&
    record.workflowRef === identity.workflowRef &&
    record.workflowRunId === identity.workflowRunId &&
    record.workflowRunAttempt === identity.workflowRunAttempt &&
    record.oidcSubject === identity.subject &&
    record.environmentName === identity.environment
  );
}

export async function cancelGitHubReleaseRun(
  input:
    | { runId: string; identity: GitHubReleaseIdentity; ownerUserId?: never }
    | { runId: string; ownerUserId: string; identity?: never },
  repository: GitHubReleaseRunRepository,
  executor: GitHubReleaseRunExecutor,
  options: { now?: () => Date } = {}
): Promise<GitCicdReleaseRun> {
  const current = "identity" in input && input.identity
    ? await getGitHubReleaseRun({ runId: input.runId, identity: input.identity }, repository)
    : await getGitHubReleaseRunForOwner(
        { runId: input.runId, userId: input.ownerUserId },
        repository
      );
  if (["succeeded", "failed", "cancelled", "partially_failed", "partially_cancelled"].includes(current.status)) {
    throw new GitHubReleaseRunError(
      "GITHUB_RELEASE_RUN_TERMINAL",
      "이미 종료된 릴리즈 실행은 취소할 수 없습니다.",
      409
    );
  }
  const saved = await repository.requestCancellation({
    runId: input.runId,
    requestedAt: options.now?.() ?? new Date()
  });
  if (!saved) throw runNotFound();
  await executor.cancel(input.runId, current.projectId);
  return toGitHubReleaseRun(saved);
}

export async function retryGitHubReleaseFrontend(
  input: { runId: string; ownerUserId: string },
  repository: GitHubReleaseRunRepository,
  executor: GitHubReleaseRunExecutor
): Promise<GitCicdReleaseRun> {
  const record = await repository.findByIdForOwner({
    runId: input.runId,
    userId: input.ownerUserId
  });
  if (!record) throw runNotFound();
  if (
    !record.releaseId ||
    record.releaseStatus !== "partially_failed" ||
    !isFrontendFailureStage(record.failureStage)
  ) {
    throw new GitHubReleaseRunError(
      "GITHUB_RELEASE_FRONTEND_RETRY_NOT_ALLOWED",
      "API 배포가 정상이고 웹 단계만 부분 실패한 GitHub 릴리즈에서만 재시도할 수 있습니다.",
      409
    );
  }
  if (!executor.retryFrontend) {
    throw new GitHubReleaseRunError(
      "GITHUB_RELEASE_FRONTEND_RETRY_UNAVAILABLE",
      "신뢰된 웹 릴리즈 재시도 워커가 준비되지 않았습니다.",
      503
    );
  }
  await executor.retryFrontend(record.id, record.projectId);
  return toGitHubReleaseRun(record);
}

async function getGitHubReleaseRunForOwner(
  input: { runId: string; userId: string },
  repository: GitHubReleaseRunRepository
): Promise<GitCicdReleaseRun> {
  const record = await repository.findByIdForOwner(input);
  if (!record) throw runNotFound();
  return toGitHubReleaseRun(record);
}

function validateRequest(input: {
  projectId: string;
  requestKey: string;
  request: CreateGitCicdReleaseRunRequest;
}): void {
  const request = input.request;
  if (
    !idempotencyKeyPattern.test(input.requestKey) ||
    !commitShaPattern.test(request.commitSha) ||
    !/^\d+$/u.test(request.repositoryId) ||
    !/^\d+$/u.test(request.workflowRunId) ||
    !Number.isSafeInteger(request.workflowRunAttempt) ||
    request.workflowRunAttempt <= 0 ||
    !/^refs\/heads\/[A-Za-z0-9._/-]+$/u.test(request.ref)
  ) {
    throw invalidRequest();
  }
  let workflowUrl: URL;
  try {
    workflowUrl = new URL(request.workflowRunUrl);
  } catch {
    throw invalidRequest();
  }
  if (
    workflowUrl.protocol !== "https:" ||
    workflowUrl.hostname !== "github.com" ||
    workflowUrl.search ||
    workflowUrl.hash
  ) throw invalidRequest();
}

function assertProjectReady(context: GitHubReleaseProjectContext): void {
  if (
    !context.githubRepositoryId ||
    !context.monitoringEnabled ||
    !context.buildEnvironmentReady ||
    !context.environmentName ||
    context.runtimeTargetKind !== "ecs_fargate"
  ) {
    throw new GitHubReleaseRunError(
      "GITHUB_RELEASE_PROJECT_NOT_READY",
      "GitHub 릴리즈 전에 ECS/Fargate 빌드 환경과 모니터링 연결을 준비해 주세요.",
      409
    );
  }
}

function assertIdentityMatches(
  request: CreateGitCicdReleaseRunRequest,
  identity: GitHubReleaseIdentity,
  context: GitHubReleaseProjectContext
): void {
  const expectedRepository = `${context.repositoryOwner}/${context.repositoryName}`;
  const expectedBranch = context.monitorBranch ?? context.defaultBranch;
  const environmentName = context.environmentName;
  if (!environmentName) throw invalidRequest();
  if (
    normalizeRepository(request.repository) !== normalizeRepository(expectedRepository) ||
    normalizeRepository(identity.repository) !== normalizeRepository(expectedRepository) ||
    request.repositoryId !== context.githubRepositoryId ||
    identity.repositoryId !== context.githubRepositoryId ||
    request.commitSha !== identity.commitSha ||
    request.ref !== identity.ref ||
    request.workflow !== identity.workflowRef ||
    request.workflowRunId !== identity.workflowRunId ||
    request.workflowRunAttempt !== identity.workflowRunAttempt ||
    identity.environment !== environmentName ||
    !isExpectedGitHubEnvironmentSubject({
      subject: identity.subject,
      repository: identity.repository,
      repositoryId: identity.repositoryId,
      environment: identity.environment
    }) ||
    branchFromRef(request.ref) !== expectedBranch ||
    !isExactGitHubWorkflowRef({
      workflowRef: request.workflow,
      repository: expectedRepository,
      workflowPath: ".github/workflows/sketchcatch-app.yml",
      ref: request.ref
    })
  ) throw invalidRequest();
}

function toGitHubReleaseRun(record: GitHubReleaseRunRecord): GitCicdReleaseRun {
  return {
    id: record.id,
    projectId: record.projectId,
    infrastructureDeploymentId: record.infrastructureDeploymentId,
    sourceRepositoryId: record.sourceRepositoryId,
    commitSha: record.commitSha,
    branch: record.branch,
    workflowRunId: record.workflowRunId,
    workflowRunUrl: record.workflowRunUrl,
    status: resolveStatus(record.pipelineStatus, record.releaseStatus),
    statusMessage: record.statusMessage,
    releaseId: record.releaseId,
    outputUrl: record.outputUrl,
    failureStage: record.failureStage,
    cancellationRequestedAt: record.cancellationRequestedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null
  };
}

function resolveStatus(
  pipelineStatus: GitCicdPipelineRunStatus,
  releaseStatus: ApplicationReleaseStatus | null
): GitCicdReleaseRunStatus {
  if (releaseStatus === "partially_failed") return "partially_failed";
  if (releaseStatus === "partially_cancelled") return "partially_cancelled";
  if (releaseStatus === "succeeded") return "succeeded";
  if (releaseStatus === "cancelled") return "cancelled";
  if (releaseStatus === "failed" || releaseStatus === "rolled_back") return "failed";
  if (pipelineStatus === "detected") return "queued";
  return pipelineStatus;
}

function branchFromRef(ref: string): string {
  return ref.slice("refs/heads/".length);
}

function normalizeRepository(value: string): string {
  return value.trim().toLowerCase().replace(/\.git$/u, "");
}

function invalidRequest(): GitHubReleaseRunError {
  return new GitHubReleaseRunError(
    "GITHUB_RELEASE_REQUEST_INVALID",
    "GitHub Repository, commit 또는 workflow 실행 정보가 OIDC 신원과 일치하지 않습니다.",
    401
  );
}

function runNotFound(): GitHubReleaseRunError {
  return new GitHubReleaseRunError(
    "GITHUB_RELEASE_RUN_NOT_FOUND",
    "GitHub 릴리즈 실행을 찾을 수 없습니다.",
    404
  );
}

function isFrontendFailureStage(stage: ApplicationReleaseFailureStage | null): boolean {
  return (
    stage === "frontend_upload" ||
    stage === "frontend_activation" ||
    stage === "cloudfront_invalidation" ||
    stage === "public_health"
  );
}
