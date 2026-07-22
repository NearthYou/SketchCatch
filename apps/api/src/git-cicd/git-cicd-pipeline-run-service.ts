import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import type {
  GitCicdMonitoredPath,
  GitCicdPipelineChangeScope,
  GitCicdPipelineExecutionKind,
  GitCicdPipelineRunStatus,
  GitCicdPipelineStageKind,
  GitCicdPipelineStageStatus
} from "@sketchcatch/types";
import { maskDeploymentMessage } from "../deployments/log-masking.js";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  gitCicdMonitoringConfigs,
  gitCicdHandoffs,
  gitCicdPipelineLogs,
  gitCicdPipelineRuns,
  gitCicdPipelineStages,
  sourceRepositories
} from "../db/schema.js";
import {
  EcsGitOpsReleaseVerificationError,
  type EcsGitOpsReleaseRecord
} from "./ecs-gitops-release-reconciler.js";
import type { GitOpsReleaseReconciler } from "./gitops-release-reconciler.js";
import { LambdaGitOpsReleaseVerificationError } from "./lambda-gitops-release-reconciler.js";
import { Ec2AsgGitOpsReleaseVerificationError } from "./ec2-asg-gitops-release-reconciler.js";
import { StaticSiteGitOpsReleaseVerificationError } from "./static-site-gitops-release-reconciler.js";
import type {
  GitCicdRunProvider,
  GitCicdRunProviderSnapshot
} from "./github-actions-run-provider.js";
import { normalizeNonSensitiveHttpUrl } from "./non-sensitive-http-url.js";

const stageKinds: readonly GitCicdPipelineStageKind[] = [
  "detect",
  "app_build",
  "artifact_publish",
  "infra_plan",
  "infra_apply",
  "app_deploy",
  "verify"
];
const terminalPipelineRunStatuses: readonly GitCicdPipelineRunStatus[] = [
  "succeeded",
  "failed",
  "cancelled"
];
const projectReleaseInProgressMessage =
  "현재 이 프로젝트에서 다른 배포가 진행 중입니다. 완료 후 다시 실행해 주세요.";

export type PipelineRefreshTarget = {
  projectId: string;
  sourceRepositoryId: string;
  installationId: string;
  owner: string;
  name: string;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  handoffId: string | null;
  appUrl: string | null;
  apiUrl: string | null;
  commitSha?: string;
  workflowRunId?: string;
  workflowRunAttempt?: number;
  executionKind?: GitCicdPipelineExecutionKind;
};

export type PersistedPipelineRun = {
  id: string;
  projectId: string;
  infrastructureDeploymentId: string | null;
  sourceRepositoryId: string;
  handoffId: string | null;
  executionKind: GitCicdPipelineExecutionKind;
  githubWorkflowRunId: string | null;
  githubWorkflowRunAttempt: number | null;
  commitSha: string;
  commitMessage: string;
  branch: string;
  changeScope: GitCicdPipelineChangeScope;
  status: GitCicdPipelineRunStatus;
  statusMessage: string | null;
  pipelineRunUrl: string | null;
  appUrl: string | null;
  apiUrl: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  upstreamOrderingToken: string;
  logRevision: string;
  lastRefreshedAt: Date;
  createdAt: Date;
};
export type PersistedPipelineStage = {
  id: string;
  pipelineRunId: string;
  kind: GitCicdPipelineStageKind;
  status: GitCicdPipelineStageStatus;
  runUrl: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};
export type PersistedPipelineLog = {
  id: string;
  pipelineRunId: string;
  stageId: string | null;
  sequence: number;
  level: "info" | "warning" | "error";
  message: string;
  createdAt: Date;
};
export type PipelineRunWithStages = PersistedPipelineRun & {
  stages: PersistedPipelineStage[];
  release?: EcsGitOpsReleaseRecord | null;
};

