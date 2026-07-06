import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { ZodError } from "zod";
import type {
  GitCicdHandoffListResponse,
  GitCicdHandoffResponse,
  GitCicdHandoffStatus
} from "@sketchcatch/types";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import { users } from "../db/schema.js";
import { createInMemoryRuntimeCache, type RuntimeCache } from "../runtime-cache/index.js";
import {
  createGitHubGitCicdHandoffProvider,
  type CreateGitCicdHandoffRecordInput,
  type GitProviderCreatePullRequestInput,
  type GitCicdHandoffArchitectureRecord,
  type GitCicdHandoffProvider,
  type GitCicdHandoffRecord,
  type GitCicdHandoffRepository,
  type GitCicdHandoffTerraformArtifactRecord,
  type GitCicdProviderCreateInput,
  type ProjectAccessContext,
  type GitCicdHandoffProjectRecord,
  type UpdateGitCicdHandoffStatusRecordInput
} from "../git-cicd/git-cicd-handoff-service.js";
import { registerGitCicdHandoffRoutes } from "./git-cicd-handoffs.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const handoffId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const sourceRepositoryId = "repo-1";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");

type UserRecord = typeof users.$inferSelect;

type RepositoryCall =
  | {
      name: "findAccessibleProject";
      projectId: string;
      accessContext: ProjectAccessContext;
    }
  | {
      name: "findArchitectureInProject";
      architectureId: string;
      projectId: string;
    }
  | {
      name: "findTerraformArtifactForArchitecture";
      terraformArtifactId: string;
      projectId: string;
      architectureId: string;
    }
  | {
      name: "createHandoff";
      input: CreateGitCicdHandoffRecordInput;
    }
  | {
      name: "findHandoffById";
      handoffId: string;
    }
  | {
      name: "listHandoffsByProject";
      projectId: string;
    }
  | {
      name: "updateHandoffStatus";
      handoffId: string;
      input: UpdateGitCicdHandoffStatusRecordInput;
    };

class FakeGitCicdHandoffRepository implements GitCicdHandoffRepository {
  readonly calls: RepositoryCall[] = [];
  project: GitCicdHandoffProjectRecord | undefined = createProjectRecord();
  architecture: GitCicdHandoffArchitectureRecord | undefined = createArchitectureRecord();
  terraformArtifact: GitCicdHandoffTerraformArtifactRecord | undefined =
    createTerraformArtifactRecord();
  handoff: GitCicdHandoffRecord | undefined = createHandoffRecord();
  handoffs: GitCicdHandoffRecord[] = [createHandoffRecord()];

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "findAccessibleProject",
      projectId: candidateProjectId,
      accessContext
    });

    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      this.project.userId !== accessContext.userId
    ) {
      return undefined;
    }

    return this.project;
  }

  async findArchitectureInProject(candidateArchitectureId: string, candidateProjectId: string) {
    this.calls.push({
      name: "findArchitectureInProject",
      architectureId: candidateArchitectureId,
      projectId: candidateProjectId
    });

    if (
      !this.architecture ||
      this.architecture.id !== candidateArchitectureId ||
      this.architecture.projectId !== candidateProjectId
    ) {
      return undefined;
    }

    return this.architecture;
  }

  async findTerraformArtifactForArchitecture(
    candidateTerraformArtifactId: string,
    candidateProjectId: string,
    candidateArchitectureId: string
  ) {
    this.calls.push({
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId: candidateTerraformArtifactId,
      projectId: candidateProjectId,
      architectureId: candidateArchitectureId
    });

    if (
      !this.terraformArtifact ||
      this.terraformArtifact.id !== candidateTerraformArtifactId ||
      this.terraformArtifact.projectId !== candidateProjectId ||
      this.terraformArtifact.architectureId !== candidateArchitectureId
    ) {
      return undefined;
    }

    return this.terraformArtifact;
  }

  async createHandoff(input: CreateGitCicdHandoffRecordInput) {
    this.calls.push({
      name: "createHandoff",
      input
    });

    this.handoff = createHandoffRecord(input.id, input);
    this.handoffs = [this.handoff];

    return this.handoff;
  }

  async findHandoffById(candidateHandoffId: string) {
    this.calls.push({
      name: "findHandoffById",
      handoffId: candidateHandoffId
    });

    return this.handoff?.id === candidateHandoffId ? this.handoff : undefined;
  }

  async listHandoffsByProject(candidateProjectId: string) {
    this.calls.push({
      name: "listHandoffsByProject",
      projectId: candidateProjectId
    });

    return this.handoffs.filter((handoff) => handoff.projectId === candidateProjectId);
  }

  async updateHandoffStatus(
    candidateHandoffId: string,
    input: UpdateGitCicdHandoffStatusRecordInput
  ) {
    this.calls.push({
      name: "updateHandoffStatus",
      handoffId: candidateHandoffId,
      input
    });

    if (!this.handoff || this.handoff.id !== candidateHandoffId) {
      return undefined;
    }

    this.handoff = {
      ...this.handoff,
      status: input.status,
      pullRequestUrl:
        input.pullRequestUrl === undefined ? this.handoff.pullRequestUrl : input.pullRequestUrl,
      pipelineRunUrl:
        input.pipelineRunUrl === undefined ? this.handoff.pipelineRunUrl : input.pipelineRunUrl,
      statusMessage:
        input.statusMessage === undefined ? this.handoff.statusMessage : input.statusMessage,
      updatedAt: fixedNow
    };

    return this.handoff;
  }
}

