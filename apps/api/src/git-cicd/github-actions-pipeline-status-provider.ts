import { requireGitHubAppConfig } from "../config/env.js";
import {
  createGitHubAppClient,
  type GitHubAppClient
} from "../source-repositories/github-app-client.js";
import type {
  GitCicdHandoffRecord,
  GitCicdHandoffSourceRepositoryRecord,
  UpdateGitCicdHandoffStatusRecordInput
} from "./git-cicd-handoff-service.js";

export type GitCicdPipelineStatusProvider = {
  refreshPipelineStatus(input: {
    handoff: GitCicdHandoffRecord;
    sourceRepository: GitCicdHandoffSourceRepositoryRecord;
  }): Promise<UpdateGitCicdHandoffStatusRecordInput | null>;
};

export type CreateGitHubActionsPipelineStatusProviderOptions = {
  githubAppClient?: GitHubAppClient;
};

export function createGitHubActionsPipelineStatusProvider(
  options: CreateGitHubActionsPipelineStatusProviderOptions = {}
): GitCicdPipelineStatusProvider {
  let cachedClient: GitHubAppClient | null = null;

  return {
    async refreshPipelineStatus({ handoff, sourceRepository }) {
      if (
        handoff.repositoryProvider !== "github" ||
        !handoff.pullRequestHeadSha ||
        !sourceRepository.githubInstallationId
      ) {
        return null;
      }

      cachedClient = cachedClient ?? options.githubAppClient ?? createGitHubAppClientFromEnv();
      const status = await cachedClient.getLatestWorkflowRunForHeadSha({
        installationId: sourceRepository.githubInstallationId,
        owner: sourceRepository.owner,
        name: sourceRepository.name,
        headSha: handoff.pullRequestHeadSha
      });

      return {
        status: status.status,
        pipelineRunUrl: status.pipelineRunUrl,
        statusMessage: status.statusMessage
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
