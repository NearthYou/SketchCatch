import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig
} from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as databaseSchema from "./schema.js";
import {
  architectures,
  awsConnectionStatusEnum,
  awsConnections,
  deploymentFailureStageEnum,
  deploymentLiveObservationManifests,
  deploymentLiveObservationManifestStatusEnum,
  deploymentLiveProfileEnum,
  deploymentLogs,
  deploymentPlanArtifacts,
  deploymentPlanOperationEnum,
  deploymentStageEnum,
  deploymentStatusEnum,
  deployments,
  gitCicdHandoffStatusEnum,
  gitCicdHandoffKindEnum,
  gitCicdHandoffs,
  gitCicdMonitoringConfigs,
  gitCicdPipelineLogs,
  gitCicdPipelineRuns,
  gitCicdPipelineStages,
  gitCicdRepositoryProviderEnum,
  projectAssets,
  projectDrafts,
  projects,
  reverseEngineeringScanLogs,
  reverseEngineeringScanStatusEnum,
  reverseEngineeringScans,
  users
} from "./schema.js";

test("Git/CI/CD monitoring tables expose commit-scoped run history", () => {
  assert.ok(gitCicdMonitoringConfigs.sourceRepositoryId);
  assert.ok(gitCicdMonitoringConfigs.validationStatus);
  assert.ok(gitCicdPipelineRuns.commitSha);
  assert.ok(gitCicdPipelineStages.pipelineRunId);
  assert.ok(gitCicdPipelineLogs.sequence);

  assert(
    hasUniqueIndex(getTableConfig(gitCicdPipelineRuns).indexes, "git_cicd_pipeline_runs_repository_commit_unique", [
      "source_repository_id",
      "commit_sha"
    ])
  );
  assert(
    hasUniqueIndex(getTableConfig(gitCicdPipelineStages).indexes, "git_cicd_pipeline_stages_run_kind_unique", [
      "pipeline_run_id",
      "kind"
    ])
  );
  assert(
    hasUniqueIndex(getTableConfig(gitCicdPipelineLogs).indexes, "git_cicd_pipeline_logs_run_sequence_unique", [
      "pipeline_run_id",
      "sequence"
    ])
  );
});

test("Git/CI/CD monitoring migration safely backfills active repositories", () => {
  const migrationUrl = new URL("../../drizzle/0032_git_cicd_monitoring_runs.sql", import.meta.url);

  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /INSERT INTO "git_cicd_monitoring_configs"/);
  assert.match(migration, /WHERE "status" = 'active'/);
  assert.match(migration, /'required'/);
  assert.match(migration, /'\{"mode":"repository_root","path":"\."\}'::jsonb/);
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE|DELETE FROM) "git_cicd_handoffs"/);
});

test("deployment status enum uses a domain-specific database name", () => {
  assert.equal(deploymentStatusEnum.enumName, "deployment_status");
  assert(deploymentStatusEnum.enumValues.includes("DESTROYED"));
});

test("deployment failure stages use validate consistently with deployment log stages", () => {
  const values: readonly string[] = deploymentFailureStageEnum.enumValues;

  assert(values.includes("validate"));
  assert(values.includes("destroy"));
  assert.equal(values.includes("validation"), false);
  assert(deploymentStageEnum.enumValues.includes("destroy"));
});

test("deployment plan artifacts identify apply and destroy operations", () => {
  const config = getTableConfig(deploymentPlanArtifacts);

  assert.equal(deploymentPlanOperationEnum.enumName, "deployment_plan_operation");
  assert.deepEqual(deploymentPlanOperationEnum.enumValues, ["apply", "destroy"]);
  assert(findColumn(config.columns, "operation"));
});

test("project drafts have a stable id primary key and one current draft per project", () => {
  const config = getTableConfig(projectDrafts);
  const id = findColumn(config.columns, "id");
  const projectId = findColumn(config.columns, "project_id");

  assert.equal(id?.primary, true);
  assert.equal(projectId?.primary, false);
  assert(hasUniqueIndex(config.indexes, "project_drafts_project_id_unique", ["project_id"]));
});

