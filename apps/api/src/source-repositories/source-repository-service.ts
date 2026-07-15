import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type {
  AnalyzeSourceRepositoryResponse,
  GitHubInstalledRepositoryCandidate,
  GitHubInstallationConnection,
  GitHubRepositoryCandidate,
  RecommendRepositoryTemplateResponse,
  RepositoryAnalysisAnswer,
  RepositoryAnalysisAiHandoff,
  RepositoryAnalysisTemplateId
} from "@sketchcatch/types";
import type { RepositoryDeploymentType } from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  githubInstallationConnections,
  projects,
  sourceRepositories,
  touchUpdatedAt
} from "../db/schema.js";
import type { ProjectAccessContext } from "../git-cicd/git-cicd-handoff-service.js";
import { createGitHubAppState, verifyGitHubAppState } from "./github-app-state.js";
import type {
  GitHubAppClient,
  GitHubAppInstallation,
  GitHubRepositoryEvidenceReader
} from "./github-app-client.js";
import { analyzeRepositoryEvidence } from "./repository-analysis.js";
import { recommendRepositoryTemplatesWithAi } from "./repository-template-recommendation.js";

export type SourceRepositoryRecord = typeof sourceRepositories.$inferSelect;
export type SourceRepositoryProjectRecord = typeof projects.$inferSelect;
export type GitHubInstallationConnectionRecord =
  typeof githubInstallationConnections.$inferSelect;

export type SourceRepositoryRepository = {
  connectGitHubInstallation(
    input: ConnectGitHubInstallationInput
  ): Promise<GitHubInstallationConnectionRecord | undefined>;
  listActiveGitHubInstallationConnections(
    userId: string
  ): Promise<GitHubInstallationConnectionRecord[]>;
  findActiveGitHubInstallationConnection(
    userId: string,
    installationId: string
  ): Promise<GitHubInstallationConnectionRecord | undefined>;
  markGitHubInstallationDisconnected(userId: string, installationId: string): Promise<void>;
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
  saveProjectSourceRepositoryAnalysis(
    input: SaveProjectSourceRepositoryAnalysisInput
  ): Promise<SourceRepositoryRecord | undefined>;
};

