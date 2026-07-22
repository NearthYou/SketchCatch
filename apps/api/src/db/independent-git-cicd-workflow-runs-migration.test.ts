import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { gitCicdPipelineRuns } from "./schema.js";

const migrationUrl = new URL(
  "../../drizzle/0047_independent_git_cicd_workflow_runs.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0047 stores app and infra workflows as independent runs", () => {
  const sql = readFileSync(migrationUrl, "utf8");
  const tableConfig = getTableConfig(gitCicdPipelineRuns);
  const executionKindColumn = tableConfig.columns.find(
    (column) => column.name === "execution_kind"
  );

  assert.equal(executionKindColumn?.notNull, true);
  assert.equal(executionKindColumn?.default, "app");
  assert(
    tableConfig.checks.some(
      (constraint) => constraint.name === "git_cicd_pipeline_runs_execution_kind_check"
    )
  );
  assert.match(sql, /ADD COLUMN "execution_kind" varchar\(16\)/u);
  assert.match(
    sql,
    /UPDATE "git_cicd_pipeline_runs"[\s\S]+WHEN "change_scope" = 'infra' THEN 'infra'[\s\S]+ELSE 'app'/u
  );
  assert.match(
    sql,
    /git_cicd_pipeline_runs_execution_kind_check[\s\S]+\('app', 'infra'\)/u
  );
  assert.match(sql, /DROP INDEX "git_cicd_pipeline_runs_repository_commit_unique"/u);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "git_cicd_pipeline_runs_github_run_unique"[\s\S]+"source_repository_id", "github_workflow_run_id", "github_workflow_run_attempt"\)[\s\S]+WHERE "github_workflow_run_id" IS NOT NULL[\s\S]+"github_workflow_run_attempt" IS NOT NULL/u
  );
  assert.doesNotMatch(
    sql,
    /git_cicd_pipeline_runs_github_run_unique[^;]+"execution_kind"/u
  );
});

test("0047 uses the server-owned pipeline status message for terminal notifications", () => {
  const sql = readFileSync(migrationUrl, "utf8");

  assert.match(sql, /CREATE OR REPLACE FUNCTION "sketchcatch_gitops_notification_trigger"/u);
  assert.match(
    sql,
    /COALESCE\([\s\S]*NEW\."status_message"[\s\S]*WHEN 'infra' THEN '인프라 배포 상태를 확인해 주세요\.'[\s\S]*ELSE '애플리케이션 배포 상태를 확인해 주세요\.'/u
  );
  assert.match(
    sql,
    /'gitops_pipeline', NEW\."id", NEW\."project_id", NEW\."status"/u
  );
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0047 is registered under the team-reserved migration number", () => {
  const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
    entries?: Array<{
      idx?: number;
      version?: string;
      when?: number;
      tag?: string;
      breakpoints?: boolean;
    }>;
  };
  const entry = journal.entries?.find(
    (candidate) => candidate.tag === "0047_independent_git_cicd_workflow_runs"
  );

  assert.deepEqual(entry, {
    idx: 47,
    version: "7",
    when: 1784246400002,
    tag: "0047_independent_git_cicd_workflow_runs",
    breakpoints: true
  });
});
