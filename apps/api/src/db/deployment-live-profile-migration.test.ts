import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../drizzle/0054_remove_practice_live_profile.sql",
  import.meta.url
);
const journalUrl = new URL("../../drizzle/meta/_journal.json", import.meta.url);

test("0054 replaces existing practice profiles before removing the enum value", () => {
  assert.equal(existsSync(migrationUrl), true);
  if (!existsSync(migrationUrl)) return;

  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /sketchcatch:contract-migration-after: v0\.1\.0/u);
  assert.match(
    sql,
    /UPDATE "deployments" SET "live_profile" = 'demo_web_service' WHERE "live_profile" = 'practice'/u
  );
  assert.match(
    sql,
    /CREATE TYPE "public"\."deployment_live_profile_next" AS ENUM\('demo_web_service', 'demo_web_service_with_rds'\)/u
  );
  assert.match(
    sql,
    /ALTER TABLE "deployments" ALTER COLUMN "live_profile" SET DEFAULT 'demo_web_service'/u
  );
  assert.doesNotMatch(sql, /\b(?:DELETE FROM|TRUNCATE)\b/iu);

  const updateOffset = sql.indexOf('UPDATE "deployments"');
  const typeConversionOffset = sql.indexOf(
    'ALTER TABLE "deployments" ALTER COLUMN "live_profile" SET DATA TYPE'
  );
  assert(updateOffset >= 0);
  assert(typeConversionOffset > updateOffset);
});

test("0054 is registered after the current migration head", () => {
  const journal = JSON.parse(readFileSync(journalUrl, "utf8")) as {
    entries?: Array<{ idx?: number; tag?: string }>;
  };

  assert.deepEqual(
    journal.entries?.find((candidate) => candidate.tag === "0054_remove_practice_live_profile"),
    {
      idx: 54,
      version: "7",
      when: 1784485550391,
      tag: "0054_remove_practice_live_profile",
      breakpoints: true
    }
  );
});
