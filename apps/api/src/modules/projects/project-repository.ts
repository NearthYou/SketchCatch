import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  ArchitectureJson,
  ArchitectureSnapshot,
  Project,
  ProjectAsset,
  ProjectAssetType,
  ProjectDetailsResponse,
  ProjectDraft
} from "@sketchcatch/types";
import type { DatabaseClient } from "../../db/client.js";
import {
  anonymousWorkspaces,
  architectures,
  projectAssets,
  projectDrafts,
  projects,
  touchUpdatedAt
} from "../../db/schema.js";
import { getNextDraftRevision, toProjectDraft } from "./project-drafts.js";
import { buildProjectOwnerFilter, type ProjectOwnerIdentity } from "./project-owner.js";

export type OwnedProjectInput = {
  owner: ProjectOwnerIdentity;
  projectId: string;
};

export type CreateProjectRepositoryInput = {
  description?: string | undefined;
  name: string;
  owner: ProjectOwnerIdentity;
};

export type CreateArchitectureSnapshotRepositoryInput = OwnedProjectInput & {
  architectureJson: ArchitectureJson;
  source: string;
  version?: number | undefined;
};

export type SaveProjectDraftRepositoryInput = OwnedProjectInput & {
  diagramJson: ProjectDraft["diagramJson"];
};

export type CreateProjectAssetRepositoryInput = OwnedProjectInput & {
  architectureId?: string | undefined;
  assetId: string;
  assetType: ProjectAssetType;
  byteSize?: number | undefined;
  contentType: string;
  fileName: string;
  objectKey: string;
};

export type ProjectRepository = {
  createProject(input: CreateProjectRepositoryInput): Promise<Project>;
  listProjects(owner: ProjectOwnerIdentity): Promise<Project[]>;
  getProjectDetails(input: OwnedProjectInput): Promise<ProjectDetailsResponse | null>;
  createArchitectureSnapshot(
    input: CreateArchitectureSnapshotRepositoryInput
  ): Promise<ArchitectureSnapshot | null>;
  getProjectDraft(input: OwnedProjectInput): Promise<ProjectDraft | null>;
  saveProjectDraft(input: SaveProjectDraftRepositoryInput): Promise<ProjectDraft | null>;
  createProjectAsset(input: CreateProjectAssetRepositoryInput): Promise<ProjectAsset | null>;
};

