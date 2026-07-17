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
  const connectionQueriesSource = readWorkspaceFile(
    "features/dashboard/connection-queries.ts"
  );

  assert.match(source, /GitHub App 연결/);
  assert.match(source, /로그인 방식과 관계없이/);
  assert.match(source, /useGitHubInstallationsQuery/);
  assert.match(connectionQueriesSource, /export function useGitHubInstallationsQuery/);
  assert.match(connectionQueriesSource, /queryFn:\s*listGitHubAccountInstallations/);
  assert.match(source, /createGitHubAccountInstallUrl/);
  assert.match(source, /GitHub 연결하기/);
  assert.match(source, /installations\.length > 0\s*\? "권한 추가"\s*:\s*"GitHub 연결하기"/s);
  assert.doesNotMatch(
    source,
    /projectId|SourceRepository|analyzeSourceRepository|connectGitHubSourceRepository/
  );
});

test("GitHub account settings renders before AWS account and CodeBuild authorization", () => {
  const source = readWorkspaceFile("app/dashboard/settings/settings-dashboard-client.tsx");
  const githubSettingsIndex = source.indexOf("<GitHubAccountSettings />");
  const awsConnectionIndex = source.indexOf('id="aws-account-connection"');
  const codeBuildAuthorizationIndex = source.indexOf("<h2>AWS CodeBuild용 GitHub 권한</h2>");

  assert.ok(githubSettingsIndex >= 0);
  assert.ok(awsConnectionIndex > githubSettingsIndex);
  assert.ok(codeBuildAuthorizationIndex > awsConnectionIndex);
});

test("GitHub account icons stay bounded inside the settings header and action", () => {
  const styles = readWorkspaceFile("app/dashboard/dashboard-tools.module.css");

  assert.match(
    styles,
    /\.settingsSection > header > svg\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*flex:\s*0 0 20px;/s
  );
  assert.match(
    styles,
    /\.githubSettingsActions \.primaryAction > svg\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;[^}]*flex:\s*0 0 16px;/s
  );
});

function readWorkspaceFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
}
