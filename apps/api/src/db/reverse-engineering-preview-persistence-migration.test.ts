import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  awsConnections,
  projectDrafts,
  projects,
  reverseEngineeringScanPreviews,
  reverseEngineeringScans,
  users
} from "./schema.js";

const migrationUrl = new URL(
  "../../drizzle/0057_reverse_engineering_scan_previews.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0057은 private preview 원본을 사용자 소유·만료·1회 claim 상태로 저장한다", () => {
  assert.equal(existsSync(migrationUrl), true, "0057 migration must exist");
  const sql = readFileSync(migrationUrl, "utf8");
  const config = getTableConfig(reverseEngineeringScanPreviews);

  assert.deepEqual(
    config.columns.map((column) => column.name),
    [
      "id",
      "user_id",
      "aws_connection_id",
      "provider",
      "region",
      "resource_types",
      "raw_result",
      "expires_at",
      "claimed_at",
      "claimed_project_id",
      "claimed_scan_id",
      "claimed_draft_id",
      "created_at",
      "updated_at"
    ]
  );
  assert.equal(findColumn(config.columns, "public_result"), undefined);
  assert.equal(findColumn(config.columns, "access_key_id"), undefined);
  assert.equal(findColumn(config.columns, "secret_access_key"), undefined);
  assert.equal(findColumn(config.columns, "session_token"), undefined);
  assert(hasIndex(config.indexes, "reverse_engineering_scan_previews_user_id_idx", ["user_id"]));
  assert(hasIndex(config.indexes, "reverse_engineering_scan_previews_expires_at_idx", ["expires_at"]));
  assert(hasIndex(config.indexes, "reverse_engineering_scan_previews_claimed_at_idx", ["claimed_at"]));
  assert(hasForeignKey(config.foreignKeys, "user_id", users, "id"));
  assert(hasForeignKey(config.foreignKeys, "aws_connection_id", awsConnections, "id"));
  assert(hasForeignKey(config.foreignKeys, "claimed_project_id", projects, "id"));
  assert(hasForeignKey(config.foreignKeys, "claimed_scan_id", reverseEngineeringScans, "id"));
  assert(hasForeignKey(config.foreignKeys, "claimed_draft_id", projectDrafts, "id"));
  assert.match(sql, /CREATE TABLE "reverse_engineering_scan_previews"/iu);
  assert.match(sql, /"raw_result" jsonb NOT NULL/iu);
  assert.match(sql, /"expires_at" timestamp with time zone NOT NULL/iu);
  assert.match(sql, /ON DELETE set null/iu);
  assert.doesNotMatch(sql, /public_result|access_key_id|secret_access_key|session_token/iu);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/iu);
});

test("0057은 현재 migration head 다음에 journal 등록된다", () => {
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
    (candidate) => candidate.tag === "0057_reverse_engineering_scan_previews"
  );

  assert.deepEqual(entry, {
    idx: 57,
    version: "7",
    when: 1784510000000,
    tag: "0057_reverse_engineering_scan_previews",
    breakpoints: true
  });
});

// gg: schema contract에서 금지하거나 필수인 column을 이름으로 확인합니다.
function findColumn(columns: Array<{ name: string }>, name: string) {
  return columns.find((column) => column.name === name);
}

// gg: preview expiry와 ownership 조회가 의도한 index 순서를 쓰는지 확인합니다.
function hasIndex(
  indexes: Array<{
    config: { name?: string; columns: unknown[] };
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

// gg: Drizzle index column과 SQL expression을 구분해 실제 column 이름만 비교합니다.
function getColumnName(column: unknown): string | undefined {
  return typeof column === "object" && column !== null && "name" in column
    ? String(column.name)
    : undefined;
}

// gg: claim audit pointer가 실제 persisted row를 가리키는지 schema metadata로 확인합니다.
function hasForeignKey(
  foreignKeys: ReturnType<typeof getTableConfig>["foreignKeys"],
  sourceColumn: string,
  targetTable: unknown,
  targetColumn: string
): boolean {
  return foreignKeys.some((foreignKey) => {
    const reference = foreignKey.reference();

    return (
      reference.columns.map((column) => column.name).join(",") === sourceColumn &&
      reference.foreignTable === targetTable &&
      reference.foreignColumns.map((column) => column.name).join(",") === targetColumn
    );
  });
}
