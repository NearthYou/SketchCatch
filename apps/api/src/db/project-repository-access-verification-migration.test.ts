import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { projectBuildEnvironments } from "./schema.js";

const migrationUrl = new URL(
  "../../drizzle/0049_project_repository_access_verification.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0049 stores exact CodeBuild repository checkout evidence", () => {
  assert.equal(existsSync(migrationUrl), true);
  const sql = readFileSync(migrationUrl, "utf8");
  const table = getTableConfig(projectBuildEnvironments);
  const columnNames = table.columns.map((column) => column.name);

  for (const columnName of [
    "repository_verification_status",
    "repository_verification_requested_commit_sha",
    "repository_verification_resolved_commit_sha",
    "repository_verification_build_arn",
    "repository_verification_status_reason",
    "repository_verified_at"
  ]) {
    assert(columnNames.includes(columnName), `${columnName} must exist`);
    assert.match(sql, new RegExp(`"${columnName}"`, "u"));
  }
  assert.match(sql, /repository_verification_evidence_check/u);
  assert.match(sql, /resolved_commit_sha" = "repository_verification_requested_commit_sha/u);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0049 is registered after migration 0048", () => {
  const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
    entries?: Array<Record<string, unknown>>;
  };
  const entry = journal.entries?.find(
    (candidate) => candidate["tag"] === "0049_project_repository_access_verification"
  );

  assert.deepEqual(entry, {
    idx: 49,
    version: "7",
    when: 1784332800001,
    tag: "0049_project_repository_access_verification",
    breakpoints: true
  });
});
