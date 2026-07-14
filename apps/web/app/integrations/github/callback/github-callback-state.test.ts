import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { GitHubProjectConnectionTarget, GitHubRepositoryCandidate } from "@sketchcatch/types";

import {
  canResumeRepositoryAnalysis,
  createCallbackEcsDefaults,
  selectCallbackTarget
} from "./github-callback-state.js";
import type { RepositoryAnalysisResumeState } from "../../../workspace/repository/repository-analysis-resume.js";

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

test("callback creates ECS defaults even when another architecture was selected", () => {
  const resume: RepositoryAnalysisResumeState = {
    schemaVersion: 1,
    resumeKey: "resume-12345678",
    createdAt: "2026-07-15T00:00:00.000Z",
    projectId: "project-1",
    projectName: "Audience Live Check",
    repositoryUrl: "https://github.com/example/audience-live-check",
    defaultBranch: "main",
    publicAnalysis: {
      repositoryUrl: "https://github.com/example/audience-live-check",
      repositoryRevision: "a".repeat(40),
      defaultBranch: "main",
      availableBranches: ["main"],
      evidenceFiles: [{ path: "apps/api/Dockerfile", found: true }],
      detectedSignals: ["Container"],
      recommendedTemplateId: "ecs-fargate-container-app",
      recommendationReason: "Dockerfile"
    },
    selectedTemplateId: "three-tier-web-app",
    deploymentType: "container",
    answers: {},
    stage: "configuration"
  };

  assert.deepEqual(createCallbackEcsDefaults(resume), {
    projectName: "Audience Live Check",
    repositoryRevision: "a".repeat(40),
    sourceRoot: "apps/api",
    dockerfilePath: "apps/api/Dockerfile"
  });
});

test("return indicator state cannot cancel the scheduled Repository redirect", () => {
  const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const redirectEffect = pageSource.match(
    /useEffect\(\(\) => \{[\s\S]*?setIsReturning\(true\);[\s\S]*?\}, \[([\s\S]*?)\]\);/
  );

  assert.ok(redirectEffect, "redirect effect must exist");
  assert.doesNotMatch(
    redirectEffect[1] ?? "",
    /\bisReturning\b/,
    "isReturning rerenders must not clean up the pending redirect timer"
  );
});
