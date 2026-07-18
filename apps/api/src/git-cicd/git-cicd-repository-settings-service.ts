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
        throw new GitCicdHandoffNotFoundError("Git/CI/CD repository settings preview not found");
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
          variables: removeBlankVariableValues(preview.variables)
        });

        return {
          applied: true,
          environmentName: result.environmentName,
          variables: result.variables,
          secrets: preview.secrets,
          workflowFiles: preview.workflowFiles
        };
      } catch (error) {
        if (isGitHubPermissionError(error)) {
          throw new GitCicdRepositorySettingsPermissionError(
            "GitHub App does not have permission to create environments or Actions variables. Approve Administration and Variables repository permissions as Read and write."
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
      "Stored Git/CI/CD repository settings are stale. Create a new handoff after configuring a public HTTPS SKETCHCATCH_PUBLIC_BASE_URL."
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

  const sourceRepository = await repository.findSourceRepositoryById(
    handoff.sourceRepositoryId,
    handoff.projectId
  );

  if (!sourceRepository) {
    throw new GitCicdHandoffNotFoundError("Source repository not found for handoff");
  }

  const result = await applier.applyRepositorySettings({ handoff, sourceRepository });
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

function removeBlankVariableValues(variables: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(variables).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0
    )
  );
}
