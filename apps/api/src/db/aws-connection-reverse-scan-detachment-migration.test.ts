import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { reverseEngineeringScans } from "./schema.js";

const migrationUrl = new URL(
  "../../drizzle/0051_aws_connection_reverse_scan_detachment.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0051 preserves Reverse Engineering scans when an AWS connection is deleted", () => {
  assert.equal(existsSync(migrationUrl), true, "0051 migration must exist");
  const sql = readFileSync(migrationUrl, "utf8");
  const table = getTableConfig(reverseEngineeringScans);
  const connectionIdColumn = table.columns.find(
    (column) => column.name === "aws_connection_id"
  );

  assert.equal(connectionIdColumn?.notNull, false);
  assert.match(sql, /ALTER COLUMN "aws_connection_id" DROP NOT NULL/iu);
  assert.match(
    sql,
    /FOREIGN KEY \("aws_connection_id"\)[\s\S]*ON DELETE set null/iu
  );
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0051 is registered after migration 0050", () => {
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
    (candidate) => candidate.tag === "0051_aws_connection_reverse_scan_detachment"
  );

  assert.deepEqual(entry, {
    idx: 51,
    version: "7",
    when: 1784383200000,
    tag: "0051_aws_connection_reverse_scan_detachment",
    breakpoints: true
  });
});
