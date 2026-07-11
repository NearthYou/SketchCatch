import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AnalyzeSourceRepositoryResponse,
  SourceRepository
} from "@sketchcatch/types";
import {
  applyRepositoryAnalysis,
  canRunRepositoryAnalysis,
  findActiveGitHubRepository,
  shouldLoadProjectSettings
} from "./project-github-settings-state";
import { resolveRepositoryAnalysisTemplate } from "../../../../features/workspace/repository-template-handoff";

test("project settings waits for authentication before loading repository data", () => {
  assert.equal(shouldLoadProjectSettings("loading"), false);
  assert.equal(shouldLoadProjectSettings("unauthenticated"), false);
  assert.equal(shouldLoadProjectSettings("authenticated"), true);
});

test("Repository Analysis runs only for an active GitHub repository and blocks duplicates", () => {
  const activeRepository = createRepository();

  assert.equal(findActiveGitHubRepository([activeRepository]), activeRepository);
  assert.equal(canRunRepositoryAnalysis(activeRepository, "idle"), true);
  assert.equal(canRunRepositoryAnalysis(activeRepository, "loading"), false);
  assert.equal(
    findActiveGitHubRepository([
      createRepository({ provider: "internal" }),
      createRepository({ status: "inactive" })
    ]),
    null
  );
});

test("Repository Analysis response replaces only the matching repository's persisted result", () => {
  const activeRepository = createRepository();
  const untouchedRepository = createRepository({ id: "source-2", status: "inactive" });
  const result: AnalyzeSourceRepositoryResponse = {
    sourceRepositoryId: activeRepository.id,
    repositoryRevision: "abc123",
    analyzedAt: "2026-07-11T00:00:00.000Z",
    aiHandoff: {
      status: "template_selected",
      templateId: "static-web-hosting",
      applicationUnits: [
        {
          id: "web",
          rootPath: ".",
          kind: "frontend",
          frameworks: ["Vite"],
          evidencePaths: ["package.json"]
        }
      ],
      evidence: [
        {
          kind: "package_json",
          path: "package.json",
          applicationUnitId: "web",
          signals: ["vite"]
        }
      ],
      missingEvidence: ["dockerfile"],
      selectionReasons: ["Vite 정적 빌드가 감지되었습니다."]
    }
  };

  const updated = applyRepositoryAnalysis([activeRepository, untouchedRepository], result);

  assert.deepEqual(updated[0]?.analysis, {
    repositoryRevision: result.repositoryRevision,
    analyzedAt: result.analyzedAt,
    aiHandoff: result.aiHandoff
  });
  assert.equal(updated[1], untouchedRepository);
});

test("Workspace handoff resolves the stored Template and rejects a tampered URL Template", () => {
  const repository = createRepository({
    analysis: {
      repositoryRevision: "abc123",
      analyzedAt: "2026-07-11T00:00:00.000Z",
      aiHandoff: {
        status: "template_selected",
        templateId: "static-web-hosting",
        applicationUnits: [],
        evidence: [],
        missingEvidence: [],
        selectionReasons: ["정적 frontend evidence"]
      }
    }
  });

  const template = resolveRepositoryAnalysisTemplate([repository], {
    sourceRepositoryId: repository.id,
    requestedTemplateId: "static-web-hosting"
  });

  assert.equal(template.id, "static-web-hosting");
  assert.throws(
    () =>
      resolveRepositoryAnalysisTemplate([repository], {
        sourceRepositoryId: repository.id,
        requestedTemplateId: "three-tier-web-app"
      }),
    /REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH/
  );
});

function createRepository(overrides: Partial<SourceRepository> = {}): SourceRepository {
  return {
    id: "source-1",
    projectId: "project-1",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "repository-1",
    owner: "NearthYou",
    name: "mini-react",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/NearthYou/mini-react",
    visibility: "public",
    archived: false,
    analysis: null,
    disconnectedAt: null,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    ...overrides
  };
}
