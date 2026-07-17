import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {
  SaveRepositoryAnalysisRecordRequest,
  RepositoryAnalysisRecord
} from "@sketchcatch/types";
import {
  createRepositoryAnalysisRecordService,
  type RepositoryAnalysisRecordStore
} from "../repository-analysis-records/repository-analysis-record-service.js";
import { registerRepositoryAnalysisRecordRoutes } from "./repository-analysis-records.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "user-1";

test("PUT replaces the current Repository Analysis Record and GET returns only the latest Board provenance", async (t) => {
  const store = createMemoryStore();
  const app = Fastify();
  await app.register(registerRepositoryAnalysisRecordRoutes, {
    createService: () =>
      createRepositoryAnalysisRecordService(store, {
        generateId: () => "record-1",
        now: () => new Date("2026-07-17T01:00:00.000Z")
      }),
    requireUserId: async () => userId
  });
  t.after(() => app.close());

  const first = await app.inject({
    method: "PUT",
    url: `/projects/${projectId}/repository-analysis-record`,
    payload: createRequest({
      repositoryUrl: "https://github.com/SketchCatch/first",
      owner: "sketchcatch",
      name: "first",
      repositoryRevision: "1".repeat(40)
    })
  });
  assert.equal(first.statusCode, 200);

  const secondRequest = createRequest({
    repositoryUrl: "https://github.com/SketchCatch/second",
    owner: "sketchcatch",
    name: "second",
    branch: "develop",
    repositoryRevision: "2".repeat(40)
  });
  const second = await app.inject({
    method: "PUT",
    url: `/projects/${projectId}/repository-analysis-record`,
    payload: secondRequest
  });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().record.repositoryUrl, "https://github.com/sketchcatch/second");
  assert.equal(second.json().record.sourceRepositoryId, null);

  const listed = await app.inject({
    method: "GET",
    url: `/projects/${projectId}/repository-analysis-record`
  });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().record.name, "second");
  assert.equal(store.records.size, 1);
});

test("Repository Analysis Record routes hide projects owned by another user", async (t) => {
  const store = createMemoryStore({ accessible: false });
  const app = Fastify();
  await app.register(registerRepositoryAnalysisRecordRoutes, {
    createService: () => createRepositoryAnalysisRecordService(store),
    requireUserId: async () => "other-user"
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/projects/${projectId}/repository-analysis-record`,
    payload: createRequest()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Project not found"
  });
});

function createRequest(
  overrides: Partial<SaveRepositoryAnalysisRecordRequest> = {}
): SaveRepositoryAnalysisRecordRequest {
  const repositoryUrl = overrides.repositoryUrl ?? "https://github.com/SketchCatch/service";
  const branch = overrides.branch ?? "main";
  const repositoryRevision = overrides.repositoryRevision ?? "a".repeat(40);

  return {
    provider: "github",
    repositoryUrl,
    owner: overrides.owner ?? "sketchcatch",
    name: overrides.name ?? "service",
    branch,
    repositoryRevision,
    analysisResult: {
      repositoryUrl,
      repositoryRevision,
      defaultBranch: branch,
      availableBranches: [branch],
      evidenceFiles: [{ path: "package.json", found: true }],
      detectedSignals: ["node"],
      recommendedTemplateId: "ecs-fargate-container-app",
      recommendationReason: "Container evidence was found"
    },
    selectedTemplateId: "ecs-fargate-container-app",
    analyzedAt: "2026-07-17T00:30:00.000Z",
    ...overrides
  };
}

function createMemoryStore(options: { accessible?: boolean } = {}):
  RepositoryAnalysisRecordStore & { records: Map<string, RepositoryAnalysisRecord> } {
  const records = new Map<string, RepositoryAnalysisRecord>();

  return {
    records,
    async isProjectAccessible() {
      return options.accessible ?? true;
    },
    async findCurrentByProject(candidateProjectId) {
      return records.get(candidateProjectId) ?? null;
    },
    async replaceCurrent(input) {
      const previous = records.get(input.projectId);
      const record: RepositoryAnalysisRecord = {
        id: previous?.id ?? input.id,
        projectId: input.projectId,
        provider: input.provider,
        repositoryUrl: input.repositoryUrl,
        owner: input.owner,
        name: input.name,
        branch: input.branch,
        repositoryRevision: input.repositoryRevision,
        analysisResult: input.analysisResult,
        selectedTemplateId: input.selectedTemplateId,
        sourceRepositoryId: null,
        analyzedAt: input.analyzedAt.toISOString(),
        createdAt: previous?.createdAt ?? input.createdAt.toISOString(),
        updatedAt: input.updatedAt.toISOString()
      };
      records.set(input.projectId, record);
      return record;
    }
  };
}
