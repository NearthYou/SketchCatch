import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function readWorkspaceFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}

test("project settings no longer owns repository connection", () => {
  const settingsSource = readWorkspaceFile("app/dashboard/projects/[projectId]/settings/page.tsx");
  const repositorySource = readWorkspaceFile(
    "app/projects/[projectId]/repository/project-source-repository-client.tsx"
  );

  assert.doesNotMatch(
    settingsSource,
    /ProjectGitHubSettingsClient|connectGitHubSourceRepository|analyzeSourceRepository/
  );
  assert.match(repositorySource, /connectGitHubSourceRepository|analyzeSourceRepository/);
});

test("source repository implementation no longer imports project settings modules", () => {
  const repositorySource = readWorkspaceFile(
    "app/projects/[projectId]/repository/project-source-repository-client.tsx"
  );

  assert.doesNotMatch(repositorySource, /\.\.\/settings\//);
  assert.match(repositorySource, /\.\/repository-analysis-result/);
});
