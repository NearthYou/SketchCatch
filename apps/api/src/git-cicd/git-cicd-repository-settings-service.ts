import type {
  GitCicdRepositorySettingsApplyResponse,
  GitCicdRepositorySettingsPreview
} from "@sketchcatch/types";
import { requireGitHubAppConfig } from "../config/env.js";
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
import { normalizeGitCicdReleaseApiUrl } from "./git-cicd-workflows.js";

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

export class GitCicdRepositorySettingsConflictError extends Error {
  readonly code = "GIT_CICD_REPOSITORY_SETTINGS_STALE";

  constructor(message: string) {
    super(message);
    this.name = "GitCicdRepositorySettingsConflictError";
  }
}

export function createGitHubRepositorySettingsApplier(
  githubAppClient: GitHubAppClient = createGitHubAppClientFromEnv()
): GitCicdRepositorySettingsApplier {
  return {
    async applyRepositorySettings({ handoff, sourceRepository }) {
      const preview = handoff.repositorySettingsPreview;

      if (!preview) {
        throw new GitCicdHandoffNotFoundError("CI/CD repository settings preview not found");
      }

      assertCurrentGitCicdRepositorySettings(preview, handoff.projectId);

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
          targetBranch: handoff.targetBranch,
          variables: preview.variables
        });

        if (result.verified !== true) {
          throw new GitCicdRepositorySettingsConflictError(
            "GitHub repository settings could not be verified after applying them"
          );
        }

        return {
          applied: true,
          appliedAt: new Date().toISOString(),
          verified: true,
          environmentName: result.environmentName,
          variables: result.variables,
          secrets: preview.secrets,
          workflowFiles: preview.workflowFiles
        };
      } catch (error) {
        if (isGitHubPermissionError(error)) {
          throw new GitCicdRepositorySettingsPermissionError(
            "GitHub App does not have permission to manage environments, branch policies, or Actions variables. Approve Administration and Variables as Read and write, and Actions as Read-only."
          );
        }

        throw error;
      }
    }
  };
}

export function assertCurrentGitCicdRepositorySettings(
  preview: GitCicdRepositorySettingsPreview,
  expectedProjectId: string
): void {
  const projectId = preview.variables.SKETCHCATCH_PROJECT_ID?.trim();
  const releaseApiUrl = normalizeGitCicdReleaseApiUrl(
    preview.variables.SKETCHCATCH_RELEASE_API_URL
  );

  if (projectId !== expectedProjectId || !releaseApiUrl) {
    throw new GitCicdRepositorySettingsConflictError(
      "Stored CI/CD repository settings are stale. Create a new handoff after configuring a public HTTPS SKETCHCATCH_PUBLIC_BASE_URL."
    );
  }
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

  const preview = handoff.repositorySettingsPreview;
  if (!preview) {
    throw new GitCicdHandoffNotFoundError("CI/CD repository settings preview not found");
  }

  const sourceRepository = await repository.findSourceRepositoryById(
    handoff.sourceRepositoryId,
    handoff.projectId
  );

  if (!sourceRepository) {
    throw new GitCicdHandoffNotFoundError("Source repository not found for handoff");
  }

  const result = await applier.applyRepositorySettings({ handoff, sourceRepository });

  if (result.applied !== true || result.verified !== true) {
    throw new GitCicdRepositorySettingsConflictError(
      "Repository settings must be applied and verified before handoff setup can continue"
    );
  }

  if (!repository.updateHandoffAutomationMetadata) {
    throw new GitCicdRepositorySettingsConflictError(
      "Repository settings evidence storage is not available"
    );
  }

  const updatedHandoff = await repository.updateHandoffAutomationMetadata(handoff.id, {
    repositorySettingsPreview: {
      ...preview,
      applied: true,
      appliedAt: result.appliedAt,
      verified: true
    }
  });

  if (updatedHandoff?.repositorySettingsPreview?.verified !== true) {
    throw new GitCicdRepositorySettingsConflictError(
      "Repository settings verification evidence was not persisted"
    );
  }

  return result;
}

function createGitHubAppClientFromEnv(): GitHubAppClient {
  let config: ReturnType<typeof requireGitHubAppConfig>;

  try {
    config = requireGitHubAppConfig();
  } catch (error) {
    throw new GitCicdRepositorySettingsPermissionError(
      `GitHub App credentials are not configured: ${getErrorMessage(error)}`
    );
  }

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
