import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { GitHubRepositoryCandidate } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { projects, sourceRepositories, touchUpdatedAt } from "../db/schema.js";
import type { ProjectAccessContext } from "../git-cicd/git-cicd-handoff-service.js";
import { createGitHubAppState, verifyGitHubAppState } from "./github-app-state.js";
import type { GitHubAppClient } from "./github-app-client.js";

export type SourceRepositoryRecord = typeof sourceRepositories.$inferSelect;
export type SourceRepositoryProjectRecord = typeof projects.$inferSelect;

export type SourceRepositoryRepository = {
  findAccessibleProject(
    projectId: string,
    accessContext: ProjectAccessContext
  ): Promise<SourceRepositoryProjectRecord | undefined>;
  listProjectSourceRepositories(projectId: string): Promise<SourceRepositoryRecord[]>;
  findProjectSourceRepository(
    projectId: string,
    sourceRepositoryId: string
  ): Promise<SourceRepositoryRecord | undefined>;
  createActiveGitHubSourceRepository(input: CreateActiveGitHubSourceRepositoryInput): Promise<SourceRepositoryRecord>;
};

export type CreateActiveGitHubSourceRepositoryInput = {
  id: string;
  projectId: string;
  createdByUserId: string;
  githubInstallationId: string;
  repository: GitHubRepositoryCandidate;
};

export type CreateGitHubInstallUrlInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  appSlug: string;
  stateSecret: string;
  now?: () => Date;
};

export type CreateGitHubInstallUrlResult = {
  installUrl: string;
  expiresAt: Date;
};

export type CreateGitHubExistingInstallationCallbackUrlInput = {
  projectId: string;
  sourceRepositoryId?: string | undefined;
  accessContext: ProjectAccessContext;
  callbackUrl: string;
  stateSecret: string;
  now?: () => Date;
};

export type CreateGitHubExistingInstallationCallbackUrlResult = {
  callbackUrl: string;
  expiresAt: Date;
};

export type ListGitHubInstallationRepositoriesInput = {
  installationId: string;
  state: string;
  accessContext: ProjectAccessContext;
  stateSecret: string;
};

export type ListGitHubInstallationRepositoriesResult = {
  projectId: string;
  repositories: GitHubRepositoryCandidate[];
};

export type ConnectGitHubSourceRepositoryInput = {
  projectId: string;
  installationId: string;
  githubRepositoryId: string;
  state: string;
  accessContext: ProjectAccessContext;
  stateSecret: string;
};

export class SourceRepositoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceRepositoryNotFoundError";
  }
}

export class SourceRepositoryStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceRepositoryStateError";
  }
}

export class SourceRepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceRepositoryConflictError";
  }
}

export function createPostgresSourceRepositoryRepository(
  db: Database
): SourceRepositoryRepository {
  return {
    async findAccessibleProject(projectId, accessContext) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, accessContext.userId)));

      return project;
    },

    async listProjectSourceRepositories(projectId) {
      return db
        .select()
        .from(sourceRepositories)
        .where(eq(sourceRepositories.projectId, projectId))
        .orderBy(desc(sourceRepositories.createdAt));
    },

    async findProjectSourceRepository(projectId, sourceRepositoryId) {
      const [repository] = await db
        .select()
        .from(sourceRepositories)
        .where(
          and(
            eq(sourceRepositories.projectId, projectId),
            eq(sourceRepositories.id, sourceRepositoryId)
          )
        );

      return repository;
    },

    async createActiveGitHubSourceRepository(input) {
      return db.transaction(async (tx) => {
        await tx
          .update(sourceRepositories)
          .set({
            status: "inactive",
            disconnectedAt: new Date(),
            ...touchUpdatedAt
          })
          .where(
            and(
              eq(sourceRepositories.projectId, input.projectId),
              eq(sourceRepositories.provider, "github"),
              eq(sourceRepositories.status, "active")
            )
          );

        const [repository] = await tx
          .insert(sourceRepositories)
          .values({
            id: input.id,
            projectId: input.projectId,
            createdByUserId: input.createdByUserId,
            provider: "github",
            status: "active",
            githubInstallationId: input.githubInstallationId,
            githubRepositoryId: input.repository.githubRepositoryId,
            owner: input.repository.owner,
            name: input.repository.name,
            defaultBranch: input.repository.defaultBranch,
            repositoryUrl: input.repository.repositoryUrl,
            visibility: input.repository.visibility,
            archived: input.repository.archived
          })
          .returning();

        if (!repository) {
          throw new Error("Source repository creation failed");
        }

        return repository;
      });
    }
  };
}

export async function createGitHubInstallUrl(
  input: CreateGitHubInstallUrlInput,
  repository: SourceRepositoryRepository
): Promise<CreateGitHubInstallUrlResult> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  const stateInput = {
    userId: input.accessContext.userId,
    projectId: input.projectId,
    secret: input.stateSecret,
    ...(input.now ? { now: input.now } : {})
  };
  const { state, expiresAt } = await createGitHubAppState(stateInput);
  const installUrl = new URL(
    `https://github.com/apps/${encodeURIComponent(input.appSlug)}/installations/select_target`
  );

  installUrl.searchParams.set("state", state);

  return {
    installUrl: installUrl.toString(),
    expiresAt
  };
}

