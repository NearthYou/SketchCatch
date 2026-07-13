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

test("refresh reuses persisted change scope without refetching immutable commit files", async () => {
  const repository = createMemoryRepository();
  const base = createProvider();
  let commitFileCalls = 0;
  const provider: GitCicdRunProvider = {
    listSnapshots: base.listSnapshots,
    async listCommitFiles(input) {
      commitFileCalls += 1;
      if (commitFileCalls > 1) throw new Error("immutable commit lookup must not repeat");
      return base.listCommitFiles(input);
    }
  };
  const service = createGitCicdPipelineRunService({
    repository,
    provider,
    createId: sequentialIds()
  });

  await service.refreshProjectPipelineRuns({
    projectId: "project-1",
    sourceRepositoryId: "repo-1"
  });
  const refreshed = await service.refreshProjectPipelineRuns({
    projectId: "project-1",
    sourceRepositoryId: "repo-1"
  });

  assert.equal(commitFileCalls, 1);
  assert.equal(repository.existingLookupCalls.value, 2);
  assert.equal(refreshed.stale, false);
  assert.equal(refreshed.runs[0]?.changeScope, "app");
});

test("listProjectPipelineRuns delegates stable cursor pagination and requests limit plus one", async () => {
  const repository = createMemoryRepository();
  repository.runs.push(
    createPersistedRun("run-a", "2026-07-13T03:00:00Z"),
    createPersistedRun("run-b", "2026-07-13T02:00:00Z"),
    createPersistedRun("run-c", "2026-07-13T01:00:00Z")
  );
  const service = createGitCicdPipelineRunService({ repository, provider: createProvider() });

  const page = await service.listProjectPipelineRuns({ projectId: "project-1", limit: 2 });

  assert.deepEqual(page.runs.map((run) => run.id), ["run-a", "run-b"]);
  assert.equal(page.nextCursor, "run-b");
  repository.runs.push(createPersistedRun("run-new", "2026-07-13T04:00:00Z"));
  const nextPage = await service.listProjectPipelineRuns({
    projectId: "project-1",
    cursor: page.nextCursor!,
    limit: 2
  });
  assert.deepEqual(nextPage.runs.map((run) => run.id), ["run-c"]);
  assert.deepEqual(repository.listRequests, [
    { projectId: "project-1", limit: 3 },
    { projectId: "project-1", cursor: "run-b", limit: 3 }
  ]);
});

test("listProjectPipelineRuns rejects an unknown project-scoped cursor", async () => {
  const repository = createMemoryRepository();
  const service = createGitCicdPipelineRunService({ repository, provider: createProvider() });

  await assert.rejects(
    service.listProjectPipelineRuns({
      projectId: "project-1",
      cursor: "foreign-or-missing-run",
      limit: 20
    }),
    /invalid pipeline run cursor/i
  );
});

test("refreshPipelineRun throws a typed unavailable error when monitoring became disabled", async () => {
  const repository = createMemoryRepository();
  repository.runs.push(createPersistedRun("run-a", "2026-07-13T01:00:00Z"));
  repository.refreshTargetEnabled.value = false;
  const service = createGitCicdPipelineRunService({ repository, provider: createProvider() });

  await assert.rejects(
    service.refreshPipelineRun({ pipelineRunId: "run-a" }),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "GitCicdPipelineRunRefreshUnavailableError" &&
      error.message === "Pipeline Run not found"
  );
});

function createPersistedRun(id: string, createdAt: string): PersistedPipelineRun {
  const timestamp = new Date(createdAt);
  return {
    id,
    projectId: "project-1",
    sourceRepositoryId: "repo-1",
    handoffId: null,
    commitSha: id,
    commitMessage: id,
    branch: "main",
    changeScope: "app",
    status: "running",
    statusMessage: null,
    pipelineRunUrl: null,
    appUrl: null,
    apiUrl: null,
    startedAt: timestamp,
    finishedAt: null,
    lastRefreshedAt: timestamp,
    createdAt: timestamp
  };
}

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
    existingLookupCalls: { value: 0 },
    listRequests: [] as unknown[],
    refreshTargetEnabled: { value: true },
    target: {
      projectId: "project-1",
      sourceRepositoryId: "repo-1",
      installationId: "42",
      owner: "owner",
      name: "repo",
      monitorBranch: "main",
      appPath: config.appPath,
      infraPath: config.infraPath
    } as
      | {
          projectId: string;
          sourceRepositoryId: string;
          installationId: string;
          owner: string;
          name: string;
          monitorBranch: string;
          appPath: typeof config.appPath;
          infraPath: typeof config.infraPath;
        }
      | undefined
  };
  const repository: GitCicdPipelinePersistenceRepository = {
    findRefreshTarget: async () =>
      state.refreshTargetEnabled.value ? state.target : undefined,
    findPipelineRun: async (pipelineRunId) => {
      const run = state.runs.find((candidate) => candidate.id === pipelineRunId);
      return run
        ? {
            ...run,
            stages: state.stages.filter((stage) => stage.pipelineRunId === run.id)
          }
        : undefined;
    },
    findRunRefreshTarget: async () =>
      state.refreshTargetEnabled.value && state.target && state.runs.length
        ? { ...state.target, commitSha: state.runs[0]!.commitSha }
        : undefined,
    listProjectPipelineRuns: async (...args: unknown[]) => {
      state.listRequests.push(args[0]);
      return state.runs.map((run) => ({
        ...run,
        stages: state.stages.filter((stage) => stage.pipelineRunId === run.id)
      }));
    },
    listProjectPipelineRunPage: async (input) => {
      state.listRequests.push(input);
      const scoped = state.runs
        .filter((run) => run.projectId === input.projectId)
        .sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() ||
            right.id.localeCompare(left.id)
        );
      const cursorIndex = input.cursor
        ? scoped.findIndex((run) => run.id === input.cursor)
        : -1;
      if (input.cursor && cursorIndex < 0) throw new Error("Invalid Pipeline Run cursor");
      return scoped.slice(cursorIndex + 1, cursorIndex + 1 + input.limit).map((run) => ({
        ...run,
        stages: state.stages.filter((stage) => stage.pipelineRunId === run.id)
      }));
    },
    listPipelineLogs: async (_runId, since) => state.logs.filter((log) => log.sequence > since),
    findPipelineRunsByCommitShas: async (_sourceRepositoryId, commitShas) => {
      state.existingLookupCalls.value += 1;
      return new Map(
        state.runs
          .filter((run) => commitShas.includes(run.commitSha))
          .map((run) => [run.commitSha, run])
      );
    },
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
