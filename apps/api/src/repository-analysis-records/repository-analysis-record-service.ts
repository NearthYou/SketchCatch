import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  ApiErrorCode,
  RepositoryAnalysisRecord,
  SaveRepositoryAnalysisRecordRequest
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import { projects, repositoryAnalysisRecords } from "../db/schema.js";

export type ReplaceRepositoryAnalysisRecordInput = Omit<
  RepositoryAnalysisRecord,
  "analyzedAt" | "createdAt" | "updatedAt"
> & {
  analyzedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type RepositoryAnalysisRecordStore = {
  isProjectAccessible(projectId: string, userId: string): Promise<boolean>;
  findCurrentByProject(projectId: string): Promise<RepositoryAnalysisRecord | null>;
  replaceCurrent(input: ReplaceRepositoryAnalysisRecordInput): Promise<RepositoryAnalysisRecord>;
};

export type RepositoryAnalysisRecordService = ReturnType<
  typeof createRepositoryAnalysisRecordService
>;

type RepositoryAnalysisRecordServiceDependencies = {
  generateId?: () => string;
  now?: () => Date;
};

export class RepositoryAnalysisRecordServiceError extends Error {
  readonly exposeMessage = true;

  constructor(
    message: string,
    readonly statusCode: number,
    readonly errorCode: ApiErrorCode
  ) {
    super(message);
    this.name = "RepositoryAnalysisRecordServiceError";
  }
}

// 현재 Board의 Repository 출처 한 건만 읽고 교체하는 작은 서비스 경계다.
export function createRepositoryAnalysisRecordService(
  store: RepositoryAnalysisRecordStore,
  dependencies: RepositoryAnalysisRecordServiceDependencies = {}
) {
  const generateId = dependencies.generateId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return {
    async getCurrent(projectId: string, userId: string): Promise<RepositoryAnalysisRecord | null> {
      await requireAccessibleProject(store, projectId, userId);
      return store.findCurrentByProject(projectId);
    },

    async replaceCurrent(
      projectId: string,
      userId: string,
      request: SaveRepositoryAnalysisRecordRequest
    ): Promise<RepositoryAnalysisRecord> {
      await requireAccessibleProject(store, projectId, userId);
      const normalized = normalizeAndValidateRequest(request);
      const timestamp = now();

      return store.replaceCurrent({
        id: generateId(),
        projectId,
        ...normalized,
        sourceRepositoryId: null,
        analyzedAt: new Date(request.analyzedAt),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  };
}

export function createPostgresRepositoryAnalysisRecordStore(
  db: Database
): RepositoryAnalysisRecordStore {
  return {
    async isProjectAccessible(projectId, userId) {
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      return Boolean(project);
    },

    async findCurrentByProject(projectId) {
      const [record] = await db
        .select()
        .from(repositoryAnalysisRecords)
        .where(eq(repositoryAnalysisRecords.projectId, projectId));
      return record ? toRepositoryAnalysisRecord(record) : null;
    },

    async replaceCurrent(input) {
      const [record] = await db
        .insert(repositoryAnalysisRecords)
        .values(input)
        .onConflictDoUpdate({
          target: repositoryAnalysisRecords.projectId,
          set: {
            provider: input.provider,
            repositoryUrl: input.repositoryUrl,
            owner: input.owner,
            name: input.name,
            branch: input.branch,
            repositoryRevision: input.repositoryRevision,
            analysisResult: input.analysisResult,
            selectedTemplateId: input.selectedTemplateId,
            sourceRepositoryId: null,
            analyzedAt: input.analyzedAt,
            updatedAt: input.updatedAt
          }
        })
        .returning();

      if (!record) {
        throw new Error("Repository Analysis Record upsert failed");
      }
      return toRepositoryAnalysisRecord(record);
    }
  };
}

async function requireAccessibleProject(
  store: RepositoryAnalysisRecordStore,
  projectId: string,
  userId: string
): Promise<void> {
  if (!(await store.isProjectAccessible(projectId, userId))) {
    throw new RepositoryAnalysisRecordServiceError("Project not found", 404, "not_found");
  }
}

function normalizeAndValidateRequest(
  request: SaveRepositoryAnalysisRecordRequest
): SaveRepositoryAnalysisRecordRequest {
  const target = parseGitHubRepositoryUrl(request.repositoryUrl);
  const analysisTarget = parseGitHubRepositoryUrl(request.analysisResult.repositoryUrl);
  const owner = request.owner.toLowerCase();
  const name = request.name.toLowerCase();
  const revision = request.repositoryRevision.toLowerCase();

  if (
    target.owner !== owner ||
    target.name !== name ||
    analysisTarget.owner !== owner ||
    analysisTarget.name !== name ||
    request.analysisResult.repositoryRevision.toLowerCase() !== revision ||
    request.analysisResult.defaultBranch !== request.branch
  ) {
    throw new RepositoryAnalysisRecordServiceError(
      "Repository analysis identity does not match the Board source",
      400,
      "bad_request"
    );
  }

  return {
    ...request,
    repositoryUrl: `https://github.com/${target.owner}/${target.name}`,
    owner,
    name,
    repositoryRevision: revision,
    analysisResult: {
      ...request.analysisResult,
      repositoryUrl: `https://github.com/${analysisTarget.owner}/${analysisTarget.name}`,
      repositoryRevision: revision
    }
  };
}

function parseGitHubRepositoryUrl(repositoryUrl: string): { owner: string; name: string } {
  let url: URL;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw invalidRepositoryUrl();
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const owner = segments[0]?.toLowerCase();
  const name = segments[1]?.replace(/\.git$/iu, "").toLowerCase();

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    segments.length !== 2 ||
    !owner ||
    !name
  ) {
    throw invalidRepositoryUrl();
  }
  return { owner, name };
}

function invalidRepositoryUrl(): RepositoryAnalysisRecordServiceError {
  return new RepositoryAnalysisRecordServiceError(
    "Invalid GitHub Repository URL",
    400,
    "bad_request"
  );
}

function toRepositoryAnalysisRecord(
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
