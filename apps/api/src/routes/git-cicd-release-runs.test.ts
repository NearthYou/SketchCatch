import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { GitHubReleaseIdentity } from "../git-cicd/github-oidc-release-identity.js";
import type {
  GitHubReleaseRunExecutor,
  GitHubReleaseRunRecord,
  GitHubReleaseRunRepository
} from "../git-cicd/github-release-run-service.js";
import { registerGitHubReleaseRunRoutes } from "./git-cicd-release-runs.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const commitSha = "a".repeat(40);
const identity: GitHubReleaseIdentity = {
  subject: "repo:jh-9999/audience-live-check:environment:sketchcatch-production",
  repository: "jh-9999/audience-live-check",
  repositoryId: "123456789",
  commitSha,
  ref: "refs/heads/main",
  workflowRef:
    "jh-9999/audience-live-check/.github/workflows/sketchcatch-app.yml@refs/heads/main",
  workflowRunId: "987654321",
  workflowRunAttempt: 1,
  environment: "sketchcatch-production"
};

test("release-run routes authenticate GitHub OIDC and return an idempotent run", async () => {
  const repository = createRepository();
  const enqueued: string[] = [];
  const executor: GitHubReleaseRunExecutor = {
    enqueue(id) {
      enqueued.push(id);
    },
    async cancel() {}
  };
  const app = Fastify();
  await app.register(registerGitHubReleaseRunRoutes, {
    prefix: "/api",
    repository,
    executor,
    verifyIdentity: async () => identity,
    generateId: () => runId,
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });

  const body = {
    repository: identity.repository,
    repositoryId: identity.repositoryId,
    commitSha,
    ref: identity.ref,
    workflow: identity.workflowRef,
    workflowRunId: identity.workflowRunId,
    workflowRunAttempt: identity.workflowRunAttempt,
    workflowRunUrl:
      "https://github.com/jh-9999/audience-live-check/actions/runs/987654321"
  };
  const first = await app.inject({
    method: "POST",
    url: `/api/git-cicd/projects/${projectId}/release-runs`,
    headers: {
      authorization: "Bearer signed-token",
      "idempotency-key": `123456789:${commitSha}:987654321:1`
    },
    payload: body
  });
  const duplicate = await app.inject({
    method: "POST",
    url: `/api/git-cicd/projects/${projectId}/release-runs`,
    headers: {
      authorization: "Bearer signed-token",
      "idempotency-key": `123456789:${commitSha}:987654321:1`
    },
    payload: body
  });

  assert.equal(first.statusCode, 202);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(first.json().run.id, runId);
  assert.deepEqual(enqueued, [runId]);
  await app.close();
});

