import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createInfrastructureDeploymentCommand,
  formatPipelineExecutionKind
} from "./cicd-deployment-command";

test("builds the confirmed infrastructure deployment command", () => {
  assert.equal(
    createInfrastructureDeploymentCommand("main"),
    "gh workflow run sketchcatch-infra.yml --ref main"
  );
});

test("uses a validated repository workflow file and default branch", () => {
  assert.equal(
    createInfrastructureDeploymentCommand("release/2026.07", "team-infra.yaml"),
    "gh workflow run team-infra.yaml --ref release/2026.07"
  );
});

test("rejects shell control characters in the workflow file or branch", () => {
  assert.throws(
    () => createInfrastructureDeploymentCommand("main; rm -rf /"),
    /안전한 Git branch/u
  );
  assert.throws(
    () => createInfrastructureDeploymentCommand("main", "infra.yml && echo exposed"),
    /안전한 GitHub Workflow 파일명/u
  );
});

test("rejects ambiguous Git refs and workflow paths", () => {
  for (const branch of ["-main", "feature//demo", "feature/../main", "release@{1}"]) {
    assert.throws(() => createInfrastructureDeploymentCommand(branch), /안전한 Git branch/u);
  }

  for (const workflowFile of ["../infra.yml", ".github/workflows/infra.yml", "infra.txt"]) {
    assert.throws(
      () => createInfrastructureDeploymentCommand("main", workflowFile),
      /안전한 GitHub Workflow 파일명/u
    );
  }
});

test("labels app and infra runs independently even on the same SHA", () => {
  assert.equal(formatPipelineExecutionKind("app"), "코드 배포");
  assert.equal(formatPipelineExecutionKind("infra"), "인프라 배포");
});
