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
  const acceptedUpdateClause = upsert.sql.split("do update set")[1] ?? "";
  assert.match(acceptedUpdateClause, /"handoff_id" = \$\d+/);
  assert.match(acceptedUpdateClause, /"app_url" = \$\d+/);
  assert.match(acceptedUpdateClause, /"api_url" = \$\d+/);
  assert.doesNotMatch(acceptedUpdateClause, /case when \$\d+ is null/);

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
  const noHandoffUpsert = queries.filter(({ sql }) =>
    sql.startsWith('insert into "git_cicd_pipeline_runs"')
  )[1];
  assert.ok(noHandoffUpsert);
  const preservedUpdateClause = noHandoffUpsert.sql.split("do update set")[1] ?? "";
  assert.doesNotMatch(preservedUpdateClause, /"handoff_id" =/);
  assert.doesNotMatch(preservedUpdateClause, /"app_url" =/);
  assert.doesNotMatch(preservedUpdateClause, /"api_url" =/);

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

test("reverse completion rejects an equal-time partial workflow snapshot and keeps terminal stages and logs", async () => {
  const terminal = createRun({
    status: "succeeded",
    upstreamOrderingToken: "2026-07-13T00:05:00.000Z|11|00000000000000000020:0000000001|00000000000000000010:0000000002",
    logRevision: "SketchCatch App:10:2",
    finishedAt: new Date("2026-07-13T00:05:00.000Z")
  });
  const terminalStage = {
    id: "stage-terminal",
    pipelineRunId: terminal.id,
    kind: "app_deploy" as const,
    status: "succeeded" as const,
    runUrl: "https://github.example/jobs/terminal",
    startedAt: new Date("2026-07-13T00:03:00.000Z"),
    finishedAt: new Date("2026-07-13T00:05:00.000Z")
  };
  const queries: string[] = [];
  let runInsertCount = 0;
  const proxy = drizzle(async (sql) => {
    queries.push(sql);
    if (sql.startsWith('insert into "git_cicd_pipeline_runs"')) {
      runInsertCount += 1;
      return { rows: runInsertCount === 1 ? [toRunRow(terminal)] : [] };
    }
    if (sql.startsWith('insert into "git_cicd_pipeline_stages"')) {
      return { rows: [[
        terminalStage.id,
        terminalStage.pipelineRunId,
        terminalStage.kind,
        terminalStage.status,
        terminalStage.runUrl,
        terminalStage.startedAt,
        terminalStage.finishedAt
      ]] };
    }
    if (sql.includes('from "git_cicd_pipeline_runs"')) return { rows: [toRunRow(terminal)] };
    if (sql.includes('from "git_cicd_pipeline_stages"')) {
      return { rows: [[
        terminalStage.id,
        terminalStage.pipelineRunId,
        terminalStage.kind,
        terminalStage.status,
        terminalStage.runUrl,
        terminalStage.startedAt,
        terminalStage.finishedAt
      ]] };
    }
    return { rows: [] };
  });
  const db = {
    transaction: async <T>(callback: (tx: typeof proxy) => Promise<T>) => callback(proxy)
  } as unknown as Database;
  const repository = createPostgresGitCicdPipelinePersistenceRepository(db);
  const terminalLog = {
    id: "log-terminal",
    pipelineRunId: terminal.id,
    stageId: terminalStage.id,
    sequence: 1,
    level: "info" as const,
    message: "terminal log",
    createdAt: terminal.finishedAt!
  };

  await repository.persistSnapshot({ run: terminal, stages: [terminalStage], logs: [terminalLog] });
  const secondInsertIndex = queries.length;
  const stale = createRun({
    status: "running",
    upstreamOrderingToken: "2026-07-13T00:05:00.000Z|01|00000000000000000000:0000000000|00000000000000000010:0000000001",
    logRevision: "SketchCatch App:10:1",
    finishedAt: null
  });
  const persisted = await repository.persistSnapshot({
    run: stale,
    stages: [{ ...terminalStage, id: "stage-stale", status: "running", finishedAt: null }],
    logs: [{ ...terminalLog, id: "log-stale", message: "stale running log" }]
  });

  assert.equal(persisted.status, "succeeded");
  assert.equal(persisted.logRevision, "SketchCatch App:10:2");
  assert.deepEqual(persisted.stages.map((stage) => stage.status), ["succeeded"]);
  const staleQueries = queries.slice(secondInsertIndex);
  assert.equal(staleQueries.some((sql) => sql.startsWith('insert into "git_cicd_pipeline_stages"')), false);
  assert.equal(staleQueries.some((sql) => sql.startsWith('delete from "git_cicd_pipeline_logs"')), false);
  assert.equal(staleQueries.some((sql) => sql.includes("stale running log")), false);
  assert.match(staleQueries[0] ?? "", /"upstream_ordering_token" < \$\d+/);
  assert.match(staleQueries[0] ?? "", /"status" not in/);

  const sameRevisionQueryIndex = queries.length;
  const sameRevision = await repository.persistSnapshot({
    run: { ...stale, upstreamOrderingToken: terminal.upstreamOrderingToken },
    stages: [{ ...terminalStage, id: "stage-same", status: "running", finishedAt: null }],
    logs: [{ ...terminalLog, id: "log-same", message: "same revision running log" }]
  });
  assert.equal(sameRevision.status, "succeeded");
  const sameRevisionQueries = queries.slice(sameRevisionQueryIndex);
  assert.equal(
    sameRevisionQueries.some((sql) => sql.startsWith('insert into "git_cicd_pipeline_stages"')),
    false
  );
  assert.equal(
    sameRevisionQueries.some((sql) => sql.startsWith('delete from "git_cicd_pipeline_logs"')),
    false
  );
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
    upstreamOrderingToken: `${timestamp.toISOString()}|SketchCatch App:1:1`,
    logRevision: "SketchCatch App:1:1",
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
    run.upstreamOrderingToken,
    run.logRevision,
    run.lastRefreshedAt,
    run.createdAt
  ];
}