export type GitCicdPipelinePersistenceRepository = {
  listRefreshTargets(projectId: string): Promise<PipelineRefreshTarget[]>;
  findRefreshTarget(
    projectId: string,
    sourceRepositoryId: string
  ): Promise<PipelineRefreshTarget | undefined>;
  findPipelineRun(pipelineRunId: string): Promise<PipelineRunWithStages | undefined>;
  findRunRefreshTarget(pipelineRunId: string): Promise<PipelineRefreshTarget | undefined>;
  listProjectPipelineRuns(projectId: string): Promise<PipelineRunWithStages[]>;
  listProjectPipelineRunPage(input: {
    projectId: string;
    cursor?: string;
    limit: number;
  }): Promise<PipelineRunWithStages[]>;
  listPipelineLogs(pipelineRunId: string, sinceSequence: number): Promise<PersistedPipelineLog[]>;
  findPipelineRunsByWorkflowRuns(
    sourceRepositoryId: string,
    keys: readonly {
      workflowRunId: string;
      workflowRunAttempt: number;
    }[]
  ): Promise<Map<string, PersistedPipelineRun>>;
  persistSnapshot(input: {
    run: PersistedPipelineRun;
    stages: PersistedPipelineStage[];
    logs: PersistedPipelineLog[];
  }): Promise<PipelineRunWithStages>;
};

export type PipelineRefreshResult = {
  runs: PipelineRunWithStages[];
  stale: boolean;
  errorMessage: string | null;
};

export class GitCicdPipelineRunInvalidCursorError extends Error {
  constructor() {
    super("Invalid Pipeline Run cursor");
    this.name = "GitCicdPipelineRunInvalidCursorError";
  }
}

export class GitCicdPipelineRunRefreshUnavailableError extends Error {
  constructor() {
    super("Pipeline Run not found");
    this.name = "GitCicdPipelineRunRefreshUnavailableError";
  }
}

export function createWorkflowRunKey(
  workflowRunId: string,
  workflowRunAttempt: number
): string {
  return `${workflowRunId}:${workflowRunAttempt}`;
}

export function createGitCicdPipelineStatusMessage(input: {
  executionKind: GitCicdPipelineExecutionKind;
  status: GitCicdPipelineRunStatus;
  stages: readonly PersistedPipelineStage[];
}): string {
  if (input.status === "failed") {
    const failedStages = new Set(
      input.stages.filter((stage) => stage.status === "failed").map((stage) => stage.kind)
    );
    if (input.executionKind === "infra") {
      if (failedStages.has("infra_plan")) {
        return "인프라 Plan 생성에 실패했습니다. Terraform Apply는 실행되지 않았습니다.";
      }
      if (failedStages.has("infra_apply")) {
        return "인프라 적용 중 실패했습니다. 일부 리소스가 변경되었을 수 있으므로 실행 로그를 확인해 주세요.";
      }
      return "인프라 배포 준비에 실패했습니다. GitHub Actions 설정과 AWS 연결을 확인해 주세요.";
    }
    if (failedStages.has("verify")) {
      return "새 버전 Health Check에 실패해 애플리케이션을 이전 정상 버전으로 복구했습니다.";
    }
    if (failedStages.has("app_deploy")) return "애플리케이션 배포에 실패했습니다.";
    return "애플리케이션 빌드에 실패했습니다.";
  }
  if (input.status === "succeeded") {
    return input.executionKind === "infra"
      ? "인프라 배포가 완료되었습니다."
      : "애플리케이션 배포가 완료되었습니다.";
  }
  if (input.status === "cancelled") {
    return input.executionKind === "infra"
      ? "인프라 배포가 취소되었습니다."
      : "애플리케이션 배포가 취소되었습니다.";
  }
  return input.executionKind === "infra"
    ? "인프라 배포가 진행 중입니다."
    : "애플리케이션 배포가 진행 중입니다.";
}

