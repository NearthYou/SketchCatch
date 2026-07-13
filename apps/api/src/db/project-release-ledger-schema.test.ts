import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  applicationReleases,
  deployments,
  projectDeploymentTargets
} from "./schema.js";

test("a project has one provider-neutral deployment target", () => {
  const config = getTableConfig(projectDeploymentTargets);

  assert.equal(findColumn(config, "project_id")?.primary, true);
  assert(findColumn(config, "provider"));
  assert(findColumn(config, "connection_id"));
  assert(findColumn(config, "region"));
  assert(findColumn(config, "runtime_target_kind"));
  assert(findColumn(config, "confirmed_build_config"));
  assert(findColumn(config, "runtime_config"));
  assert(findColumn(config, "rollout_strategy"));
});

test("ECS runtime coordinates are added by a non-destructive migration", () => {
  const migrationUrl = new URL("../../drizzle/0037_ecs_gitops_runtime.sql", import.meta.url);

  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /ADD COLUMN "runtime_config" jsonb/);
  assert.match(migration, /project_deployment_targets_runtime_config_check/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

test("Lambda runtime coordinates extend the JSON contract without destructive data changes", () => {
  const migrationUrl = new URL("../../drizzle/0038_lambda_gitops_runtime.sql", import.meta.url);

  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /runtime_target_kind" = 'lambda'/);
  assert.match(migration, /'runtimeTargetKind' = 'lambda'/);
  assert.match(migration, /VALIDATE CONSTRAINT/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

test("EC2 ASG runtime coordinates extend the JSON contract without destructive data changes", () => {
  const migrationUrl = new URL("../../drizzle/0039_ec2_asg_gitops_runtime.sql", import.meta.url);

  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /runtime_target_kind" = 'ec2_asg'/);
  assert.match(migration, /'runtimeTargetKind' = 'ec2_asg'/);
  assert.match(migration, /VALIDATE CONSTRAINT/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

test("Direct and GitOps application releases share one project ledger", () => {
  const config = getTableConfig(applicationReleases);

  for (const name of [
    "project_id",
    "deployment_id",
    "pipeline_run_id",
    "source",
    "runtime_target_kind",
    "version",
    "commit_sha",
    "artifact_digest",
    "provider_revision",
    "output_url",
    "status"
  ]) {
    assert(findColumn(config, name), `missing ${name}`);
  }
  assert(config.indexes.some((item) => item.config.name === "application_releases_project_created_id_idx"));
  assert(config.indexes.some((item) => item.config.name === "application_releases_deployment_unique"));
  assert(config.indexes.some((item) => item.config.name === "application_releases_pipeline_run_unique"));
});

test("legacy deployments remain compatible while linking to the shared release model", () => {
  const config = getTableConfig(deployments);

  assert(findColumn(config, "live_profile"));
  assert(findColumn(config, "scope"));
  assert(findColumn(config, "target_kind"));
  assert(findColumn(config, "source"));
  assert(findColumn(config, "release_id"));
  assert(config.indexes.some((item) => item.config.name === "deployments_release_id_unique"));
  assert(
    config.foreignKeys.some((foreignKey) =>
      foreignKey.reference().columns.some((column) => column.name === "release_id")
    )
  );
});

test("release ledger migration backfills legacy deployment intent without fabricating release evidence", () => {
  const migrationUrl = new URL("../../drizzle/0035_project_release_ledger.sql", import.meta.url);

  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /CREATE TABLE "project_deployment_targets"/);
  assert.match(migration, /CREATE TABLE "application_releases"/);
  assert.match(migration, /ADD COLUMN "scope"/);
  assert.match(migration, /ADD COLUMN "release_id"/);
  assert.match(migration, /demo_web_service/);
  assert.match(migration, /full_stack/);
  assert.doesNotMatch(migration, /INSERT INTO "application_releases"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

function findColumn(config: ReturnType<typeof getTableConfig>, name: string) {
  return config.columns.find((column) => column.name === name);
}
