import type { GitCicdRepositorySettingsApplyResponse } from "@sketchcatch/types";
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
          variables: removeBlankVariableValues(preview.variables)
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
            "GitHub App does not have permission to create environments or Actions variables. Approve Administration and Variables repository permissions as Read and write."
          );
        }

        throw error;
      }
    }
  };
}

export function createGitHubOAuthRepositorySettingsApplier(
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): GitCicdRepositorySettingsApplier {
  return {
    async applyRepositorySettings({ handoff, sourceRepository }) {
      const preview = handoff.repositorySettingsPreview;

      if (!preview) {
        throw new GitCicdHandoffNotFoundError("Git/CI/CD repository settings preview not found");
      }

      try {
        await requestGitHubWithOAuth(fetchImpl, accessToken, {
          method: "PUT",
          owner: sourceRepository.owner,
          name: sourceRepository.name,
          path: `/environments/${encodeURIComponent(preview.environmentName)}`,
          body: {}
        });

        const variables = removeBlankVariableValues(preview.variables);
        const variableNames = Object.keys(variables).sort();

        for (const variableName of variableNames) {
          await upsertRepositoryVariableWithOAuth(fetchImpl, accessToken, {
            owner: sourceRepository.owner,
            name: sourceRepository.name,
            variableName,
            value: variables[variableName] ?? ""
          });
        }

        return {
          applied: true,
          environmentName: preview.environmentName,
          variables: variableNames,
          secrets: preview.secrets,
          workflowFiles: preview.workflowFiles,
          githubOAuthRequired: false
        };
      } catch (error) {
        if (isGitHubPermissionError(error)) {
          throw new GitCicdRepositorySettingsPermissionError(
            "GitHub OAuth token does not have permission to create environments or Actions variables. Approve Administration and Variables repository permissions as Read and write."
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

async function upsertRepositoryVariableWithOAuth(
  fetchImpl: typeof fetch,
  accessToken: string,
  input: {
    owner: string;
    name: string;
    variableName: string;
    value: string;
  }
): Promise<void> {
  const body = {
    name: input.variableName,
    value: input.value
  };

  try {
    await requestGitHubWithOAuth(fetchImpl, accessToken, {
      method: "PATCH",
      owner: input.owner,
      name: input.name,
      path: `/actions/variables/${encodeURIComponent(input.variableName)}`,
      body
    });
  } catch (error) {
    if (!isGitHubStatus(error, 404)) {
      throw error;
    }

    await requestGitHubWithOAuth(fetchImpl, accessToken, {
      method: "POST",
      owner: input.owner,
      name: input.name,
      path: "/actions/variables",
      body
    });
  }
}

async function requestGitHubWithOAuth(
  fetchImpl: typeof fetch,
  accessToken: string,
  input: {
    owner: string;
    name: string;
    path: string;
    method?: string;
    body?: Record<string, unknown>;
  }
): Promise<unknown> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(
      input.name
    )}${input.path}`,
    {
      method: input.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {})
    }
  );

  if (!response.ok) {
    const error = new Error(`GitHub API request failed: ${response.status}`) as Error & {
      statusCode?: number;
    };

    error.statusCode = response.status;
    throw error;
  }

  if (response.status === 204) {
    return {};
  }

  return response.json().catch(() => ({}));
}

function isGitHubStatus(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { readonly statusCode?: unknown }).statusCode === statusCode
  );
}
