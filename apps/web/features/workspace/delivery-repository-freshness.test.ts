import assert from "node:assert/strict";
import test from "node:test";
import type { RepositoryAnalysisRecord, SourceRepository } from "@sketchcatch/types";
import { getDeliveryRepositoryFreshness } from "./delivery-repository-freshness.js";

test("reports a SHA mismatch as a non-blocking change", () => {
  const result = getDeliveryRepositoryFreshness(
    { repositoryRevision: "a".repeat(40) } as RepositoryAnalysisRecord,
    { analysis: { repositoryRevision: "b".repeat(40) } } as SourceRepository
  );

  assert.equal(result.status, "changed");
  assert.equal(result.analyzedRevision, "a".repeat(40));
  assert.equal(result.currentRevision, "b".repeat(40));
});

test("does not claim freshness without an authenticated current revision", () => {
  const result = getDeliveryRepositoryFreshness(
    { repositoryRevision: "a".repeat(40) } as RepositoryAnalysisRecord,
    null
  );

  assert.deepEqual(result, {
    status: "unknown",
    analyzedRevision: "a".repeat(40),
    currentRevision: null
  });
});
