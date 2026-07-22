import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import {
  GitCicdHandoffConfigurationStaleError,
  GitCicdInitialApplicationReleaseRequiredError,
  GitCicdSourceRepositoryMismatchError,
  type GitCicdHandoffProvider,
  type GitCicdHandoffRecord,
  type GitCicdHandoffRepository,
  type ProjectAccessContext
} from "../git-cicd/git-cicd-handoff-service.js";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import { registerGitCicdHandoffRoutes } from "./git-cicd-handoffs.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "git-cicd-handoff-route-test-secret-at-least-32-characters";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

test("initial application release evidence failure maps to HTTP 409", async (t) => {
  const app = Fastify();
  await app.register(registerGitCicdHandoffRoutes, {
    prefix: "/api",
    getDatabaseClient: createAuthDatabaseClient,
    createGitCicdHandoffRepository: () => ({}) as GitCicdHandoffRepository,
    gitCicdHandoffProvider: {} as GitCicdHandoffProvider,
    createGitCicdHandoff: async () => {
      throw new GitCicdInitialApplicationReleaseRequiredError();
    }
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` },
    payload: {
      architectureId: "33333333-3333-4333-8333-333333333333",
      terraformArtifactId: "44444444-4444-4444-8444-444444444444",
      sourceDeploymentId: "55555555-5555-4555-8555-555555555555",
      sourceRepositoryId: "repository-1",
      userAcceptedChangeId: "66666666-6666-4666-8666-666666666666"
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "GIT_CICD_INITIAL_APPLICATION_RELEASE_REQUIRED",
    message: "최초 앱 배포를 완료한 뒤 CI/CD 설치 PR을 생성해 주세요."
  });
});

test("source Repository mismatch maps to its stable HTTP 409 code", async (t) => {
  const app = Fastify();
  await app.register(registerGitCicdHandoffRoutes, {
    prefix: "/api",
    getDatabaseClient: createAuthDatabaseClient,
    createGitCicdHandoffRepository: () => ({}) as GitCicdHandoffRepository,
    gitCicdHandoffProvider: {} as GitCicdHandoffProvider,
    createGitCicdHandoff: async () => {
      throw new GitCicdSourceRepositoryMismatchError();
    }
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` },
    payload: {
      architectureId: "33333333-3333-4333-8333-333333333333",
      terraformArtifactId: "44444444-4444-4444-8444-444444444444",
      sourceDeploymentId: "55555555-5555-4555-8555-555555555555",
      sourceRepositoryId: "repository-1",
      userAcceptedChangeId: "66666666-6666-4666-8666-666666666666"
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "GIT_CICD_SOURCE_REPOSITORY_MISMATCH",
    message:
      "현재 Board와 다른 Repository가 요청되었습니다. Board에서 Repository를 다시 선택한 뒤 CI/CD 정보를 새로고침해 주세요."
  });
});

test("stale handoff configuration maps to its stable HTTP 409 code", async (t) => {
  const app = Fastify();
  await app.register(registerGitCicdHandoffRoutes, {
    prefix: "/api",
    getDatabaseClient: createAuthDatabaseClient,
    createGitCicdHandoffRepository: () => ({}) as GitCicdHandoffRepository,
    gitCicdHandoffProvider: {} as GitCicdHandoffProvider,
    createGitCicdHandoff: async () => {
      throw new GitCicdHandoffConfigurationStaleError();
    }
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd-handoffs`,
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` },
    payload: {
      architectureId: "33333333-3333-4333-8333-333333333333",
      terraformArtifactId: "44444444-4444-4444-8444-444444444444",
      sourceDeploymentId: "55555555-5555-4555-8555-555555555555",
      sourceRepositoryId: "repository-1",
      userAcceptedChangeId: "66666666-6666-4666-8666-666666666666"
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "GIT_CICD_HANDOFF_CONFIGURATION_STALE",
    message: "CI/CD 설정이 변경되었습니다. Delivery 정보를 새로고침하고 다시 검토해 주세요."
  });
});

test("setup retries an existing handoff without requiring another accepted change id", async (t) => {
  const app = Fastify();
  const handoffId = "77777777-7777-4777-8777-777777777777";
  let receivedInput: unknown;
  await app.register(registerGitCicdHandoffRoutes, {
    prefix: "/api",
    getDatabaseClient: createAuthDatabaseClient,
    createGitCicdHandoffRepository: () => ({}) as GitCicdHandoffRepository,
    gitCicdHandoffProvider: {} as GitCicdHandoffProvider,
    runtimeCache: createInMemoryRuntimeCache({ cleanupIntervalMs: null }),
    setupGitCicdHandoff: async (input: {
      handoffId: string;
      accessContext: ProjectAccessContext;
    }) => {
      receivedInput = input;
      return createHandoffRecord(input.handoffId);
    }
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/git-cicd-handoffs/${handoffId}/setup`,
    headers: { authorization: `Bearer ${await createAccessToken(userId)}` }
  });

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(receivedInput, {
    handoffId,
    accessContext: { kind: "user", userId }
  });
  assert.equal(response.json().handoff.userAcceptedChangeId, "accepted-plan-1");
  assert.equal(response.json().handoff.status, "pr_created");
});

function createHandoffRecord(id: string): GitCicdHandoffRecord {
  return {
    id,
    projectId,
    architectureId: "architecture-1",
    terraformArtifactId: "terraform-1",
    handoffKind: "terraform_iac",
    sourceDeploymentId: "deployment-1",
    deploymentMode: "infra_and_app",
    requiresEnvironmentApproval: true,
    sourceRepositoryId: "repository-1",
    repositoryProvider: "github",
    repositoryOwner: "sketchcatch",
    repositoryName: "demo",
    targetBranch: "main",
    sourceBranch: "sketchcatch/demo/iac-handoff",
    commitMessage: null,
    pullRequestTitle: "Deploy SketchCatch",
    pullRequestUrl: "https://github.com/sketchcatch/demo/pull/1",
    pullRequestNumber: 1,
    pullRequestHeadSha: "a".repeat(40),
    mergeCommitSha: null,
    environmentName: "sketchcatch-production",
    pipelineRunUrl: null,
    infraPipelineRunUrl: null,
    infraPipelineStatus: "waiting_for_merge",
    appPipelineRunUrl: null,
    appPipelineStatus: "not_started",
    destroyPipelineRunUrl: null,
    destroyPipelineStatus: "not_started",
    staticSiteUrl: null,
    apiBaseUrl: null,
    repositorySettingsPreview: null,
    awsRoleDiff: null,
    githubAppPermissionRequired: false,
    status: "pr_created",
    statusMessage: null,
    userAcceptedChangeId: "accepted-plan-1",
    createdByUserId: userId,
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    updatedAt: new Date("2026-07-22T00:01:00.000Z")
  };
}

function createAuthDatabaseClient(): DatabaseClient {
  const query = {
    from() {
      return {
        where() {
          return Promise.resolve([{ id: userId, deletedAt: null }]);
        }
      };
    }
  };

  return {
    db: {
      select() {
        return query;
      }
    } as unknown as DatabaseClient["db"],
    pool: { end: async () => undefined } as DatabaseClient["pool"]
  };
}
