import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("./DeliveryCenterPanel.tsx", import.meta.url), "utf8");
const cicdConsoleSource = readFileSync(new URL("./CicdConsoleScreen.tsx", import.meta.url), "utf8");
const statusBoardSource = readFileSync(new URL("./CicdStatusBoard.tsx", import.meta.url), "utf8");
const presentationSource = readFileSync(
  new URL("./cicd-readiness-presentation.ts", import.meta.url),
  "utf8"
);
const settingsDrawerSource = readFileSync(
  new URL("./CicdSettingsDrawer.tsx", import.meta.url),
  "utf8"
);
const handoffPanelSource = readFileSync(new URL("./CicdHandoffPanel.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("./DeploymentConsoleShell.tsx", import.meta.url), "utf8");
const rightPanelSource = readFileSync(
  new URL("./WorkspaceRightPanel.tsx", import.meta.url),
  "utf8"
);
const editorSource = readFileSync(
  new URL("./delivery/ProjectDeploymentTargetEditor.tsx", import.meta.url),
  "utf8"
);
const monitoringSource = readFileSync(
  new URL(
    "../../app/projects/[projectId]/settings/project-cicd-monitoring-settings-client.tsx",
    import.meta.url
  ),
  "utf8"
);
const connectionSummarySource = readFileSync(
  new URL("./delivery/DeliveryConnectionSummary.tsx", import.meta.url),
  "utf8"
);
const repositoryConnectionFormSource = readFileSync(
  new URL("./CicdRepositoryConnectionForm.tsx", import.meta.url),
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

test("CI/CD Delivery owns the project delivery configuration drawers", () => {
  assert.match(panelSource, /CicdRepositoryConnectionForm/);
  assert.match(panelSource, /ProjectCicdMonitoringSettingsClient/);
  assert.match(panelSource, /ProjectDeploymentTargetEditor/);
  assert.match(panelSource, /profile=\{profile\}/);
  assert.match(panelSource, /onSaved=\{handleDeploymentTargetSaved\}/);
  assert.match(panelSource, /const \[activeDrawer, setActiveDrawer\]/);
  assert.match(panelSource, /getDrawerContent\(activeDrawer/);
  assert.match(panelSource, /onOpenSetup=\{setActiveDrawer\}/);
  assert.match(panelSource, /\{drawer \? \([\s\S]*?<CicdSettingsDrawer/);
  assert.match(
    panelSource,
    /onLastRefreshedAtChange\?\.\(profile\?\.readiness\.checkedAt \?\? null\)/
  );
  assert.doesNotMatch(
    panelSource,
    /app\/projects\/\[projectId\]\/settings\/project-deployment-target-settings-client/
  );
  assert.doesNotMatch(panelSource, /배포 준비부터 GitHub Actions 실행까지/);
  assert.doesNotMatch(panelSource, /setupContent=/);
});

test("CI/CD 헤더는 준비 제목을 표시하고 전역 헤더가 확인 시각과 새로고침을 맡는다", () => {
  assert.match(panelSource, /<h2>CI\/CD 준비<\/h2>/);
  assert.match(shellSource, /onLastRefreshedAtChange=\{setCicdLastRefreshedAt\}/);
  assert.match(shellSource, /formatCicdLastRefreshed\(cicdLastRefreshedAt\)/);
  assert.match(shellSource, /새로고침 중/);
  assert.match(shellSource, /return `최근 확인 \$\{new Date\(value\)/);
  assert.doesNotMatch(panelSource, /최근 확인|전체 새로고침/);
  assert.doesNotMatch(panelSource, /배포 준비부터 GitHub Actions 실행까지 ·/);
});

test("연결 전에는 단일 presentation model이 GitHub 저장소 연결을 현재 작업으로 정한다", () => {
  assert.match(presentationSource, /if \(!input\.sourceReady\)/);
  assert.match(presentationSource, /title: "GitHub 저장소 연결"/);
  assert.match(
    presentationSource,
    /description: "배포에 사용할 GitHub 계정, Repository와 Branch를 선택하세요\."/
  );
  assert.match(presentationSource, /actionLabel: "저장소 연결하기"/);
  assert.match(presentationSource, /action: \{ kind: "drawer", drawer: "repository" \}/);
  assert.match(statusBoardSource, /presentation\.currentTask\.title/);
  assert.match(statusBoardSource, /presentation\.currentTask\.description/);
  assert.match(statusBoardSource, /presentation\.currentTask\.actionLabel/);
  assert.doesNotMatch(statusBoardSource, /currentHandoff|getNextAction/);
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

test("Repository drawer에서 계정, Repository, Branch를 확인하고 명시적으로 연결한다", () => {
  assert.match(panelSource, /CicdRepositoryConnectionForm/);
  assert.doesNotMatch(panelSource, /DeliveryConnectionSummary|repositoryHref/);
  assert.match(repositoryConnectionFormSource, /listGitHubInstalledRepositories/);
  assert.match(repositoryConnectionFormSource, /connectGitHubSourceRepository/);
  assert.match(repositoryConnectionFormSource, /GitHub 계정/);
  assert.match(repositoryConnectionFormSource, /Repository/);
  assert.match(repositoryConnectionFormSource, /Branch/);
  assert.match(repositoryConnectionFormSource, /onCancel/);
  assert.match(repositoryConnectionFormSource, /onSaved/);
  assert.match(repositoryConnectionFormSource, /type="submit"/);
  assert.match(repositoryConnectionFormSource, /dashboard\/settings#github-account-settings-title/);
  assert.match(connectionSummarySource, /cicd-source-repository/);
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

test("CI/CD current-task CTA, phase accordion, and setup drawer share one presentation flow", () => {
  assert.doesNotMatch(panelSource, /id="delivery-readiness"|href="#delivery-readiness"/);
  assert.doesNotMatch(panelSource, /href="#cicd-handoff"/);
  assert.match(panelSource, /useProjectDeliveryProfile\(projectId, readinessRefreshRequestId\)/);
  assert.match(cicdConsoleSource, /const presentation = getCicdReadinessPresentation\(\{/);
  assert.match(cicdConsoleSource, /<CicdStatusBoard/);
  assert.match(cicdConsoleSource, /presentation\.currentTask\.action/);
  assert.match(cicdConsoleSource, /onOpenSetup\(action\.drawer\)/);
  assert.match(cicdConsoleSource, /presentation\.currentPhase === "source"/);
  assert.match(cicdConsoleSource, /presentation\.currentPhase === "target"/);
  assert.match(statusBoardSource, /onClick=\{onActivateCurrentTask\}/);
  assert.equal(statusBoardSource.match(/className=\{styles\.nextTaskAction\}/g)?.length, 1);
  assert.match(settingsDrawerSource, /dialog\.showModal\(\)/);
  assert.match(settingsDrawerSource, /onCancel=\{\(event\) =>/);
  assert.match(settingsDrawerSource, /aria-labelledby=\{titleId\}/);
  assert.match(handoffPanelSource, /id="cicd-pr-readiness"/);
  assert.match(handoffPanelSource, /const applyPlanReady = isReadinessItemReady/);
  assert.match(handoffPanelSource, /initialApplicationApplicable/);
  assert.doesNotMatch(handoffPanelSource, /해당 없음/);
  assert.match(handoffPanelSource, /disabled=\{!canCreateHandoff\}/);
});

test("Apply Plan CTA는 managed deployment만 열고 Plan 또는 Apply API를 직접 호출하지 않는다", () => {
  assert.match(cicdConsoleSource, /if \(action\.kind === "direct_deployment"\)/);
  assert.match(cicdConsoleSource, /onOpenDirectDeployment\?\.\(action\.scope\)/);
  assert.doesNotMatch(cicdConsoleSource, /runDeploymentPlan|approveDeploymentPlan/);
  assert.match(handoffPanelSource, /onOpenDirectDeployment\?\.\(null\)/);
});

test("PR 생성은 승인 Plan, 최초 배포, Repository와 모니터링 계약을 계속 요구한다", () => {
  assert.match(cicdConsoleSource, /isGitCicdHandoffCreationEnabled\(\{/);
  assert.match(cicdConsoleSource, /hasApprovedApplyPlanArtifact: Boolean/);
  assert.match(cicdConsoleSource, /hasMonitoringConfig: config !== null/);
  assert.match(cicdConsoleSource, /hasRepository: repository !== null/);
  assert.match(cicdConsoleSource, /hasSourceDeployment: sourceDeployment !== null/);
  assert.match(cicdConsoleSource, /!readiness\?\.approvedApplyPlanArtifactId/);
  assert.match(cicdConsoleSource, /buildGitCicdHandoffRequest\(\{/);
});

test("one setup approval resumes server-owned Repository, AWS, and PR convergence", () => {
  assert.doesNotMatch(handoffPanelSource, /<CicdChangeReview/);
  assert.doesNotMatch(handoffPanelSource, /Repository 설정 적용|AWS Role 변경 적용/);
  assert.match(handoffPanelSource, /Repository 설정/);
  assert.match(handoffPanelSource, /AWS 신뢰 정책/);
  assert.match(handoffPanelSource, /repositorySettingsPreview\?\.verified/);
  assert.match(handoffPanelSource, /awsRoleDiff.*verified/su);
  assert.match(handoffPanelSource, /설정 적용 및 PR 생성/);
  assert.match(handoffPanelSource, /설정 계속하기/);
  assert.match(cicdConsoleSource, /setupGitCicdHandoff/);
  assert.match(cicdConsoleSource, /existingHandoff\s*\?/);
});

test("deployment modal renders Delivery in its existing CI/CD screen", () => {
  assert.match(shellSource, /DeliveryCenterPanel/);
  assert.match(shellSource, /activeScreen !== "cicd"/);
  assert.doesNotMatch(shellSource, /DeliveryModalSummary|onOpenDelivery\b/);
  assert.doesNotMatch(rightPanelSource, /activeView === "delivery"|<DeliveryCenterPanel/);
});

test("expanded console keeps exactly one active Delivery instance", () => {
  assert.match(shellSource, /!fullScreenOnly && !isDeploymentOverlayOpen/);
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

test("saved deployment target invalidates the stale managed deployment prerequisite", () => {
  assert.match(panelSource, /onDeploymentTargetSaved/);
  assert.match(panelSource, /onSaved=\{handleDeploymentTargetSaved\}/);
  assert.match(shellSource, /deploymentTargetSavedRevision/);
  assert.match(shellSource, /onDeploymentTargetSaved=\{\(\) =>/);
});

test("GitHub callback follows the canonical source-only continuation instead of owning target state", () => {
  assert.match(githubCallbackSource, /배포 설정은 원래 분석을 마친 뒤 Delivery에서 받는다/);
  assert.doesNotMatch(githubCallbackSource, /ProjectDeploymentTargetEditor/);
});
