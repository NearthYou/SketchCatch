import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitCicdPipelineExecutionKind,
  GitCicdPipelineStageKind
} from "@sketchcatch/types";
import type {
  GitCicdRunProvider,
  GitCicdRunProviderSnapshot
} from "./github-actions-run-provider.js";
import {
  createGitCicdPipelineRunService,
  createGitCicdPipelineStatusMessage,
  createWorkflowRunKey,
  type GitCicdPipelinePersistenceRepository,
  type PersistedPipelineRun,
  type PipelineRefreshTarget,
  type PipelineRunWithStages
} from "./git-cicd-pipeline-run-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const sourceRepositoryId = "22222222-2222-4222-8222-222222222222";
const commitSha = "a".repeat(40);
const now = new Date("2026-07-16T00:00:00.000Z");
const target: PipelineRefreshTarget = {
  projectId,
  sourceRepositoryId,
  installationId: "installation-1",
  owner: "jh-9999",
  name: "audience-live-check",
  monitorBranch: "main",
  appPath: { mode: "repository_root", path: "." },
  infraPath: { mode: "subdirectory", path: "infra" },
  handoffId: null,
  appUrl: null,
  apiUrl: null
};

test("persists app and infra workflow runs for the same commit independently", async () => {
  const repository = createMemoryRepository();
  const provider = createProvider([
    snapshot({ executionKind: "app", workflowRunId: "101" }),
    snapshot({ executionKind: "infra", workflowRunId: "102" })
  ]);
  const service = createGitCicdPipelineRunService({
    repository,
    provider,
    now: () => now,
    createId: sequentialIds()
  });

  const result = await service.refreshProjectPipelineRuns({ projectId, sourceRepositoryId });

  assert.equal(result.stale, false);
  assert.equal(result.runs.length, 2);
  assert.deepEqual(
    new Set(result.runs.map((run) => run.executionKind)),
    new Set<GitCicdPipelineExecutionKind>(["app", "infra"])
  );
  const appRun = result.runs.find((run) => run.executionKind === "app");
  const infraRun = result.runs.find((run) => run.executionKind === "infra");
  assert.equal(appRun?.stages.find((item) => item.kind === "infra_plan")?.status, "skipped");
  assert.equal(infraRun?.stages.find((item) => item.kind === "app_build")?.status, "skipped");
  assert.equal(repository.runs.size, 2);
});

test("keeps rerun attempts as separate pipeline records", async () => {
  const repository = createMemoryRepository();
  const first = createGitCicdPipelineRunService({
    repository,
    provider: createProvider([
      snapshot({ executionKind: "infra", workflowRunId: "102", workflowRunAttempt: 1 })
    ]),
    now: () => now,
    createId: sequentialIds()
  });
  await first.refreshProjectPipelineRuns({ projectId, sourceRepositoryId });
  const rerun = createGitCicdPipelineRunService({
    repository,
    provider: createProvider([
      snapshot({ executionKind: "infra", workflowRunId: "102", workflowRunAttempt: 2 })
    ]),
    now: () => now,
    createId: sequentialIds()
  });

  await rerun.refreshProjectPipelineRuns({ projectId, sourceRepositoryId });

  assert.equal(repository.runs.size, 2);
  assert.equal(repository.runs.has(createWorkflowRunKey("102", 1)), true);
  assert.equal(repository.runs.has(createWorkflowRunKey("102", 2)), true);
});

test("does not create a second row when one workflow identity is classified as another kind", async () => {
  const repository = createMemoryRepository();
  const service = createGitCicdPipelineRunService({
    repository,
    provider: createProvider([
      snapshot({ executionKind: "app", workflowRunId: "101" }),
      snapshot({ executionKind: "infra", workflowRunId: "101" })
    ]),
    now: () => now,
    createId: sequentialIds()
  });

  const result = await service.refreshProjectPipelineRuns({ projectId, sourceRepositoryId });

  assert.equal(result.stale, true);
  assert.equal(repository.runs.size, 1);
  assert.equal([...repository.runs.values()][0]?.executionKind, "app");
});

