import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readSettingsFile("page.tsx");
const clientSource = readSettingsFile("project-github-settings-client.tsx");

test("project settings owns GitHub source repository setup", () => {
  assert.match(pageSource, /ProjectGitHubSettingsClient/);
  assert.match(clientSource, /listSourceRepositories\(projectId\)/);
  assert.match(clientSource, /activeRepository/);
  assert.match(clientSource, /connectGitHubSourceRepository/);
  assert.match(clientSource, /createGitHubSourceRepositoryInstallUrl/);
});

test("project GitHub settings lists existing installation repositories before install handoff", () => {
  const listIndex = clientSource.indexOf("async function loadInstalledRepositories");
  const installIndex = clientSource.indexOf("async function openGitHubInstallation");

  assert.ok(listIndex > -1);
  assert.ok(installIndex > listIndex);
  assert.match(clientSource, /listGitHubInstalledRepositories\(projectId\)/);
  assert.match(clientSource, /installedRepositories\.map/);
  assert.match(clientSource, /GitHub App 설치\/권한 추가/);
});

function readSettingsFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