export type ConnectGitHubInstallationInput = {
  userId: string;
  installation: GitHubAppInstallation;
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

export type CreateGitHubAccountInstallUrlInput = {
  accessContext: ProjectAccessContext;
  appSlug: string;
  stateSecret: string;
  now?: () => Date;
};

export type ListGitHubAccountInstallationsInput = {
  accessContext: ProjectAccessContext;
};

export type ListGitHubAccountInstallationsResult = {
  installations: GitHubInstallationConnection[];
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

export type ListGitHubInstallationRepositoriesResult =
  | { scope: "account" }
  | {
      scope: "project";
      projectId: string;
      repositories: GitHubRepositoryCandidate[];
    };

export type ListGitHubInstalledRepositoriesInput = {
  projectId: string;
  accessContext: ProjectAccessContext;
  stateSecret: string;
  now?: () => Date;
};

export type ListGitHubInstalledRepositoriesResult = {
  projectId: string;
  state: string;
  expiresAt: Date;
  repositories: GitHubInstalledRepositoryCandidate[];
};

export type ConnectGitHubSourceRepositoryInput = {
  projectId: string;
  installationId: string;
  githubRepositoryId: string;
  state: string;
  accessContext: ProjectAccessContext;
  stateSecret: string;
};

export type AnalyzeSourceRepositoryInput = {
  readonly projectId: string;
  readonly sourceRepositoryId: string;
  readonly accessContext: ProjectAccessContext;
};

export type RecommendSourceRepositoryTemplateInput = {
  readonly projectId: string;
  readonly sourceRepositoryId: string;
  readonly accessContext: ProjectAccessContext;
  readonly deploymentType: RepositoryDeploymentType;
  readonly usesCiCd: boolean;
  readonly answers: readonly RepositoryAnalysisAnswer[];
};

export type SaveProjectSourceRepositoryAnalysisInput = {
  readonly projectId: string;
  readonly sourceRepositoryId: string;
  readonly repositoryRevision: string;
  readonly analyzedAt: Date;
  readonly aiHandoff: RepositoryAnalysisAiHandoff;
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

export class RepositoryAnalysisTemplateSelectionError extends Error {
  readonly statusCode = 409;
  readonly errorCode = "conflict" as const;

  constructor(message: string) {
    super(message);
    this.name = "RepositoryAnalysisTemplateSelectionError";
  }
}

// Source Repository 연결과 마지막 분석 결과를 같은 RDS row에서 관리합니다.
export function createPostgresSourceRepositoryRepository(
  db: Database
): SourceRepositoryRepository {
  return {
    async connectGitHubInstallation(input) {
      const now = new Date();
      const [connection] = await db
        .insert(githubInstallationConnections)
        .values({
          id: randomUUID(),
          userId: input.userId,
          githubInstallationId: input.installation.installationId,
          accountId: input.installation.accountId,
          accountLogin: input.installation.accountLogin,
          accountType: input.installation.accountType,
          repositorySelection: input.installation.repositorySelection,
          htmlUrl: input.installation.htmlUrl,
          status: "active",
          connectedAt: now,
          lastVerifiedAt: now
        })
        .onConflictDoUpdate({
          target: githubInstallationConnections.githubInstallationId,
          set: {
            accountId: input.installation.accountId,
            accountLogin: input.installation.accountLogin,
            accountType: input.installation.accountType,
            repositorySelection: input.installation.repositorySelection,
            htmlUrl: input.installation.htmlUrl,
            status: "active",
            lastVerifiedAt: now,
            disconnectedAt: null,
            updatedAt: now
          },
          setWhere: eq(githubInstallationConnections.userId, input.userId)
        })
        .returning();

      return connection;
    },
    async listActiveGitHubInstallationConnections(userId) {
      return db
        .select()
        .from(githubInstallationConnections)
        .where(
          and(
            eq(githubInstallationConnections.userId, userId),
            eq(githubInstallationConnections.status, "active")
          )
        )
        .orderBy(desc(githubInstallationConnections.connectedAt));
    },
    async findActiveGitHubInstallationConnection(userId, installationId) {
      const [connection] = await db
        .select()
        .from(githubInstallationConnections)
        .where(
          and(
            eq(githubInstallationConnections.userId, userId),
            eq(githubInstallationConnections.githubInstallationId, installationId),
            eq(githubInstallationConnections.status, "active")
          )
        );

      return connection;
    },
    async markGitHubInstallationDisconnected(userId, installationId) {
      const now = new Date();
      await db
        .update(githubInstallationConnections)
        .set({
          status: "disconnected",
          disconnectedAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(githubInstallationConnections.userId, userId),
            eq(githubInstallationConnections.githubInstallationId, installationId),
            eq(githubInstallationConnections.status, "active")
          )
        );
    },
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
    },

    async saveProjectSourceRepositoryAnalysis(input) {
      const [repository] = await db
        .update(sourceRepositories)
        .set({
          analysisResult: input.aiHandoff,
          analysisRevision: input.repositoryRevision,
          analyzedAt: input.analyzedAt,
          ...touchUpdatedAt
        })
        .where(
          and(
            eq(sourceRepositories.projectId, input.projectId),
            eq(sourceRepositories.id, input.sourceRepositoryId),
            eq(sourceRepositories.status, "active")
          )
        )
        .returning();

      return repository;
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
    scope: "project" as const,
    userId: input.accessContext.userId,
    projectId: input.projectId,
    secret: input.stateSecret,
    ...(input.now ? { now: input.now } : {})
  };
  const { state, expiresAt } = await createGitHubAppState(stateInput);
  const installUrl = new URL(
    `https://github.com/apps/${encodeURIComponent(input.appSlug)}/installations/new`
  );

  installUrl.searchParams.set("state", state);

  return {
    installUrl: installUrl.toString(),
    expiresAt
  };
}

export async function createGitHubAccountInstallUrl(
  input: CreateGitHubAccountInstallUrlInput
): Promise<CreateGitHubInstallUrlResult> {
  const { state, expiresAt } = await createGitHubAppState({
    scope: "account",
    userId: input.accessContext.userId,
    secret: input.stateSecret,
    ...(input.now ? { now: input.now } : {})
  });
  const installUrl = new URL(
    `https://github.com/apps/${encodeURIComponent(input.appSlug)}/installations/new`
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
    scope: "project" as const,
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
  await connectGitHubInstallationFromCallback(
    state.userId,
    input.installationId,
    repository,
    githubAppClient
  );

  if (state.scope === "account") {
    return { scope: "account" };
  }

  const repositories = await listGitHubInstallationRepositoriesWithDisconnect(
    state.userId,
    input.installationId,
    repository,
    githubAppClient
  );

  return {
    scope: "project",
    projectId: state.projectId,
    repositories
  };
}

export async function listGitHubAccountInstallations(
  input: ListGitHubAccountInstallationsInput,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient
): Promise<ListGitHubAccountInstallationsResult> {
  const installations = await listOwnedGitHubInstallations(
    input.accessContext.userId,
    repository,
    githubAppClient
  );
  const connections: GitHubInstallationConnection[] = [];

  for (const installation of installations) {
    try {
      const installationRepositories = await listGitHubInstallationRepositoriesWithDisconnect(
        input.accessContext.userId,
        installation.installationId,
        repository,
        githubAppClient
      );
      connections.push({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        repositorySelection: installation.repositorySelection,
        repositoryCount: installationRepositories.length,
        htmlUrl: installation.htmlUrl
      });
    } catch (error) {
      if (!isGitHubRepositoryAccessUnavailableConflict(error)) {
        throw error;
      }
    }
  }

  return {
    installations: connections.sort(
      (left, right) =>
        left.accountLogin.localeCompare(right.accountLogin) ||
        left.installationId.localeCompare(right.installationId)
    )
  };
}

export async function listGitHubInstalledRepositories(
  input: ListGitHubInstalledRepositoriesInput,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient
): Promise<ListGitHubInstalledRepositoriesResult> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );

  const stateInput = {
    scope: "project" as const,
    userId: input.accessContext.userId,
    projectId: input.projectId,
    secret: input.stateSecret,
    ...(input.now ? { now: input.now } : {})
  };
  const { state, expiresAt } = await createGitHubAppState(stateInput);
  const knownRepositories = await repository.listProjectSourceRepositories(input.projectId);
  const installations = await listOwnedGitHubInstallations(
    input.accessContext.userId,
    repository,
    githubAppClient
  );
  const repositories: GitHubInstalledRepositoryCandidate[] = [];

  for (const installation of installations) {
    let installationRepositories: GitHubRepositoryCandidate[];

    try {
      installationRepositories = await listGitHubInstallationRepositoriesWithDisconnect(
        input.accessContext.userId,
        installation.installationId,
        repository,
        githubAppClient
      );
    } catch (error) {
      if (isGitHubRepositoryAccessUnavailableConflict(error)) {
        continue;
      }
      throw error;
    }

    repositories.push(
      ...installationRepositories.map((candidate) => {
        const knownRepository = knownRepositories.find(
          (known) =>
            known.githubInstallationId === installation.installationId &&
            known.githubRepositoryId === candidate.githubRepositoryId
        );

        return {
          ...candidate,
          installationId: installation.installationId,
          installationAccountLogin: installation.accountLogin,
          installationAccountType: installation.accountType,
          installationRepositorySelection: installation.repositorySelection,
          connectedSourceRepositoryId: knownRepository?.id ?? null,
          connectedStatus:
            knownRepository?.status === "active" || knownRepository?.status === "inactive"
              ? knownRepository.status
              : null
        };
      })
    );
  }

  return {
    projectId: input.projectId,
    state,
    expiresAt,
    repositories: repositories.sort((left, right) =>
      left.fullName.localeCompare(right.fullName)
    )
  };
}

export async function connectGitHubSourceRepository(
  input: ConnectGitHubSourceRepositoryInput,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient,
  generateId: () => string = randomUUID
): Promise<SourceRepositoryRecord> {
  const state = await verifyAndAuthorizeState(input, repository);
  await requireOwnedGitHubInstallation(
    state.userId,
    input.installationId,
    repository,
    githubAppClient
  );

  const repositories = await listGitHubInstallationRepositoriesWithDisconnect(
    state.userId,
    input.installationId,
    repository,
    githubAppClient
  );
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

export async function requireRepositoryAnalysisTemplateId(
  input: {
    readonly projectId: string;
    readonly sourceRepositoryId: string;
    readonly requestedTemplateId?: RepositoryAnalysisTemplateId | undefined;
    readonly accessContext: ProjectAccessContext;
  },
  repository: SourceRepositoryRepository
): Promise<RepositoryAnalysisTemplateId> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );
  const sourceRepository = await repository.findProjectSourceRepository(
    input.projectId,
    input.sourceRepositoryId
  );
  const analysis = sourceRepository?.analysisResult;

  if (
    !sourceRepository ||
    sourceRepository.provider !== "github" ||
    sourceRepository.status !== "active" ||
    !analysis ||
    analysis.status !== "template_selected"
  ) {
    throw new RepositoryAnalysisTemplateSelectionError(
      "REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE"
    );
  }

  if (!input.requestedTemplateId) {
    return analysis.templateId;
  }

  const supportedTemplateIds = new Set<RepositoryAnalysisTemplateId>([
    analysis.templateId,
    ...(analysis.recommendation?.candidates.map((candidate) => candidate.templateId) ?? [])
  ]);

  if (!supportedTemplateIds.has(input.requestedTemplateId)) {
    throw new RepositoryAnalysisTemplateSelectionError(
      "REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH"
    );
  }

  return input.requestedTemplateId;
}

// active GitHub Source Repository를 정적으로 읽고 구조화된 분석 요약만 저장한다.
// 저장소 코드를 실행하지 않고 고정 revision의 evidence만 분석해 마지막 AI Handoff를 저장합니다.
export async function analyzeSourceRepository(
  input: AnalyzeSourceRepositoryInput,
  repository: SourceRepositoryRepository,
  evidenceReader: GitHubRepositoryEvidenceReader
): Promise<AnalyzeSourceRepositoryResponse> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );
  const sourceRepository = await repository.findProjectSourceRepository(
    input.projectId,
    input.sourceRepositoryId
  );

  if (!sourceRepository) {
    throw new SourceRepositoryNotFoundError("Source repository not found");
  }

  if (
    sourceRepository.status !== "active" ||
    sourceRepository.provider !== "github" ||
    !sourceRepository.githubInstallationId ||
    !sourceRepository.githubRepositoryId ||
    sourceRepository.archived
  ) {
    throw new SourceRepositoryConflictError(
      "Only an active GitHub source repository can be analyzed"
    );
  }

  const snapshot = await evidenceReader.readRepositoryEvidence({
    installationId: sourceRepository.githubInstallationId,
    expectedRepositoryId: sourceRepository.githubRepositoryId,
    owner: sourceRepository.owner,
    name: sourceRepository.name
  });

  const aiHandoff = analyzeRepositoryEvidence(snapshot);
  const analyzedAt = new Date();
  const savedRepository = await repository.saveProjectSourceRepositoryAnalysis({
    projectId: input.projectId,
    sourceRepositoryId: sourceRepository.id,
    repositoryRevision: snapshot.revision,
    analyzedAt,
    aiHandoff
  });

  if (!savedRepository) {
    throw new SourceRepositoryConflictError("Source repository changed during analysis");
  }

  return {
    sourceRepositoryId: sourceRepository.id,
    repositoryRevision: snapshot.revision,
    analyzedAt: analyzedAt.toISOString(),
    aiHandoff
  };
}

