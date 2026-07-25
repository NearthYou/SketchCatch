import path from "node:path";
import { and, eq } from "drizzle-orm";
import type {
  GitCicdMonitoredPath,
  UpdateGitCicdMonitoringConfigRequest
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { requireGitHubAppConfig } from "../config/env.js";
import {
  gitCicdMonitoringConfigs,
  projects,
  sourceRepositories,
  touchUpdatedAt
} from "../db/schema.js";
import {
  createGitHubAppClient,
  type GitHubAppClient
} from "../source-repositories/github-app-client.js";
import type { ProjectAccessContext } from "./git-cicd-handoff-service.js";
import { createDefaultGitCicdMonitoringConfig } from "./git-cicd-monitoring-defaults.js";

export type GitCicdMonitoringConfigRecord =
  typeof gitCicdMonitoringConfigs.$inferSelect;

export type GitCicdMonitoringSourceRepository = Pick<
  typeof sourceRepositories.$inferSelect,
  | "id"
  | "projectId"
  | "provider"
  | "status"
  | "githubInstallationId"
  | "owner"
  | "name"
  | "defaultBranch"
  | "updatedAt"
>;

export type MonitoringTargetInput = {
  installationId: string;
  owner: string;
  name: string;
  branch: string;
};

export type GitCicdMonitoringProvider = {
  validateBranch(input: MonitoringTargetInput): Promise<boolean>;
  validateDirectory(
    input: MonitoringTargetInput & { path: string }
  ): Promise<"directory" | "file" | "missing">;
};

export type GitCicdMonitoringProviderSource =
  | GitCicdMonitoringProvider
  | (() => GitCicdMonitoringProvider);

export type GitCicdMonitoringRepository = {
  findAccessibleSourceRepository(
    projectId: string,
    sourceRepositoryId: string,
    accessContext: ProjectAccessContext
  ): Promise<GitCicdMonitoringSourceRepository | undefined>;
  findConfig(
    sourceRepositoryId: string
  ): Promise<GitCicdMonitoringConfigRecord | undefined>;
  upsertConfig(
    input: Omit<GitCicdMonitoringConfigRecord, "updatedAt">
  ): Promise<GitCicdMonitoringConfigRecord>;
};

export type GetMonitoringInput = {
  projectId: string;
  sourceRepositoryId: string;
  accessContext: ProjectAccessContext;
};

export type UpdateMonitoringInput = GetMonitoringInput &
  UpdateGitCicdMonitoringConfigRequest;

export type GitCicdMonitoringValidationErrorCode =
  | "MONITOR_PATH_INVALID"
  | "MONITOR_BRANCH_NOT_FOUND"
  | "MONITOR_PATH_NOT_FOUND"
  | "MONITOR_PATH_NOT_DIRECTORY"
  | "GITHUB_PERMISSION_REQUIRED";

export class GitCicdMonitoringNotFoundError extends Error {
  constructor() {
    super("Active source repository not found for project");
    this.name = "GitCicdMonitoringNotFoundError";
  }
}

export class GitCicdMonitoringValidationError extends Error {
  constructor(
    readonly code: GitCicdMonitoringValidationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GitCicdMonitoringValidationError";
  }
}

export function normalizeMonitoredPath(input: GitCicdMonitoredPath): GitCicdMonitoredPath {
  if (input.mode === "repository_root") {
    return { mode: "repository_root", path: "." };
  }

  const value = input.path.trim().replaceAll("\\", "/");
  if (
    value.length === 0 ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(input.path.trim()) ||
    /^[a-z][a-z\d+.-]*:/i.test(value)
  ) {
    throw new GitCicdMonitoringValidationError(
      "MONITOR_PATH_INVALID",
      "Monitoring paths must be repository-relative directories"
    );
  }

  const segments = value.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    throw new GitCicdMonitoringValidationError(
      "MONITOR_PATH_INVALID",
      "Monitoring paths cannot traverse outside the repository"
    );
  }

  return { mode: "subdirectory", path: segments.join("/") };
}

export async function getGitCicdMonitoringConfig(
  input: GetMonitoringInput,
  repository: GitCicdMonitoringRepository
): Promise<GitCicdMonitoringConfigRecord> {
  const sourceRepository = await requireSourceRepository(input, repository);
  const savedConfig = await repository.findConfig(sourceRepository.id);
  return savedConfig ?? createDefaultGitCicdMonitoringConfig({
    sourceRepositoryId: sourceRepository.id,
    defaultBranch: sourceRepository.defaultBranch,
    updatedAt: sourceRepository.updatedAt
  });
}

export async function updateGitCicdMonitoringConfig(
  input: UpdateMonitoringInput,
  repository: GitCicdMonitoringRepository,
  providerSource: GitCicdMonitoringProviderSource,
  now: () => Date = () => new Date()
): Promise<GitCicdMonitoringConfigRecord> {
  const sourceRepository = await requireSourceRepository(input, repository);
  const appPath = normalizeMonitoredPath(input.appPath);
  const infraPath = normalizeMonitoredPath(input.infraPath);

  if (!input.enabled) {
    return repository.upsertConfig({
      sourceRepositoryId: sourceRepository.id,
      enabled: false,
      monitorBranch: input.monitorBranch,
      appPath,
      infraPath,
      validationStatus: "required",
      validationMessage: null,
      validatedAt: null
    });
  }

  const provider =
    typeof providerSource === "function" ? providerSource() : providerSource;

  await validateMonitoringTarget({
    sourceRepository,
    monitorBranch: input.monitorBranch,
    appPath,
    infraPath,
    provider
  });

  return repository.upsertConfig({
    sourceRepositoryId: sourceRepository.id,
    enabled: true,
    monitorBranch: input.monitorBranch,
    appPath,
    infraPath,
    validationStatus: "valid",
    validationMessage: null,
    validatedAt: now()
  });
}

