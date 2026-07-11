import assert from "node:assert/strict";
import test from "node:test";
import type {
  GitCicdHandoff,
  GitCicdHandoffPipelineStatus,
  SourceRepository
} from "@sketchcatch/types";
import {
  mergeGitCicdPipelineStatus,
  selectActiveGitHubRepositories,
  selectCurrentGitCicdHandoff
} from "./workspace-git-cicd-state";

test("Git/CI/CD에는 활성 상태인 GitHub Repository만 표시한다", () => {
  const active = createRepository({ id: "active" });
  const repositories = [
    active,
    createRepository({ id: "inactive", status: "inactive" }),
    createRepository({ id: "archived", archived: true }),
    createRepository({ id: "internal", provider: "internal" })
  ];

  assert.deepEqual(selectActiveGitHubRepositories(repositories), [active]);
});

test("선택한 handoff가 없으면 가장 최근 실행을 고른다", () => {
  const older = createHandoff({ id: "older", updatedAt: "2026-07-10T00:00:00.000Z" });
  const latest = createHandoff({ id: "latest", updatedAt: "2026-07-12T00:00:00.000Z" });

  assert.equal(selectCurrentGitCicdHandoff([older, latest], "")?.id, "latest");
  assert.equal(selectCurrentGitCicdHandoff([older, latest], "older")?.id, "older");
});

test("Pipeline 상태를 handoff 링크와 결과에 합친다", () => {
  const handoff = createHandoff({ id: "handoff" });
  const status: GitCicdHandoffPipelineStatus = {
    id: "handoff",
    projectId: "project",
    status: "pipeline_success",
    pullRequestUrl: "https://github.com/example/repo/pull/7",
    pullRequestNumber: 7,
    mergeCommitSha: "abc123",
    pipelineRunUrl: "https://github.com/example/repo/actions/runs/7",
    infraPipelineRunUrl: "https://github.com/example/repo/actions/runs/8",
    infraPipelineStatus: "success",
    appPipelineRunUrl: null,
    appPipelineStatus: "not_started",
    destroyPipelineRunUrl: null,
    destroyPipelineStatus: "not_started",
    environmentName: "production",
    staticSiteUrl: null,
    apiBaseUrl: "https://api.example.com",
    statusMessage: "완료",
    updatedAt: "2026-07-12T01:00:00.000Z",
    source: "rds"
  };

  const merged = mergeGitCicdPipelineStatus(handoff, status);
  assert.equal(merged.status, "pipeline_success");
  assert.equal(merged.pullRequestNumber, 7);
  assert.equal(merged.apiBaseUrl, "https://api.example.com");
});

// 테스트에서 Repository 조건만 짧게 바꿀 수 있는 기본 값을 만듭니다.
function createRepository(overrides: Partial<SourceRepository>): SourceRepository {
  return {
    id: "repository",
    projectId: "project",
    provider: "github",
    status: "active",
    githubInstallationId: "installation",
    githubRepositoryId: "github-repository",
    owner: "example",
    name: "repo",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/example/repo",
    visibility: "private",
    archived: false,
    analysis: null,
    disconnectedAt: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides
  };
}

// 테스트에서 Pipeline 관련 필드가 모두 있는 기본 handoff를 만듭니다.
function createHandoff(overrides: Partial<GitCicdHandoff>): GitCicdHandoff {
  return {
    id: "handoff",
    projectId: "project",
    architectureId: "architecture",
    terraformArtifactId: "artifact",
    handoffKind: "terraform_iac",
    sourceDeploymentId: "deployment",
    deploymentMode: "infra_and_app",
    requiresEnvironmentApproval: true,
    sourceRepositoryId: "repository",
    repositoryProvider: "github",
    repositoryOwner: "example",
    repositoryName: "repo",
    targetBranch: "main",
    sourceBranch: null,
    commitMessage: null,
    pullRequestTitle: null,
    pullRequestUrl: null,
    pullRequestNumber: null,
    pullRequestHeadSha: null,
    mergeCommitSha: null,
    environmentName: "production",
    pipelineRunUrl: null,
    infraPipelineRunUrl: null,
    infraPipelineStatus: "not_started",
    appPipelineRunUrl: null,
    appPipelineStatus: "not_started",
    destroyPipelineRunUrl: null,
    destroyPipelineStatus: "not_started",
    staticSiteUrl: null,
    apiBaseUrl: null,
    repositorySettingsPreview: null,
    awsRoleDiff: null,
    githubOAuthRequired: false,
    status: "draft",
    statusMessage: null,
    userAcceptedChangeId: "accepted",
    createdByUserId: "user",
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides
  };
}
