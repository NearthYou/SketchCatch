import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const migrationDirectory = path.join(process.cwd(), "apps/api/drizzle");
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

if (failures.length > 0) {
  for (const failure of failures) console.error(`Migration compatibility check failed: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Migration compatibility check passed for revisions ${String(policyStartRevision).padStart(4, "0")} and later.`
  );
}
