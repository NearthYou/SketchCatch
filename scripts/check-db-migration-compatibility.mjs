import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { findAppendOnlyMigrationHistoryFailures } from "./db-migration-history.mjs";

const migrationDirectory = path.join(process.cwd(), "apps/api/drizzle");
const migrationJournalRelativePath = "apps/api/drizzle/meta/_journal.json";
const migrationJournalPath = path.join(process.cwd(), migrationJournalRelativePath);
const policyStartRevision = 29;
const destructivePatterns = [
  /\bDROP\s+(?:TABLE|COLUMN)\b/i,
  /\bRENAME\s+(?:COLUMN|TO)\b/i,
  /\bALTER\s+COLUMN\b[\s\S]*?\b(?:TYPE|SET\s+NOT\s+NULL)\b/i
];
const contractMarker = /^--\s*sketchcatch:contract-migration-after:\s*v\d+\.\d+\.\d+\s*$/im;

const failures = [];
const migrationFiles = fs
  .readdirSync(migrationDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

for (const fileName of migrationFiles) {
  const revision = Number.parseInt(fileName.slice(0, 4), 10);
  if (revision < policyStartRevision) continue;

  const sql = fs.readFileSync(path.join(migrationDirectory, fileName), "utf8");
  const hasDestructiveDdl = destructivePatterns.some((pattern) => pattern.test(sql));
  if (hasDestructiveDdl && !contractMarker.test(sql)) {
    failures.push(
      `${fileName}: destructive DDL requires -- sketchcatch:contract-migration-after: vX.Y.Z`
    );
  }
}

const baseSha = process.env.MIGRATION_BASE_SHA?.trim();
if (baseSha && !/^0{40}$/.test(baseSha)) {
  if (!/^[a-f\d]{40}$/i.test(baseSha)) {
    failures.push("MIGRATION_BASE_SHA must be a 40-character Git commit SHA");
  } else {
    const currentJournal = JSON.parse(fs.readFileSync(migrationJournalPath, "utf8"));
    const baseJournal = JSON.parse(
      execFileSync("git", ["show", `${baseSha}:${migrationJournalRelativePath}`], {
        encoding: "utf8"
      })
    );
    failures.push(
      ...findAppendOnlyMigrationHistoryFailures(
        baseJournal.entries ?? [],
        currentJournal.entries ?? []
      )
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Migration compatibility check failed: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Migration compatibility check passed for revisions ${String(policyStartRevision).padStart(4, "0")} and later.`
  );
}