export function createGitCicdPipelineRunService(options: {
  repository: GitCicdPipelinePersistenceRepository;
  provider: GitCicdRunProvider;
  now?: () => Date;
  createId?: () => string;
  releaseReconciler?: GitOpsReleaseReconciler | undefined;
}) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;

  async function refreshTarget(
    target: PipelineRefreshTarget,
    onlyWorkflow?: {
      commitSha: string;
      workflowRunId: string;
      workflowRunAttempt: number;
      executionKind: GitCicdPipelineExecutionKind;
    }
  ): Promise<PipelineRefreshResult> {
    try {
      const snapshots = await options.provider.listSnapshots({
        installationId: target.installationId,
        owner: target.owner,
        name: target.name,
        branch: target.monitorBranch,
        ...(onlyWorkflow ? { commitSha: onlyWorkflow.commitSha } : {})
      });
      const relevantSnapshots = onlyWorkflow
        ? snapshots.filter(
            (snapshot) =>
              snapshot.commitSha === onlyWorkflow.commitSha &&
              snapshot.workflowRunId === onlyWorkflow.workflowRunId &&
              snapshot.workflowRunAttempt === onlyWorkflow.workflowRunAttempt &&
              snapshot.executionKind === onlyWorkflow.executionKind
          )
        : snapshots;
      const existingRuns = await options.repository.findPipelineRunsByWorkflowRuns(
        target.sourceRepositoryId,
        relevantSnapshots.map((snapshot) => ({
          workflowRunId: snapshot.workflowRunId,
          workflowRunAttempt: snapshot.workflowRunAttempt
        }))
      );
      const refreshed: PipelineRunWithStages[] = [];
      let latestApplicableWorkflowKey: string | null = null;
      let projectRuns: PipelineRunWithStages[] | null = null;
      for (const snapshot of relevantSnapshots) {
        const workflowKey = createWorkflowRunKey(
          snapshot.workflowRunId,
          snapshot.workflowRunAttempt
        );
        const existingRun = existingRuns.get(workflowKey);
        latestApplicableWorkflowKey ??= workflowKey;
        try {
          refreshed.push(await persistSnapshot(target, snapshot, existingRun));
        } catch (error) {
          if (!isReleaseVerificationError(error) || workflowKey === latestApplicableWorkflowKey) {
            throw error;
          }
          projectRuns ??= await options.repository.listProjectPipelineRuns(target.projectId);
          const persisted = projectRuns.find(
            (run) =>
              run.sourceRepositoryId === target.sourceRepositoryId &&
              run.githubWorkflowRunId === snapshot.workflowRunId &&
              run.githubWorkflowRunAttempt === snapshot.workflowRunAttempt &&
              run.executionKind === snapshot.executionKind
          );
          if (persisted) refreshed.push(maskRun(persisted));
        }
      }
      return { runs: refreshed, stale: false, errorMessage: null };
    } catch (error) {
      const persisted = await options.repository.listProjectPipelineRuns(target.projectId);
      const runs = onlyWorkflow
        ? persisted.filter(
            (run) =>
              run.githubWorkflowRunId === onlyWorkflow.workflowRunId &&
              run.githubWorkflowRunAttempt === onlyWorkflow.workflowRunAttempt &&
              run.executionKind === onlyWorkflow.executionKind
          )
        : persisted;
      return {
        runs: maskRuns(runs),
        stale: true,
        errorMessage:
          isReleaseVerificationError(error)
            ? "Application release verification failed; showing the last persisted state."
            : "GitHub Actions status refresh failed; showing the last persisted state."
      };
    }
  }

  async function persistSnapshot(
    target: PipelineRefreshTarget,
    snapshot: GitCicdRunProviderSnapshot,
    existingRun?: PersistedPipelineRun
  ): Promise<PipelineRunWithStages> {
    if (existingRun && existingRun.executionKind !== snapshot.executionKind) {
      throw new Error("GitHub Workflow execution kind changed for the same run attempt");
    }
    const refreshedAt = now();
    const runId = existingRun?.id ?? createId();
    const stages = buildStages(runId, snapshot, snapshot.executionKind, createId);
    const run: PersistedPipelineRun = {
      id: runId,
      projectId: target.projectId,
      infrastructureDeploymentId: null,
      sourceRepositoryId: target.sourceRepositoryId,
      handoffId: target.handoffId,
      executionKind: snapshot.executionKind,
      githubWorkflowRunId: snapshot.workflowRunId,
      githubWorkflowRunAttempt: snapshot.workflowRunAttempt,
      commitSha: snapshot.commitSha,
      commitMessage: maskDeploymentMessage(snapshot.commitMessage),
      branch: snapshot.branch,
      changeScope: snapshot.executionKind,
      status: snapshot.status,
      statusMessage:
        existingRun?.statusMessage === projectReleaseInProgressMessage
          ? projectReleaseInProgressMessage
          : createGitCicdPipelineStatusMessage({
              executionKind: snapshot.executionKind,
              status: snapshot.status,
              stages
            }),
      pipelineRunUrl: snapshot.runUrl,
      appUrl: normalizeNonSensitiveHttpUrl(target.appUrl),
      apiUrl: normalizeNonSensitiveHttpUrl(target.apiUrl),
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt,
      upstreamOrderingToken: snapshot.upstreamOrderingToken,
      logRevision: snapshot.logRevision,
      lastRefreshedAt: refreshedAt,
      createdAt: existingRun?.createdAt ?? refreshedAt
    };
    const stageIds = new Map(stages.map((stage) => [stage.kind, stage.id]));
    const logs = snapshot.logs.map(
      (log, index): PersistedPipelineLog => ({
        id: createId(),
        pipelineRunId: runId,
        stageId: log.stageKind ? (stageIds.get(log.stageKind) ?? null) : null,
        sequence: index + 1,
        level: log.level,
        message: maskDeploymentMessage(log.message),
        createdAt: refreshedAt
      })
    );
    const persisted = await options.repository.persistSnapshot({ run, stages, logs });
    if (
      options.releaseReconciler &&
      snapshot.releaseEvidence &&
      persisted.upstreamOrderingToken === snapshot.upstreamOrderingToken &&
      terminalPipelineRunStatuses.includes(snapshot.status)
    ) {
      const release = await options.releaseReconciler.reconcile({
        projectId: target.projectId,
        pipelineRunId: persisted.id,
        commitSha: snapshot.commitSha,
        pipelineStatus: snapshot.status,
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt,
        evidence: snapshot.releaseEvidence
      });
      return maskRun({ ...persisted, release });
    }
    return maskRun(persisted);
  }

  return {
    async refreshProjectMonitoringTargets(input: { projectId: string }) {
      const targets = await options.repository.listRefreshTargets(input.projectId);
      const results = await Promise.all(
        targets.map(async (target) => ({
          sourceRepositoryId: target.sourceRepositoryId,
          result: await refreshTarget(target)
        }))
      );
      const runs = await options.repository.listProjectPipelineRunPage({
        projectId: input.projectId,
        limit: 50
      });
      return {
        runs: maskRuns(runs),
        targets: results.map(({ sourceRepositoryId, result }) => ({
          sourceRepositoryId,
          stale: result.stale,
          errorMessage: result.errorMessage
        })),
        stale: results.some(({ result }) => result.stale)
      };
    },
    async refreshProjectPipelineRuns(input: {
      projectId: string;
      sourceRepositoryId: string;
    }): Promise<PipelineRefreshResult> {
      const target = await options.repository.findRefreshTarget(
        input.projectId,
        input.sourceRepositoryId
      );
      if (!target) throw new Error("Enabled and valid Git/CI/CD monitoring target not found");
      return refreshTarget(target);
    },
    async refreshPipelineRun(input: {
      pipelineRunId: string;
      authorizeProject?: (projectId: string) => Promise<boolean>;
    }): Promise<{ run: PipelineRunWithStages; stale: boolean; errorMessage: string | null }> {
      const target = await options.repository.findRunRefreshTarget(input.pipelineRunId);
      if (
        !target?.commitSha ||
        !target.workflowRunId ||
        !target.workflowRunAttempt ||
        !target.executionKind
      ) {
        throw new GitCicdPipelineRunRefreshUnavailableError();
      }
      if (input.authorizeProject && !(await input.authorizeProject(target.projectId))) {
        throw new GitCicdPipelineRunRefreshUnavailableError();
      }
      const result = await refreshTarget(target, {
        commitSha: target.commitSha,
        workflowRunId: target.workflowRunId,
        workflowRunAttempt: target.workflowRunAttempt,
        executionKind: target.executionKind
      });
      const run =
        result.runs.find((candidate) => candidate.id === input.pipelineRunId) ??
        (await options.repository.findPipelineRun(input.pipelineRunId));
      if (!run) throw new GitCicdPipelineRunRefreshUnavailableError();
      return { run: maskRun(run), stale: result.stale, errorMessage: result.errorMessage };
    },
    async listProjectPipelineRuns(input: {
      projectId: string;
      cursor?: string;
      limit: number;
    }) {
      const rows = await options.repository.listProjectPipelineRunPage({
        projectId: input.projectId,
        limit: input.limit + 1,
        ...(input.cursor ? { cursor: input.cursor } : {})
      });
      const runs = rows.slice(0, input.limit);
      return {
        runs: maskRuns(runs),
        nextCursor: rows.length > input.limit ? (runs.at(-1)?.id ?? null) : null
      };
    },
    async getPipelineRun(input: { pipelineRunId: string }) {
      const run = await options.repository.findPipelineRun(input.pipelineRunId);
      return run ? maskRun(run) : undefined;
    },
    async listPipelineLogs(input: { pipelineRunId: string; sinceSequence?: number }) {
      return (
        await options.repository.listPipelineLogs(input.pipelineRunId, input.sinceSequence ?? 0)
      ).map(maskLog);
    }
  };
}

