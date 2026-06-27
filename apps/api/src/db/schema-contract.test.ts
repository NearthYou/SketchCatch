import { test } from "node:test";
import assert from "node:assert/strict";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  awsConnectionStatusEnum,
  awsConnections,
  deploymentFailureStageEnum,
  deploymentLogs,
  deploymentStatusEnum,
  deployments,
  projectDrafts,
  users
} from "./schema.js";

test("deployment status enum uses a domain-specific database name", () => {
  assert.equal(deploymentStatusEnum.enumName, "deployment_status");
});

test("deployment failure stages use validate consistently with deployment log stages", () => {
  const values: readonly string[] = deploymentFailureStageEnum.enumValues;

  assert(values.includes("validate"));
  assert.equal(values.includes("validation"), false);
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
