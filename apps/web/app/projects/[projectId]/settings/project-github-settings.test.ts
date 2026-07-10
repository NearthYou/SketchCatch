import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const pageSource = readDashboardSettingsPage();
const clientSource = readSettingsFile("project-github-settings-client.tsx");
const connectionPanelSource = readSettingsFile("github-repository-connection-panel.tsx");
const resultSource = readSettingsFile("repository-analysis-result.tsx");
const settingsStyles = readSettingsFile("project-github-settings.module.css");
const workspaceAiChatSource = readWorkspaceFile("WorkspaceAiChatDock.tsx");

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
  assert.match(clientSource, /GitHubRepositoryConnectionPanel/);
  assert.match(connectionPanelSource, /installedRepositories\.map/);
  assert.match(connectionPanelSource, /GitHub App 설치\/권한 추가/);
  assert.match(connectionPanelSource, /이 repository 연결/);
});

test("project settings runs Repository Analysis once and restores the saved result", () => {
  assert.match(clientSource, /analyzeSourceRepository\(projectId, activeRepository\.id\)/);
  assert.match(clientSource, /analysisState === "loading"/);
  assert.match(clientSource, /disabled=\{analysisState === "loading"/);
  assert.match(clientSource, /activeRepository\.analysis/);
  assert.match(clientSource, /RepositoryAnalysisResult/);
});

test("project settings waits for authentication recovery before loading repository data", () => {
  assert.match(clientSource, /useAuth/);
  assert.match(clientSource, /authStatus !== "authenticated"/);
  assert.match(clientSource, /\[authStatus, projectId\]/);
});

test("project settings keeps metadata readable and mobile actions touch accessible", () => {
  assert.match(settingsStyles, /settingsInfoGrid span/);
  assert.match(settingsStyles, /min-height: 44px/);
});

test("Repository Analysis renders selected and failed Template states with evidence", () => {
  assert.match(resultSource, /handoff\.status === "template_selected"/);
  assert.match(resultSource, /지원하는 Template을 선택하지 못했습니다/);
  assert.match(resultSource, /handoff\.applicationUnits\.map/);
  assert.match(resultSource, /감지된 Application Unit이 없습니다/);
  assert.match(resultSource, /분석에 사용할 evidence를 찾지 못했습니다/);
  assert.match(resultSource, /handoff\.missingEvidence\.map/);
  assert.match(resultSource, /handoff\.selectionReasons/);
  assert.match(resultSource, /handoff\.mismatchReasons/);
  assert.match(resultSource, /createWorkspaceHref/);
});

test("selected Repository Template is handed to the Workspace AI request without replacement", () => {
  assert.match(workspaceAiChatSource, /readRepositoryTemplateFromLocation/);
  assert.match(workspaceAiChatSource, /params\.get\("sourceRepositoryId"\)/);
  assert.match(workspaceAiChatSource, /draftRequest\.templateId \?\? repositoryTemplate\?\.id/);
  assert.match(workspaceAiChatSource, /AI는 이 Template을 바꾸지 않고 부족한 요구사항만 보완합니다/);
});

function readSettingsFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

// 실제 Workspace AI 요청까지 Template ID가 이어지는지 같은 소스 계약으로 확인합니다.
function readWorkspaceFile(fileName: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../features/workspace/${fileName}`, import.meta.url)),
    "utf8"
  );
}

// orphan client가 아니라 실제 dashboard settings route에 연결됐는지 확인합니다.
function readDashboardSettingsPage(): string {
  return readFileSync(
    fileURLToPath(
      new URL("../../../dashboard/projects/[projectId]/settings/page.tsx", import.meta.url)
    ),
    "utf8"
  );
}
