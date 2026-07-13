import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { Database } from "../db/client.js";
import {
  createPostgresGitCicdPipelinePersistenceRepository,
  type PersistedPipelineRun
} from "./git-cicd-pipeline-run-service.js";

test("refresh target selects the latest accepted handoff for the monitored repository branch", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = drizzle(async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('from "source_repositories"')) {
      return {
        rows: [[
          "project-1",
          "repo-1",
          "installation-1",
          "owner",
          "repository",
          "main",
          { mode: "subdirectory", path: "apps/web" },
          { mode: "subdirectory", path: "infra" }
        ]]
      };
    }
    if (sql.includes('from "git_cicd_handoffs"')) {
      return {
        rows: [["handoff-2", "https://app.example.com", "https://api.example.com"]]
      };
    }
    return { rows: [] };
  });
  const repository = createPostgresGitCicdPipelinePersistenceRepository(
    db as unknown as Database
  );

  const target = await repository.findRefreshTarget("project-1", "repo-1");

  assert.equal(target?.handoffId, "handoff-2");
  assert.equal(target?.appUrl, "https://app.example.com");
  assert.equal(target?.apiUrl, "https://api.example.com");
  const handoffQuery = queries.find(({ sql }) => sql.includes('from "git_cicd_handoffs"'));
  assert.ok(handoffQuery);
  assert.match(handoffQuery.sql, /"source_repository_id" = \$\d+/);
  assert.match(handoffQuery.sql, /"target_branch" = \$\d+/);
  assert.match(handoffQuery.sql, /"status" not in \(\$\d+, \$\d+\)/);
  assert.match(handoffQuery.sql, /order by "git_cicd_handoffs"\."created_at" desc, "git_cicd_handoffs"\."id" desc/);
  assert.match(handoffQuery.sql, /limit \$\d+/);
  assert.ok(handoffQuery.params.includes("repo-1"));
  assert.ok(handoffQuery.params.includes("main"));
  assert.ok(handoffQuery.params.includes("draft"));
  assert.ok(handoffQuery.params.includes("cancelled"));
});

test("refresh target remains usable when no accepted handoff applies", async () => {
  const db = drizzle(async (sql) => {
    return sql.includes('from "source_repositories"')
      ? {
          rows: [[
            "project-1",
            "repo-1",
            "installation-1",
            "owner",
            "repository",
            "main",
            { mode: "subdirectory", path: "apps/web" },
            { mode: "subdirectory", path: "infra" }
          ]]
        }
      : { rows: [] };
  });
  const repository = createPostgresGitCicdPipelinePersistenceRepository(
    db as unknown as Database
  );

  const target = await repository.findRefreshTarget("project-1", "repo-1");

  assert.equal(target?.handoffId, null);
  assert.equal(target?.appUrl, null);
  assert.equal(target?.apiUrl, null);
});

test("snapshot upsert replaces or preserves the provenance tuple atomically", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const acceptedA = createRun({
    handoffId: "handoff-a",
    appUrl: "https://a-app.example.com",
    apiUrl: "https://a-api.example.com"
  });
  const preservedA = { ...acceptedA };
  const partialB = createRun({
    handoffId: "handoff-b",
    appUrl: null,
    apiUrl: "https://b-api.example.com/v2"
  });
  const emptyB = createRun({ handoffId: "handoff-b", appUrl: null, apiUrl: null });
  const returnedRuns = [acceptedA, preservedA, partialB, emptyB];
  const proxy = drizzle(async (sql, params) => {
    queries.push({ sql, params });
    if (!sql.startsWith('insert into "git_cicd_pipeline_runs"')) return { rows: [] };
    const returnedRun = returnedRuns.shift();
    assert.ok(returnedRun);
    return { rows: [toRunRow(returnedRun)] };
  });
  const db = {
    transaction: async <T>(callback: (tx: typeof proxy) => Promise<T>) => callback(proxy)
  } as unknown as Database;
  const repository = createPostgresGitCicdPipelinePersistenceRepository(db);

  const storedA = await repository.persistSnapshot({
    run: acceptedA,
    stages: [],
    logs: []
  });

  assert.deepEqual(readProvenanceTuple(storedA), [
    "handoff-a",
    "https://a-app.example.com",
    "https://a-api.example.com"
  ]);
  const upsert = queries.find(({ sql }) => sql.startsWith('insert into "git_cicd_pipeline_runs"'));
  assert.ok(upsert);
  assert.match(
    upsert.sql,
    /"handoff_id" = case when \$\d+ is null then "git_cicd_pipeline_runs"\."handoff_id" else \$\d+ end/
  );
  assert.match(
    upsert.sql,
    /"app_url" = case when \$\d+ is null then "git_cicd_pipeline_runs"\."app_url" else \$\d+ end/
  );
  assert.match(
    upsert.sql,
    /"api_url" = case when \$\d+ is null then "git_cicd_pipeline_runs"\."api_url" else \$\d+ end/
  );

  const noHandoff = createRun({ handoffId: null, appUrl: null, apiUrl: null });
  const preserved = await repository.persistSnapshot({
    run: noHandoff,
    stages: [],
    logs: []
  });
  assert.deepEqual(readProvenanceTuple(preserved), [
    "handoff-a",
    "https://a-app.example.com",
    "https://a-api.example.com"
  ]);

  const storedPartialB = await repository.persistSnapshot({
    run: partialB,
    stages: [],
    logs: []
  });
  assert.deepEqual(readProvenanceTuple(storedPartialB), [
    "handoff-b",
    null,
    "https://b-api.example.com/v2"
  ]);

  const storedEmptyB = await repository.persistSnapshot({
    run: emptyB,
    stages: [],
    logs: []
  });
  assert.deepEqual(readProvenanceTuple(storedEmptyB), ["handoff-b", null, null]);
});

function readProvenanceTuple(
  run: Pick<PersistedPipelineRun, "handoffId" | "appUrl" | "apiUrl">
): [string | null, string | null, string | null] {
  return [run.handoffId, run.appUrl, run.apiUrl];
}

function createRun(overrides: Partial<PersistedPipelineRun> = {}): PersistedPipelineRun {
  const timestamp = new Date("2026-07-13T00:00:00.000Z");
  return {
    id: "run-1",
    projectId: "project-1",
    sourceRepositoryId: "repo-1",
    handoffId: null,
    commitSha: "abc",
    commitMessage: "Ship",
    branch: "main",
    changeScope: "app",
    status: "running",
    statusMessage: "running",
    pipelineRunUrl: "https://github.example/actions/1",
    appUrl: null,
    apiUrl: null,
    startedAt: timestamp,
    finishedAt: null,
    lastRefreshedAt: timestamp,
    createdAt: timestamp,
    ...overrides
  };
}

function toRunRow(run: PersistedPipelineRun): unknown[] {
  return [
    run.id,
    run.projectId,
    run.sourceRepositoryId,
    run.handoffId,
    run.commitSha,
    run.commitMessage,
    run.branch,
    run.changeScope,
    run.status,
    run.statusMessage,
    run.pipelineRunUrl,
    run.appUrl,
    run.apiUrl,
    run.startedAt,
    run.finishedAt,
    run.lastRefreshedAt,
    run.createdAt
  ];
}
