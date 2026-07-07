import type { GitCicdRepositorySettingsApplyResponse } from "@sketchcatch/types";
import {
  createGitHubAppClient,
  type GitHubAppClient
} from "../source-repositories/github-app-client.js";
import type {
  GitCicdHandoffRecord,
  GitCicdHandoffRepository,
  GitCicdHandoffSourceRepositoryRecord,
  ProjectAccessContext
} from "./git-cicd-handoff-service.js";
import {
  getGitCicdHandoff,
  GitCicdHandoffNotFoundError
} from "./git-cicd-handoff-service.js";

export type GitCicdRepositorySettingsApplier = {
  applyRepositorySettings(input: {
    handoff: GitCicdHandoffRecord;
    sourceRepository: GitCicdHandoffSourceRepositoryRecord;
  }): Promise<GitCicdRepositorySettingsApplyResponse>;
};

export class GitCicdRepositorySettingsPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitCicdRepositorySettingsPermissionError";
  }
}

export function createGitHubRepositorySettingsApplier(
  githubAppClient: GitHubAppClient = createGitHubAppClientFromEnv()
): GitCicdRepositorySettingsApplier {
  return {
    async applyRepositorySettings({ handoff, sourceRepository }) {
      const preview = handoff.repositorySettingsPreview;

      if (!preview) {
        throw new GitCicdHandoffNotFoundError("Git/CI/CD repository settings preview not found");
      }

      if (!sourceRepository.githubInstallationId) {
        throw new GitCicdRepositorySettingsPermissionError(
          "GitHub installation is required before repository settings can be applied"
        );
      }

      try {
        const result = await githubAppClient.applyRepositorySettings({
          installationId: sourceRepository.githubInstallationId,
          owner: sourceRepository.owner,
          name: sourceRepository.name,
          environmentName: preview.environmentName,
          variables: preview.variables
        });

        return {
          applied: true,
          environmentName: result.environmentName,
          variables: result.variables,
          secrets: preview.secrets,
          workflowFiles: preview.workflowFiles,
          githubOAuthRequired: false
        };
      } catch (error) {
        if (isGitHubPermissionError(error)) {
          throw new GitCicdRepositorySettingsPermissionError(
            "GitHub App does not have permission to create environments or Actions variables"
          );
        }

        throw error;
      }
    }
  };
}

export async function applyGitCicdRepositorySettings(
  input: {
    handoffId: string;
    accessContext: ProjectAccessContext;
  },
  repository: GitCicdHandoffRepository,
  applier: GitCicdRepositorySettingsApplier
): Promise<GitCicdRepositorySettingsApplyResponse> {
  const handoff = await getGitCicdHandoff(input, repository);

  if (handoff.repositoryProvider !== "github") {
    throw new GitCicdRepositorySettingsPermissionError(
      "Repository settings can be applied only to GitHub handoffs"
    );
  }

  const sourceRepository = await repository.findSourceRepositoryById(
    handoff.sourceRepositoryId,
    handoff.projectId
  );

  if (!sourceRepository) {
    throw new GitCicdHandoffNotFoundError("Source repository not found for handoff");
  }

  const result = await applier.applyRepositorySettings({ handoff, sourceRepository });

  await repository.updateHandoffAutomationMetadata?.(handoff.id, {
    githubOAuthRequired: result.githubOAuthRequired
  });

  return result;
}

function createGitHubAppClientFromEnv(): GitHubAppClient {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new GitCicdRepositorySettingsPermissionError(
      "GitHub App credentials are not configured"
    );
  }

  return createGitHubAppClient({
    appId,
    privateKey
  });
}

function isGitHubPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    ((error as { readonly statusCode?: unknown }).statusCode === 401 ||
      (error as { readonly statusCode?: unknown }).statusCode === 403)
  );
}
