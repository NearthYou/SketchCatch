import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPipelineChangeScope,
  createGitCicdPipelineRunService,
  type GitCicdPipelinePersistenceRepository,
  type PersistedPipelineLog,
  type PersistedPipelineRun,
  type PersistedPipelineStage
} from "./git-cicd-pipeline-run-service.js";
import type { GitCicdRunProvider } from "./github-actions-run-provider.js";

const config = {
  appPath: { mode: "subdirectory" as const, path: "apps/web" },
  infraPath: { mode: "subdirectory" as const, path: "infra/terraform" }
};

test("classifyPipelineChangeScope classifies monitored app and infra paths", () => {
  assert.equal(classifyPipelineChangeScope(["apps/web/page.tsx"], config), "app");
  assert.equal(classifyPipelineChangeScope(["infra/terraform/main.tf"], config), "infra");
  assert.equal(
    classifyPipelineChangeScope(["apps/web/page.tsx", "infra/terraform/main.tf"], config),
    "app_and_infra"
  );
  assert.equal(classifyPipelineChangeScope(["README.md"], config), null);
});

test("classifyPipelineChangeScope uses path-segment-safe matching", () => {
  assert.equal(classifyPipelineChangeScope(["apps/web-old/page.tsx"], config), null);
  assert.equal(classifyPipelineChangeScope(["infra/terraform-old/main.tf"], config), null);
});

test("refresh is idempotent and persists six deterministic stages and log sequences", async () => {
  const repository = createMemoryRepository();
  const provider = createProvider();
  const service = createGitCicdPipelineRunService({
    repository,
    provider,
    now: () => new Date("2026-07-13T01:00:00Z"),
    createId: sequentialIds()
  });

  await service.refreshProjectPipelineRuns({
    projectId: "project-1",
    sourceRepositoryId: "repo-1"
  });
  await service.refreshProjectPipelineRuns({
    projectId: "project-1",
    sourceRepositoryId: "repo-1"
  });

  assert.equal(repository.runs.length, 1);
  assert.deepEqual(
    repository.stages.map((stage) => stage.kind),
    ["detect", "app_build", "infra_plan", "infra_apply", "app_deploy", "verify"]
  );
  assert.equal(new Set(repository.stages.map((stage) => stage.kind)).size, 6);
  assert.deepEqual(
    repository.stages.map((stage) => stage.status),
    ["succeeded", "running", "skipped", "skipped", "not_started", "not_started"]
  );
  assert.deepEqual(
    repository.logs.map((log) => log.sequence),
    [1, 2]
  );
  assert.deepEqual(
    repository.logs.map((log) => log.message),
    ["building", "[REDACTED]"]
  );
});

test("provider failure preserves persisted status and refresh time while returning stale", async () => {
  const repository = createMemoryRepository();
  let fail = false;
  const provider = createProvider(() => fail);
  const service = createGitCicdPipelineRunService({
    repository,
    provider,
    now: () => new Date("2026-07-13T01:00:00Z"),
    createId: sequentialIds()
  });

  const first = await service.refreshProjectPipelineRuns({
    projectId: "project-1",
    sourceRepositoryId: "repo-1"
  });
  fail = true;
  const stale = await service.refreshProjectPipelineRuns({
    projectId: "project-1",
    sourceRepositoryId: "repo-1"
  });

  assert.equal(first.stale, false);
  assert.equal(stale.stale, true);
  assert.equal(stale.runs[0]?.status, "running");
  assert.equal(stale.runs[0]?.lastRefreshedAt.toISOString(), "2026-07-13T01:00:00.000Z");
});

function createProvider(shouldFail: () => boolean = () => false): GitCicdRunProvider {
  return {
    async listCommitFiles() {
      return ["apps/web/page.tsx"];
    },
    async listSnapshots() {
      if (shouldFail()) throw new Error("GitHub unavailable");
      return [
        {
          commitSha: "abc",
          commitMessage: "Ship",
          branch: "main",
          workflowName: "SketchCatch App",
          runUrl: "https://run/app",
          startedAt: new Date("2026-07-13T00:00:00Z"),
          finishedAt: null,
          status: "running",
          jobs: [
            {
              stageKind: "app_build",
              status: "running",
              runUrl: "https://job/build",
              startedAt: null,
              finishedAt: null
            }
          ],
          logs: [
            { stageKind: "app_build", level: "info", message: "building" },
            { stageKind: null, level: "info", message: "token=super-secret" }
          ]
        }
      ];
    }
  };
}

function sequentialIds(): () => string {
  let value = 0;
  return () => `id-${++value}`;
}

function createMemoryRepository() {
  const state = {
    runs: [] as PersistedPipelineRun[],
    stages: [] as PersistedPipelineStage[],
    logs: [] as PersistedPipelineLog[],
    target: {
      projectId: "project-1",
      sourceRepositoryId: "repo-1",
      installationId: "42",
      owner: "owner",
      name: "repo",
      monitorBranch: "main",
      appPath: config.appPath,
      infraPath: config.infraPath
    }
  };
  const repository: GitCicdPipelinePersistenceRepository = {
    findRefreshTarget: async () => state.target,
    findRunRefreshTarget: async () =>
      state.runs.length ? { ...state.target, commitSha: state.runs[0]!.commitSha } : undefined,
    listProjectPipelineRuns: async () =>
      state.runs.map((run) => ({
        ...run,
        stages: state.stages.filter((stage) => stage.pipelineRunId === run.id)
      })),
    listPipelineLogs: async (_runId, since) => state.logs.filter((log) => log.sequence > since),
    async persistSnapshot(input) {
      let run = state.runs.find(
        (item) =>
          item.sourceRepositoryId === input.run.sourceRepositoryId &&
          item.commitSha === input.run.commitSha
      );
      if (run) Object.assign(run, { ...input.run, id: run.id, createdAt: run.createdAt });
      else {
        run = { ...input.run };
        state.runs.push(run);
      }
      for (const stage of input.stages) {
        const persistedStage = { ...stage, pipelineRunId: run.id };
        const current = state.stages.find(
          (item) => item.pipelineRunId === run.id && item.kind === stage.kind
        );
        if (current) Object.assign(current, { ...persistedStage, id: current.id });
        else state.stages.push(persistedStage);
      }
      state.logs.splice(
        0,
        state.logs.length,
        ...state.logs.filter((log) => log.pipelineRunId !== run.id)
      );
      state.logs.push(
        ...input.logs.map((log) => ({
          ...log,
          pipelineRunId: run.id,
          stageId: log.stageId
            ? (state.stages.find(
                (stage) =>
                  stage.pipelineRunId === run.id &&
                  input.stages.find((candidate) => candidate.id === log.stageId)?.kind ===
                    stage.kind
              )?.id ?? null)
            : null
        }))
      );
      return { ...run, stages: state.stages.filter((stage) => stage.pipelineRunId === run.id) };
    }
  };
  return Object.assign(repository, state);
}
