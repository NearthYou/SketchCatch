import assert from "node:assert/strict";
import test from "node:test";
import type {
  RepositoryAnalysisAiHandoff,
  SourceRepositoryAnalysisResult
} from "@sketchcatch/types";

import { resolveCurrentRepositoryAnalysis } from "./current-repository-analysis.js";

const legacyAnalysis: RepositoryAnalysisAiHandoff = {
  status: "template_selection_failed",
  templateId: null,
  mismatchReasons: [],
  applicationUnits: [],
  evidence: [{
    kind: "dockerfile",
    path: "legacy/Dockerfile",
    applicationUnitId: null,
    signals: []
  }],
  missingEvidence: []
};

test("uses the legacy analysis only when no RepositoryAnalysisRecord was queried", () => {
  assert.deepEqual(
    resolveCurrentRepositoryAnalysis({
      legacyAnalysisRevision: "b".repeat(40),
      legacyAnalysisResult: legacyAnalysis
    }),
    {
      analysisRevision: "b".repeat(40),
      analysisResult: legacyAnalysis
    }
  );
});

test("uses the legacy analysis when a left join returns an empty RepositoryAnalysisRecord", () => {
  assert.deepEqual(
    resolveCurrentRepositoryAnalysis({
      legacyAnalysisRevision: "b".repeat(40),
      legacyAnalysisResult: legacyAnalysis,
      repositoryAnalysisRevision: null,
      repositoryAnalysisResult: null
    }),
    {
      analysisRevision: "b".repeat(40),
      analysisResult: legacyAnalysis
    }
  );
});

test("prefers the linked RepositoryAnalysisRecord over stale legacy analysis", () => {
  const revision = "a".repeat(40);
  const repositoryAnalysisResult = createRepositoryAnalysisResult(revision);

  const result = resolveCurrentRepositoryAnalysis({
    legacyAnalysisRevision: "b".repeat(40),
    legacyAnalysisResult: legacyAnalysis,
    repositoryAnalysisRevision: revision,
    repositoryAnalysisResult
  });

  assert.equal(result.analysisRevision, revision);
  assert.equal(result.analysisResult, repositoryAnalysisResult.aiHandoff);
});

test("fails closed when the RepositoryAnalysisRecord revision and payload diverge", () => {
  const result = resolveCurrentRepositoryAnalysis({
    legacyAnalysisRevision: "b".repeat(40),
    legacyAnalysisResult: legacyAnalysis,
    repositoryAnalysisRevision: "a".repeat(40),
    repositoryAnalysisResult: createRepositoryAnalysisResult("c".repeat(40))
  });

  assert.deepEqual(result, {
    analysisRevision: "a".repeat(40),
    analysisResult: null
  });
});

function createRepositoryAnalysisResult(revision: string): SourceRepositoryAnalysisResult {
  return {
    repositoryUrl: "https://github.com/sketchcatch/app",
    repositoryRevision: revision,
    defaultBranch: "main",
    availableBranches: ["main"],
    evidenceFiles: [],
    detectedSignals: [],
    recommendedTemplateId: null,
    recommendationReason: "",
    aiHandoff: {
      status: "template_selection_failed",
      templateId: null,
      mismatchReasons: [],
      applicationUnits: [],
      evidence: [{
        kind: "dockerfile",
        path: "apps/api/Dockerfile",
        applicationUnitId: null,
        signals: []
      }],
      missingEvidence: []
    }
  };
}
