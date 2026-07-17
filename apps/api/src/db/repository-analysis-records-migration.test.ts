import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { repositoryAnalysisRecords } from "./schema.js";

const migrationUrl = new URL(
  "../../drizzle/0050_repository_analysis_records.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0050 stores one current Repository Analysis Record per project", () => {
  assert.equal(existsSync(migrationUrl), true, "0050 migration must exist");
  const sql = readFileSync(migrationUrl, "utf8");
  const table = getTableConfig(repositoryAnalysisRecords);

  assert.equal(table.name, "repository_analysis_records");
  assert(table.indexes.some((index) => index.config.name === "repository_analysis_records_project_unique"));
  assert(table.foreignKeys.some((foreignKey) =>
    foreignKey.getName() === "repository_analysis_records_project_id_projects_id_fk"
  ));
  assert(table.foreignKeys.some((foreignKey) =>
    foreignKey.getName() === "repository_analysis_records_source_repository_id_source_repositories_id_fk"
  ));
  assert(table.checks.some((constraint) =>
    constraint.name === "repository_analysis_records_provider_check"
  ));
  assert.match(sql, /CREATE TABLE "repository_analysis_records"/u);
  assert.match(sql, /ON DELETE cascade/u);
  assert.match(sql, /ON DELETE set null/u);
  assert.match(sql, /CREATE UNIQUE INDEX "repository_analysis_records_project_unique"/u);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0050 is registered after migration 0049", () => {
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
    (candidate) => candidate.tag === "0050_repository_analysis_records"
  );

  assert.deepEqual(entry, {
    idx: 50,
    version: "7",
    when: 1784332800002,
    tag: "0050_repository_analysis_records",
    breakpoints: true
  });
});