export async function validateMonitoringTarget(input: {
  sourceRepository: GitCicdMonitoringSourceRepository;
  monitorBranch: string;
  appPath: GitCicdMonitoredPath;
  infraPath: GitCicdMonitoredPath;
  provider: GitCicdMonitoringProvider;
}): Promise<void> {
  const installationId = input.sourceRepository.githubInstallationId;
  if (input.sourceRepository.provider !== "github" || !installationId) {
    throw new GitCicdMonitoringValidationError(
      "GITHUB_PERMISSION_REQUIRED",
      "GitHub App repository access is required to validate monitoring settings"
    );
  }

  const target: MonitoringTargetInput = {
    installationId,
    owner: input.sourceRepository.owner,
    name: input.sourceRepository.name,
    branch: input.monitorBranch
  };

  try {
    if (!(await input.provider.validateBranch(target))) {
      throw new GitCicdMonitoringValidationError(
        "MONITOR_BRANCH_NOT_FOUND",
        `Monitoring branch was not found: ${input.monitorBranch}`
      );
    }

    for (const monitoredPath of [input.appPath, input.infraPath]) {
      const result = await input.provider.validateDirectory({
        ...target,
        path: monitoredPath.path
      });
      if (result === "missing") {
        throw new GitCicdMonitoringValidationError(
          "MONITOR_PATH_NOT_FOUND",
          `Monitoring path was not found: ${monitoredPath.path}`
        );
      }
      if (result === "file") {
        throw new GitCicdMonitoringValidationError(
          "MONITOR_PATH_NOT_DIRECTORY",
          `Monitoring path is not a directory: ${monitoredPath.path}`
        );
      }
    }
  } catch (error) {
    if (error instanceof GitCicdMonitoringValidationError) {
      throw error;
    }
    if (isPermissionError(error)) {
      throw new GitCicdMonitoringValidationError(
        "GITHUB_PERMISSION_REQUIRED",
        "GitHub App permission is required to validate monitoring settings"
      );
    }
    throw error;
  }
}

export function createGitHubMonitoringProvider(
  client: GitHubAppClient
): GitCicdMonitoringProvider {
  return {
    validateBranch: (input) => client.validateRepositoryBranch(input),
    validateDirectory: (input) => client.validateRepositoryDirectory(input)
  };
}

export function createGitHubMonitoringProviderFromEnv(): GitCicdMonitoringProvider {
  const config = requireGitHubAppConfig();
  return createGitHubMonitoringProvider(
    createGitHubAppClient({ appId: config.appId, privateKey: config.privateKey })
  );
}

export function createPostgresGitCicdMonitoringRepository(
  db: Database
): GitCicdMonitoringRepository {
  return {
    async findAccessibleSourceRepository(projectId, sourceRepositoryId, accessContext) {
      const [sourceRepository] = await db
        .select({
          id: sourceRepositories.id,
          projectId: sourceRepositories.projectId,
          provider: sourceRepositories.provider,
          status: sourceRepositories.status,
          githubInstallationId: sourceRepositories.githubInstallationId,
          owner: sourceRepositories.owner,
          name: sourceRepositories.name,
          defaultBranch: sourceRepositories.defaultBranch,
          updatedAt: sourceRepositories.updatedAt
        })
        .from(sourceRepositories)
        .innerJoin(projects, eq(projects.id, sourceRepositories.projectId))
        .where(
          and(
            eq(sourceRepositories.id, sourceRepositoryId),
            eq(sourceRepositories.projectId, projectId),
            eq(sourceRepositories.status, "active"),
            eq(projects.userId, accessContext.userId)
          )
        );
      return sourceRepository;
    },
    async findConfig(sourceRepositoryId) {
      const [config] = await db
        .select()
        .from(gitCicdMonitoringConfigs)
        .where(eq(gitCicdMonitoringConfigs.sourceRepositoryId, sourceRepositoryId));
      return config;
    },
    async upsertConfig(input) {
      const [config] = await db
        .insert(gitCicdMonitoringConfigs)
        .values(input)
        .onConflictDoUpdate({
          target: gitCicdMonitoringConfigs.sourceRepositoryId,
          set: { ...input, ...touchUpdatedAt }
        })
        .returning();
      if (!config) {
        throw new Error("Failed to persist CI/CD monitoring config");
      }
      return config;
    }
  };
}

async function requireSourceRepository(
  input: GetMonitoringInput,
  repository: GitCicdMonitoringRepository
): Promise<GitCicdMonitoringSourceRepository> {
  const sourceRepository = await repository.findAccessibleSourceRepository(
    input.projectId,
    input.sourceRepositoryId,
    input.accessContext
  );
  if (!sourceRepository) {
    throw new GitCicdMonitoringNotFoundError();
  }
  return sourceRepository;
}

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error.statusCode === 401 || error.statusCode === 403)
  );
}