export async function createGitHubExistingInstallationCallbackUrl(
  input: CreateGitHubExistingInstallationCallbackUrlInput,
  repository: SourceRepositoryRepository
): Promise<CreateGitHubExistingInstallationCallbackUrlResult> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  const reusableRepository = input.sourceRepositoryId
    ? await findReusableGitHubSourceRepositoryById(
        input.projectId,
        input.sourceRepositoryId,
        repository
      )
    : await findReusableGitHubSourceRepository(input.projectId, repository);

  if (!reusableRepository?.githubInstallationId) {
    throw new SourceRepositoryNotFoundError("Reusable GitHub source repository not found");
  }

  const stateInput = {
    userId: input.accessContext.userId,
    projectId: input.projectId,
    secret: input.stateSecret,
    ...(input.now ? { now: input.now } : {})
  };
  const { state, expiresAt } = await createGitHubAppState(stateInput);
  const callbackUrl = new URL(input.callbackUrl);

  callbackUrl.searchParams.set("installation_id", reusableRepository.githubInstallationId);
  callbackUrl.searchParams.set("state", state);

  return {
    callbackUrl: callbackUrl.toString(),
    expiresAt
  };
}

export async function listGitHubInstallationRepositories(
  input: ListGitHubInstallationRepositoriesInput,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient
): Promise<ListGitHubInstallationRepositoriesResult> {
  const state = await verifyAndAuthorizeState(input, repository);
  const repositories = await githubAppClient.listInstallationRepositories(input.installationId);

  return {
    projectId: state.projectId,
    repositories
  };
}

export async function connectGitHubSourceRepository(
  input: ConnectGitHubSourceRepositoryInput,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient,
  generateId: () => string = randomUUID
): Promise<SourceRepositoryRecord> {
  await verifyAndAuthorizeState(input, repository);

  const repositories = await githubAppClient.listInstallationRepositories(input.installationId);
  const selectedRepository = repositories.find(
    (candidate) => candidate.githubRepositoryId === input.githubRepositoryId
  );

  if (!selectedRepository) {
    throw new SourceRepositoryNotFoundError("GitHub repository not found in installation");
  }

  if (selectedRepository.archived) {
    throw new SourceRepositoryConflictError("Archived GitHub repositories cannot be connected");
  }

  return repository.createActiveGitHubSourceRepository({
    id: generateId(),
    projectId: input.projectId,
    createdByUserId: input.accessContext.userId,
    githubInstallationId: input.installationId,
    repository: selectedRepository
  });
}

export async function listSourceRepositories(
  input: { projectId: string; accessContext: ProjectAccessContext },
  repository: SourceRepositoryRepository
): Promise<SourceRepositoryRecord[]> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  return repository.listProjectSourceRepositories(input.projectId);
}

async function verifyAndAuthorizeState(
  input: {
    readonly projectId?: string | undefined;
    readonly state: string;
    readonly stateSecret: string;
    readonly accessContext: ProjectAccessContext;
  },
  repository: SourceRepositoryRepository
): Promise<{ userId: string; projectId: string }> {
  let state: Awaited<ReturnType<typeof verifyGitHubAppState>>;

  try {
    state = await verifyGitHubAppState({
      state: input.state,
      secret: input.stateSecret
    });
  } catch (error) {
    throw new SourceRepositoryStateError(
      error instanceof Error ? error.message : "Invalid GitHub App state"
    );
  }

  if (state.userId !== input.accessContext.userId) {
    throw new SourceRepositoryStateError("GitHub App state user mismatch");
  }

  if (input.projectId && state.projectId !== input.projectId) {
    throw new SourceRepositoryStateError("GitHub App state project mismatch");
  }

  await requireAccessibleProject(
    state.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  return {
    userId: state.userId,
    projectId: state.projectId
  };
}

async function requireAccessibleProject(
  projectId: string,
  accessContext: ProjectAccessContext,
  repository: SourceRepositoryRepository,
  message: string
): Promise<SourceRepositoryProjectRecord> {
  const project = await repository.findAccessibleProject(projectId, accessContext);

  if (!project) {
    throw new SourceRepositoryNotFoundError(message);
  }

  return project;
}

async function findReusableGitHubSourceRepository(
  projectId: string,
  repository: SourceRepositoryRepository
): Promise<SourceRepositoryRecord | null> {
  const repositories = await repository.listProjectSourceRepositories(projectId);

  return (
    repositories.find(
      (candidate) =>
        candidate.provider === "github" &&
        candidate.status === "active" &&
        Boolean(candidate.githubInstallationId)
    ) ??
    repositories.find(
      (candidate) => candidate.provider === "github" && Boolean(candidate.githubInstallationId)
    ) ?? null
  );
}

async function findReusableGitHubSourceRepositoryById(
  projectId: string,
  sourceRepositoryId: string,
  repository: SourceRepositoryRepository
): Promise<SourceRepositoryRecord | null> {
  const sourceRepository = await repository.findProjectSourceRepository(
    projectId,
    sourceRepositoryId
  );

  if (
    sourceRepository?.provider !== "github" ||
    !sourceRepository.githubInstallationId
  ) {
    return null;
  }

  return sourceRepository;
}
