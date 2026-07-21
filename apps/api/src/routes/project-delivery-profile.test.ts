import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { ProjectDeliveryProfile } from "@sketchcatch/types";
import { registerProjectDeliveryProfileRoutes } from "./project-delivery-profile.js";

const projectId = "11111111-1111-4111-8111-111111111111";

test("GET returns one read-only Project Delivery Profile", async (t) => {
  const calls: Array<{ projectId: string; userId: string }> = [];
  const app = Fastify();
  await app.register(registerProjectDeliveryProfileRoutes, {
    getProfile: async (input: { projectId: string; userId: string }) => {
      calls.push(input);
      return createProfile();
    },
    requireUserId: async () => "user-1"
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/projects/${projectId}/delivery-profile`
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().profile.readiness.projectId, projectId);
  assert.deepEqual(calls, [{ projectId, userId: "user-1" }]);
});

test("GET rejects an invalid project id before reading Delivery state", async (t) => {
  let readCount = 0;
  const app = Fastify();
  await app.register(registerProjectDeliveryProfileRoutes, {
    getProfile: async () => {
      readCount += 1;
      return createProfile();
    },
    requireUserId: async () => "user-1"
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/projects/not-a-uuid/delivery-profile" });

  assert.equal(response.statusCode, 400);
  assert.equal(readCount, 0);
});

function createProfile(): ProjectDeliveryProfile {
  return {
    githubInstallations: [],
    repositoryAnalysisTarget: null,
    sourceRepository: null,
    monitoringConfig: null,
    deploymentTarget: null,
    environmentName: null,
    buildVerification: {
      status: "not_started",
      requestedCommitSha: null,
      resolvedCommitSha: null,
      statusReason: null,
      verifiedAt: null
    },
    handoffConfigurationPreview: null,
    readiness: {
      projectId,
      checkedAt: "2026-07-17T00:00:00.000Z",
      ready: false,
      requiredActionCount: 3,
      sourceDeploymentId: null,
      approvedApplyPlanArtifactId: null,
      initialApplicationReleaseId: null,
      items: []
    }
  };
}
