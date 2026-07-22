import assert from "node:assert/strict";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import type { GitCicdReadinessSnapshot } from "@sketchcatch/types";
import {
  GitCicdReadinessNotFoundError,
  GitCicdReadinessRefreshError
} from "../git-cicd/git-cicd-readiness-service.js";
import { registerGitCicdReadinessRoutes } from "./git-cicd-readiness.js";

process.env.NODE_ENV = "test";

const projectId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";

test("readiness refresh requires an authenticated owner", async (t) => {
  const app = await buildApp(async () => createActionRequiredSnapshot());
  t.after(() => app.close());

  const unauthenticated = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd/readiness/refresh`
  });
  assert.equal(unauthenticated.statusCode, 401);

  const foreignProject = await buildApp(async () => {
    throw new GitCicdReadinessNotFoundError("Project not found");
  });
  t.after(() => foreignProject.close());
  const inaccessible = await foreignProject.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd/readiness/refresh`,
    headers: { authorization: `Bearer ${ownerId}` }
  });
  assert.equal(inaccessible.statusCode, 404);
  assert.deepEqual(inaccessible.json(), {
    error: "not_found",
    message: "Project not found"
  });
});

test("readiness refresh returns action_required evidence gaps as a successful response", async (t) => {
  const snapshot = createActionRequiredSnapshot();
  const calls: Array<{ projectId: string; userId: string }> = [];
  const app = await buildApp(async (input) => {
    calls.push(input);
    return snapshot;
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd/readiness/refresh`,
    headers: { authorization: `Bearer ${ownerId}` }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { readiness: snapshot });
  assert.deepEqual(calls, [{ projectId, userId: ownerId }]);
});

test("readiness refresh maps transient evidence failures to a stable 503 code", async (t) => {
  const app = await buildApp(async () => {
    throw new GitCicdReadinessRefreshError("temporary S3 failure with internal details", {
      cause: new Error("S3 timeout")
    });
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd/readiness/refresh`,
    headers: { authorization: `Bearer ${ownerId}` }
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: "GIT_CICD_READINESS_REFRESH_FAILED",
    message: "Git/CI/CD readiness evidence could not be refreshed"
  });
  assert.doesNotMatch(response.body, /temporary S3 failure|internal details/u);

  const databaseFailure = await buildApp(async () => {
    throw new Error("temporary database failure with raw query details");
  });
  t.after(() => databaseFailure.close());
  const databaseResponse = await databaseFailure.inject({
    method: "POST",
    url: `/api/projects/${projectId}/git-cicd/readiness/refresh`,
    headers: { authorization: `Bearer ${ownerId}` }
  });
  assert.equal(databaseResponse.statusCode, 503);
  assert.equal(databaseResponse.json().error, "GIT_CICD_READINESS_REFRESH_FAILED");
  assert.doesNotMatch(databaseResponse.body, /raw query details/u);
});

async function buildApp(
  refresh: (input: { projectId: string; userId: string }) => Promise<GitCicdReadinessSnapshot>
) {
  const app = Fastify();
  await app.register(registerGitCicdReadinessRoutes, {
    prefix: "/api",
    refreshGitCicdReadiness: refresh,
    requireUserId: async (request: FastifyRequest) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) {
        throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
      }
      return authorization.slice("Bearer ".length);
    }
  });
  return app;
}

function createActionRequiredSnapshot(): GitCicdReadinessSnapshot {
  return {
    projectId,
    checkedAt: "2026-07-17T01:00:00.000Z",
    ready: false,
    requiredActionCount: 4,
  sourceDeploymentId: null,
  approvedApplyPlanArtifactId: null,
  initialApplicationReleaseId: null,
    items: [
      {
        key: "approved_apply_plan",
        label: "승인된 Apply Plan",
        status: "action_required",
        missingKeys: [],
        action: "approve_apply_plan"
      },
      {
        key: "source_repository",
        label: "소스 저장소",
        status: "action_required",
        missingKeys: [],
        action: "select_repository"
      },
      {
        key: "monitoring_config",
        label: "모니터링 설정",
        status: "action_required",
        missingKeys: [],
        action: "confirm_monitoring_config"
      },
      {
        key: "deployment_target",
        label: "배포 타깃",
        status: "action_required",
        completedCount: 0,
        totalCount: 4,
        missingKeys: ["aws_connection", "build_config"],
        action: "select_aws_connection"
      }
    ]
  };
}