test("deployment approvals reference users by approved_by_user_id", () => {
  const config = getTableConfig(deployments);

  assert(findColumn(config.columns, "approved_by_user_id"));
  assert.equal(findColumn(config.columns, "approved_by"), undefined);
  assert(
    config.foreignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();

      return (
        reference.columns.some((column) => column.name === "approved_by_user_id") &&
        reference.foreignTable === users &&
        reference.foreignColumns.some((column) => column.name === "id")
      );
    })
  );
});

test("deployment log sequences are unique per deployment", () => {
  const config = getTableConfig(deploymentLogs);

  assert(
    hasUniqueIndex(config.indexes, "deployment_logs_deployment_sequence_unique", [
      "deployment_id",
      "sequence"
    ])
  );
});

test("deployments explicitly reference the AWS connection selected for execution", () => {
  const config = getTableConfig(deployments);

  assert(findColumn(config.columns, "aws_connection_id"));
  assert(hasIndex(config.indexes, "deployments_aws_connection_id_idx", ["aws_connection_id"]));
  assert(
    config.foreignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();

      return (
        reference.columns.some((column) => column.name === "aws_connection_id") &&
        reference.foreignTable === awsConnections &&
        reference.foreignColumns.some((column) => column.name === "id")
      );
    })
  );
});

test("deployments store the explicit live deployment profile", () => {
  const config = getTableConfig(deployments);

  assert.equal(deploymentLiveProfileEnum.enumName, "deployment_live_profile");
  assert.deepEqual(deploymentLiveProfileEnum.enumValues, [
    "practice",
    "demo_web_service",
    "demo_web_service_with_rds"
  ]);
  assert(findColumn(config.columns, "live_profile"));
});

test("deployment Live Observation manifests are one-to-one schema v2 records without secrets", () => {
  const config = getTableConfig(deploymentLiveObservationManifests);
  const deploymentId = config.columns.find((column) => column.name === "deployment_id");
  const schemaVersion = config.columns.find((column) => column.name === "schema_version");
  const status = config.columns.find((column) => column.name === "status");
  const manifest = config.columns.find((column) => column.name === "manifest");
  const invalidReason = config.columns.find((column) => column.name === "invalid_reason");
  const createdAt = config.columns.find((column) => column.name === "created_at");
  const updatedAt = config.columns.find((column) => column.name === "updated_at");

  assert.equal(
    deploymentLiveObservationManifestStatusEnum.enumName,
    "deployment_live_observation_manifest_status"
  );
  assert.deepEqual(deploymentLiveObservationManifestStatusEnum.enumValues, [
    "valid",
    "manifest_invalid"
  ]);
  assert.deepEqual(
    config.columns.map((column) => column.name),
    [
      "deployment_id",
      "schema_version",
      "status",
      "manifest",
      "invalid_reason",
      "created_at",
      "updated_at"
    ]
  );
  assert.equal(deploymentId?.primary, true);
  assert.equal(deploymentId?.notNull, true);
  assert.equal(schemaVersion?.columnType, "PgInteger");
  assert.equal(schemaVersion?.notNull, true);
  assert.equal(status?.notNull, true);
  assert.equal(manifest?.columnType, "PgJsonb");
  assert.equal(manifest?.notNull, false);
  assert.equal(invalidReason?.notNull, false);
  assert.equal(createdAt?.notNull, true);
  assert.equal(updatedAt?.notNull, true);
  assert.equal((createdAt as { withTimezone?: boolean } | undefined)?.withTimezone, true);
  assert.equal((updatedAt as { withTimezone?: boolean } | undefined)?.withTimezone, true);
  assert(
    config.checks.some(
      (constraint) =>
        constraint.name ===
        "deployment_live_observation_manifests_schema_version_check"
    )
  );

  const deploymentForeignKey = config.foreignKeys.find((foreignKey) => {
    const reference = foreignKey.reference();

    return (
      reference.columns.some((column) => column.name === "deployment_id") &&
      reference.foreignTable === deployments &&
      reference.foreignColumns.some((column) => column.name === "id")
    );
  });
  assert.ok(deploymentForeignKey);
  assert.equal(deploymentForeignKey.onDelete, "cascade");
});

