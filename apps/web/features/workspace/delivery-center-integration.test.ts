import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("./DeliveryCenterPanel.tsx", import.meta.url), "utf8");
const cicdConsoleSource = readFileSync(new URL("./CicdConsoleScreen.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./DeploymentConsoleShell.tsx", import.meta.url), "utf8");
const rightPanelSource = readFileSync(
  new URL("./WorkspaceRightPanel.tsx", import.meta.url),
  "utf8"
);
const repositorySource = readFileSync(
  new URL("../../app/workspace/repository/repository-start-client.tsx", import.meta.url),
  "utf8"
);
const editorSource = readFileSync(
  new URL("./delivery/ProjectDeploymentTargetEditor.tsx", import.meta.url),
  "utf8"
);
const compatibilityRouteSource = readFileSync(
  new URL("../../app/dashboard/projects/[projectId]/settings/page.tsx", import.meta.url),
  "utf8"
);
const githubCallbackSource = readFileSync(
  new URL("../../app/integrations/github/callback/page.tsx", import.meta.url),
  "utf8"
);

test("CI/CD Delivery owns the project delivery configuration sections", () => {
  assert.match(panelSource, /GitHub 연결/);
  assert.match(panelSource, /Source Repository/);
  assert.match(panelSource, /ProjectCicdMonitoringSettingsClient/);
  assert.match(panelSource, /ProjectDeploymentTargetEditor/);
  assert.match(panelSource, /initialProfile=\{profile\}/);
  assert.match(panelSource, /onSaved=\{reload\}/);
  assert.doesNotMatch(
    panelSource,
    /app\/projects\/\[projectId\]\/settings\/project-deployment-target-settings-client/
  );
  assert.match(panelSource, /Pull Request와 Pipeline을 관리하세요/);
});

test("CI/CD Repository 연결은 새 분석 화면이 아니라 현재 프로젝트 선택 화면을 연다", () => {
  assert.match(panelSource, /createGitCicdReadinessNavigation/);
  assert.match(panelSource, /readinessAction:\s*"select_repository"/);
  assert.doesNotMatch(panelSource, /return `\/workspace\/repository\?/);
});

test("CI/CD Delivery shows readiness once beside the PR action", () => {
  assert.doesNotMatch(panelSource, /id="delivery-readiness"|href="#delivery-readiness"/);
  assert.match(panelSource, /href="#cicd-pr-readiness"/);
  assert.match(panelSource, /\[projectId, readinessRefreshRequestId, reloadKey\]/);
  assert.match(cicdConsoleSource, /id="cicd-pr-readiness"/);
  assert.match(cicdConsoleSource, /readiness\?\.ready \? \(/);
  assert.match(cicdConsoleSource, /모든 필수 항목 완료/);
  assert.match(cicdConsoleSource, /readinessItems\.map/);
});

test("deployment modal renders Delivery in its existing CI/CD screen", () => {
  assert.match(shellSource, /DeliveryCenterPanel/);
  assert.match(shellSource, /activeScreen !== "cicd"/);
  assert.doesNotMatch(shellSource, /DeliveryModalSummary|onOpenDelivery\b/);
  assert.doesNotMatch(rightPanelSource, /activeView === "delivery"|<DeliveryCenterPanel/);
});

test("legacy project settings route opens the single Delivery editor", () => {
  assert.match(compatibilityRouteSource, /startMode: "delivery"/);
  assert.match(compatibilityRouteSource, /redirect\(`\/workspace\?\$\{query\.toString\(\)\}`\)/);
});

test("target save refreshes Delivery without starting deployment or Git handoff", () => {
  assert.match(editorSource, /putProjectDeploymentTarget/);
  assert.match(editorSource, /onSaved\?\.\(\)/);
  assert.doesNotMatch(
    editorSource,
    /createGitCicdPullRequest|startGitCicdPipelineRun|startDirectDeployment/
  );
});

test("GitHub callback follows the canonical source-only continuation instead of owning target state", () => {
  assert.match(githubCallbackSource, /배포 설정은 원래 분석을 마친 뒤 Delivery에서 받는다/);
  assert.doesNotMatch(githubCallbackSource, /ProjectDeploymentTargetEditor/);
});

test("public Repository analysis defers CI/CD configuration until after Board creation", () => {
  assert.match(repositorySource, /CI\/CD는 보드 생성 후 Delivery에서 연결합니다/);
  assert.doesNotMatch(repositorySource, /function RepositoryCiCdConnection/);
});
