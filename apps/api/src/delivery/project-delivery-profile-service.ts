import { and, desc, eq } from "drizzle-orm";
import type {
  GitCicdMonitoringConfig,
  GitCicdReadinessSnapshot,
  GitHubInstallationConnection,
  ProjectDeliveryProfile,
  ProjectDeploymentTarget,
  RepositoryAnalysisRecord,
  SourceRepository
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  gitCicdHandoffs,
  gitCicdMonitoringConfigs,
  githubInstallationConnections,
  projectDeploymentTargets,
  projects,
  repositoryAnalysisRecords,
  sourceRepositories
} from "../db/schema.js";
import { createDefaultGitCicdMonitoringConfig } from "../git-cicd/git-cicd-monitoring-defaults.js";
import { selectProjectDeliverySourceRepository } from "./project-delivery-source-repository.js";

export type ProjectDeliveryProfileStore = {
  isProjectAccessible(projectId: string, userId: string): Promise<boolean>;
  listGitHubInstallations(
    userId: string
  ): Promise<Array<Omit<GitHubInstallationConnection, "repositoryCount">>>;
  findRepositoryAnalysisTarget(projectId: string): Promise<RepositoryAnalysisRecord | null>;
  listActiveSourceRepositories(projectId: string): Promise<SourceRepository[]>;
  findMonitoringConfig(sourceRepositoryId: string): Promise<GitCicdMonitoringConfig | null>;
  findDeploymentTarget(projectId: string): Promise<ProjectDeploymentTarget | null>;
  findEnvironmentName(projectId: string): Promise<string | null>;
};

export type ProjectDeliveryReadinessReader = (input: {
  projectId: string;
  userId: string;
  deliverySourceRepositoryId: string | null;
}) => Promise<GitCicdReadinessSnapshot>;

export class ProjectDeliveryProfileNotFoundError extends Error {
  constructor(message = "Project not found") {
    super(message);
    this.name = "ProjectDeliveryProfileNotFoundError";
  }
}

// Delivery 화면은 이 조회 결과만 조합하며 하위 설정이나 외부 시스템을 변경하지 않는다.
export function createProjectDeliveryProfileService(options: {
  store: ProjectDeliveryProfileStore;
  inspectReadiness: ProjectDeliveryReadinessReader;
}) {
  return {
    async get(input: { projectId: string; userId: string }): Promise<ProjectDeliveryProfile> {
      if (!(await options.store.isProjectAccessible(input.projectId, input.userId))) {
        throw new ProjectDeliveryProfileNotFoundError();
      }

      const [githubInstallations, repositoryAnalysisTarget, activeRepositories,
        deploymentTarget, environmentName] = await Promise.all([
        options.store.listGitHubInstallations(input.userId),
        options.store.findRepositoryAnalysisTarget(input.projectId),
        options.store.listActiveSourceRepositories(input.projectId),
        options.store.findDeploymentTarget(input.projectId),
        options.store.findEnvironmentName(input.projectId)
      ]);
      const sourceRepository = selectProjectDeliverySourceRepository({
        repositoryAnalysisTarget,
        activeRepositories
      });
      const [savedMonitoringConfig, readiness] = await Promise.all([
        sourceRepository
          ? options.store.findMonitoringConfig(sourceRepository.id)
          : Promise.resolve(null),
        options.inspectReadiness({
          ...input,
          deliverySourceRepositoryId: sourceRepository?.id ?? null
        })
      ]);

      return {
        githubInstallations,
        repositoryAnalysisTarget,
        sourceRepository,
        deploymentTarget,
        environmentName,
        readiness,
        monitoringConfig: sourceRepository
          ? savedMonitoringConfig ?? createDefaultGitCicdMonitoringConfig({
              sourceRepositoryId: sourceRepository.id,
              defaultBranch: sourceRepository.defaultBranch,
              updatedAt: sourceRepository.updatedAt
            })
          : null
      };
    }
  };
}

