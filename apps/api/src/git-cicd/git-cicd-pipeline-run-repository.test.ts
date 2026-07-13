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

test("snapshot upsert refreshes accepted URLs and preserves known URLs when metadata is null", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const returnedRun = createRun({
    handoffId: "handoff-late",
    appUrl: "https://late-app.example.com",
    apiUrl: "https://late-api.example.com"
  });
  const proxy = drizzle(async (sql, params) => {
    queries.push({ sql, params });
    return sql.startsWith('insert into "git_cicd_pipeline_runs"')
      ? { rows: [toRunRow(returnedRun)] }
      : { rows: [] };
  });
  const db = {
    transaction: async <T>(callback: (tx: typeof proxy) => Promise<T>) => callback(proxy)
  } as unknown as Database;
  const repository = createPostgresGitCicdPipelinePersistenceRepository(db);

  const refreshed = await repository.persistSnapshot({
    run: returnedRun,
    stages: [],
    logs: []
  });

  assert.equal(refreshed.handoffId, "handoff-late");
  assert.equal(refreshed.appUrl, "https://late-app.example.com");
  assert.equal(refreshed.apiUrl, "https://late-api.example.com");
  const upsert = queries.find(({ sql }) => sql.startsWith('insert into "git_cicd_pipeline_runs"'));
  assert.ok(upsert);
  assert.match(upsert.sql, /"handoff_id" = coalesce\(\$\d+, "git_cicd_pipeline_runs"\."handoff_id"\)/);
  assert.match(upsert.sql, /"app_url" = coalesce\(\$\d+, "git_cicd_pipeline_runs"\."app_url"\)/);
  assert.match(upsert.sql, /"api_url" = coalesce\(\$\d+, "git_cicd_pipeline_runs"\."api_url"\)/);

  queries.length = 0;
  const missingMetadata = createRun({ handoffId: null, appUrl: null, apiUrl: null });
  const preserved = await repository.persistSnapshot({
    run: missingMetadata,
    stages: [],
    logs: []
  });
  assert.equal(preserved.handoffId, "handoff-late");
  assert.equal(preserved.appUrl, "https://late-app.example.com");
  assert.equal(preserved.apiUrl, "https://late-api.example.com");
});

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
