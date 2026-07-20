import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepositoryAnalysisAiHandoff } from "@sketchcatch/types";
import { getRepositoryTemplateApplicationContract } from "./repository-template-application-contract";

test("repository application contract carries frontend and health evidence", () => {
  const handoff: RepositoryAnalysisAiHandoff = {
    status: "template_selected",
    templateId: "ecs-fargate-container-app",
    selectionReasons: ["repository evidence"],
    applicationUnits: [
      {
        id: "api",
        kind: "backend",
        rootPath: "apps/api",
        frameworks: ["express"],
        evidencePaths: ["apps/api/package.json"]
      },
      {
        id: "web",
        kind: "frontend",
        rootPath: "apps/web",
        frameworks: ["vite"],
        evidencePaths: ["apps/web/package.json"]
      }
    ],
    evidence: [],
    architectureFacts: [
      { kind: "health_check", value: "http:8080/health", sourcePath: "apps/api/src/app.ts" },
      { kind: "frontend_delivery", value: "s3_cloudfront_static", sourcePath: "apps/web" }
    ],
    missingEvidence: []
  };

  assert.deepEqual(getRepositoryTemplateApplicationContract(handoff), {
    includeFrontend: true,
    containerPort: 8080,
    healthCheckPath: "/health"
  });
});