export function createPostgresProjectDeliveryProfileStore(
  db: Database
): ProjectDeliveryProfileStore {
  return {
    async isProjectAccessible(projectId, userId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      return Boolean(project);
    },

    async listGitHubInstallations(userId) {
      const rows = await db
        .select()
        .from(githubInstallationConnections)
        .where(and(
          eq(githubInstallationConnections.userId, userId),
          eq(githubInstallationConnections.status, "active")
        ))
        .orderBy(desc(githubInstallationConnections.connectedAt));
      return rows.map((row) => ({
        installationId: row.githubInstallationId,
        accountLogin: row.accountLogin,
        accountType: row.accountType,
        repositorySelection: row.repositorySelection,
        htmlUrl: row.htmlUrl
      }));
    },

    async findRepositoryAnalysisTarget(projectId) {
      const [row] = await db
        .select()
        .from(repositoryAnalysisRecords)
        .where(eq(repositoryAnalysisRecords.projectId, projectId));
      return row ? mapRepositoryAnalysisRecord(row) : null;
    },

    async listActiveSourceRepositories(projectId) {
      const rows = await db
        .select()
        .from(sourceRepositories)
        .where(and(
          eq(sourceRepositories.projectId, projectId),
          eq(sourceRepositories.provider, "github"),
          eq(sourceRepositories.status, "active"),
          eq(sourceRepositories.archived, false)
        ))
        .orderBy(desc(sourceRepositories.createdAt));
      return rows.map(mapSourceRepository);
    },

    async findMonitoringConfig(sourceRepositoryId) {
      const [row] = await db
        .select()
        .from(gitCicdMonitoringConfigs)
        .where(eq(gitCicdMonitoringConfigs.sourceRepositoryId, sourceRepositoryId));
      return row ? {
        sourceRepositoryId: row.sourceRepositoryId,
        enabled: row.enabled,
        monitorBranch: row.monitorBranch,
        appPath: row.appPath,
        infraPath: row.infraPath,
        validationStatus: row.validationStatus,
        validationMessage: row.validationMessage,
        validatedAt: row.validatedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString()
      } : null;
    },

    async findDeploymentTarget(projectId) {
      const [row] = await db
        .select()
        .from(projectDeploymentTargets)
        .where(eq(projectDeploymentTargets.projectId, projectId));
      return row ? {
        projectId: row.projectId,
        provider: row.provider,
        connectionId: row.connectionId,
        region: row.region,
        runtimeTargetKind: row.runtimeTargetKind,
        confirmedBuildConfig: row.confirmedBuildConfig,
        runtimeConfig: row.runtimeConfig,
        runtimeTarget: row.runtimeTarget,
        deploymentTargetFingerprint: row.deploymentTargetFingerprint,
        rolloutStrategy: row.rolloutStrategy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      } : null;
    },

    async findEnvironmentName(projectId) {
      const [row] = await db
        .select({ environmentName: gitCicdHandoffs.environmentName })
        .from(gitCicdHandoffs)
        .where(eq(gitCicdHandoffs.projectId, projectId))
        .orderBy(desc(gitCicdHandoffs.createdAt));
      return row?.environmentName ?? null;
    }
  };
}

function mapRepositoryAnalysisRecord(
  row: typeof repositoryAnalysisRecords.$inferSelect
): RepositoryAnalysisRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    provider: row.provider,
    repositoryUrl: row.repositoryUrl,
    owner: row.owner,
    name: row.name,
    branch: row.branch,
    repositoryRevision: row.repositoryRevision,
    analysisResult: row.analysisResult,
    selectedTemplateId: row.selectedTemplateId,
    sourceRepositoryId: row.sourceRepositoryId,
    analyzedAt: row.analyzedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapSourceRepository(row: typeof sourceRepositories.$inferSelect): SourceRepository {
  return {
    id: row.id,
    projectId: row.projectId,
    provider: row.provider,
    status: row.status,
    githubInstallationId: row.githubInstallationId,
    githubRepositoryId: row.githubRepositoryId,
    owner: row.owner,
    name: row.name,
    defaultBranch: row.defaultBranch,
    repositoryUrl: row.repositoryUrl,
    visibility: mapVisibility(row.visibility),
    archived: row.archived,
    analysis: row.analysisResult && row.analysisRevision && row.analyzedAt ? {
      repositoryRevision: row.analysisRevision,
      analyzedAt: row.analyzedAt.toISOString(),
      aiHandoff: row.analysisResult
    } : null,
    disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapVisibility(value: string | null): SourceRepository["visibility"] {
  return value === "public" || value === "private" || value === "internal" ? value : null;
}