export class OwnedProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found for owner: ${projectId}`);
    this.name = "OwnedProjectNotFoundError";
  }
}

export function createProjectRepository({ db }: DatabaseClient): ProjectRepository {
  return {
    async createProject(input) {
      if (!input.owner.workspaceId) {
        throw new Error("Project workspace owner is required");
      }

      await db
        .insert(anonymousWorkspaces)
        .values({
          id: input.owner.workspaceId
        })
        .onConflictDoUpdate({
          target: anonymousWorkspaces.id,
          set: touchUpdatedAt
        });

      const [project] = await db
        .insert(projects)
        .values({
          id: randomUUID(),
          workspaceId: input.owner.workspaceId,
          userId: input.owner.userId,
          name: input.name,
          description: input.description
        })
        .returning();

      if (!project) {
        throw new Error("Failed to create project");
      }

      return toProject(project);
    },

    async listProjects(owner) {
      const ownerFilter = buildProjectOwnerFilter(owner);

      if (!ownerFilter) {
        return [];
      }

      const workspaceProjects = await db
        .select()
        .from(projects)
        .where(ownerFilter)
        .orderBy(desc(projects.updatedAt));

      return workspaceProjects.map(toProject);
    },

    async getProjectDetails(input) {
      const project = await findOwnedProject(db, input);

      if (!project) {
        return null;
      }

      const [projectArchitectures, assets] = await Promise.all([
        db
          .select()
          .from(architectures)
          .where(eq(architectures.projectId, input.projectId))
          .orderBy(desc(architectures.createdAt)),
        db
          .select()
          .from(projectAssets)
          .where(eq(projectAssets.projectId, input.projectId))
          .orderBy(desc(projectAssets.createdAt))
      ]);

      return {
        project: toProject(project),
        architectures: projectArchitectures.map(toArchitectureSnapshot),
        assets: assets.map(toProjectAsset)
      };
    },

    async createArchitectureSnapshot(input) {
      const project = await findOwnedProject(db, input);

      if (!project) {
        return null;
      }

      const version =
        input.version ??
        Number(
          (
            await db
              .select({ nextVersion: sql<number>`coalesce(max(${architectures.version}), 0) + 1` })
              .from(architectures)
              .where(eq(architectures.projectId, input.projectId))
          )[0]?.nextVersion ?? 1
        );

      const [architecture] = await db
        .insert(architectures)
        .values({
          id: randomUUID(),
          projectId: input.projectId,
          version,
          source: input.source,
          architectureJson: input.architectureJson
        })
        .returning();

      await db.update(projects).set(touchUpdatedAt).where(eq(projects.id, input.projectId));

      return architecture ? toArchitectureSnapshot(architecture) : null;
    },

    async getProjectDraft(input) {
      const project = await findOwnedProject(db, input);

      if (!project) {
        throw new OwnedProjectNotFoundError(input.projectId);
      }

      const [draft] = await db.select().from(projectDrafts).where(eq(projectDrafts.projectId, input.projectId));

      return draft ? toProjectDraft(draft) : null;
    },

    async saveProjectDraft(input) {
      const project = await findOwnedProject(db, input);

      if (!project) {
        return null;
      }

      const [existingDraft] = await db
        .select({ revision: projectDrafts.revision })
        .from(projectDrafts)
        .where(eq(projectDrafts.projectId, input.projectId));
      const now = new Date();
      const revision = getNextDraftRevision(existingDraft?.revision);

      const [draft] = await db
        .insert(projectDrafts)
        .values({
          projectId: input.projectId,
          diagramJson: input.diagramJson,
          revision,
          serverSavedAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: projectDrafts.projectId,
          set: {
            diagramJson: input.diagramJson,
            revision,
            serverSavedAt: now,
            updatedAt: now
          }
        })
        .returning();

      if (!draft) {
        throw new Error("Failed to save project draft");
      }

      await db.update(projects).set(touchUpdatedAt).where(eq(projects.id, input.projectId));

      return toProjectDraft(draft);
    },

    async createProjectAsset(input) {
      const project = await findOwnedProject(db, input);

      if (!project) {
        return null;
      }

      if (input.architectureId) {
        const [architecture] = await db
          .select()
          .from(architectures)
          .where(and(eq(architectures.id, input.architectureId), eq(architectures.projectId, input.projectId)));

        if (!architecture) {
          return null;
        }
      }

      const [asset] = await db
        .insert(projectAssets)
        .values({
          id: input.assetId,
          projectId: input.projectId,
          architectureId: input.architectureId,
          assetType: input.assetType,
          objectKey: input.objectKey,
          fileName: input.fileName,
          contentType: input.contentType,
          byteSize: input.byteSize
        })
        .returning();

      return asset ? toProjectAsset(asset) : null;
    }
  };
}

async function findOwnedProject(db: DatabaseClient["db"], input: OwnedProjectInput) {
  const ownerFilter = buildProjectOwnerFilter(input.owner);

  if (!ownerFilter) {
    return null;
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), ownerFilter));

  return project ?? null;
}

export function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId ?? undefined,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toArchitectureSnapshot(row: typeof architectures.$inferSelect): ArchitectureSnapshot {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    source: row.source,
    architectureJson: row.architectureJson,
    createdAt: row.createdAt.toISOString()
  };
}

function toProjectAsset(row: typeof projectAssets.$inferSelect): ProjectAsset {
  return {
    id: row.id,
    projectId: row.projectId,
    architectureId: row.architectureId,
    assetType: row.assetType,
    objectKey: row.objectKey,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString()
  };
}
