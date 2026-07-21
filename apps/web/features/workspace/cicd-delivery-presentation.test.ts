import assert from "node:assert/strict";
import test from "node:test";
import type { GitCicdPipelineRun } from "@sketchcatch/types";
import {
  formatPipelineRunOption,
  getDeploymentTargetPresentation,
  getPipelinePresentation
} from "./cicd-delivery-presentation";

test("labels an auto-filled AWS connection as unsaved", () => {
  assert.equal(
    getDeploymentTargetPresentation({
      draftAwsConnectionId: "aws-1",
      savedAwsConnectionId: null,
      isDirty: false
    }).statusLabel,
    "저장 전 추천값"
  );
});

test("distinguishes saved, dirty, and required target states", () => {
  assert.equal(
    getDeploymentTargetPresentation({
      draftAwsConnectionId: "aws-1",
      savedAwsConnectionId: "aws-1",
      isDirty: false
    }).status,
    "saved"
  );
  assert.equal(
    getDeploymentTargetPresentation({
      draftAwsConnectionId: "aws-2",
      savedAwsConnectionId: "aws-1",
      isDirty: true
    }).statusLabel,
    "미저장 변경"
  );
  assert.equal(
    getDeploymentTargetPresentation({
      draftAwsConnectionId: null,
      savedAwsConnectionId: null,
      isDirty: false
    }).status,
    "required"
  );
});

test("hides Pipeline controls when no run has been detected", () => {
  const empty = getPipelinePresentation([]);

  assert.equal(empty.hasRuns, false);
  assert.equal(empty.showRunControls, false);
  assert.equal(empty.emptyTitle, "아직 실행된 Pipeline이 없습니다");
  assert.equal(getPipelinePresentation([pipelineRun()]).showRunControls, true);
});

test("uses a short execution, commit, and status label in the Pipeline selector", () => {
  assert.equal(formatPipelineRunOption(pipelineRun()), "코드 배포 · e6f0e0a6 · 실행 중");
  assert.equal(
    formatPipelineRunOption(pipelineRun({ executionKind: "infra", status: "failed" })),
    "인프라 배포 · e6f0e0a6 · 실패"
  );
});

function pipelineRun(overrides: Partial<GitCicdPipelineRun> = {}): GitCicdPipelineRun {
  return {
    id: "run-1",
    projectId: "project-1",
    infrastructureDeploymentId: null,
    sourceRepositoryId: "repository-1",
    handoffId: "handoff-1",
    executionKind: "app",
    githubWorkflowRunId: "101",
    githubWorkflowRunAttempt: 1,
    commitSha: "e6f0e0a612345678901234567890123456789012",
    commitMessage: "Deploy the application",
    branch: "main",
    changeScope: "app",
    status: "running",
    statusMessage: null,
    pipelineRunUrl: "https://github.com/owner/repo/actions/runs/101",
    appUrl: null,
    apiUrl: null,
    startedAt: "2026-07-20T10:00:00.000Z",
    finishedAt: null,
    upstreamOrderingToken: "1",
    logRevision: "1",
    lastRefreshedAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-20T10:00:00.000Z",
    stages: [],
    ...overrides
  };
}
