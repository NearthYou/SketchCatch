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
const connectionSource = readFileSync(
  fileURLToPath(new URL("./delivery/DeliveryConnectionSummary.tsx", import.meta.url)),
  "utf8"
);
const profileHookSource = readFileSync(
  fileURLToPath(new URL("./delivery/use-project-delivery-profile.ts", import.meta.url)),
  "utf8"
);

test("CI/CD keeps GitHub account recovery available without hiding the readiness checklist", () => {
  assert.match(connectionSource, /\/dashboard\/settings#github-account-settings-title/);
  assert.match(connectionSource, /GitHub 연결 필요/);
  assert.match(handoffPanelSource, /aria-label="CI\/CD PR 준비 상태"/);
  assert.doesNotMatch(source, /listGitHubAccountInstallations|githubInstallationAccess/);
});

test("CI/CD keeps the four server readiness rows visible when no repository is connected", () => {
  assert.match(source, /getGitCicdHandoffReadiness/);
  assert.match(source, /isGitCicdHandoffReady/);
  assert.match(handoffPanelSource, /GitCicdReadinessSnapshot/);
  assert.match(handoffPanelSource, /aria-label="CI\/CD PR 준비 상태"/);
  assert.match(handoffPanelSource, /readinessItems\.map/);
  assert.match(connectionSource, /repositoryHref/);
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

test("CI/CD applies the same creation gate before and after opening PR review", () => {
  assert.match(source, /isGitCicdHandoffCreationEnabled/);
  assert.match(source, /isConsoleDataFresh,/);
  assert.match(source, /if \(\s*!canCreateHandoff/gu);
  assert.equal(handoffPanelSource.match(/disabled=\{!canCreateHandoff\}/gu)?.length, 2);
});

test("CI/CD reloads have one owner and disable manual refresh for either loading state", () => {
  assert.match(source, /isGitCicdReloadOwner/);
  assert.match(source, /reloadReservedOrInFlightRef/);
  assert.match(source, /isRefreshing/);
});