export async function recommendSourceRepositoryTemplate(
  input: RecommendSourceRepositoryTemplateInput,
  repository: SourceRepositoryRepository
): Promise<RecommendRepositoryTemplateResponse> {
  await requireAccessibleProject(
    input.projectId,
    input.accessContext,
    repository,
    "Project not found"
  );
  const sourceRepository = await repository.findProjectSourceRepository(
    input.projectId,
    input.sourceRepositoryId
  );
  const analysis = sourceRepository?.analysisResult;

  if (
    !sourceRepository ||
    sourceRepository.provider !== "github" ||
    sourceRepository.status !== "active" ||
    !analysis ||
    !sourceRepository.analysisRevision
  ) {
    throw new RepositoryAnalysisTemplateSelectionError(
      "REPOSITORY_ANALYSIS_TEMPLATE_UNAVAILABLE"
    );
  }

  const recommendation = await recommendRepositoryTemplatesWithAi({
    snapshot: {
      revision: sourceRepository.analysisRevision,
      treePaths: analysis.evidence.map((item) => item.path),
      files: analysis.evidence.map((item) => ({
        path: item.path,
        content: item.signals.join("\n")
      }))
    },
    applicationUnits: analysis.applicationUnits,
    evidence: analysis.evidence,
    missingEvidence: analysis.missingEvidence,
    deploymentType: input.deploymentType,
    usesCiCd: input.usesCiCd,
    answers: input.answers
  });

  return {
    sourceRepositoryId: sourceRepository.id,
    repositoryRevision: sourceRepository.analysisRevision,
    recommendation
  };
}