test("deployments and Live Observation manifests expose inverse one-to-one relations", () => {
  const relationalConfig = extractTablesRelationalConfig(
    databaseSchema,
    createTableRelationsHelpers
  ).tables;

  assert.equal(
    relationalConfig.deployments?.relations.liveObservationManifest?.referencedTableName,
    "deployment_live_observation_manifests"
  );
  assert.equal(
    relationalConfig.deploymentLiveObservationManifests?.relations.deployment
      ?.referencedTableName,
    "deployments"
  );
});

test("AWS connections store generated external ids without raw credentials", () => {
  const config = getTableConfig(awsConnections);

  assert.equal(awsConnectionStatusEnum.enumName, "aws_connection_status");
  assert.equal(findColumn(config.columns, "project_id"), undefined);
  assert(findColumn(config.columns, "user_id"));
  assert(findColumn(config.columns, "external_id"));
  assert(findColumn(config.columns, "role_arn"));
  assert(findColumn(config.columns, "account_id"));
  assert.equal(findColumn(config.columns, "access_key_id"), undefined);
  assert.equal(findColumn(config.columns, "secret_access_key"), undefined);
  assert.equal(findColumn(config.columns, "session_token"), undefined);
  assert(hasIndex(config.indexes, "aws_connections_user_id_idx", ["user_id"]));
  assert(
    hasUniqueIndex(config.indexes, "aws_connections_user_verified_account_unique", [
      "user_id",
      "account_id"
    ])
  );
  assert(hasUniqueIndex(config.indexes, "aws_connections_external_id_unique", ["external_id"]));
});

test("Git/CI/CD handoffs store repository metadata without raw provider secrets", () => {
  const config = getTableConfig(gitCicdHandoffs);

  assert.equal(gitCicdRepositoryProviderEnum.enumName, "git_cicd_repository_provider");
  assert.deepEqual(gitCicdRepositoryProviderEnum.enumValues, ["internal", "github"]);
  assert.equal(gitCicdHandoffStatusEnum.enumName, "git_cicd_handoff_status");
  assert.equal(gitCicdHandoffKindEnum.enumName, "git_cicd_handoff_kind");
  assert.deepEqual(gitCicdHandoffStatusEnum.enumValues, [
    "draft",
    "pr_created",
    "pipeline_running",
    "pipeline_success",
    "pipeline_failed",
    "cancelled"
  ]);
  assert.deepEqual(gitCicdHandoffKindEnum.enumValues, ["terraform_iac", "static_site"]);
  assert(findColumn(config.columns, "source_repository_id"));
  assert(findColumn(config.columns, "handoff_kind"));
  assert(findColumn(config.columns, "repository_provider"));
  assert(findColumn(config.columns, "repository_owner"));
  assert(findColumn(config.columns, "repository_name"));
  assert(findColumn(config.columns, "target_branch"));
  assert(findColumn(config.columns, "source_deployment_id"));
  assert(findColumn(config.columns, "deployment_mode"));
  assert(findColumn(config.columns, "requires_environment_approval"));
  assert(findColumn(config.columns, "pull_request_number"));
  assert(findColumn(config.columns, "merge_commit_sha"));
  assert(findColumn(config.columns, "environment_name"));
  assert(findColumn(config.columns, "infra_pipeline_run_url"));
  assert(findColumn(config.columns, "infra_pipeline_status"));
  assert(findColumn(config.columns, "app_pipeline_run_url"));
  assert(findColumn(config.columns, "app_pipeline_status"));
  assert(findColumn(config.columns, "destroy_pipeline_run_url"));
  assert(findColumn(config.columns, "destroy_pipeline_status"));
  assert(findColumn(config.columns, "repository_settings_preview"));
  assert(findColumn(config.columns, "aws_role_diff"));
  assert(findColumn(config.columns, "github_oauth_required"));
  assert(findColumn(config.columns, "user_accepted_change_id"));
  assert(findColumn(config.columns, "created_by_user_id"));
  assert.equal(findColumn(config.columns, "access_token"), undefined);
  assert.equal(findColumn(config.columns, "private_key"), undefined);
  assert.equal(findColumn(config.columns, "ci_secret"), undefined);
  assert.equal(findColumn(config.columns, "deploy_key"), undefined);
  assert(hasIndex(config.indexes, "git_cicd_handoffs_project_id_idx", ["project_id"]));
  assert(hasIndex(config.indexes, "git_cicd_handoffs_status_idx", ["status"]));
  assert(hasForeignKey(config.foreignKeys, "project_id", projects, "id"));
  assert(hasForeignKey(config.foreignKeys, "architecture_id", architectures, "id"));
  assert(hasForeignKey(config.foreignKeys, "terraform_artifact_id", projectAssets, "id"));
  assert(hasForeignKey(config.foreignKeys, "created_by_user_id", users, "id"));
});