export function createPostgresGitCicdPipelinePersistenceRepository(
  db: Database
): GitCicdPipelinePersistenceRepository {
  async function findTarget(
    where: ReturnType<typeof and>
  ): Promise<PipelineRefreshTarget | undefined> {
    return (await findTargets(where))[0];
  }

  async function findTargets(
    where: ReturnType<typeof and>
  ): Promise<PipelineRefreshTarget[]> {
    const targets = await db
      .select({
        projectId: sourceRepositories.projectId,
        sourceRepositoryId: sourceRepositories.id,
        installationId: sourceRepositories.githubInstallationId,
        owner: sourceRepositories.owner,
        name: sourceRepositories.name,
        monitorBranch: gitCicdMonitoringConfigs.monitorBranch,
        appPath: gitCicdMonitoringConfigs.appPath,
        infraPath: gitCicdMonitoringConfigs.infraPath
      })
      .from(sourceRepositories)
      .innerJoin(
        gitCicdMonitoringConfigs,
        eq(gitCicdMonitoringConfigs.sourceRepositoryId, sourceRepositories.id)
      )
      .where(where);
    const refreshTargets: PipelineRefreshTarget[] = [];
    for (const target of targets) {
      if (!target.installationId) continue;
      const [handoff] = await db
        .select({
          id: gitCicdHandoffs.id,
          appUrl: gitCicdHandoffs.staticSiteUrl,
          apiUrl: gitCicdHandoffs.apiBaseUrl
        })
        .from(gitCicdHandoffs)
        .where(
          and(
            eq(gitCicdHandoffs.projectId, target.projectId),
            eq(gitCicdHandoffs.sourceRepositoryId, target.sourceRepositoryId),
            eq(gitCicdHandoffs.targetBranch, target.monitorBranch),
            notInArray(gitCicdHandoffs.status, ["draft", "cancelled"])
          )
        )
        .orderBy(desc(gitCicdHandoffs.createdAt), desc(gitCicdHandoffs.id))
        .limit(1);
      refreshTargets.push({
        ...target,
        installationId: target.installationId,
        handoffId: handoff?.id ?? null,
        appUrl: handoff?.appUrl ?? null,
        apiUrl: handoff?.apiUrl ?? null
      });
    }
    return refreshTargets;
  }

  async function listRuns(projectId: string): Promise<PipelineRunWithStages[]> {
    const runs = await db
      .select()
      .from(gitCicdPipelineRuns)
      .where(eq(gitCicdPipelineRuns.projectId, projectId))
      .orderBy(desc(gitCicdPipelineRuns.createdAt));
    if (!runs.length) return [];
    const stages = await db
      .select()
      .from(gitCicdPipelineStages)
      .where(
        inArray(
          gitCicdPipelineStages.pipelineRunId,
          runs.map((run) => run.id)
        )
      )
      .orderBy(asc(gitCicdPipelineStages.kind));
    const releases = await db
      .select()
      .from(applicationReleases)
      .where(inArray(applicationReleases.pipelineRunId, runs.map((run) => run.id)));
    return runs.map((run) => ({
      ...run,
      release: releases.find((release) => release.pipelineRunId === run.id) ?? null,
      stages: stages
        .filter((stage) => stage.pipelineRunId === run.id)
        .sort((left, right) => stageKinds.indexOf(left.kind) - stageKinds.indexOf(right.kind))
    }));
  }

  async function listRunPage(input: {
    projectId: string;
    cursor?: string;
    limit: number;
  }): Promise<PipelineRunWithStages[]> {
    let cursor: { createdAt: Date; id: string } | undefined;
    if (input.cursor) {
      [cursor] = await db
        .select({ createdAt: gitCicdPipelineRuns.createdAt, id: gitCicdPipelineRuns.id })
        .from(gitCicdPipelineRuns)
        .where(
          and(
            eq(gitCicdPipelineRuns.projectId, input.projectId),
            eq(gitCicdPipelineRuns.id, input.cursor)
          )
        );
      if (!cursor) throw new GitCicdPipelineRunInvalidCursorError();
    }
    const keysetCondition = cursor
      ? or(
          lt(gitCicdPipelineRuns.createdAt, cursor.createdAt),
          and(
            eq(gitCicdPipelineRuns.createdAt, cursor.createdAt),
            lt(gitCicdPipelineRuns.id, cursor.id)
          )
        )
      : undefined;
    const runs = await db
      .select()
      .from(gitCicdPipelineRuns)
      .where(
        keysetCondition
          ? and(eq(gitCicdPipelineRuns.projectId, input.projectId), keysetCondition)
          : eq(gitCicdPipelineRuns.projectId, input.projectId)
      )
      .orderBy(desc(gitCicdPipelineRuns.createdAt), desc(gitCicdPipelineRuns.id))
      .limit(input.limit);
    if (!runs.length) return [];
    const stages = await db
      .select()
      .from(gitCicdPipelineStages)
      .where(inArray(gitCicdPipelineStages.pipelineRunId, runs.map((run) => run.id)));
    const releases = await db
      .select()
      .from(applicationReleases)
      .where(inArray(applicationReleases.pipelineRunId, runs.map((run) => run.id)));
    return runs.map((run) => ({
      ...run,
      release: releases.find((release) => release.pipelineRunId === run.id) ?? null,
      stages: stages
        .filter((stage) => stage.pipelineRunId === run.id)
        .sort((left, right) => stageKinds.indexOf(left.kind) - stageKinds.indexOf(right.kind))
    }));
  }

  return {
    listRefreshTargets(projectId) {
      return findTargets(
        and(
          eq(sourceRepositories.projectId, projectId),
          eq(sourceRepositories.status, "active"),
          eq(sourceRepositories.provider, "github"),
          eq(gitCicdMonitoringConfigs.enabled, true),
          eq(gitCicdMonitoringConfigs.validationStatus, "valid")
        )
      );
    },
    findRefreshTarget(projectId, sourceRepositoryId) {
      return findTarget(
        and(
          eq(sourceRepositories.projectId, projectId),
          eq(sourceRepositories.id, sourceRepositoryId),
          eq(sourceRepositories.status, "active"),
          eq(sourceRepositories.provider, "github"),
          eq(gitCicdMonitoringConfigs.enabled, true),
          eq(gitCicdMonitoringConfigs.validationStatus, "valid")
        )
      );
    },
    async findPipelineRun(pipelineRunId) {
      const [run] = await db
        .select()
        .from(gitCicdPipelineRuns)
        .where(eq(gitCicdPipelineRuns.id, pipelineRunId));
      if (!run) return undefined;
      const stages = await db
        .select()
        .from(gitCicdPipelineStages)
        .where(eq(gitCicdPipelineStages.pipelineRunId, pipelineRunId));
      const [release] = await db
        .select()
        .from(applicationReleases)
        .where(eq(applicationReleases.pipelineRunId, pipelineRunId));
      return {
        ...run,
        release: release ?? null,
        stages: stages.sort(
          (left, right) => stageKinds.indexOf(left.kind) - stageKinds.indexOf(right.kind)
        )
      };
    },
    async findRunRefreshTarget(pipelineRunId) {
      const [run] = await db
        .select({
          projectId: gitCicdPipelineRuns.projectId,
          sourceRepositoryId: gitCicdPipelineRuns.sourceRepositoryId,
          commitSha: gitCicdPipelineRuns.commitSha,
          workflowRunId: gitCicdPipelineRuns.githubWorkflowRunId,
          workflowRunAttempt: gitCicdPipelineRuns.githubWorkflowRunAttempt,
          executionKind: gitCicdPipelineRuns.executionKind
        })
        .from(gitCicdPipelineRuns)
        .where(eq(gitCicdPipelineRuns.id, pipelineRunId));
      if (!run) return undefined;
      const target = await findTarget(
        and(
          eq(sourceRepositories.projectId, run.projectId),
          eq(sourceRepositories.id, run.sourceRepositoryId),
          eq(sourceRepositories.status, "active"),
          eq(sourceRepositories.provider, "github"),
          eq(gitCicdMonitoringConfigs.enabled, true),
          eq(gitCicdMonitoringConfigs.validationStatus, "valid")
        )
      );
      return target && run.workflowRunId && run.workflowRunAttempt
        ? {
            ...target,
            commitSha: run.commitSha,
            workflowRunId: run.workflowRunId,
            workflowRunAttempt: run.workflowRunAttempt,
            executionKind: run.executionKind
          }
        : undefined;
    },
    listProjectPipelineRuns: listRuns,
    listProjectPipelineRunPage: listRunPage,
    listPipelineLogs(pipelineRunId, sinceSequence) {
      return db
        .select()
        .from(gitCicdPipelineLogs)
        .where(
          and(
            eq(gitCicdPipelineLogs.pipelineRunId, pipelineRunId),
            gt(gitCicdPipelineLogs.sequence, sinceSequence)
          )
        )
        .orderBy(asc(gitCicdPipelineLogs.sequence));
    },
    async findPipelineRunsByWorkflowRuns(sourceRepositoryId, keys) {
      if (!keys.length) return new Map();
      const workflowRunIds = [...new Set(keys.map((key) => key.workflowRunId))];
      const runs = await db
        .select()
        .from(gitCicdPipelineRuns)
        .where(
          and(
            eq(gitCicdPipelineRuns.sourceRepositoryId, sourceRepositoryId),
            inArray(gitCicdPipelineRuns.githubWorkflowRunId, workflowRunIds)
          )
        );
      const requestedKeys = new Set(
        keys.map((key) =>
          createWorkflowRunKey(key.workflowRunId, key.workflowRunAttempt)
        )
      );
      return new Map(
        runs.flatMap((run) => {
          if (!run.githubWorkflowRunId || !run.githubWorkflowRunAttempt) return [];
          const key = createWorkflowRunKey(
            run.githubWorkflowRunId,
            run.githubWorkflowRunAttempt
          );
          return requestedKeys.has(key) ? [[key, run] as const] : [];
        })
      );
    },
    persistSnapshot(input) {
      return db.transaction(async (tx) => {
        const incomingIsTerminal = terminalPipelineRunStatuses.includes(input.run.status);
        const [run] = await tx
          .insert(gitCicdPipelineRuns)
          .values(input.run)
          .onConflictDoUpdate({
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
              ...(input.run.handoffId === null
                ? {}
                : {
                    handoffId: input.run.handoffId,
                    appUrl: input.run.appUrl,
                    apiUrl: input.run.apiUrl
                  }),
              commitMessage: input.run.commitMessage,
              branch: input.run.branch,
              changeScope: input.run.changeScope,
              status: input.run.status,
              statusMessage: input.run.statusMessage,
              pipelineRunUrl: input.run.pipelineRunUrl,
              startedAt: input.run.startedAt,
              finishedAt: input.run.finishedAt,
              upstreamOrderingToken: input.run.upstreamOrderingToken,
              logRevision: input.run.logRevision,
              lastRefreshedAt: input.run.lastRefreshedAt
            },
            setWhere: or(
              eq(gitCicdPipelineRuns.logRevision, ""),
              lt(gitCicdPipelineRuns.upstreamOrderingToken, input.run.upstreamOrderingToken),
              and(
                eq(gitCicdPipelineRuns.upstreamOrderingToken, input.run.upstreamOrderingToken),
                incomingIsTerminal
                  ? sql`true`
                  : notInArray(gitCicdPipelineRuns.status, [...terminalPipelineRunStatuses])
              )
            )!
          })
          .returning();
        if (!run) {
          const [persistedRun] = await tx
            .select()
            .from(gitCicdPipelineRuns)
            .where(
              and(
                eq(gitCicdPipelineRuns.sourceRepositoryId, input.run.sourceRepositoryId),
                eq(gitCicdPipelineRuns.githubWorkflowRunId, input.run.githubWorkflowRunId!),
                eq(
                  gitCicdPipelineRuns.githubWorkflowRunAttempt,
                  input.run.githubWorkflowRunAttempt!
                )
              )
            );
          if (!persistedRun) throw new Error("Failed to read persisted Pipeline Run");
          if (persistedRun.executionKind !== input.run.executionKind) {
            throw new Error("GitHub Workflow execution kind changed for the same run attempt");
          }
          const persistedStages = await tx
            .select()
            .from(gitCicdPipelineStages)
            .where(eq(gitCicdPipelineStages.pipelineRunId, persistedRun.id));
          return {
            ...persistedRun,
            stages: persistedStages.sort(
              (left, right) => stageKinds.indexOf(left.kind) - stageKinds.indexOf(right.kind)
            )
          };
        }

        if (run.executionKind !== input.run.executionKind) {
          throw new Error("GitHub Workflow execution kind changed for the same run attempt");
        }

        const persistedStages: PersistedPipelineStage[] = [];
        const inputKindById = new Map(input.stages.map((stage) => [stage.id, stage.kind]));
        for (const stage of input.stages) {
          const values = { ...stage, pipelineRunId: run.id };
          const [persisted] = await tx
            .insert(gitCicdPipelineStages)
            .values(values)
            .onConflictDoUpdate({
              target: [gitCicdPipelineStages.pipelineRunId, gitCicdPipelineStages.kind],
              set: {
                status: values.status,
                runUrl: values.runUrl,
                startedAt: values.startedAt,
                finishedAt: values.finishedAt
              }
            })
            .returning();
          if (!persisted) throw new Error("Failed to persist Pipeline Run stage");
          persistedStages.push(persisted);
        }
        const persistedStageId = new Map(persistedStages.map((stage) => [stage.kind, stage.id]));
        await tx.delete(gitCicdPipelineLogs).where(eq(gitCicdPipelineLogs.pipelineRunId, run.id));
        if (input.logs.length) {
          await tx.insert(gitCicdPipelineLogs).values(
            input.logs.map((log) => ({
              ...log,
              pipelineRunId: run.id,
              stageId: log.stageId
                ? (persistedStageId.get(inputKindById.get(log.stageId)!) ?? null)
                : null
            }))
          );
        }
        return { ...run, stages: persistedStages };
      });
    }
  };
}

