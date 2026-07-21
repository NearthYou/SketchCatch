import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGitCicdHandoffSourceRepositoryMatchesBoard,
  createGitCicdHandoff,
  GitCicdHandoffProviderConflictError,
  type GitCicdHandoffProvider,
  type GitCicdHandoffRepository
} from "./git-cicd-handoff-service.js";

test("allows no Board record and an exact Board Repository", () => {
  assert.doesNotThrow(() => assertGitCicdHandoffSourceRepositoryMatchesBoard({
    repositoryAnalysisTarget: undefined,
    requestedSourceRepositoryId: "source-requested"
  }));
  assert.doesNotThrow(() => assertGitCicdHandoffSourceRepositoryMatchesBoard({
    repositoryAnalysisTarget: { sourceRepositoryId: "source-requested" },
    requestedSourceRepositoryId: "source-requested"
  }));
});

test("rejects a Board record whose Repository is not attached", () => {
  assert.throws(
    () => assertGitCicdHandoffSourceRepositoryMatchesBoard({
      repositoryAnalysisTarget: { sourceRepositoryId: null },
      requestedSourceRepositoryId: "source-requested"
    }),
    (error) =>
      error instanceof GitCicdHandoffProviderConflictError &&
      error.code === "GIT_CICD_SOURCE_REPOSITORY_MISMATCH"
  );
});

test("rejects a Repository that differs from current Board provenance before provider invocation", async () => {
  let providerCreateCount = 0;
  const repository = {
    async findAccessibleProject() {
      return { id: "project-1" };
    },
    async findArchitectureInProject() {
      return { id: "architecture-1" };
    },
    async findTerraformArtifactForArchitecture() {
      return { id: "terraform-1" };
    },
    async findActiveSourceRepository() {
      return { id: "source-requested" };
    },
    async findRepositoryAnalysisTarget() {
      return { sourceRepositoryId: "source-board" };
    }
  } as unknown as GitCicdHandoffRepository;
  const provider: GitCicdHandoffProvider = {
    async createHandoff() {
      providerCreateCount += 1;
      throw new Error("provider must not be called");
    }
  };

  await assert.rejects(
    createGitCicdHandoff({
      projectId: "project-1",
      accessContext: { kind: "user", userId: "user-1" },
      architectureId: "architecture-1",
      terraformArtifactId: "terraform-1",
      sourceRepositoryId: "source-requested",
      userAcceptedChangeId: "accepted-change-1"
    }, repository, provider),
    (error) =>
      error instanceof GitCicdHandoffProviderConflictError &&
      error.code === "GIT_CICD_SOURCE_REPOSITORY_MISMATCH"
  );
  assert.equal(providerCreateCount, 0);
});
