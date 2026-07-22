import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./CicdConsoleScreen.tsx", import.meta.url)),
  "utf8"
);
const handoffSource = readFileSync(
  fileURLToPath(new URL("./cicd-handoff.ts", import.meta.url)),
  "utf8"
);
const handoffPanelSource = readFileSync(
  fileURLToPath(new URL("./CicdHandoffPanel.tsx", import.meta.url)),
  "utf8"
);
const statusBoardSource = readFileSync(
  fileURLToPath(new URL("./CicdStatusBoard.tsx", import.meta.url)),
  "utf8"
);
const presentationSource = readFileSync(
  fileURLToPath(new URL("./cicd-readiness-presentation.ts", import.meta.url)),
  "utf8"
);
const connectionSource = readFileSync(
  fileURLToPath(new URL("./CicdRepositoryConnectionForm.tsx", import.meta.url)),
  "utf8"
);
const profileHookSource = readFileSync(
  fileURLToPath(new URL("./delivery/use-project-delivery-profile.ts", import.meta.url)),
  "utf8"
);

test("CI/CD keeps GitHub account recovery available without hiding the readiness checklist", () => {
  assert.match(connectionSource, /\/dashboard\/settings#github-account-settings-title/);
  assert.match(connectionSource, /GitHub 계정 연결이 필요합니다/);
  assert.match(handoffPanelSource, /aria-label="CI\/CD PR 준비 상태"/);
  assert.doesNotMatch(source, /listGitHubAccountInstallations|githubInstallationAccess/);
});

test("CI/CD keeps server readiness evidence in the flat PR task rows", () => {
  assert.match(source, /getGitCicdHandoffReadiness/);
  assert.match(source, /isGitCicdHandoffReady/);
  assert.match(handoffPanelSource, /GitCicdReadinessSnapshot/);
  assert.match(handoffPanelSource, /aria-label="CI\/CD PR 준비 상태"/);
  assert.match(handoffPanelSource, /isReadinessItemReady\(/);
  assert.match(handoffPanelSource, /readinessItems/);
  assert.match(handoffPanelSource, /directDeploymentScope/);
  assert.match(handoffPanelSource, /applyPlanReady\s*\?/);
  assert.doesNotMatch(handoffPanelSource, /해당 없음/);
  assert.doesNotMatch(handoffPanelSource, /onOpenDirectDeployment\?\.\("full_stack"\)/);
  assertTaskOrder(handoffPanelSource, [
    'title="Apply Plan"',
    'title="최초 앱 배포"',
    'title="배포 증거"',
    'title="배포 PR"'
  ]);
  assert.match(connectionSource, /listGitHubInstalledRepositories/);
  assert.doesNotMatch(source, /if \(!repository\) \{\s*return \(\s*<div/u);
});

test("CI/CD exposes the Git handoff action that creates the deployment pull request", () => {
  assert.match(source, /createGitCicdHandoff/);
  assert.match(source, /listGitCicdHandoffs/);
  assert.match(handoffPanelSource, /CI\/CD PR 생성/);
});

test("CI/CD uses GitHub App permissions without exposing login OAuth for repository changes", () => {
  assert.doesNotMatch(source, /GitHub OAuth 승인/);
  assert.doesNotMatch(source, /startGitHubOAuth/);
  assert.doesNotMatch(source, /applyGitCicdRepositorySettingsWithGitHubOAuth/);
});

test("CI/CD blocks PR creation until every read-only Delivery readiness item is ready", () => {
  assert.match(profileHookSource, /getProjectDeliveryProfile/);
  assert.doesNotMatch(source, /refreshGitCicdReadiness/);
  assert.doesNotMatch(source, /getProjectDeploymentTarget/);
  assert.match(source, /handoffReady/);
  assert.match(source, /isReadinessReady: handoffReady/);
  assert.match(handoffSource, /#project-cicd-settings-title/);
  assert.match(handoffSource, /#deployment-target-title/);
});

test("CI/CD keeps one contextual CTA and applies the server gate to final PR creation", () => {
  assert.match(source, /isGitCicdHandoffCreationEnabled/);
  assert.match(source, /isConsoleDataFresh,/);
  assert.match(source, /if \(\s*!canCreateHandoff/gu);
  assert.match(source, /suppressPrimaryAction=\{isHandoffReviewOpen\}/);
  assert.equal(statusBoardSource.match(/<button/gu)?.length, 1);
  assert.match(statusBoardSource, /disabled=\{disabled\}/);
  assert.match(presentationSource, /action: \{ kind: "review_pr" \}/);
  assert.equal(handoffPanelSource.match(/disabled=\{!canCreateHandoff\}/gu)?.length, 1);
});

test("CI/CD reloads have one owner and disable manual refresh for either loading state", () => {
  assert.match(source, /isGitCicdReloadOwner/);
  assert.match(source, /reloadReservedOrInFlightRef/);
  assert.match(source, /isRefreshing/);
});

function assertTaskOrder(sourceText: string, labels: readonly string[]): void {
  let previousIndex = -1;
  for (const label of labels) {
    const currentIndex = sourceText.indexOf(label);
    assert.ok(currentIndex >= 0, `${label} 작업 행이 있어야 합니다.`);
    assert.ok(currentIndex > previousIndex, `${label} 작업 행의 순서를 유지해야 합니다.`);
    previousIndex = currentIndex;
  }
}
