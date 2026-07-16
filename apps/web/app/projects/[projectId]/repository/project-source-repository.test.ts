import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { GitHubInstalledRepositoryCandidate, SourceRepository } from "@sketchcatch/types";

const clientUrl = new URL("./project-source-repository-client.tsx", import.meta.url);
const stateUrl = new URL("./project-source-repository-state.ts", import.meta.url);
const panelUrl = new URL("./github-repository-connection-panel.tsx", import.meta.url);

function readIfPresent(url: URL): string {
  return existsSync(fileURLToPath(url)) ? readFileSync(fileURLToPath(url), "utf8") : "";
}

test("project source repository has a dedicated client and state module", () => {
  assert.equal(existsSync(fileURLToPath(clientUrl)), true);
  assert.equal(existsSync(fileURLToPath(stateUrl)), true);
});

test("project source repository owns selection and analysis but not GitHub App installation", () => {
  const source = readIfPresent(clientUrl);

  assert.match(source, /listGitHubAccountInstallations/);
  assert.match(source, /connectGitHubSourceRepository|analyzeSourceRepository/);
  assert.doesNotMatch(source, /createGitHubAccountInstallUrl|openGitHubInstallation/);
  assert.match(source, /href="\/dashboard\/settings#github-account-settings-title"/);
});

test("project and GitHub account loading states remain independent", () => {
  const source = readIfPresent(clientUrl);

  assert.match(source, /loadProjectRepository/);
  assert.match(source, /loadGitHubAccountConnection/);
  assert.match(source, /accountErrorMessage/);
  assert.match(source, /GitHub App 연결 상태를 불러오지 못했습니다/);
  assert.match(source, /로그인 방식과 관계없이/);
});

test("source repository loads only after authentication", async () => {
  const state = await import("./project-source-repository-state");

  assert.equal(state.shouldLoadProjectSourceRepository("loading"), false);
  assert.equal(state.shouldLoadProjectSourceRepository("unauthenticated"), false);
  assert.equal(state.shouldLoadProjectSourceRepository("authenticated"), true);
});

test("an active repository requires confirmation only for a different candidate", async () => {
  const state = await import("./project-source-repository-state") as {
    shouldConfirmRepositoryChange?: (
      repository: SourceRepository | null,
      candidate: GitHubInstalledRepositoryCandidate
    ) => boolean;
  };
  const shouldConfirm = state.shouldConfirmRepositoryChange;

  assert.equal(typeof shouldConfirm, "function");
  if (!shouldConfirm) return;

  const active = createRepository();
  assert.equal(shouldConfirm(null, createCandidate()), false);
  assert.equal(
    shouldConfirm(active, createCandidate({ githubRepositoryId: active.githubRepositoryId ?? "" })),
    false
  );
  assert.equal(shouldConfirm(active, createCandidate({ githubRepositoryId: "repository-2" })), true);
});

test("active repository candidates stay collapsed until the user requests a change", () => {
  const source = readIfPresent(clientUrl);

  assert.match(source, /showRepositoryCandidates/);
  assert.match(source, /저장소 변경/);
  assert.match(source, /setShowRepositoryCandidates\(true\)/);
});

test("replacing an active repository requires explicit confirmation", () => {
  const source = readIfPresent(clientUrl);

  assert.match(source, /pendingRepository/);
  assert.match(source, /shouldConfirmRepositoryChange/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /분석 및 Git\/CI\/CD에서 사용할 프로젝트 소스가 변경됩니다/);
  assert.match(source, /confirmRepositoryChange/);
});

test("repository candidate panel explains why archived repositories are disabled", () => {
  const source = readIfPresent(panelUrl);

  assert.match(source, /Archived repository는 연결할 수 없습니다/);
  assert.match(source, /repository\.archived/);
});

function createRepository(overrides: Partial<SourceRepository> = {}): SourceRepository {
  return {
    id: "source-1",
    projectId: "project-1",
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "repository-1",
    owner: "NearthYou",
    name: "sketchcatch",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/NearthYou/sketchcatch",
    visibility: "private",
    archived: false,
    analysis: null,
    disconnectedAt: null,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides
  };
}

function createCandidate(
  overrides: Partial<GitHubInstalledRepositoryCandidate> = {}
): GitHubInstalledRepositoryCandidate {
  return {
    githubRepositoryId: "repository-1",
    owner: "NearthYou",
    name: "sketchcatch",
    fullName: "NearthYou/sketchcatch",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/NearthYou/sketchcatch",
    visibility: "private",
    archived: false,
    installationId: "installation-1",
    installationAccountLogin: "NearthYou",
    installationAccountType: "Organization",
    installationRepositorySelection: "selected",
    connectedSourceRepositoryId: null,
    connectedStatus: null,
    ...overrides
  };
}
