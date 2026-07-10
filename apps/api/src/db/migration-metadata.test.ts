import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMigrationJournalFile,
  stripLeadingByteOrderMark
} from "./migration-metadata.js";

test("stripLeadingByteOrderMark removes only a leading BOM", () => {
  assert.equal(stripLeadingByteOrderMark("\uFEFF{\"version\":\"7\"}"), "{\"version\":\"7\"}");
  assert.equal(stripLeadingByteOrderMark("{\"\uFEFFversion\":\"7\"}"), "{\"\uFEFFversion\":\"7\"}");
});

test("normalizeMigrationJournalFile rewrites journal JSON without a leading BOM", () => {
  const directory = mkdtempSync(join(tmpdir(), "sketchcatch-migrations-"));

  try {
    mkdirSync(join(directory, "meta"));
    const journalPath = join(directory, "meta", "_journal.json");

    writeFileSync(journalPath, "\uFEFF{\n  \"version\": \"7\",\n  \"entries\": []\n}", "utf8");
    normalizeMigrationJournalFile(directory);

    const normalized = readFileSync(journalPath, "utf8");
    assert.equal(normalized.startsWith("\uFEFF"), false);
    assert.deepEqual(JSON.parse(normalized), { version: "7", entries: [] });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
