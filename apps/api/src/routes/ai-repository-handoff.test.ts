import assert from "node:assert/strict";
import test from "node:test";
import type { TemplateId } from "@sketchcatch/types";
import { buildApp } from "../app.js";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  SourceRepositoryRecord,
  SourceRepositoryRepository
} from "../source-repositories/source-repository-service.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const projectId = "11111111-1111-4111-8111-111111111111";
const sourceRepositoryId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

test("Repository Analysis handoff accepts the stored Template selection", async () => {
  const app = buildHandoffApp("static-web-hosting");
  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    headers: await authHeaders(),
    payload: {
      prompt: "EC2와 RDS 기반 3계층으로 바꿔줘",
      templateId: "static-web-hosting",
      repositoryAnalysis: {
        projectId,
        sourceRepositoryId
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().architectureJson.nodes.length, 6);
  await app.close();
});

test("Repository Analysis handoff rejects a client-supplied replacement Template", async () => {
  const app = buildHandoffApp("static-web-hosting");
  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    headers: await authHeaders(),
    payload: {
      prompt: "다른 Template으로 바꿔줘",
      templateId: "three-tier-web-app",
      repositoryAnalysis: {
        projectId,
        sourceRepositoryId
      }
    }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().message, "REPOSITORY_ANALYSIS_TEMPLATE_MISMATCH");
  await app.close();
});

test("Repository Analysis handoff requires authentication", async () => {
  const app = buildHandoffApp("static-web-hosting");
  const response = await app.inject({
    method: "POST",
    url: "/api/ai/architecture-draft",
    payload: {
      prompt: "정적 사이트를 보완해줘",
      repositoryAnalysis: {
        projectId,
        sourceRepositoryId
      }
    }
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

function buildHandoffApp(templateId: TemplateId) {
  const databaseClient = createAuthDatabaseClient();
  const repository = createSourceRepository(templateId);

  return buildApp({
    getDatabaseClient: () => databaseClient,
    sourceRepositoryRoutes: {
      createSourceRepositoryRepository: () => repository
    }
  });
}

function createAuthDatabaseClient(): DatabaseClient {
  const db = {
    select: () => ({
      from: () => ({
        where: async () => [{ id: userId, deletedAt: null }]
      })
    })
  };

  return {
    db: db as unknown as DatabaseClient["db"],
    pool: { end: async () => undefined } as DatabaseClient["pool"]
  };
}

function createSourceRepository(templateId: TemplateId): SourceRepositoryRepository {
  const row = createSourceRepositoryRecord(templateId);

  return {
    async findGitHubProviderUserId() {
      return null;
    },
    async findAccessibleProject(candidateProjectId, accessContext) {
      if (candidateProjectId !== projectId || accessContext.userId !== userId) {
        return undefined;
      }

      return { id: projectId, userId } as Awaited<
        ReturnType<SourceRepositoryRepository["findAccessibleProject"]>
      >;
    },
    async listProjectSourceRepositories() {
      return [row];
    },
    async findProjectSourceRepository(candidateProjectId, candidateSourceRepositoryId) {
      return candidateProjectId === projectId && candidateSourceRepositoryId === row.id
        ? row
        : undefined;
    },
    async createActiveGitHubSourceRepository() {
      throw new Error("not used");
    },
    async saveProjectSourceRepositoryAnalysis() {
      throw new Error("not used");
    }
  };
}

function createSourceRepositoryRecord(templateId: TemplateId): SourceRepositoryRecord {
  const now = new Date("2026-07-11T00:00:00.000Z");

  return {
    id: sourceRepositoryId,
    projectId,
    createdByUserId: userId,
    provider: "github",
    status: "active",
    githubInstallationId: "installation-1",
    githubRepositoryId: "repository-1",
    owner: "NearthYou",
    name: "mini-react",
    defaultBranch: "main",
    repositoryUrl: "https://github.com/NearthYou/mini-react",
    visibility: "public",
    archived: false,
    analysisResult: {
      status: "template_selected",
      templateId,
      applicationUnits: [],
      evidence: [],
      missingEvidence: [],
      selectionReasons: ["static frontend"]
    },
    analysisRevision: "abc123",
    analyzedAt: now,
    disconnectedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(userId)}`
  };
}
