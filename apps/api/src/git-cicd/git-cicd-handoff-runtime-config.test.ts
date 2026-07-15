import assert from "node:assert/strict";
import test from "node:test";

import {
  assertGitOpsTarget,
  GitCicdHandoffProviderConflictError,
  type GitCicdHandoffDeploymentTargetRecord,
  type GitCicdHandoffSourceRepositoryRecord
} from "./git-cicd-handoff-service.js";

test("GitOps handoff reports a stable code when the deployment target is missing", () => {
  assert.throws(
    () =>
      assertGitOpsTarget(
        undefined,
        {} as GitCicdHandoffSourceRepositoryRecord,
        { mode: "repository_root", path: "." }
      ),
    (error: unknown) =>
      error instanceof GitCicdHandoffProviderConflictError &&
      error.code === "PROJECT_DEPLOYMENT_TARGET_REQUIRED"
  );
});

test("ECS GitOps handoff reports the required output URL for a null runtime config", () => {
  const target = {
    runtimeTargetKind: "ecs_fargate",
    confirmedBuildConfig: {},
    runtimeConfig: null,
    awsRoleArn: "arn:aws:iam::123456789012:role/SketchCatch"
  } as unknown as GitCicdHandoffDeploymentTargetRecord;

  assert.throws(
    () => assertGitOpsTarget(
      target,
      {} as GitCicdHandoffSourceRepositoryRecord,
      { mode: "repository_root", path: "." }
    ),
    (error: unknown) =>
      error instanceof GitCicdHandoffProviderConflictError &&
      error.code === "DEPLOYMENT_OUTPUT_URL_REQUIRED"
  );
});
