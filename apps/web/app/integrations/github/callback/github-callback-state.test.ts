import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { GitHubProjectConnectionTarget, GitHubRepositoryCandidate } from "@sketchcatch/types";
import { selectCallbackTarget } from "./github-callback-state.js";

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

test("callback target selection never falls back to another Repository", () => {
  const target: GitHubProjectConnectionTarget = { owner: "owner", name: "repo" };
  assert.equal(selectCallbackTarget([candidate("owner/other")], target), null);
  assert.equal(selectCallbackTarget([candidate("Owner/Repo")], target)?.fullName, "Owner/Repo");
});

test("callback connects the exact Repository and returns without duplicate deployment settings", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /connectGitHubSourceRepository/);
  assert.match(source, /router\.replace\(`\/workspace\/repository\?/);
  assert.doesNotMatch(source, /ProjectDeploymentTargetSettingsClient/);
  assert.doesNotMatch(source, /ProjectCicdMonitoringSettingsClient/);
  assert.doesNotMatch(source, /설정 저장 후 계속/);
});
