import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitHubInstallationConnection,
  GitHubInstalledRepositoryCandidate,
  SourceRepository
} from "@sketchcatch/types";
import { selectRepositoryRecoveryAction } from "./repository-recovery-action";

const installation: GitHubInstallationConnection = {
  installationId: "installation-1",
  accountLogin: "sketchcatch",
  accountType: "Organization",
  repositorySelection: "selected",
  repositoryCount: 1,
  htmlUrl: "https://github.com/settings/installations/1"
};

test("Repository recovery asks for GitHub connection when no installation exists", () => {
  assert.deepEqual(selectRepositoryRecoveryAction(createInput()), { kind: "connect_github" });
});

test("Repository recovery asks for exact Repository permission on one installation", () => {
  assert.deepEqual(
    selectRepositoryRecoveryAction(createInput({ installations: [installation] })),
    {
      kind: "add_repository_permission",
      installationId: "installation-1",
      managementUrl: "https://github.com/settings/installations/1"
    }
  );
});

test("Repository recovery connects only an exact accessible Repository", () => {
  const candidate = createCandidate();
  assert.deepEqual(
    selectRepositoryRecoveryAction(createInput({
      candidates: [candidate],
      installations: [installation]
    })),
    {
      kind: "connect_exact_repository",
      candidate
    }
  );
});

test("Repository recovery reuses an exact active SourceRepository", () => {
  assert.deepEqual(
    selectRepositoryRecoveryAction(createInput({
      activeRepository: createSourceRepository(),
      installations: [installation]
    })),
    {
      kind: "analyze_connected_repository",
      sourceRepositoryId: "source-1"
    }
  );
});

test("Repository recovery does not guess between multiple installations", () => {
  assert.deepEqual(
    selectRepositoryRecoveryAction(createInput({
      installations: [
        installation,
        { ...installation, installationId: "installation-2", accountLogin: "another" }
      ]
    })),
    { kind: "resolve_multiple_installations" }
  );
});

test("Repository recovery does not pick an exact candidate from multiple installations", () => {
  assert.deepEqual(
    selectRepositoryRecoveryAction(createInput({
      candidates: [createCandidate()],
      installations: [
        installation,
        { ...installation, installationId: "installation-2", accountLogin: "another" }
      ]
    })),
    { kind: "resolve_multiple_installations" }
  );
});

function createInput(overrides: Partial<Parameters<typeof selectRepositoryRecoveryAction>[0]> = {}) {
  return {
    repositoryUrl: "https://github.com/SketchCatch/service",
    installations: [],
    candidates: [],
    activeRepository: null,
    ...overrides
  };
}

function createCandidate(): GitHubInstalledRepositoryCandidate {
  return {
    githubRepositoryId: "github-1",
    owner: "sketchcatch",
    name: "service",
    fullName: "sketchcatch/service",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/sketchcatch/service",
    visibility: "private",
    archived: false,
    installationId: "installation-1",
    installationAccountLogin: "sketchcatch",
    installationAccountType: "Organization",
    installationRepositorySelection: "selected",
    connectedSourceRepositoryId: null,
    connectedStatus: null
  };
}

function createSourceRepository(): SourceRepository {
  const now = "2026-07-17T00:00:00.000Z";
  return {
    id: "source-1",
    projectId: "project-1",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "github-1",
    owner: "sketchcatch",
    name: "service",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/sketchcatch/service",
    visibility: "private",
    archived: false,
    analysis: null,
    disconnectedAt: null,
    createdAt: now,
    updatedAt: now
  };
}
