import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubProjectConnectionTarget, GitHubRepositoryCandidate } from "@sketchcatch/types";

import {
  canResumeRepositoryAnalysis,
  selectCallbackTarget
} from "./github-callback-state.js";

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

test("callback waits for both required settings", () => {
  assert.equal(
    canResumeRepositoryAnalysis({
      deploymentTargetSaved: true,
      gitOpsMonitoringSaved: false
    }),
    false
  );
  assert.equal(
    canResumeRepositoryAnalysis({
      deploymentTargetSaved: true,
      gitOpsMonitoringSaved: true
    }),
    true
  );
});

test("callback target selection never falls back to another Repository", () => {
  const target: GitHubProjectConnectionTarget = { owner: "owner", name: "repo" };

  assert.equal(selectCallbackTarget([candidate("owner/other")], target), null);
  assert.equal(selectCallbackTarget([candidate("Owner/Repo")], target)?.fullName, "Owner/Repo");
});