test("Reverse Engineering scans store provider-neutral job metadata without raw credentials", () => {
  const config = getTableConfig(reverseEngineeringScans);

  assert.equal(reverseEngineeringScanStatusEnum.enumName, "reverse_engineering_scan_status");
  assert.deepEqual(reverseEngineeringScanStatusEnum.enumValues, [
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled"
  ]);
  assert(findColumn(config.columns, "aws_connection_id"));
  assert(findColumn(config.columns, "provider"));
  assert(findColumn(config.columns, "region"));
  assert(findColumn(config.columns, "resource_types"));
  assert(findColumn(config.columns, "status"));
  assert(findColumn(config.columns, "result"));
  assert(findColumn(config.columns, "error_summary"));
  assert(findColumn(config.columns, "cancel_requested_at"));
  assert(findColumn(config.columns, "deleted_at"));
  assert.equal(findColumn(config.columns, "access_key_id"), undefined);
  assert.equal(findColumn(config.columns, "secret_access_key"), undefined);
  assert.equal(findColumn(config.columns, "session_token"), undefined);
  assert(hasIndex(config.indexes, "reverse_engineering_scans_project_id_idx", ["project_id"]));
  assert(hasIndex(config.indexes, "reverse_engineering_scans_status_idx", ["status"]));
  assert(hasForeignKey(config.foreignKeys, "project_id", projects, "id"));
  assert(hasForeignKey(config.foreignKeys, "aws_connection_id", awsConnections, "id"));
});

test("Reverse Engineering scan logs keep ordered masked progress messages", () => {
  const config = getTableConfig(reverseEngineeringScanLogs);

  assert(findColumn(config.columns, "scan_id"));
  assert(findColumn(config.columns, "sequence"));
  assert(findColumn(config.columns, "stage"));
  assert(findColumn(config.columns, "level"));
  assert(findColumn(config.columns, "message"));
  assert.equal(findColumn(config.columns, "raw_message"), undefined);
  assert(
    hasUniqueIndex(config.indexes, "reverse_engineering_scan_logs_scan_sequence_unique", [
      "scan_id",
      "sequence"
    ])
  );
  assert(hasIndex(config.indexes, "reverse_engineering_scan_logs_scan_id_idx", ["scan_id"]));
  assert(hasForeignKey(config.foreignKeys, "scan_id", reverseEngineeringScans, "id"));
});

function findColumn(columns: Array<{ name: string }>, name: string) {
  return columns.find((column) => column.name === name) as
    | { name: string; primary?: boolean }
    | undefined;
}

function hasUniqueIndex(
  indexes: Array<{
    config: {
      name?: string;
      unique?: boolean;
      columns: unknown[];
    };
  }>,
  name: string,
  columns: string[]
): boolean {
  return indexes.some(
    (index) =>
      index.config.name === name &&
      index.config.unique === true &&
      index.config.columns.map(getColumnName).join(",") === columns.join(",")
  );
}

function hasIndex(
  indexes: Array<{
    config: {
      name?: string;
      columns: unknown[];
    };
  }>,
  name: string,
  columns: string[]
): boolean {
  return indexes.some(
    (index) =>
      index.config.name === name &&
      index.config.columns.map(getColumnName).join(",") === columns.join(",")
  );
}

function getColumnName(column: unknown): string | undefined {
  return typeof column === "object" && column !== null && "name" in column
    ? String(column.name)
    : undefined;
}

function hasForeignKey(
  foreignKeys: ReturnType<typeof getTableConfig>["foreignKeys"],
  columnName: string,
  foreignTable: unknown,
  foreignColumnName: string
): boolean {
  return foreignKeys.some((foreignKey) => {
    const reference = foreignKey.reference();

    return (
      reference.columns.some((column) => column.name === columnName) &&
      reference.foreignTable === foreignTable &&
      reference.foreignColumns.some((column) => column.name === foreignColumnName)
    );
  });
}
