import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("./DeliveryCenterPanel.tsx", import.meta.url), "utf8");
const cicdConsoleSource = readFileSync(new URL("./CicdConsoleScreen.tsx", import.meta.url), "utf8");
const handoffPanelSource = readFileSync(new URL("./CicdHandoffPanel.tsx", import.meta.url), "utf8");
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
const monitoringSource = readFileSync(
  new URL("../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client.tsx", import.meta.url),
  "utf8"
);
const connectionSummarySource = readFileSync(
  new URL("./delivery/DeliveryConnectionSummary.tsx", import.meta.url),
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
  assert.match(panelSource, /DeliveryConnectionSummary/);
  assert.match(panelSource, /ProjectCicdMonitoringSettingsClient/);
  assert.match(panelSource, /ProjectDeploymentTargetEditor/);
  assert.match(panelSource, /profile=\{profile\}/);
  assert.match(panelSource, /onSaved=\{handleDeploymentTargetSaved\}/);
  assert.doesNotMatch(
    panelSource,
    /app\/projects\/\[projectId\]\/settings\/project-deployment-target-settings-client/
  );
  assert.match(panelSource, /배포 준비를 확인하고 PR과 Pipeline을 관리합니다/);
});

test("일반 배포 진입은 이전 CI/CD 탭 대신 현재 Board 배포를 연다", () => {
  assert.match(
    rightPanelSource,
    /initialActiveScreen=\{initialView === "deployment" \? "cicd" : "deployment"\}/
  );
});

test("Delivery는 Board Repository를 다시 선택하는 카드를 표시하지 않는다", () => {
  assert.doesNotMatch(panelSource, /delivery-repository-title/);
  assert.doesNotMatch(panelSource, /Repository 다시 분석/);
  assert.doesNotMatch(panelSource, /readinessAction:\s*"select_repository"/);
});

test("exact Repository를 compact summary에 자동 적용으로 표시한다", () => {
  assert.match(panelSource, /DeliveryConnectionSummary/);
  assert.match(connectionSummarySource, /cicd-source-repository/);
  assert.match(connectionSummarySource, /defaultBranch/);
  assert.match(connectionSummarySource, /자동 적용/);
  assert.match(connectionSummarySource, /PR 권한 연결 필요/);
  assert.doesNotMatch(connectionSummarySource, /<select/);
});

test("CI/CD는 별도 Repository 목록 대신 Board Delivery Profile을 사용한다", () => {
  assert.doesNotMatch(cicdConsoleSource, /listSourceRepositories/);
  assert.doesNotMatch(cicdConsoleSource, /getGitCicdMonitoringConfig/);
  assert.doesNotMatch(cicdConsoleSource, /getProjectDeliveryProfile/);
  assert.match(cicdConsoleSource, /deliveryProfile\.sourceRepository/);
  assert.match(cicdConsoleSource, /deliveryProfile\.monitoringConfig/);
  assert.match(cicdConsoleSource, /deliveryProfile\.readiness/);
  assert.match(panelSource, /deliveryProfile=\{profile\}/);
});

test("Delivery 하위 설정은 Profile을 다시 조회하지 않는다", () => {
  assert.doesNotMatch(monitoringSource, /listSourceRepositories|getGitCicdMonitoringConfig/);
  assert.doesNotMatch(editorSource, /listSourceRepositories|getProjectDeploymentTarget/);
  assert.match(monitoringSource, /profile\.sourceRepository/);
  assert.match(editorSource, /profile\.deploymentTarget/);
});

test("CI/CD Delivery shows readiness once beside the PR action", () => {
  assert.doesNotMatch(panelSource, /id="delivery-readiness"|href="#delivery-readiness"/);
  assert.match(panelSource, /href="#cicd-handoff"/);
  assert.match(
    panelSource,
    /useProjectDeliveryProfile\(projectId, readinessRefreshRequestId\)/
  );
  assert.match(handoffPanelSource, /id="cicd-pr-readiness"/);
  assert.match(handoffPanelSource, /data-ready=\{readiness\.ready\}/);
  assert.match(handoffPanelSource, /remainingLabel/);
  assert.match(handoffPanelSource, /readinessGroup\.required\.map/);
  assert.match(handoffPanelSource, /readinessGroup\.completed\.map/);
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

test("saved deployment target invalidates the stale Direct Deployment prerequisite", () => {
  assert.match(panelSource, /onDeploymentTargetSaved/);
  assert.match(panelSource, /onSaved=\{handleDeploymentTargetSaved\}/);
  assert.match(shellSource, /deploymentTargetSavedRevision/);
  assert.match(shellSource, /onDeploymentTargetSaved=\{\(\) =>/);
});

test("GitHub callback follows the canonical source-only continuation instead of owning target state", () => {
  assert.match(githubCallbackSource, /배포 설정은 원래 분석을 마친 뒤 Delivery에서 받는다/);
  assert.doesNotMatch(githubCallbackSource, /ProjectDeploymentTargetEditor/);
});

test("public Repository analysis defers CI/CD configuration until after Board creation", () => {
  assert.match(repositorySource, /CI\/CD는 보드 생성 후 Delivery에서 연결합니다/);
  assert.doesNotMatch(repositorySource, /function RepositoryCiCdConnection/);
});
