import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import type {
  GitCicdMonitoredPath,
  GitCicdPipelineChangeScope,
  GitCicdPipelineRunStatus,
  GitCicdPipelineStageKind,
  GitCicdPipelineStageStatus
} from "@sketchcatch/types";
import { maskDeploymentMessage } from "../deployments/log-masking.js";
import type { Database } from "../db/client.js";
import {
  gitCicdMonitoringConfigs,
  gitCicdPipelineLogs,
  gitCicdPipelineRuns,
  gitCicdPipelineStages,
  sourceRepositories
} from "../db/schema.js";
import type {
  GitCicdRunProvider,
  GitCicdRunProviderSnapshot
} from "./github-actions-run-provider.js";

const stageKinds: readonly GitCicdPipelineStageKind[] = [
  "detect",
  "app_build",
  "infra_plan",
  "infra_apply",
  "app_deploy",
  "verify"
];

export type PipelineRefreshTarget = {
  projectId: string;
  sourceRepositoryId: string;
  installationId: string;
  owner: string;
  name: string;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  commitSha?: string;
};

export type PersistedPipelineRun = {
  id: string;
  projectId: string;
  sourceRepositoryId: string;
  handoffId: string | null;
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
export type PipelineRunWithStages = PersistedPipelineRun & { stages: PersistedPipelineStage[] };

export type GitCicdPipelinePersistenceRepository = {
  findRefreshTarget(
    projectId: string,
    sourceRepositoryId: string
  ): Promise<PipelineRefreshTarget | undefined>;
  findRunRefreshTarget(pipelineRunId: string): Promise<PipelineRefreshTarget | undefined>;
  listProjectPipelineRuns(projectId: string): Promise<PipelineRunWithStages[]>;
  listPipelineLogs(pipelineRunId: string, sinceSequence: number): Promise<PersistedPipelineLog[]>;
  findPipelineRunsByCommitShas(
    sourceRepositoryId: string,
    commitShas: readonly string[]
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

export function createGitCicdPipelineRunService(options: {
  repository: GitCicdPipelinePersistenceRepository;
  provider: GitCicdRunProvider;
  now?: () => Date;
  createId?: () => string;
}) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;

  async function refreshTarget(
    target: PipelineRefreshTarget,
    onlyCommitSha?: string
  ): Promise<PipelineRefreshResult> {
    try {
      const snapshots = await options.provider.listSnapshots({
        installationId: target.installationId,
        owner: target.owner,
        name: target.name,
        branch: target.monitorBranch
      });
      const relevantSnapshots = onlyCommitSha
        ? snapshots.filter((snapshot) => snapshot.commitSha === onlyCommitSha)
        : snapshots;
      const existingRuns = await options.repository.findPipelineRunsByCommitShas(
        target.sourceRepositoryId,
        [...new Set(relevantSnapshots.map((snapshot) => snapshot.commitSha))]
      );
      const refreshed: PipelineRunWithStages[] = [];
      for (const snapshot of relevantSnapshots) {
        const existingRun = existingRuns.get(snapshot.commitSha);
        const changeScope =
          existingRun?.changeScope ??
          classifyPipelineChangeScope(
            await options.provider.listCommitFiles({
              installationId: target.installationId,
              owner: target.owner,
              name: target.name,
              branch: target.monitorBranch,
              commitSha: snapshot.commitSha
            }),
            target
          );
        if (!changeScope) continue;
        refreshed.push(await persistSnapshot(target, snapshot, changeScope));
      }
      return { runs: refreshed, stale: false, errorMessage: null };
    } catch {
      const persisted = await options.repository.listProjectPipelineRuns(target.projectId);
      const runs = onlyCommitSha
        ? persisted.filter((run) => run.commitSha === onlyCommitSha)
        : persisted;
      return {
        runs: maskRuns(runs),
        stale: true,
        errorMessage: "GitHub Actions status refresh failed; showing the last persisted state."
      };
    }
  }

  async function persistSnapshot(
    target: PipelineRefreshTarget,
    snapshot: GitCicdRunProviderSnapshot,
    changeScope: GitCicdPipelineChangeScope
  ): Promise<PipelineRunWithStages> {
    const refreshedAt = now();
    const runId = createId();
    const run: PersistedPipelineRun = {
      id: runId,
      projectId: target.projectId,
      sourceRepositoryId: target.sourceRepositoryId,
      handoffId: null,
      commitSha: snapshot.commitSha,
      commitMessage: maskDeploymentMessage(snapshot.commitMessage),
      branch: snapshot.branch,
      changeScope,
      status: snapshot.status,
      statusMessage: `${snapshot.workflowName}: ${snapshot.status}`,
      pipelineRunUrl: snapshot.runUrl,
      appUrl: null,
      apiUrl: null,
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt,
      lastRefreshedAt: refreshedAt,
      createdAt: refreshedAt
    };
    const stages = buildStages(runId, snapshot, changeScope, createId);
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
    return maskRun(await options.repository.persistSnapshot({ run, stages, logs }));
  }

  return {
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
    async refreshPipelineRun(input: { pipelineRunId: string }): Promise<PipelineRefreshResult> {
      const target = await options.repository.findRunRefreshTarget(input.pipelineRunId);
      if (!target?.commitSha) throw new Error("Pipeline Run not found");
      return refreshTarget(target, target.commitSha);
    },
    async listProjectPipelineRuns(input: { projectId: string }) {
      return maskRuns(await options.repository.listProjectPipelineRuns(input.projectId));
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
    const [target] = await db
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
    if (!target?.installationId) return undefined;
    return { ...target, installationId: target.installationId };
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
    return runs.map((run) => ({
      ...run,
      stages: stages
        .filter((stage) => stage.pipelineRunId === run.id)
        .sort((left, right) => stageKinds.indexOf(left.kind) - stageKinds.indexOf(right.kind))
    }));
  }

  return {
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
    async findRunRefreshTarget(pipelineRunId) {
      const [run] = await db
        .select({
          projectId: gitCicdPipelineRuns.projectId,
          sourceRepositoryId: gitCicdPipelineRuns.sourceRepositoryId,
          commitSha: gitCicdPipelineRuns.commitSha
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
      return target ? { ...target, commitSha: run.commitSha } : undefined;
    },
    listProjectPipelineRuns: listRuns,
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
    async findPipelineRunsByCommitShas(sourceRepositoryId, commitShas) {
      if (!commitShas.length) return new Map();
      const runs = await db
        .select()
        .from(gitCicdPipelineRuns)
        .where(
          and(
            eq(gitCicdPipelineRuns.sourceRepositoryId, sourceRepositoryId),
            inArray(gitCicdPipelineRuns.commitSha, [...commitShas])
          )
        );
      return new Map(runs.map((run) => [run.commitSha, run]));
    },
    persistSnapshot(input) {
      return db.transaction(async (tx) => {
        const [run] = await tx
          .insert(gitCicdPipelineRuns)
          .values(input.run)
          .onConflictDoUpdate({
            target: [gitCicdPipelineRuns.sourceRepositoryId, gitCicdPipelineRuns.commitSha],
            set: {
              commitMessage: input.run.commitMessage,
              branch: input.run.branch,
              changeScope: input.run.changeScope,
              status: input.run.status,
              statusMessage: input.run.statusMessage,
              pipelineRunUrl: input.run.pipelineRunUrl,
              startedAt: input.run.startedAt,
              finishedAt: input.run.finishedAt,
              lastRefreshedAt: input.run.lastRefreshedAt
            }
          })
          .returning();
        if (!run) throw new Error("Failed to persist Pipeline Run");

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

function buildStages(
  runId: string,
  snapshot: GitCicdRunProviderSnapshot,
  scope: GitCicdPipelineChangeScope,
  createId: () => string
): PersistedPipelineStage[] {
  return stageKinds.map((kind) => {
    const applicable =
      kind === "detect" ||
      kind === "verify" ||
      (scope !== "infra" && (kind === "app_build" || kind === "app_deploy")) ||
      (scope !== "app" && (kind === "infra_plan" || kind === "infra_apply"));
    const job = snapshot.jobs.find((candidate) => candidate.stageKind === kind);
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

function isInsideMonitoredPath(file: string, monitoredPath: GitCicdMonitoredPath): boolean {
  if (monitoredPath.mode === "repository_root") return true;
  const normalizedFile = file.replaceAll("\\", "/").replace(/^\.\//, "");
  const normalizedPath = monitoredPath.path
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
  return normalizedFile === normalizedPath || normalizedFile.startsWith(`${normalizedPath}/`);
}
