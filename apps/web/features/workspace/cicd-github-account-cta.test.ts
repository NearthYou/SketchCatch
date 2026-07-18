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

test("CI/CD keeps GitHub account recovery available without hiding the readiness checklist", () => {
  assert.match(source, /listGitHubAccountInstallations/);
  assert.match(source, /githubInstallationAccess/);
  assert.doesNotMatch(source, /isGitHubIdentityRequiredError/);
  assert.match(source, /\/dashboard\/settings#github-account-settings-title/);
  assert.match(source, /GitHub App 연결이 필요합니다\./);
  assert.match(source, /로그인 방식과 관계없이/);
  assert.match(source, /GitHub App 설정 열기/);
  assert.match(source, /deriveGitHubInstallationAccessState/);
  assert.match(source, /GitHub App 서버 설정이 필요합니다/);
});

test("CI/CD keeps the four server readiness rows visible when no repository is connected", () => {
  assert.match(source, /getGitCicdHandoffReadiness/);
  assert.match(source, /isGitCicdHandoffReady/);
  assert.match(source, /GitCicdReadinessSnapshot/);
  assert.match(source, /aria-label="CI\/CD PR 준비 상태"/);
  assert.match(source, /readinessItems\.map/);
  assert.match(source, /\/dashboard\/projects\/\$\{encodeURIComponent\(projectId\)\}\/repository/);
  assert.doesNotMatch(source, /if \(!repository\) \{\s*return \(\s*<div/u);
});

test("CI/CD exposes the Git handoff action that creates the deployment pull request", () => {
  assert.match(source, /createGitCicdHandoff/);
  assert.match(source, /listGitCicdHandoffs/);
  assert.match(source, /CI\/CD PR 생성/);
});

test("CI/CD uses GitHub App permissions without exposing login OAuth for repository changes", () => {
  assert.doesNotMatch(source, /GitHub OAuth 승인/);
  assert.doesNotMatch(source, /startGitHubOAuth/);
  assert.doesNotMatch(source, /applyGitCicdRepositorySettingsWithGitHubOAuth/);
});

test("CI/CD blocks PR creation until every read-only Delivery readiness item is ready", () => {
  assert.match(source, /getProjectDeliveryProfile/);
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
  assert.equal(source.match(/disabled=\{!canCreateHandoff\}/gu)?.length, 2);
});

test("CI/CD reloads have one owner and disable manual refresh for either loading state", () => {
  assert.match(source, /isGitCicdReloadOwner/);
  assert.match(source, /reloadReservedOrInFlightRef/);
  assert.match(source, /disabled=\{isRefreshing \|\| isReadinessRefreshing\}/);
});