async function verifyAndAuthorizeState(
  input: {
    readonly projectId?: string | undefined;
    readonly state: string;
    readonly stateSecret: string;
    readonly accessContext: ProjectAccessContext;
  },
  repository: SourceRepositoryRepository
): Promise<Awaited<ReturnType<typeof verifyGitHubAppState>>> {
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

  if (state.scope === "account") {
    if (input.projectId) {
      throw new SourceRepositoryStateError("GitHub App state scope mismatch");
    }

    return state;
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

  return state;
}

async function listOwnedGitHubInstallations(
  userId: string,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient
) {
  const connections = await repository.listActiveGitHubInstallationConnections(userId);
  const installations = await githubAppClient.listInstallations();
  const ownedInstallations: GitHubAppInstallation[] = [];

  for (const connection of connections) {
    const installation = installations.find(
      (candidate) => candidate.installationId === connection.githubInstallationId
    );

    if (!installation) {
      await repository.markGitHubInstallationDisconnected(
        userId,
        connection.githubInstallationId
      );
      continue;
    }

    await repository.connectGitHubInstallation({ userId, installation });
    ownedInstallations.push(installation);
  }

  return ownedInstallations;
}

async function listGitHubInstallationRepositoriesWithDisconnect(
  userId: string,
  installationId: string,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient
): Promise<GitHubRepositoryCandidate[]> {
  try {
    return await githubAppClient.listInstallationRepositories(installationId);
  } catch (error) {
    if (!isGitHubInstallationAccessError(error)) {
      throw error;
    }

    await repository.markGitHubInstallationDisconnected(userId, installationId);
    throw new SourceRepositoryConflictError("GIT_APP_REPOSITORY_ACCESS_UNAVAILABLE");
  }
}

function isGitHubInstallationAccessError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }

  const statusCode = (error as { readonly statusCode?: unknown }).statusCode;
  return statusCode === 403 || statusCode === 404;
}