test("POST /api/projects/:projectId/git-cicd-handoffs creates an internal metadata handoff", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  const provider = createProviderSpy(providerCalls);
  const app = await buildGitCicdHandoffTestApp(repository, { provider });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 201);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.projectId, projectId);
  assert.equal(body.handoff.architectureId, architectureId);
  assert.equal(body.handoff.terraformArtifactId, terraformArtifactId);
  assert.equal(body.handoff.sourceRepositoryId, sourceRepositoryId);
  assert.equal(body.handoff.repositoryProvider, "internal");
  assert.equal(body.handoff.status, "draft");
  assert.equal(body.handoff.pullRequestUrl, null);
  assert.equal(body.handoff.pipelineRunUrl, null);
  assert.equal(body.handoff.createdByUserId, userId);
  assert.equal(providerCalls.length, 1);
  const providerCall = providerCalls[0];
  assert.equal(providerCall?.projectId, projectId);
  assert.equal(providerCall?.terraformArtifact.fileName, "main.tf");
  assert.equal(providerCall?.terraformArtifact.objectKey, "projects/project-id/terraform/main.tf");
  assert.deepEqual(providerCall?.sourceRepository, {
    id: sourceRepositoryId,
    provider: "internal",
    owner: "sketchcatch",
    name: "infra-live",
    defaultBranch: "main"
  });
  assert.equal(providerCall?.sourceBranch, "sketchcatch/iac-preview");
  assert.equal(providerCall?.commitMessage, "Add SketchCatch Terraform preview");
  assert.equal(providerCall?.pullRequestTitle, "SketchCatch IaC preview");
  assert.equal(providerCall?.pullRequestDraft.title, "SketchCatch IaC preview");
  assert.match(providerCall?.pullRequestDraft.body ?? "", /## IaC Preview/);
  assert.match(providerCall?.pullRequestDraft.body ?? "", /## Review checklist/);
  assert.equal(providerCall?.pullRequestDraft.reviewChecklist.length, 4);
  assert.equal(providerCall?.userAcceptedChangeId, "accepted-change-1");
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs creates GitHub PR handoff through fake provider", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const gitProviderCalls: GitProviderCreatePullRequestInput[] = [];
  const provider = createGitHubGitCicdHandoffProvider({
    async createPullRequest(input) {
      gitProviderCalls.push(input);

      return {
        pullRequestUrl: "https://github.com/sketchcatch/infra-live/pull/42",
        sourceBranch: input.sourceBranch,
        commitSha: "abc1234"
      };
    }
  });
  const app = await buildGitCicdHandoffTestApp(repository, { provider });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: {
      ...createHandoffBody(),
      repositoryProvider: "github",
      sourceBranch: undefined,
      planSummary: createPlanSummary()
    }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.repositoryProvider, "github");
  assert.equal(body.handoff.status, "pr_created");
  assert.equal(body.handoff.pullRequestUrl, "https://github.com/sketchcatch/infra-live/pull/42");
  assert.equal(body.handoff.sourceBranch, `sketchcatch/iac-${terraformArtifactId.slice(0, 8)}`);
  assert.match(body.handoff.statusMessage ?? "", /GitHub PR created/);
  assert.equal(gitProviderCalls.length, 1);
  assert.deepEqual(gitProviderCalls[0]?.repository, {
    provider: "github",
    owner: "sketchcatch",
    name: "infra-live"
  });
  assert.equal(gitProviderCalls[0]?.targetBranch, "main");
  assert.equal(gitProviderCalls[0]?.files[0]?.path, "terraform/main.tf");
  assert.equal(
    gitProviderCalls[0]?.files[0]?.artifactObjectKey,
    "projects/project-id/terraform/main.tf"
  );
  assert.match(gitProviderCalls[0]?.pullRequest.body ?? "", /Create 2, update 1, delete 0, replace 0/);
  assert.match(gitProviderCalls[0]?.pullRequest.body ?? "", /Pre-Deployment Check/);
  assert.equal(gitProviderCalls[0]?.pullRequest.reviewChecklist.length, 4);
  assert.equal(
    gitProviderCalls[0]?.pullRequest.planSummary?.warnings[0]?.relatedResourceId,
    "aws_instance.web"
  );
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs rejects provider mismatch", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: {
      ...createHandoffBody(),
      repositoryProvider: "github"
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Git/CI/CD handoff provider mismatch: requested github, received internal"
  });
  assert.equal(repository.calls.some((call) => call.name === "createHandoff"), false);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs rejects secret-looking request fields", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: {
      ...createHandoffBody(),
      accessToken: "should-not-be-accepted"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(providerCalls.length, 0);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs maps inaccessible projects to not_found", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  repository.project = undefined;
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Project not found"
  });
  assert.equal(providerCalls.length, 0);

  await app.close();
});

