import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { deployments } from "./schema.js";

test("deployments persist the prepared and approved project draft snapshots", () => {
  const config = getTableConfig(deployments);

  for (const name of [
    "prepared_draft_revision",
    "prepared_snapshot_hash",
    "approved_prepared_snapshot_hash"
  ]) {
    assert(config.columns.some((column) => column.name === name), `missing ${name}`);
  }
  assert(
    config.indexes.some(
      (index) => index.config.name === "deployments_project_prepared_revision_idx"
    )
  );
  assert(
    config.checks.some(
      (check) => check.name === "deployments_prepared_snapshot_pair_check"
    )
  );
});

test("prepared revision migration is additive and validates stored hashes", () => {
  const migrationUrl = new URL(
    "../../drizzle/0036_deployment_prepared_revision.sql",
    import.meta.url
  );

  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /ADD COLUMN "prepared_draft_revision"/);
  assert.match(migration, /ADD COLUMN "prepared_snapshot_hash"/);
  assert.match(migration, /ADD COLUMN "approved_prepared_snapshot_hash"/);
  assert.match(migration, /VALIDATE CONSTRAINT "deployments_prepared_snapshot_pair_check"/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});
