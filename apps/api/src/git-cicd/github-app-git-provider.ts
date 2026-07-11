import { requireGitHubAppConfig } from "../config/env.js";
import {
  defaultTerraformArtifactMaxBytes,
  downloadTerraformArtifactFromS3,
  parseTerraformArtifactBundle
} from "../deployments/terraform-workspace.js";
import { posix } from "node:path";
import {
  createGitHubAppClient,
  type GitHubAppClient
} from "../source-repositories/github-app-client.js";
import type {
  GitProvider,
  GitProviderCreatePullRequestInput
} from "./git-cicd-handoff-service.js";

export type CreateGitHubAppGitProviderOptions = {
  githubAppClient?: GitHubAppClient;
  downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
};

export function createGitHubAppGitProvider(
  options: CreateGitHubAppGitProviderOptions = {}
): GitProvider {
  let cachedClient: GitHubAppClient | null = null;

  return {
    async createPullRequest(input) {
      cachedClient = cachedClient ?? options.githubAppClient ?? createGitHubAppClientFromEnv();
      const files = (
        await Promise.all(
          input.files.map((file) => expandPullRequestFile(file, options.downloadTerraformArtifact))
        )
      ).flat();
      const result = await cachedClient.createPullRequest({
        installationId: input.repository.installationId,
        owner: input.repository.owner,
        name: input.repository.name,
        targetBranch: input.targetBranch,
        sourceBranch: input.sourceBranch,
        commitMessage: input.commitMessage,
        pullRequestTitle: input.pullRequest.title,
        pullRequestBody: input.pullRequest.body,
        files
      });

      return {
        pullRequestUrl: result.pullRequestUrl,
        sourceBranch: input.sourceBranch,
        commitSha: result.commitSha,
        pullRequestHeadSha: result.pullRequestHeadSha,
        pullRequestNumber: result.pullRequestNumber
      };
    }
  };
}

// Terraform bundle은 PR 안에서 사용자가 편집한 원래 파일들로 다시 펼칩니다.
async function expandPullRequestFile(
  file: GitProviderCreatePullRequestInput["files"][number],
  downloadTerraformArtifact:
    | ((objectKey: string) => Promise<Buffer | Uint8Array | string>)
    | undefined
): Promise<Array<{ path: string; content: string }>> {
  const content = await downloadTerraformArtifactText(file, downloadTerraformArtifact);
  if (file.contentType !== "application/vnd.sketchcatch.terraform-files+json") {
    return [{ path: file.path, content }];
  }

  const directory = posix.dirname(file.path);
  return parseTerraformArtifactBundle(content).files.map((bundleFile) => ({
    path: posix.join(directory, bundleFile.fileName),
    content: bundleFile.terraformCode
  }));
}

function createGitHubAppClientFromEnv(): GitHubAppClient {
  const config = requireGitHubAppConfig();

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey
  });
}

async function downloadTerraformArtifactText(
  file: GitProviderCreatePullRequestInput["files"][number],
  downloadTerraformArtifact:
    | ((objectKey: string) => Promise<Buffer | Uint8Array | string>)
    | undefined
): Promise<string> {
  if (file.content !== undefined) {
    return file.content;
  }

  if (!file.artifactObjectKey) {
    throw new Error(`Git/CI/CD handoff file ${file.path} has no content source`);
  }

  const content =
    downloadTerraformArtifact !== undefined
      ? await downloadTerraformArtifact(file.artifactObjectKey)
      : await downloadTerraformArtifactFromS3(file.artifactObjectKey, {
          maxBytes: defaultTerraformArtifactMaxBytes
        });

  return typeof content === "string" ? content : Buffer.from(content).toString("utf8");
}
