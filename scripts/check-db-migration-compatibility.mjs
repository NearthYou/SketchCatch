import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { findAppendOnlyMigrationHistoryFailures } from "./db-migration-history.mjs";

const migrationDirectory = path.join(process.cwd(), "apps/api/drizzle");
const migrationJournalRelativePath = "apps/api/drizzle/meta/_journal.json";
const migrationJournalPath = path.join(process.cwd(), migrationJournalRelativePath);
const policyStartRevision = 29;
const knownHistoricalMigrationRepairs = [
  {
    fileName: "0044_github_codebuild_release_plane.sql",
    sha256: "f1395432cb3dc4fdc01bd14ba5cb3c985f573c55d6587c5b75941a5560b22264",
    tag: "0044_github_codebuild_release_plane",
    when: 1784160000002
  }
];
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
    const baseEntries = baseJournal.entries ?? [];
    const currentEntries = currentJournal.entries ?? [];
    const baseTags = new Set(baseEntries.map((entry) => entry.tag));
    const currentByTag = new Map(currentEntries.map((entry) => [entry.tag, entry]));
    const allowedHistoricalInsertions = knownHistoricalMigrationRepairs.flatMap((repair) => {
      const currentEntry = currentByTag.get(repair.tag);
      if (baseTags.has(repair.tag) || currentEntry?.when !== repair.when) {
        return [];
      }

      const sql = fs
        .readFileSync(path.join(migrationDirectory, repair.fileName), "utf8")
        .replaceAll("\r\n", "\n");
      const sha256 = createHash("sha256").update(sql).digest("hex");
      if (sha256 !== repair.sha256) {
        failures.push(
          `${repair.tag} historical repair checksum changed from ${repair.sha256} to ${sha256}`
        );
        return [];
      }

      return [{ tag: repair.tag, when: repair.when }];
    });

    failures.push(
      ...findAppendOnlyMigrationHistoryFailures(baseEntries, currentEntries, {
        allowedHistoricalInsertions
      })
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
