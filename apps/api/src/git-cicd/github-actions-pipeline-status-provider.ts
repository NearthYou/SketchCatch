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
        !sourceRepository.githubInstallationId
      ) {
        return null;
      }

      cachedClient = cachedClient ?? options.githubAppClient ?? createGitHubAppClientFromEnv();
      if (handoff.pullRequestNumber) {
        const status = await cachedClient.getPipelineStatusForPullRequest({
          installationId: sourceRepository.githubInstallationId,
          owner: sourceRepository.owner,
          name: sourceRepository.name,
          pullRequestNumber: handoff.pullRequestNumber
        });

        return {
          status: status.status,
          pipelineRunUrl: status.pipelineRunUrl,
          mergeCommitSha: status.mergeCommitSha,
          infraPipelineRunUrl: status.infraPipelineRunUrl,
          infraPipelineStatus: status.infraPipelineStatus,
          appPipelineRunUrl: status.appPipelineRunUrl,
          appPipelineStatus: status.appPipelineStatus,
          destroyPipelineRunUrl: status.destroyPipelineRunUrl,
          destroyPipelineStatus: status.destroyPipelineStatus,
          statusMessage: status.statusMessage
        };
      }

      if (!handoff.pullRequestHeadSha) {
        return null;
      }

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
