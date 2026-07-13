import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { GitHubAppClient, GitHubAppCreatePullRequestInput } from "../source-repositories/github-app-client.js";
import { createGitHubAppGitProvider } from "./github-app-git-provider.js";

test("GitHub App provider expands Terraform bundle files into the pull request", async () => {
  const terraformBundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "providers.tf", terraformCode: "terraform {}" },
      { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}' }
    ]
  });
  const pullRequests: GitHubAppCreatePullRequestInput[] = [];
  const provider = createGitHubAppGitProvider({
    githubAppClient: createGitHubClient(pullRequests),
    downloadTerraformArtifact: async () => terraformBundle
  });

  await provider.createPullRequest({
    repository: {
      provider: "github",
      installationId: "installation-1",
      owner: "sketchcatch",
      name: "infra"
    },
    targetBranch: "main",
    sourceBranch: "sketchcatch/iac",
    commitMessage: "Add Terraform",
    files: [
      {
        path: "infra/project/terraform-files.json",
        artifactObjectKey: "projects/project/assets/terraform-files.json",
        contentType: "application/vnd.sketchcatch.terraform-files+json",
        expectedSha256: createHash("sha256").update(terraformBundle).digest("hex")
      }
    ],
    pullRequest: {
      title: "Terraform update",
      body: "Review Terraform",
      planSummary: null,
      reviewChecklist: []
    },
    userAcceptedChangeId: "plan-artifact-1"
  });

  assert.deepEqual(
    pullRequests[0]?.files,
    [
      { path: "infra/project/providers.tf", content: "terraform {}" },
      { path: "infra/project/main.tf", content: 'resource "aws_s3_bucket" "assets" {}' }
    ]
  );
});

test("GitHub App provider rejects Terraform bytes changed after approval", async () => {
  const approvedTerraform = 'resource "aws_s3_bucket" "approved" {}\n';
  const changedTerraform = 'resource "aws_s3_bucket" "changed" {}\n';
  const pullRequests: GitHubAppCreatePullRequestInput[] = [];
  const provider = createGitHubAppGitProvider({
    githubAppClient: createGitHubClient(pullRequests),
    downloadTerraformArtifact: async () => changedTerraform
  });

  await assert.rejects(
    () =>
      provider.createPullRequest({
        repository: {
          provider: "github",
          installationId: "installation-1",
          owner: "sketchcatch",
          name: "infra"
        },
        targetBranch: "main",
        sourceBranch: "sketchcatch/iac",
        commitMessage: "Add Terraform",
        files: [
          {
            path: "infra/project/main.tf",
            artifactObjectKey: "projects/project/assets/main.tf",
            contentType: "text/plain",
            expectedSha256: createHash("sha256").update(approvedTerraform).digest("hex")
          }
        ],
        pullRequest: {
          title: "Terraform update",
          body: "Review Terraform",
          planSummary: null,
          reviewChecklist: []
        },
        userAcceptedChangeId: "plan-artifact-1"
      }),
    /changed after approval/
  );
  assert.equal(pullRequests.length, 0);
});

// 테스트에서는 PR 생성 입력만 기록하고 나머지 GitHub 동작은 사용하지 않습니다.
function createGitHubClient(pullRequests: GitHubAppCreatePullRequestInput[]): GitHubAppClient {
  return {
    async createPullRequest(input) {
      pullRequests.push(input);
      return {
        pullRequestUrl: "https://github.com/sketchcatch/infra/pull/1",
        pullRequestNumber: 1,
        pullRequestHeadSha: "head-sha",
        commitSha: "commit-sha"
      };
    },
    async listInstallations() { return []; },
    async listInstallationRepositories() { return []; },
    async applyRepositorySettings() { return { environmentName: "production", variables: [] }; },
    async validateRepositoryBranch() { throw new Error("not used"); },
    async validateRepositoryDirectory() { throw new Error("not used"); },
    async getLatestWorkflowRunForHeadSha() {
      return { status: "pr_created", pipelineRunUrl: null, statusMessage: "unused" };
    },
    async getPipelineStatusForPullRequest() {
      return { status: "pr_created", pipelineRunUrl: null, statusMessage: "unused" };
    }
  };
}
