import { requireGitHubAppConfig } from "../config/env.js";
import {
  defaultTerraformArtifactMaxBytes,
  downloadTerraformArtifactFromS3
} from "../deployments/terraform-workspace.js";
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
  return {
    async createPullRequest(input) {
      const githubAppClient = options.githubAppClient ?? createGitHubAppClientFromEnv();
      const files = await Promise.all(
        input.files.map(async (file) => ({
          path: file.path,
          content: await downloadTerraformArtifactText(file, options.downloadTerraformArtifact)
        }))
      );
      const result = await githubAppClient.createPullRequest({
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
        pullRequestHeadSha: result.pullRequestHeadSha
      };
    }
  };
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
  const content =
    downloadTerraformArtifact !== undefined
      ? await downloadTerraformArtifact(file.artifactObjectKey)
      : await downloadTerraformArtifactFromS3(file.artifactObjectKey, {
          maxBytes: defaultTerraformArtifactMaxBytes
        });

  return Buffer.isBuffer(content) ? content.toString("utf8") : Buffer.from(content).toString("utf8");
}
