import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  applicationReleaseSteps,
  awsCodeConnections,
  awsConnections,
  projectBuildEnvironments,
  projectExecutionLeases,
  projects,
  releaseCandidates
} from "./schema.js";

const migrationUrl = new URL(
  "../../drizzle/0044_github_codebuild_release_plane.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0044 creates the complete release plane in the fresh Drizzle schema", () => {
  assert.deepEqual(
    [
      awsCodeConnections,
      projectBuildEnvironments,
      projectExecutionLeases,
      releaseCandidates,
      applicationReleaseSteps
    ].map((table) => getTableConfig(table).name),
    [
      "aws_code_connections",
      "project_build_environments",
      "project_execution_leases",
      "release_candidates",
      "application_release_steps"
    ]
  );

  const sql = readFileSync(migrationUrl, "utf8");
  for (const tableName of [
    "aws_code_connections",
    "project_build_environments",
    "project_execution_leases",
    "release_candidates",
    "application_release_steps"
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE "${tableName}"`, "u"));
  }
  assert.match(sql, /release_candidates_reference_check[\s\S]+num_nonnulls/u);
  assert.match(
    sql,
    /release_candidates_deployment_id_deployments_id_fk[\s\S]+ON DELETE cascade/u
  );
  assert.match(
    sql,
    /release_candidates_pipeline_run_id_git_cicd_pipeline_runs_id_fk[\s\S]+ON DELETE cascade/u
  );
  assert.match(sql, /project_execution_leases_fencing_check[\s\S]+"fencing_version" > 0/u);
  assert.match(
    sql,
    /project_execution_leases_status_check[\s\S]+\('active', 'releasing', 'released'\)/u
  );
  assert.match(sql, /"projects" ADD COLUMN "deletion_started_at" timestamp with time zone/u);
  assert.match(
    sql,
    /"aws_connections" ADD COLUMN "deletion_started_at" timestamp with time zone/u
  );
  assert.match(
    sql,
    /aws_code_connections_status_check[\s\S]+'CREATING'[\s\S]+'PENDING'/u
  );
  assert.equal(
    getTableConfig(awsCodeConnections).columns.find(
      (column) => column.name === "connection_arn"
    )?.notNull,
    false
  );
  assert(
    getTableConfig(projects).columns.some(
      (column) => column.name === "deletion_started_at"
    )
  );
  assert(
    getTableConfig(awsConnections).columns.some(
      (column) => column.name === "deletion_started_at"
    )
  );
  assert.match(
    sql,
    /git_cicd_pipeline_runs_repository_commit_unique[\s\S]+WHERE "release_request_key" is null/u
  );
});

test("0044 backfills AWS snapshots before changing connection history to SET NULL", () => {
  const sql = readFileSync(migrationUrl, "utf8");
  const backfillPosition = sql.indexOf('UPDATE "deployments" AS "deployment"');
  const deploymentSetNullPosition = sql.indexOf(
    'ALTER TABLE "deployments" ADD CONSTRAINT "deployments_aws_connection_id_aws_connections_id_fk"'
  );
  const targetSetNullPosition = sql.indexOf(
    'ALTER TABLE "project_deployment_targets" ADD CONSTRAINT "project_deployment_targets_connection_id_aws_connections_id_fk"'
  );
  const releaseMetadataPosition = sql.indexOf(
    'ALTER TABLE "application_releases" ADD COLUMN "release_candidate_id"'
  );

  assert(backfillPosition > 0);
  assert(deploymentSetNullPosition > backfillPosition);
  assert(targetSetNullPosition > backfillPosition);
  assert(releaseMetadataPosition > backfillPosition);
  assert.match(
    sql,
    /"aws_account_id_snapshot" = COALESCE\("deployment"\."approved_aws_account_id", "connection"\."account_id"\)/u
  );
  assert.match(
    sql,
    /"aws_region_snapshot" = COALESCE\("deployment"\."approved_aws_region", "connection"\."region"\)/u
  );
  assert.match(
    sql,
    /project_deployment_targets_connection_id_aws_connections_id_fk[\s\S]+ON DELETE set null/u
  );
  assert.match(
    sql,
    /deployments_aws_connection_id_aws_connections_id_fk[\s\S]+ON DELETE set null/u
  );
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0044 is registered under its collision-safe migration number", () => {
  const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
    entries?: Array<{ idx?: number; tag?: string }>;
  };
  const entry = journal.entries?.find(
    (candidate) => candidate.tag === "0044_github_codebuild_release_plane"
  );

  assert.deepEqual(entry, {
    idx: 44,
    version: "7",
    when: 1784160000002,
    tag: "0044_github_codebuild_release_plane",
    breakpoints: true
  });
});
