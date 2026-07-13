import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceRepository } from "@sketchcatch/types";
import { buildRepositoryTemplateFallbackDraftRequest } from "./repository-template-fallback";

test("buildRepositoryTemplateFallbackDraftRequest creates an AI request without templateId", () => {
  const request = buildRepositoryTemplateFallbackDraftRequest({
    additionalRequirements: "",
    ciCdEnabled: true,
    deploymentType: "git_cicd_deployment",
    dynamicQuestionAnswers: [
      {
        questionId: "runtime",
        question: "Runtime",
        answer: "Managed containers"
      }
    ],
    projectId: "project-1",
    repository: createSourceRepository()
  });

  assert.equal(request.templateId, undefined);
  assert.deepEqual(request.repositoryAnalysis, {
    projectId: "project-1",
    sourceRepositoryId: "repo-1"
  });
  assert.equal(request.templateFallback?.mode, "template_unselected");
  assert.equal(request.templateFallback?.ciCdEnabled, true);
  assert.equal(request.templateFallback?.additionalRequirements, undefined);
  assert.match(request.prompt, /The user did not choose any recommended Template/);
  assert.match(request.prompt, /Managed containers/);
  assert.match(request.prompt, /Additional requirements:\n- none/);
});

function createSourceRepository(): SourceRepository {
  return {
    id: "repo-1",
    projectId: "project-1",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "github-repo-1",
    owner: "NearthYou",
    name: "mini-react",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/NearthYou/mini-react",
    visibility: "public",
    archived: false,
    analysis: {
      repositoryRevision: "abc123",
      analyzedAt: "2026-07-12T00:00:00.000Z",
      aiHandoff: {
        status: "template_selected",
        templateId: "static-web-hosting",
        applicationUnits: [],
        evidence: [],
        missingEvidence: [],
        selectionReasons: ["static frontend"]
      }
    },
    disconnectedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z"
  };
}