function isGitHubRepositoryAccessUnavailableConflict(
  error: unknown
): error is SourceRepositoryConflictError {
  return (
    error instanceof SourceRepositoryConflictError &&
    error.message === "GIT_APP_REPOSITORY_ACCESS_UNAVAILABLE"
  );
}

async function connectGitHubInstallationFromCallback(
  userId: string,
  installationId: string,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient
) {
  const installations = await githubAppClient.listInstallations();
  const installation = installations.find(
    (candidate) => candidate.installationId === installationId
  );

  if (!installation) {
    throw new SourceRepositoryConflictError("GIT_APP_INSTALLATION_FORBIDDEN");
  }

  const connection = await repository.connectGitHubInstallation({ userId, installation });

  if (!connection) {
    throw new SourceRepositoryConflictError("GIT_APP_INSTALLATION_FORBIDDEN");
  }

  return installation;
}

async function requireOwnedGitHubInstallation(
  userId: string,
  installationId: string,
  repository: SourceRepositoryRepository,
  githubAppClient: GitHubAppClient
) {
  const connection = await repository.findActiveGitHubInstallationConnection(
    userId,
    installationId
  );

  if (!connection) {
    throw new SourceRepositoryConflictError("GIT_APP_INSTALLATION_FORBIDDEN");
  }

  const installations = await githubAppClient.listInstallations();
  const installation = installations.find(
    (candidate) => candidate.installationId === installationId
  );

  if (!installation) {
    await repository.markGitHubInstallationDisconnected(userId, installationId);
    throw new SourceRepositoryConflictError("GIT_APP_INSTALLATION_FORBIDDEN");
  }

  await repository.connectGitHubInstallation({ userId, installation });
  return installation;
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
