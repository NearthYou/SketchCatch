import assert from "node:assert/strict";
import test from "node:test";
import type { ProjectAssetStorage } from "../projects/project-asset-storage.js";
import type { GitHubAppClient } from "../source-repositories/github-app-client.js";
import { createGitHubAppGitProvider } from "./github-app-git-provider.js";

test("reads Terraform handoff files from the configured Project asset storage", async () => {
  const terraform = "terraform { required_version = \">= 1.6.0\" }\n";
  const objectKey = "projects/project-1/assets/terraform_file/main.tf";
  let storageReadCount = 0;
  let pullRequestFiles: Array<{ path: string; content: string }> = [];
  let expectedPullRequestHeadSha: string | null | undefined;
  const projectAssetStorage: ProjectAssetStorage = {
    async putObject() {},
    async getObject(input) {
      assert.equal(input.objectKey, objectKey);
      storageReadCount += 1;
      return Buffer.from(terraform);
    },
    async deleteObject() {},
    async objectExists() {
      return true;
    }
  };
  const githubAppClient = {
    async createPullRequest(input: {
      expectedPullRequestHeadSha?: string | null;
      files: Array<{ path: string; content: string }>;
    }) {
      pullRequestFiles = input.files;
      expectedPullRequestHeadSha = input.expectedPullRequestHeadSha;
      return {
        pullRequestUrl: "https://github.com/example/repository/pull/1",
        pullRequestNumber: 1,
        pullRequestHeadSha: "a".repeat(40),
        commitSha: "a".repeat(40),
        sourceBranch: "sketchcatch/deploy-retry-2"
      };
    }
  } as GitHubAppClient;
  const providerOptions = { githubAppClient, projectAssetStorage };
  const previousBucketName = process.env.S3_BUCKET_NAME;
  delete process.env.S3_BUCKET_NAME;

  try {
    const provider = createGitHubAppGitProvider(providerOptions);
    const result = await provider.createPullRequest({
      repository: {
        provider: "github",
        installationId: "installation-1",
        owner: "example",
        name: "repository"
      },
      targetBranch: "main",
      sourceBranch: "sketchcatch/deploy",
      expectedPullRequestHeadSha: "persisted-head-sha",
      commitMessage: "chore: add deployment",
      files: [
        {
          path: "infra/main.tf",
          artifactObjectKey: objectKey,
          contentType: "text/plain"
        }
      ],
      pullRequest: {
        title: "Deploy infrastructure",
        body: "Approved deployment",
        planSummary: null,
        reviewChecklist: []
      },
      userAcceptedChangeId: "plan-1"
    });
    assert.equal(result.sourceBranch, "sketchcatch/deploy-retry-2");
  } finally {
    if (previousBucketName === undefined) {
      delete process.env.S3_BUCKET_NAME;
    } else {
      process.env.S3_BUCKET_NAME = previousBucketName;
    }
  }

  assert.equal(storageReadCount, 1);
  assert.equal(expectedPullRequestHeadSha, "persisted-head-sha");
  assert.deepEqual(pullRequestFiles, [{ path: "infra/main.tf", content: terraform }]);
});
