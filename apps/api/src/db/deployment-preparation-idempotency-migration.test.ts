import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { deployments } from "./schema.js";

const migrationUrl = new URL(
  "../../drizzle/0052_deployment_preparation_idempotency.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0052 adds a collision-safe preparation key for active Deployment reuse", () => {
  const table = getTableConfig(deployments);
  assert.equal(
    table.columns.some((column) => column.name === "preparation_key"),
    true
  );
  assert.equal(
    table.indexes.some((index) => index.config.name === "deployments_project_preparation_active_unique"),
    true
  );
  assert.equal(existsSync(migrationUrl), true);
  if (!existsSync(migrationUrl)) return;

  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /ADD COLUMN "preparation_key" varchar\(64\)/u);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "deployments_project_preparation_active_unique"[\s\S]+"project_id", "preparation_key"[\s\S]+status[\s\S]+PENDING[\s\S]+RUNNING/u
  );
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0052 is registered after the current migration head", () => {
  const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
    entries?: Array<{ idx?: number; tag?: string }>;
  };
  assert.deepEqual(
    journal.entries?.find(
      (candidate) => candidate.tag === "0052_deployment_preparation_idempotency"
    ),
    {
      idx: 52,
      version: "7",
      when: 1784383200001,
      tag: "0052_deployment_preparation_idempotency",
      breakpoints: true
    }
  );
});