test("POST /api/projects/:projectId/git-cicd-handoffs requires matching Terraform artifact", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const providerCalls: GitCicdProviderCreateInput[] = [];
  repository.terraformArtifact = undefined;
  const app = await buildGitCicdHandoffTestApp(repository, {
    provider: createProviderSpy(providerCalls)
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders(),
    payload: createHandoffBody()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Terraform artifact not found for project architecture"
  });
  assert.equal(providerCalls.length, 0);

  await app.close();
});

test("GET /api/projects/:projectId/git-cicd-handoffs lists project handoffs", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdHandoffListResponse;
  assert.equal(body.handoffs.length, 1);
  assert.equal(body.handoffs[0]?.id, handoffId);
  assertResponseHasNoSecretFields(body.handoffs[0]);
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "listHandoffsByProject",
      projectId
    }
  ]);

  await app.close();
});

test("GET /api/git-cicd-handoffs/:handoffId returns one accessible handoff", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.id, handoffId);
  assert.equal(body.handoff.createdAt, fixedNow.toISOString());
  assert.equal(body.handoff.updatedAt, fixedNow.toISOString());
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("GET /api/git-cicd-handoffs/:handoffId/pipeline-status uses Runtime Cache after RDS miss", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pipeline_running",
    pipelineRunUrl: "https://example.invalid/sketchcatch/infra-live/actions/runs/1",
    statusMessage: "Pipeline is running"
  });
  const runtimeCache = createInMemoryRuntimeCache();
  const app = await buildGitCicdHandoffTestApp(repository, { runtimeCache });

  const firstResponse = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}/pipeline-status`,
    headers: await authHeaders()
  });
  const secondResponse = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}/pipeline-status`,
    headers: await authHeaders()
  });

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  const firstBody = firstResponse.json() as { pipelineStatus: { source: string } };
  const secondBody = secondResponse.json() as { pipelineStatus: { source: string } };
  assert.equal(firstBody.pipelineStatus.source, "rds");
  assert.equal(secondBody.pipelineStatus.source, "runtime_cache");
  assert.equal(
    repository.calls.filter((call) => call.name === "findHandoffById").length,
    1
  );

  await app.close();
});

test("GET /api/git-cicd-handoffs/:handoffId hides handoffs from other users", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.project = createProjectRecord({
    userId: "99999999-9999-4999-8999-999999999999"
  });
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Git/CI/CD handoff not found"
  });

  await app.close();
});