test("monitoring refresh reuses an App release row with the same workflow identity", async () => {
  const existing = persistedRun({
    id: "release-run-1",
    executionKind: "app",
    githubWorkflowRunId: "101",
    githubWorkflowRunAttempt: 1
  });
  const repository = createMemoryRepository([existing]);
  const service = createGitCicdPipelineRunService({
    repository,
    provider: createProvider([snapshot({ executionKind: "app", workflowRunId: "101" })]),
    now: () => now,
    createId: sequentialIds()
  });

  const result = await service.refreshProjectPipelineRuns({ projectId, sourceRepositoryId });

  assert.equal(result.runs[0]?.id, existing.id);
  assert.equal(repository.runs.size, 1);
});

test("preserves the shared-lease collision message during monitoring refresh", async () => {
  const collisionMessage =
    "현재 이 프로젝트에서 다른 배포가 진행 중입니다. 완료 후 다시 실행해 주세요.";
  const existing = {
    ...persistedRun({
      id: "blocked-infra-run",
      executionKind: "infra",
      githubWorkflowRunId: "102",
      githubWorkflowRunAttempt: 1
    }),
    status: "failed" as const,
    statusMessage: collisionMessage
  };
  const repository = createMemoryRepository([existing]);
  const service = createGitCicdPipelineRunService({
    repository,
    provider: createProvider([snapshot({ executionKind: "infra", workflowRunId: "102" })]),
    now: () => now,
    createId: sequentialIds()
  });

  const result = await service.refreshProjectPipelineRuns({ projectId, sourceRepositoryId });

  assert.equal(result.runs[0]?.statusMessage, collisionMessage);
});

test("single-run refresh does not refresh a different workflow on the same commit", async () => {
  const appRun = persistedRun({
    id: "app-run-1",
    executionKind: "app",
    githubWorkflowRunId: "101",
    githubWorkflowRunAttempt: 1
  });
  const repository = createMemoryRepository([appRun]);
  const provider = createProvider([
    snapshot({ executionKind: "app", workflowRunId: "101" }),
    snapshot({ executionKind: "infra", workflowRunId: "102" })
  ]);
  const service = createGitCicdPipelineRunService({
    repository,
    provider,
    now: () => now,
    createId: sequentialIds()
  });

  const result = await service.refreshPipelineRun({ pipelineRunId: appRun.id });

  assert.equal(result.run.id, appRun.id);
  assert.equal(repository.runs.size, 1);
  assert.equal(repository.runs.has(createWorkflowRunKey("102", 1)), false);
});

test("creates fixed terminal messages from execution kind and failed stage", () => {
  assert.equal(
    createGitCicdPipelineStatusMessage({
      executionKind: "infra",
      status: "failed",
      stages: [stage("infra_plan", "failed"), stage("infra_apply", "skipped")]
    }),
    "인프라 Plan 생성에 실패했습니다. Terraform Apply는 실행되지 않았습니다."
  );
  assert.equal(
    createGitCicdPipelineStatusMessage({
      executionKind: "app",
      status: "failed",
      stages: [stage("verify", "failed")]
    }),
    "새 버전 Health Check에 실패해 애플리케이션을 이전 정상 버전으로 복구했습니다."
  );
  assert.equal(
    createGitCicdPipelineStatusMessage({
      executionKind: "app",
      status: "succeeded",
      stages: []
    }),
    "애플리케이션 배포가 완료되었습니다."
  );
});

function createProvider(snapshots: GitCicdRunProviderSnapshot[]): GitCicdRunProvider {
  return {
    async listSnapshots() {
      return snapshots;
    },
    async listCommitFiles() {
      throw new Error("workflow execution kind must not require commit classification");
    }
  };
}

