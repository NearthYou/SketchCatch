import assert from "node:assert/strict";
import test from "node:test";

import { createRepositorySettingsPreview } from "./git-cicd-workflows.js";

test("ECS GitOps setup fails before rendering settings without an output URL", () => {
  assert.throws(
    () => createRepositorySettingsPreview({
      projectSlug: "audience-live-check",
      repositoryOwner: "NearthYou",
      repositoryName: "SketchCatch",
      targetBranch: "main",
      runtimeTargetKind: "ecs_fargate",
      runtimeConfig: {
        runtimeTargetKind: "ecs_fargate",
        codeBuildProjectName: "audience-live-check-app-build",
        ecrRepositoryName: "audience-live-check-app",
        clusterName: "audience-live-check-cluster",
        serviceName: "audience-live-check-service",
        containerName: "web",
        outputUrl: null
      }
    }),
    /DEPLOYMENT_OUTPUT_URL_REQUIRED/
  );
});