test("PATCH /api/git-cicd-handoffs/:handoffId/status updates status metadata", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pr_created"
  });
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "PATCH",
    url: `/api/git-cicd-handoffs/${handoffId}/status`,
    headers: await authHeaders(),
    payload: {
      status: "pipeline_running" satisfies GitCicdHandoffStatus,
      pullRequestUrl: "https://example.invalid/sketchcatch/infra-live/pull/1",
      pipelineRunUrl: "https://example.invalid/sketchcatch/infra-live/actions/runs/1",
      statusMessage: "Pipeline started by internal provider worker"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as GitCicdHandoffResponse;
  assert.equal(body.handoff.status, "pipeline_running");
  assert.equal(
    body.handoff.pullRequestUrl,
    "https://example.invalid/sketchcatch/infra-live/pull/1"
  );
  assert.equal(
    body.handoff.pipelineRunUrl,
    "https://example.invalid/sketchcatch/infra-live/actions/runs/1"
  );
  assert.equal(body.handoff.statusMessage, "Pipeline started by internal provider worker");
  assertResponseHasNoSecretFields(body.handoff);

  await app.close();
});

test("PATCH /api/git-cicd-handoffs/:handoffId/status refreshes cached pipeline status", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pr_created"
  });
  const runtimeCache = createInMemoryRuntimeCache();
  const app = await buildGitCicdHandoffTestApp(repository, { runtimeCache });

  const patchResponse = await app.inject({
    method: "PATCH",
    url: `/api/git-cicd-handoffs/${handoffId}/status`,
    headers: await authHeaders(),
    payload: {
      status: "pipeline_running" satisfies GitCicdHandoffStatus,
      pipelineRunUrl: "https://example.invalid/sketchcatch/infra-live/actions/runs/2",
      statusMessage: "Pipeline started"
    }
  });
  const statusResponse = await app.inject({
    method: "GET",
    url: `/api/git-cicd-handoffs/${handoffId}/pipeline-status`,
    headers: await authHeaders()
  });

  assert.equal(patchResponse.statusCode, 200);
  assert.equal(statusResponse.statusCode, 200);
  const body = statusResponse.json() as {
    pipelineStatus: {
      pipelineRunUrl: string | null;
      source: string;
      status: GitCicdHandoffStatus;
      statusMessage: string | null;
    };
  };
  assert.equal(body.pipelineStatus.source, "runtime_cache");
  assert.equal(body.pipelineStatus.status, "pipeline_running");
  assert.equal(
    body.pipelineStatus.pipelineRunUrl,
    "https://example.invalid/sketchcatch/infra-live/actions/runs/2"
  );
  assert.equal(body.pipelineStatus.statusMessage, "Pipeline started");

  await app.close();
});

test("PATCH /api/git-cicd-handoffs/:handoffId/status rejects invalid status transitions", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  repository.handoff = createHandoffRecord(handoffId, {
    status: "pipeline_success"
  });
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "PATCH",
    url: `/api/git-cicd-handoffs/${handoffId}/status`,
    headers: await authHeaders(),
    payload: {
      status: "pipeline_running" satisfies GitCicdHandoffStatus
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message:
      "Invalid Git/CI/CD handoff status transition from pipeline_success to pipeline_running"
  });
  assert.equal(
    repository.calls.some((call) => call.name === "updateHandoffStatus"),
    false
  );

  await app.close();
});

