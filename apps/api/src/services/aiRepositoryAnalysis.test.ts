import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRepositoryEvidence } from "./aiRepositoryAnalysis.js";

test("repository analysis recommends the database template from package evidence", () => {
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

  assert.equal(result.recommendedTemplateId, "template-api-db");
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
