import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceRepository } from "@sketchcatch/types";
import { buildBoardTemplateDiagram } from "../resource-settings/template-library";
import { resolveRepositoryAnalysisTemplate } from "./repository-template-handoff";

test("Repository handoff carries required runtime Secrets into the initial Board", () => {
  const resolved = resolveRepositoryAnalysisTemplate(
    [createAnalyzedRepository()],
    {
      sourceRepositoryId: "repository-1",
      requestedTemplateId: "ecs-fargate-container-app"
    }
  );

  assert.equal(resolved.id, "ecs-fargate-container-app");
  assert.deepEqual(resolved.requiredRuntimeSecrets, ["CHECK_IN_SIGNING_SECRET"]);

  const diagram = buildBoardTemplateDiagram(resolved.id, {
    projectSlug: "audience-live-check",
    shortId: "workspace",
    requiredRuntimeSecrets: resolved.requiredRuntimeSecrets
  });
  assert.ok(
    diagram?.nodes.some(
      (node) => node.parameters?.resourceType === "aws_secretsmanager_secret_version"
    )
  );
});

function createAnalyzedRepository(): SourceRepository {
  return {
    id: "repository-1",
    projectId: "project-1",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "github-repository-1",
    owner: "jh-9999",
    name: "audience-live-check",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/jh-9999/audience-live-check",
    visibility: "public",
    archived: false,
    analysis: {
      repositoryRevision: "515d1fcaaa24a2a0fe922f10dfdd756caabe3f17",
      analyzedAt: "2026-07-20T00:00:00.000Z",
      aiHandoff: {
        status: "template_selected",
        templateId: "ecs-fargate-container-app",
        selectionReasons: ["ECS Fargate evidence"],
        applicationUnits: [],
        evidence: [],
        architectureFacts: [
          {
            kind: "runtime_secret",
            value: "CHECK_IN_SIGNING_SECRET",
            sourcePath: "README.md"
          }
        ],
        missingEvidence: []
      }
    },
    disconnectedAt: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z"
  };
}
