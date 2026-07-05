import assert from "node:assert/strict";
import { test } from "node:test";
import type { TerraformDiagnostic } from "@sketchcatch/types";
import {
  createTerraformDiagnosticKey,
  createTerraformIssuesStorageKey,
  markTerraformIssuesStale,
  mergeTerraformValidationDiagnostics,
  readStoredTerraformIssues,
  storeTerraformIssues,
  type TerraformIssueRecord
} from "./terraform-issues-state";

test("mergeTerraformValidationDiagnostics keeps latest diagnostics and removes resolved issues", () => {
  const now = "2026-07-05T00:00:00.000Z";
  const staleIssue = createIssue({
    code: "terraform.trailing_comma",
    line: 2,
    message: "Trailing comma",
    severity: "error"
  });
  const nextDiagnostic: TerraformDiagnostic = {
    code: "terraform.quoted_reference",
    line: 4,
    message: "Quoted reference",
    severity: "warning"
  };

  const merged = mergeTerraformValidationDiagnostics([staleIssue], [nextDiagnostic], now);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.diagnostic.code, "terraform.quoted_reference");
  assert.equal(merged[0]?.isStale, false);
  assert.equal(merged[0]?.lastValidatedAt, now);
});

test("markTerraformIssuesStale keeps issues visible while code is edited", () => {
  const issue = createIssue({
    code: "terraform.trailing_comma",
    line: 2,
    message: "Trailing comma",
    severity: "error"
  });

  const staleIssues = markTerraformIssuesStale([issue]);

  assert.equal(staleIssues.length, 1);
  assert.equal(staleIssues[0]?.isStale, true);
  assert.equal(staleIssues[0]?.diagnostic.code, "terraform.trailing_comma");
});

test("storeTerraformIssues and readStoredTerraformIssues persist project-scoped records", () => {
  const storage = new MemoryStorage();
  const projectId = "project-123";
  const issue = createIssue({
    code: "terraform.trailing_comma",
    line: 2,
    message: "Trailing comma",
    severity: "error"
  });

  storeTerraformIssues(storage, projectId, [issue]);

  assert.equal(storage.lastKey, createTerraformIssuesStorageKey(projectId));
  assert.deepEqual(readStoredTerraformIssues(storage, projectId), [issue]);
});

test("readStoredTerraformIssues returns empty state for invalid storage payloads", () => {
  const storage = new MemoryStorage();
  storage.setItem(createTerraformIssuesStorageKey("project-123"), "{bad json");

  assert.deepEqual(readStoredTerraformIssues(storage, "project-123"), []);
});

function createIssue(diagnostic: TerraformDiagnostic): TerraformIssueRecord {
  return {
    diagnostic,
    diagnosticKey: createTerraformDiagnosticKey(diagnostic),
    isStale: false,
    lastSeenAt: "2026-07-05T00:00:00.000Z",
    lastValidatedAt: "2026-07-05T00:00:00.000Z"
  };
}

class MemoryStorage implements Storage {
  lastKey = "";
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.lastKey = key;
    this.values.set(key, value);
  }
}

