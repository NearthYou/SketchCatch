import assert from "node:assert/strict";
import test from "node:test";
import type { RepositoryAnalysisRecord, SourceRepository } from "@sketchcatch/types";
import { getDeliveryRepositoryPresentationState } from "./delivery-repository-state";

const analysisTarget = {
  owner: "sketchcatch",
  name: "demo",
  branch: "main"
} as RepositoryAnalysisRecord;
const sourceRepository = {
  id: "source-1",
  owner: "sketchcatch",
  name: "demo",
  defaultBranch: "main"
} as SourceRepository;

test("shows the exact attached Repository as automatically applied", () => {
  const state = getDeliveryRepositoryPresentationState({
    repositoryAnalysisTarget: analysisTarget,
    sourceRepository
  });

  assert.equal(state.kind, "connected");
  if (state.kind === "connected") assert.equal(state.repository.id, "source-1");
});

test("keeps Board provenance visible when PR permission still needs connection", () => {
  const state = getDeliveryRepositoryPresentationState({
    repositoryAnalysisTarget: analysisTarget,
    sourceRepository: null
  });

  assert.equal(state.kind, "connection_required");
  if (state.kind === "connection_required") {
    assert.equal(state.analysisTarget.name, "demo");
  }
});

test("reports not selected only when neither source nor provenance exists", () => {
  assert.equal(getDeliveryRepositoryPresentationState({
    repositoryAnalysisTarget: null,
    sourceRepository: null
  }).kind, "not_selected");
});