test("GET /api/projects/:projectId/git-cicd-handoffs requires authentication", async () => {
  const repository = new FakeGitCicdHandoffRepository();
  const app = await buildGitCicdHandoffTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/git-cicd-handoffs`
  });

  assert.equal(response.statusCode, 401);

  await app.close();
});

type GitCicdRouteTestOptions = {
  provider?: GitCicdHandoffProvider;
  runtimeCache?: RuntimeCache;
  userRows?: UserRecord[];
};

async function buildGitCicdHandoffTestApp(
  repository: GitCicdHandoffRepository,
  routeOptions: GitCicdRouteTestOptions = {}
) {
  const app = Fastify({ logger: false });
  const fakeAuthDb = new GitCicdRouteFakeAuthDb(routeOptions.userRows ?? [createUserRecord()]);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "bad_request",
        message: error.message
      });
      return;
    }

    throw error;
  });

  await app.register(registerGitCicdHandoffRoutes, {
    prefix: "/api",
    getDatabaseClient: () => fakeAuthDb.client,
    createGitCicdHandoffRepository: () => repository,
    ...(routeOptions.provider ? { gitCicdHandoffProvider: routeOptions.provider } : {}),
    ...(routeOptions.runtimeCache ? { runtimeCache: routeOptions.runtimeCache } : {})
  });

  return app;
}

function createProviderSpy(calls: GitCicdProviderCreateInput[]): GitCicdHandoffProvider {
  return {
    async createHandoff(input) {
      calls.push(input);

      return {
        repositoryProvider: "internal",
        pullRequestUrl: null,
        pipelineRunUrl: null,
        status: "draft",
        statusMessage: null
      };
    }
  };
}

function createHandoffRecord(
  id: string = handoffId,
  overrides: Partial<GitCicdHandoffRecord> = {}
): GitCicdHandoffRecord {
  return {
    id,
    projectId,
    architectureId,
    terraformArtifactId,
    sourceRepositoryId,
    repositoryProvider: "internal",
    repositoryOwner: "sketchcatch",
    repositoryName: "infra-live",
    targetBranch: "main",
    sourceBranch: "sketchcatch/iac-preview",
    commitMessage: "Add SketchCatch Terraform preview",
    pullRequestTitle: "SketchCatch IaC preview",
    pullRequestUrl: null,
    pipelineRunUrl: null,
    status: "draft",
    statusMessage: null,
    userAcceptedChangeId: "accepted-change-1",
    createdByUserId: userId,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createProjectRecord(
  overrides: Partial<GitCicdHandoffProjectRecord> = {}
): GitCicdHandoffProjectRecord {
  return {
    id: projectId,
    userId,
    name: "Test Project",
    description: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createArchitectureRecord(
  overrides: Partial<GitCicdHandoffArchitectureRecord> = {}
): GitCicdHandoffArchitectureRecord {
  return {
    id: architectureId,
    projectId,
    version: 1,
    source: "manual",
    architectureJson: {
      nodes: [],
      edges: []
    },
    createdAt: fixedNow,
    ...overrides
  };
}

function createTerraformArtifactRecord(
  overrides: Partial<GitCicdHandoffTerraformArtifactRecord> = {}
): GitCicdHandoffTerraformArtifactRecord {
  return {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/terraform/main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform",
    uploadStatus: "uploaded",
    ...overrides
  };
}

function createHandoffBody() {
  return {
    architectureId,
    terraformArtifactId,
    sourceRepositoryId,
    repositoryOwner: "sketchcatch",
    repositoryName: "infra-live",
    targetBranch: "main",
    sourceBranch: "sketchcatch/iac-preview",
    commitMessage: "Add SketchCatch Terraform preview",
    pullRequestTitle: "SketchCatch IaC preview",
    userAcceptedChangeId: "accepted-change-1"
  };
}

function createPlanSummary() {
  return {
    createCount: 2,
    updateCount: 1,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: [
      {
        id: "repository-variable-warning",
        level: "medium",
        category: "configuration",
        source: "pre_deployment_check",
        code: "UNSUPPORTED_RESOURCE",
        message: "Confirm destination repository variables before merge.",
        relatedResourceId: "aws_instance.web",
        requiresAcknowledgement: true,
        blocksApproval: false
      }
    ]
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: userId,
    username: "git-cicd-user",
    email: "git-cicd@example.com",
    nickname: "Git CI User",
    passwordHash: "unused",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
    ...overrides
  };
}

async function authHeaders(activeUserId = userId): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(activeUserId)}`
  };
}

function assertResponseHasNoSecretFields(value: unknown): void {
  assert.equal(hasOwnKey(value, "accessToken"), false);
  assert.equal(hasOwnKey(value, "privateKey"), false);
  assert.equal(hasOwnKey(value, "ciSecret"), false);
  assert.equal(hasOwnKey(value, "deployKey"), false);
}

function hasOwnKey(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key);
}

class GitCicdRouteFakeAuthDb {
  client: DatabaseClient;

  constructor(private readonly userRows: UserRecord[]) {
    this.client = {
      db: this.createDb() as DatabaseClient["db"],
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => new SelectQuery(() => (table === users ? this.userRows : []))
      })
    };
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}
