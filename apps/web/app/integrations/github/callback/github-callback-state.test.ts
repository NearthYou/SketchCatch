import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { GitHubProjectConnectionTarget, GitHubRepositoryCandidate } from "@sketchcatch/types";

import {
  canResumeRepositoryAnalysis,
  createCallbackEcsDefaults,
  saveCallbackSettings,
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
      recommendationReason: "Dockerfile",
      aiHandoff: {
        status: "template_selected",
        templateId: "ecs-fargate-container-app",
        selectionReasons: ["Container API and Vite frontend"],
        applicationUnits: [
          {
            id: "api",
            rootPath: "apps/api",
            kind: "backend",
            frameworks: ["Express"],
            evidencePaths: ["apps/api/package.json", "apps/api/Dockerfile"]
          },
          {
            id: "web",
            rootPath: "apps/web",
            kind: "frontend",
            frameworks: ["React", "Vite"],
            evidencePaths: ["apps/web/package.json"]
          }
        ],
        evidence: [
          { kind: "package_json", path: "package.json", applicationUnitId: null, signals: [] },
          { kind: "lockfile", path: "package-lock.json", applicationUnitId: null, signals: [] },
          { kind: "dockerfile", path: "apps/api/Dockerfile", applicationUnitId: "api", signals: [] },
          { kind: "package_json", path: "apps/web/package.json", applicationUnitId: "web", signals: ["React", "Vite"] },
          { kind: "static_output", path: "apps/web/dist", applicationUnitId: "web", signals: ["Vite static build output"] }
        ],
        missingEvidence: []
      }
    },
    selectedTemplateId: "three-tier-web-app",
    deploymentType: "container",
    answers: {},
    stage: "configuration"
  };

  assert.deepEqual(createCallbackEcsDefaults(resume), {
    projectName: "Audience Live Check",
    repositoryRevision: "a".repeat(40),
    sourceRoot: ".",
    dockerfilePath: "apps/api/Dockerfile",
    ecsWeb: {
      api: {
        sourceRoot: ".",
        dockerfilePath: "apps/api/Dockerfile",
        containerPort: 8080,
        healthCheckPath: "/health"
      },
      frontend: {
        sourceRoot: "apps/web",
        packageManifestPath: "apps/web/package.json",
        lockfilePath: "package-lock.json",
        packageManager: "npm",
        packageManagerVersion: "10.9.2",
        installPreset: "npm_ci",
        buildPreset: "npm_build",
        outputPath: "apps/web/dist"
      }
    }
  });
});

test("callback uses one polished completion action instead of child save buttons", () => {
  const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const styleSource = readFileSync(
    new URL("./github-callback.module.css", import.meta.url),
    "utf8"
  );
  const hiddenSaveButtons = pageSource.match(/showSaveButton=\{false\}/g) ?? [];

  assert.equal(hiddenSaveButtons.length, 2);
  assert.match(pageSource, /onClick=\{saveSettingsAndReturn\}/);
  assert.match(pageSource, /설정 저장 후 계속/);
  assert.match(pageSource, /설정 저장 중/);
  assert.match(pageSource, /styles\.completionPanel/);
  assert.match(pageSource, /styles\.completionButton/);
  assert.match(styleSource, /\.completionButton\s*\{[^}]*min-height:\s*48px/s);
  assert.match(styleSource, /\.completionButton:focus-visible/);
  assert.match(
    styleSource,
    /@media \(max-width:\s*640px\)[\s\S]*\.completionButton\s*\{[^}]*width:\s*100%/s
  );
  assert.doesNotMatch(pageSource, /onSaved=/);
});

test("single confirmation saves deployment target before GitOps monitoring", async () => {
  const order: string[] = [];

  const saved = await saveCallbackSettings({
    saveDeploymentTarget: async () => {
      order.push("deployment-target");
      return true;
    },
    saveGitOpsMonitoring: async () => {
      order.push("gitops-monitoring");
      return true;
    }
  });

  assert.equal(saved, true);
  assert.deepEqual(order, ["deployment-target", "gitops-monitoring"]);
});

test("single confirmation stops before GitOps monitoring when target save fails", async () => {
  let monitoringCalled = false;

  const saved = await saveCallbackSettings({
    saveDeploymentTarget: async () => false,
    saveGitOpsMonitoring: async () => {
      monitoringCalled = true;
      return true;
    }
  });

  assert.equal(saved, false);
  assert.equal(monitoringCalled, false);
});
