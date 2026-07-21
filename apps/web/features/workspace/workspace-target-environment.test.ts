import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WORKSPACE_TARGET_ENVIRONMENT,
  createWorkspaceTargetEnvironmentOptions
} from "./workspace-target-environment";

test("새 프로젝트는 네 대상 환경을 제공하고 AWS를 기본 선택한다", () => {
  assert.equal(DEFAULT_WORKSPACE_TARGET_ENVIRONMENT, "aws");
  assert.deepEqual(createWorkspaceTargetEnvironmentOptions(), [
    { id: "aws", label: "AWS" },
    { id: "gcp", label: "GCP" },
    { id: "azure", label: "Azure" },
    { id: "on_premise", label: "On-premise" }
  ]);
});