test("release-run routes reject requests without a bearer identity", async () => {
  const app = Fastify();
  await app.register(registerGitHubReleaseRunRoutes, {
    prefix: "/api",
    repository: createRepository(),
    executor: { enqueue() {}, async cancel() {} },
    verifyIdentity: async () => identity
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/git-cicd/release-runs/${runId}`
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "GITHUB_OIDC_INVALID");
  await app.close();
});

test("project owner can cancel the GitHub release run without a GitHub OIDC token", async () => {
  const repository = createRepository();
  const cancelled: string[] = [];
  const app = Fastify();
  await app.register(registerGitHubReleaseRunRoutes, {
    prefix: "/api",
    repository,
    executor: {
      enqueue() {},
      async cancel(id: string) {
        cancelled.push(id);
      }
    },
    verifyIdentity: async () => identity,
    requireOwnerUserId: async () => "owner-user",
    generateId: () => runId
  });
  await repository.create({
    id: runId,
    projectId,
    sourceRepositoryId: "repository-1",
    requestKey: `123456789:${commitSha}:987654321:1`,
    request: {
      repository: identity.repository,
      repositoryId: identity.repositoryId,
      commitSha,
      ref: identity.ref,
      workflow: identity.workflowRef,
      workflowRunId: identity.workflowRunId,
      workflowRunAttempt: 1,
      workflowRunUrl:
        "https://github.com/jh-9999/audience-live-check/actions/runs/987654321"
    },
    identity,
    branch: "main",
    now: new Date("2026-07-15T00:00:00.000Z")
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd/release-runs/${runId}/cancel`
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(cancelled, [runId]);
  await app.close();
});

test("project owner can retry only the frontend for a partially failed GitHub release", async () => {
  const repository = createRepository();
  const retried: string[] = [];
  const app = Fastify();
  await app.register(registerGitHubReleaseRunRoutes, {
    prefix: "/api",
    repository,
    executor: {
      enqueue() {},
      async cancel() {},
      async retryFrontend(id: string) {
        retried.push(id);
      }
    },
    verifyIdentity: async () => identity,
    requireOwnerUserId: async () => "owner-user"
  });
  await repository.create({
    id: runId,
    projectId,
    sourceRepositoryId: "repository-1",
    requestKey: `123456789:${commitSha}:987654321:1`,
    request: {
      repository: identity.repository,
      repositoryId: identity.repositoryId,
      commitSha,
      ref: identity.ref,
      workflow: identity.workflowRef,
      workflowRunId: identity.workflowRunId,
      workflowRunAttempt: 1,
      workflowRunUrl:
        "https://github.com/jh-9999/audience-live-check/actions/runs/987654321"
    },
    identity,
    branch: "main",
    now: new Date("2026-07-15T00:00:00.000Z")
  });
  const record = await repository.findById(runId);
  assert.ok(record);
  record.releaseId = "release-1";
  record.releaseStatus = "partially_failed";
  record.failureStage = "cloudfront_invalidation";
  record.outputUrl = "https://demo.cloudfront.net";
  record.pipelineStatus = "failed";

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd/release-runs/${runId}/frontend/retry`
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(retried, [runId]);
  assert.equal(response.json().run.outputUrl, "https://demo.cloudfront.net");
  await app.close();
});

function createRepository(): GitHubReleaseRunRepository {
  const records = new Map<string, GitHubReleaseRunRecord>();
  const requestKeys = new Map<string, string>();
  return {
    async findProjectContext(id) {
      return id === projectId
        ? {
            projectId,
            sourceRepositoryId: "repository-1",
            repositoryOwner: "jh-9999",
            repositoryName: "audience-live-check",
            githubRepositoryId: "123456789",
            defaultBranch: "main",
            monitorBranch: "main",
            monitoringEnabled: true,
            buildEnvironmentReady: true,
            environmentName: "sketchcatch-production",
            runtimeTargetKind: "ecs_fargate"
          }
        : undefined;
    },
    async findByRequestKey(key) {
      const id = requestKeys.get(key);
      return id ? records.get(id) : undefined;
    },
    async findById(id) {
      return records.get(id);
    },
    async findByIdForOwner(input) {
      return input.userId === "owner-user" ? records.get(input.runId) : undefined;
    },
    async create(input) {
      const record: GitHubReleaseRunRecord = {
        id: input.id,
        projectId: input.projectId,
        infrastructureDeploymentId: "deployment-1",
        sourceRepositoryId: input.sourceRepositoryId,
        commitSha: input.request.commitSha,
        branch: input.branch,
        repositoryId: input.request.repositoryId,
        workflowRef: input.request.workflow,
        workflowRunId: input.request.workflowRunId,
        workflowRunAttempt: input.request.workflowRunAttempt,
        workflowRunUrl: input.request.workflowRunUrl,
        oidcSubject: input.identity.subject,
        environmentName: input.identity.environment,
        pipelineStatus: "queued",
        statusMessage: null,
        releaseId: null,
        releaseStatus: null,
        outputUrl: null,
        failureStage: null,
        cancellationRequestedAt: null,
        createdAt: input.now,
        finishedAt: null
      };
      records.set(record.id, record);
      requestKeys.set(input.requestKey, record.id);
      return record;
    },
    async requestCancellation(input) {
      return records.get(input.runId);
    }
  };
}
