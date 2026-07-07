import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function normalizeMigrationJournalFile(migrationsFolder = "./drizzle"): void {
  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  const journal = readFileSync(journalPath, "utf8");
  const normalizedJournal = stripLeadingByteOrderMark(journal);

  if (normalizedJournal !== journal) {
    writeFileSync(journalPath, normalizedJournal, "utf8");
  }
}

export function stripLeadingByteOrderMark(value: string): string {
  return value.startsWith("\uFEFF") ? value.slice(1) : value;
}
