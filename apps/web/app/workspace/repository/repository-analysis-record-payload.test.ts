import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRepositoryAnalysisResult } from "@sketchcatch/types";
import { createRepositoryAnalysisRecordPayload } from "./repository-analysis-record-payload";

test("Board provenance payload keeps the analyzed branch and normalizes GitHub identity", () => {
  const analysis: SourceRepositoryAnalysisResult = {
    repositoryUrl: "https://github.com/SketchCatch/Service.git",
    repositoryRevision: "A".repeat(40),
    defaultBranch: "release",
    availableBranches: ["main", "release"],
    evidenceFiles: [{ path: "package.json", found: true }],
    detectedSignals: ["node"],
    recommendedTemplateId: "ecs-fargate-container-app",
    recommendationReason: "Container evidence was found"
  };

  assert.deepEqual(
    createRepositoryAnalysisRecordPayload({
      analysis,
      analyzedAt: "2026-07-17T02:00:00.000Z",
      selectedTemplateId: "ecs-fargate-container-app"
    }),
    {
      provider: "github",
      repositoryUrl: "https://github.com/sketchcatch/service",
      owner: "sketchcatch",
      name: "service",
      branch: "release",
      repositoryRevision: "a".repeat(40),
      analysisResult: {
        ...analysis,
        repositoryUrl: "https://github.com/sketchcatch/service",
        repositoryRevision: "a".repeat(40)
      },
      selectedTemplateId: "ecs-fargate-container-app",
      analyzedAt: "2026-07-17T02:00:00.000Z"
    }
  );
});

test("Board provenance rejects a non-GitHub URL before saving", () => {
  assert.throws(
    () => createRepositoryAnalysisRecordPayload({
      analysis: {
        repositoryUrl: "https://example.com/owner/repository",
        repositoryRevision: "a".repeat(40),
        defaultBranch: "main",
        availableBranches: ["main"],
        evidenceFiles: [],
        detectedSignals: [],
        recommendedTemplateId: null,
        recommendationReason: ""
      },
      analyzedAt: "2026-07-17T02:00:00.000Z",
      selectedTemplateId: null
    }),
    /Invalid GitHub Repository URL/
  );
});