function isReleaseVerificationError(error: unknown): boolean {
  return (
    error instanceof EcsGitOpsReleaseVerificationError ||
    error instanceof LambdaGitOpsReleaseVerificationError ||
    error instanceof Ec2AsgGitOpsReleaseVerificationError ||
    error instanceof StaticSiteGitOpsReleaseVerificationError
  );
}

function buildStages(
  runId: string,
  snapshot: GitCicdRunProviderSnapshot,
  executionKind: GitCicdPipelineExecutionKind,
  createId: () => string
): PersistedPipelineStage[] {
  return stageKinds.map((kind) => {
    const job = snapshot.jobs.find((candidate) => candidate.stageKind === kind);
    const applicable =
      Boolean(job) ||
      kind === "detect" ||
      kind === "verify" ||
      (executionKind === "app" &&
        (kind === "app_build" || kind === "artifact_publish" || kind === "app_deploy")) ||
      (executionKind === "infra" && (kind === "infra_plan" || kind === "infra_apply"));
    return {
      id: createId(),
      pipelineRunId: runId,
      kind,
      status: !applicable
        ? "skipped"
        : kind === "detect"
          ? "succeeded"
          : (job?.status ?? "not_started"),
      runUrl: job?.runUrl ?? null,
      startedAt: job?.startedAt ?? null,
      finishedAt: job?.finishedAt ?? null
    };
  });
}

