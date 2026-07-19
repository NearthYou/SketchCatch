import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCurrentGitCicdRepositorySettings,
  GitCicdRepositorySettingsConflictError
} from "./git-cicd-repository-settings-service.js";

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
