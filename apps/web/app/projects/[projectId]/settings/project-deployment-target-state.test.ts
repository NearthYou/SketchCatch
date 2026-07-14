import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeploymentTargetDraft,
  createDeploymentTargetRequest,
  createEcsFargateDeploymentDefaults
} from "./project-deployment-target-state.js";

const verifiedConnection = {
  id: "abcdef12-3456-4789-8abc-def012345678",
  userId: "user-1",
  accountId: "123456789012",
  roleArn: "arn:aws:iam::123456789012:role/SketchCatch",
  externalId: "external-id",
  region: "ap-northeast-2",
  status: "verified" as const,
  lastVerifiedAt: "2026-07-15T00:00:00.000Z",
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z"
};

test("ECS defaults use project slug and analyzed Dockerfile evidence", () => {
  assert.deepEqual(
    createEcsFargateDeploymentDefaults({
      projectName: "Audience Live Check",
      repositoryRevision: "a".repeat(40),
      sourceRoot: "apps/api",
      dockerfilePath: "apps/api/Dockerfile"
    }),
    {
      runtimeTargetKind: "ecs_fargate",
      sourceRoot: "apps/api",
      evidencePath: "apps/api/Dockerfile",
      commitSha: "a".repeat(40),
      codeBuildProjectName: "audience-live-check-app-build",
      ecrRepositoryName: "audience-live-check-app",
      clusterName: "audience-live-check-cluster",
      serviceName: "audience-live-check-service",
      containerName: "web",
      healthCheckPath: "/",
      outputUrl: ""
    }
  );
});

test("ECS defaults are immediately saveable without a fabricated output URL", () => {
  const draft = createDeploymentTargetDraft(null, [verifiedConnection], null, {
    projectName: "Audience Live Check",
    repositoryRevision: "a".repeat(40),
    sourceRoot: "apps/api",
    dockerfilePath: "apps/api/Dockerfile"
  });
  const request = createDeploymentTargetRequest(
    draft,
    [verifiedConnection],
    new Date("2026-07-15T00:00:00.000Z")
  );

  assert.equal(request.runtimeConfig?.runtimeTargetKind, "ecs_fargate");
  assert.equal(request.runtimeConfig?.outputUrl, null);
  assert.equal(request.confirmedBuildConfig.healthCheckPath, "/");
});

test("callback preference replaces an existing non-ECS target with complete ECS defaults", () => {
  const draft = createDeploymentTargetDraft(
    {
      projectId: "project-1",
      provider: "aws",
      connectionId: verifiedConnection.id,
      region: verifiedConnection.region,
      runtimeTargetKind: "lambda",
      confirmedBuildConfig: null,
      runtimeConfig: {
        runtimeTargetKind: "lambda",
        functionLogicalId: "ApiFunction",
        functionName: "old-function",
        aliasName: "live",
        codeDeployApplicationName: "old-app",
        codeDeployDeploymentGroupName: "old-group",
        outputUrl: "https://old.example.com"
      },
      rolloutStrategy: "all_at_once",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z"
    },
    [verifiedConnection],
    null,
    {
      projectName: "Audience Live Check",
      repositoryRevision: "a".repeat(40),
      sourceRoot: "apps/api",
      dockerfilePath: "apps/api/Dockerfile"
    },
    "prefer_ecs_defaults"
  );

  assert.equal(draft.runtimeTargetKind, "ecs_fargate");
  assert.equal(draft.codeBuildProjectName, "audience-live-check-app-build");
  assert.equal(draft.ecrRepositoryName, "audience-live-check-app");
  assert.equal(draft.clusterName, "audience-live-check-cluster");
  assert.equal(draft.serviceName, "audience-live-check-service");
  assert.equal(draft.containerName, "web");
  assert.equal(draft.outputUrl, "");
});
