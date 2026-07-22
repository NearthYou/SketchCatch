import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../drizzle/0048_repair_github_installation_connections.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0048 repairs missing GitHub installation connections idempotently", () => {
  assert.equal(
    existsSync(migrationUrl),
    true,
    "0048 GitHub installation connections repair migration must exist"
  );

  const sql = readFileSync(migrationUrl, "utf8");

  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS "github_installation_connections"/u
  );
  assert.match(sql, /"github_installation_id" varchar\(128\) NOT NULL/u);
  assert.match(sql, /"user_id" varchar\(36\) NOT NULL/u);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS "github_installation_connections_installation_unique"/u
  );
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS "github_installation_connections_user_status_idx"/u
  );
  assert.match(
    sql,
    /github_installation_connections_user_id_users_id_fk/u
  );
  assert.match(sql, /github_installation_connections_status_check/u);
  assert.match(
    sql,
    /github_installation_connections_repository_selection_check/u
  );
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0048 is registered after the latest migration", () => {
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
    (candidate) => candidate.tag === "0048_repair_github_installation_connections"
  );

  assert.deepEqual(entry, {
    idx: 48,
    version: "7",
    when: 1784332800000,
    tag: "0048_repair_github_installation_connections",
    breakpoints: true
  });
});
