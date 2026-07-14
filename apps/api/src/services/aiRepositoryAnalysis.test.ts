import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRepositoryEvidence } from "./aiRepositoryAnalysis.js";

test("repository analysis recommends the deployable three-tier template from database evidence", () => {
  const result = analyzeRepositoryEvidence({
    defaultBranch: "main",
    evidence: [
      {
        content: JSON.stringify({ dependencies: { express: "latest", prisma: "latest" } }),
        path: "package.json"
      }
    ],
    repositoryUrl: "https://github.com/example/api"
  });

  assert.equal(result.recommendedTemplateId, "three-tier-web-app");
  assert.deepEqual(result.availableBranches, ["main"]);
  assert.deepEqual(result.detectedSignals, ["Node API", "Database"]);
  assert.deepEqual(result.evidenceFiles, [{ found: true, path: "package.json" }]);
});

test("repository analysis does not invent a recommendation without evidence", () => {
  const result = analyzeRepositoryEvidence({
    defaultBranch: "develop",
    evidence: [],
    repositoryUrl: "https://github.com/example/unknown"
  });

  assert.equal(result.recommendedTemplateId, null);
  assert.deepEqual(result.detectedSignals, []);
  assert.match(result.recommendationReason, /직접 선택/);
});

test("repository analysis keeps Python APIs and container-only repositories on deployable templates", () => {
  const pythonApi = analyzeRepositoryEvidence({
    defaultBranch: "main",
    evidence: [{ content: "fastapi==latest", path: "requirements.txt" }],
    repositoryUrl: "https://github.com/example/python-api"
  });
  const containerApp = analyzeRepositoryEvidence({
    defaultBranch: "main",
    evidence: [{ content: "FROM node:24-alpine", path: "Dockerfile" }],
    repositoryUrl: "https://github.com/example/container-app"
  });

  assert.equal(pythonApi.recommendedTemplateId, "three-tier-web-app");
  assert.equal(containerApp.recommendedTemplateId, "ecs-fargate-container-app");
});
