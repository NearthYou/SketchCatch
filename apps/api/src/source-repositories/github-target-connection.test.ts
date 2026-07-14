import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import type { GitHubAppClient } from "./github-app-client.js";
import { createGitHubAppState } from "./github-app-state.js";

import {
  connectGitHubSourceRepository,
  findTargetGitHubRepository,
  type SourceRepositoryRecord,
  type SourceRepositoryRepository
} from "./source-repository-service.js";

const stateSecret = "github-app-state-secret-at-least-thirty-two-characters";

function candidate(fullName: string): GitHubRepositoryCandidate {
  const [owner = "", name = ""] = fullName.split("/");

  return {
    githubRepositoryId: fullName,
    owner,
    name,
    fullName,
    defaultBranch: "main",
    repositoryUrl: `https://github.com/${fullName}`,
    visibility: "public",
    archived: false
  };
}

test("target matching returns only the analyzed GitHub Repository", () => {
  const target = findTargetGitHubRepository(
    [candidate("NearthYou/SketchCatch"), candidate("NearthYou/Other")],
    { owner: "nearthyou", name: "sketchcatch" }
  );

  assert.equal(target?.fullName, "NearthYou/SketchCatch");
});

test("target matching does not fall back to another Repository", () => {
  assert.equal(
    findTargetGitHubRepository(
      [candidate("NearthYou/Other")],
      { owner: "nearthyou", name: "sketchcatch" }
    ),
    null
  );
});

test("connecting the same active target is idempotent", async () => {
  const target = candidate("NearthYou/SketchCatch");
  const existing = {
    id: "source-repository-1",
    projectId: "project-1",
    createdByUserId: "user-1",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: target.githubRepositoryId
  } as SourceRepositoryRecord;
  const createdRecords: unknown[] = [];
  const repository = {
    async findGitHubProviderUserId() {
      return "github-user-1";
    },
    async findAccessibleProject() {
      return {} as never;
    },
    async listProjectSourceRepositories() {
      return [existing];
    },
    async findProjectSourceRepository() {
      return existing;
    },
    async createActiveGitHubSourceRepository(input: unknown) {
      createdRecords.push(input);
      return existing;
    },
    async saveProjectSourceRepositoryAnalysis() {
      return existing;
    }
  } satisfies SourceRepositoryRepository;
  const githubAppClient = {
    async listInstallations() {
      return [{
        installationId: "installation-1",
        accountId: "github-user-1",
        accountLogin: "NearthYou",
        accountType: "User",
        repositorySelection: "selected" as const,
        htmlUrl: null
      }];
    },
    async listInstallationRepositories() {
      return [target];
    }
  } as unknown as GitHubAppClient;
  const { state } = await createGitHubAppState({
    scope: "project",
    projectId: "project-1",
    userId: "user-1",
    targetRepository: { owner: "NearthYou", name: "SketchCatch" },
    resumeKey: "resume-12345678",
    secret: stateSecret
  });

  const connected = await connectGitHubSourceRepository(
    {
      projectId: "project-1",
      installationId: "installation-1",
      githubRepositoryId: target.githubRepositoryId,
      state,
      accessContext: { kind: "user", userId: "user-1" },
      stateSecret
    },
    repository,
    githubAppClient
  );

  assert.equal(connected.id, existing.id);
  assert.equal(createdRecords.length, 0);
});