function createMemoryRepository(
  initialRuns: PipelineRunWithStages[] = []
): GitCicdPipelinePersistenceRepository & { runs: Map<string, PipelineRunWithStages> } {
  const runs = new Map(
    initialRuns.map((run) => [
      createWorkflowRunKey(
        run.githubWorkflowRunId!,
        run.githubWorkflowRunAttempt!
      ),
      run
    ])
  );
  return {
    runs,
    async listRefreshTargets() {
      return [target];
    },
    async findRefreshTarget() {
      return target;
    },
    async findPipelineRun(pipelineRunId) {
      return [...runs.values()].find((run) => run.id === pipelineRunId);
    },
    async findRunRefreshTarget(pipelineRunId) {
      const run = [...runs.values()].find((candidate) => candidate.id === pipelineRunId);
      return run
        ? {
            ...target,
            commitSha: run.commitSha,
            workflowRunId: run.githubWorkflowRunId!,
            workflowRunAttempt: run.githubWorkflowRunAttempt!,
            executionKind: run.executionKind
          }
        : undefined;
    },
    async listProjectPipelineRuns() {
      return [...runs.values()];
    },
    async listProjectPipelineRunPage() {
      return [...runs.values()];
    },
    async listPipelineLogs() {
      return [];
    },
    async findPipelineRunsByWorkflowRuns(_repositoryId, keys) {
      return new Map(
        keys.flatMap((key) => {
          const mapKey = createWorkflowRunKey(key.workflowRunId, key.workflowRunAttempt);
          const run = runs.get(mapKey);
          return run ? [[mapKey, run] as const] : [];
        })
      );
    },
    async persistSnapshot(input) {
      const key = createWorkflowRunKey(
        input.run.githubWorkflowRunId!,
        input.run.githubWorkflowRunAttempt!
      );
      const previous = runs.get(key);
      if (previous && previous.executionKind !== input.run.executionKind) {
        throw new Error("GitHub Workflow execution kind changed for the same run attempt");
      }
      const persisted: PipelineRunWithStages = {
        ...input.run,
        id: previous?.id ?? input.run.id,
        createdAt: previous?.createdAt ?? input.run.createdAt,
        stages: input.stages.map((item) => ({
          ...item,
          pipelineRunId: previous?.id ?? input.run.id
        }))
      };
      runs.set(key, persisted);
      return persisted;
    }
  };
}

function snapshot(input: {
  executionKind: GitCicdPipelineExecutionKind;
  workflowRunId: string;
  workflowRunAttempt?: number;
}): GitCicdRunProviderSnapshot {
  return {
    executionKind: input.executionKind,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt ?? 1,
    commitSha,
    commitMessage: "Demo release",
    branch: "main",
    workflowName: input.executionKind === "app" ? "SketchCatch App" : "SketchCatch Infra",
    runUrl: `https://github.com/jh-9999/audience-live-check/actions/runs/${input.workflowRunId}`,
    startedAt: now,
    finishedAt: now,
    status: "succeeded",
    upstreamOrderingToken: `${input.workflowRunId}:${input.workflowRunAttempt ?? 1}`,
    logRevision: `${input.workflowRunId}:${input.workflowRunAttempt ?? 1}`,
    jobs: [],
    logs: [],
    releaseEvidence: null
  };
}

function persistedRun(input: {
  id: string;
  executionKind: GitCicdPipelineExecutionKind;
  githubWorkflowRunId: string;
  githubWorkflowRunAttempt: number;
}): PipelineRunWithStages {
  const base: PersistedPipelineRun = {
    id: input.id,
    projectId,
    infrastructureDeploymentId: null,
    sourceRepositoryId,
    handoffId: null,
    executionKind: input.executionKind,
    githubWorkflowRunId: input.githubWorkflowRunId,
    githubWorkflowRunAttempt: input.githubWorkflowRunAttempt,
    commitSha,
    commitMessage: "release request",
    branch: "main",
    changeScope: input.executionKind,
    status: "queued",
    statusMessage: "SketchCatch에서 코드 사전 검증을 준비하고 있습니다.",
    pipelineRunUrl: null,
    appUrl: null,
    apiUrl: null,
    startedAt: null,
    finishedAt: null,
    upstreamOrderingToken: `${input.githubWorkflowRunId}:${input.githubWorkflowRunAttempt}`,
    logRevision: "",
    lastRefreshedAt: now,
    createdAt: now
  };
  return { ...base, stages: [] };
}

function stage(
  kind: GitCicdPipelineStageKind,
  status: "failed" | "skipped"
) {
  return {
    id: `${kind}-id`,
    pipelineRunId: "run-id",
    kind,
    status,
    runUrl: null,
    startedAt: null,
    finishedAt: null
  };
}

function sequentialIds(): () => string {
  let sequence = 0;
  return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
}
