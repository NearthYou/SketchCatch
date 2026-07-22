import assert from "node:assert/strict";
import test from "node:test";
import { selectProjectDeliverySourceRepository } from "./project-delivery-source-repository.js";

const oldRepository = { id: "source-old", owner: "team", name: "old" };
const boardRepository = { id: "source-board", owner: "team", name: "app" };

test("selects only the active Repository attached to the current Board", () => {
  const selected = selectProjectDeliverySourceRepository({
    repositoryAnalysisTarget: { sourceRepositoryId: "source-board" },
    activeRepositories: [oldRepository, boardRepository]
  });

  assert.equal(selected, boardRepository);
});

test("does not fall back when the current Board has no attached Source Repository", () => {
  const selected = selectProjectDeliverySourceRepository({
    repositoryAnalysisTarget: { sourceRepositoryId: null },
    activeRepositories: [oldRepository]
  });

  assert.equal(selected, null);
});

test("does not fall back when the attached Source Repository is no longer active", () => {
  const selected = selectProjectDeliverySourceRepository({
    repositoryAnalysisTarget: { sourceRepositoryId: "source-board" },
    activeRepositories: [oldRepository]
  });

  assert.equal(selected, null);
});

test("uses the active project Repository when no Board provenance exists", () => {
  const selected = selectProjectDeliverySourceRepository({
    repositoryAnalysisTarget: null,
    activeRepositories: [oldRepository]
  });

  assert.equal(selected, oldRepository);
});
