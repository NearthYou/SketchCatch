import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGitCicdRepositorySettings,
  assertCurrentGitCicdRepositorySettings,
  GitCicdRepositorySettingsConflictError
} from "./git-cicd-repository-settings-service.js";
import type {
  GitCicdHandoffRecord,
  GitCicdHandoffRepository
} from "./git-cicd-handoff-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";

function createPreview(projectIdValue: string, releaseApiUrl: string) {
  return {
    environmentName: "sketchcatch-production",
    variables: {
      SKETCHCATCH_PROJECT_ID: projectIdValue,
      SKETCHCATCH_RELEASE_API_URL: releaseApiUrl
    },
    secrets: [],
    workflowFiles: [".github/workflows/sketchcatch-app.yml"]
  };
}

test("repository settings accept the current project and a public HTTPS release API", () => {
  assert.doesNotThrow(() =>
    assertCurrentGitCicdRepositorySettings(
      createPreview(projectId, "https://sketchcatch.example.com"),
      projectId
    )
  );
});

test("repository settings reject a blank callback instead of retaining a stale GitHub variable", () => {
  assert.throws(
    () => assertCurrentGitCicdRepositorySettings(createPreview(projectId, ""), projectId),
    GitCicdRepositorySettingsConflictError
  );
});

test("repository settings reject a callback bound to a different project", () => {
  assert.throws(
    () =>
      assertCurrentGitCicdRepositorySettings(
        createPreview("22222222-2222-4222-8222-222222222222", "https://sketchcatch.example.com"),
        projectId
      ),
    GitCicdRepositorySettingsConflictError
  );
});

test("repository settings persist applied and verified evidence only after provider verification", async () => {
  const appliedAt = "2026-07-22T03:00:00.000Z";
  const preview = createPreview(projectId, "https://sketchcatch.example.com");
  const handoff = {
    id: "handoff-1",
    projectId,
    sourceRepositoryId: "repository-1",
    repositoryProvider: "github",
    repositorySettingsPreview: preview
  } as unknown as GitCicdHandoffRecord;
  const metadataUpdates: unknown[] = [];
  const repository = {
    async findAccessibleProject() {
      return { id: projectId };
    },
    async findHandoffById() {
      return handoff;
    },
    async findSourceRepositoryById() {
      return {
        id: "repository-1",
        projectId,
        provider: "github",
        status: "active",
        githubInstallationId: "installation-1",
        githubRepositoryId: "github-repository-1",
        owner: "sketchcatch",
        name: "example",
        defaultBranch: "main",
        repositoryUrl: "https://github.com/sketchcatch/example",
        analysisResult: null,
        analysisRevision: null,
        analyzedAt: null
      };
    },
    async updateHandoffAutomationMetadata(
      _handoffId: string,
      input: { repositorySettingsPreview?: GitCicdHandoffRecord["repositorySettingsPreview"] }
    ) {
      metadataUpdates.push(input);
      return {
        ...handoff,
        repositorySettingsPreview: input.repositorySettingsPreview ?? null
      } as GitCicdHandoffRecord;
    }
  } as unknown as GitCicdHandoffRepository;

  const result = await applyGitCicdRepositorySettings(
    {
      handoffId: handoff.id,
      accessContext: { kind: "user", userId: "user-1" }
    },
    repository,
    {
      async applyRepositorySettings() {
        return {
          applied: true,
          appliedAt,
          verified: true,
          environmentName: preview.environmentName,
          variables: Object.keys(preview.variables),
          secrets: preview.secrets,
          workflowFiles: preview.workflowFiles
        };
      }
    }
  );

  assert.equal(result.verified, true);
  assert.deepEqual(metadataUpdates, [{
    repositorySettingsPreview: {
      ...preview,
      applied: true,
      appliedAt,
      verified: true
    }
  }]);

  await assert.rejects(
    applyGitCicdRepositorySettings(
      {
        handoffId: handoff.id,
        accessContext: { kind: "user", userId: "user-1" }
      },
      {
        ...repository,
        async updateHandoffAutomationMetadata() {
          return handoff;
        }
      } as unknown as GitCicdHandoffRepository,
      {
        async applyRepositorySettings() {
          return result;
        }
      }
    ),
    (error: unknown) =>
      error instanceof GitCicdRepositorySettingsConflictError &&
      /not persisted/iu.test(error.message)
  );
});
