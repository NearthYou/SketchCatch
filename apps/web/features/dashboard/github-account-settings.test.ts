import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const githubSettingsUrl = new URL(
  "../../app/dashboard/settings/github-account-settings.tsx",
  import.meta.url
);

test("global settings owns GitHub App installation without project repository behavior", () => {
  assert.equal(existsSync(fileURLToPath(githubSettingsUrl)), true);
  const source = readFileSync(fileURLToPath(githubSettingsUrl), "utf8");

  assert.match(source, /GitHub 계정 연결/);
  assert.match(source, /listGitHubAccountInstallations/);
  assert.match(source, /createGitHubAccountInstallUrl/);
  assert.doesNotMatch(
    source,
    /projectId|SourceRepository|analyzeSourceRepository|connectGitHubSourceRepository/
  );
});

test("GitHub account settings renders immediately after connected AWS accounts", () => {
  const source = readWorkspaceFile("app/dashboard/settings/settings-dashboard-client.tsx");
  const awsConnectionsIndex = source.indexOf("연결된 AWS 계정");
  const githubSettingsIndex = source.indexOf("<GitHubAccountSettings />");

  assert.ok(awsConnectionsIndex >= 0);
  assert.ok(githubSettingsIndex > awsConnectionsIndex);
});

function readWorkspaceFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}