function maskRun(run: PipelineRunWithStages): PipelineRunWithStages {
  return {
    ...run,
    commitMessage: maskDeploymentMessage(run.commitMessage),
    statusMessage: run.statusMessage ? maskDeploymentMessage(run.statusMessage) : null
  };
}
function maskRuns(runs: PipelineRunWithStages[]): PipelineRunWithStages[] {
  return runs.map(maskRun);
}
function maskLog(log: PersistedPipelineLog): PersistedPipelineLog {
  return { ...log, message: maskDeploymentMessage(log.message) };
}

export function classifyPipelineChangeScope(
  changedFiles: readonly string[],
  config: { appPath: GitCicdMonitoredPath; infraPath: GitCicdMonitoredPath }
): GitCicdPipelineChangeScope | null {
  const appChanged = changedFiles.some((file) => isInsideMonitoredPath(file, config.appPath));
  const infraChanged = changedFiles.some((file) => isInsideMonitoredPath(file, config.infraPath));

  if (appChanged && infraChanged) return "app_and_infra";
  if (appChanged) return "app";
  if (infraChanged) return "infra";
  return null;
}

function isInsideMonitoredPath(
  file: string,
  monitoredPath?: GitCicdMonitoredPath
): boolean {
  if (monitoredPath?.mode === "repository_root") return true;
  const monitoredPathValue = monitoredPath?.path;
  if (
    monitoredPath?.mode !== "subdirectory" ||
    typeof monitoredPathValue !== "string" ||
    monitoredPathValue.trim().length === 0
  ) {
    return false;
  }
  const normalizedFile = file.replaceAll("\\", "/").replace(/^\.\//, "");
  const normalizedPath = monitoredPathValue
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
  return normalizedFile === normalizedPath || normalizedFile.startsWith(`${normalizedPath}/`);
}
