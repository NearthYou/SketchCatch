import assert from "node:assert/strict";
import test from "node:test";
import type { GitCicdPipelineRun } from "@sketchcatch/types";
import {
  canOpenGitCicdLiveObservation,
  canRetryGitCicdFrontend,
  getGitCicdLiveObservationSelection
} from "./cicd-frontend-retry";
import { getSafePipelineRunLinks } from "./deployment-output-links";

test("CI/CD offers frontend-only retry only for a terminal frontend partial failure", () => {
  const run = createRun();
  assert.equal(canRetryGitCicdFrontend(run), true);
  assert.equal(canRetryGitCicdFrontend({ ...run, status: "running" }), false);
  assert.equal(
    canRetryGitCicdFrontend({
      ...run,
      release: run.release ? { ...run.release, failureStage: "ecs_health" } : null
    }),
    false
  );
});

test("CI/CD keeps Live Observation available while the frontend is partially failed", () => {
  const run = createRun();
  assert.equal(canOpenGitCicdLiveObservation(run), true);
  assert.deepEqual(getGitCicdLiveObservationSelection(run), {
    runId: "run-1",
    deploymentId: "deployment-1",
    outputUrl: "https://demo.cloudfront.net/"
  });
  assert.equal(
    canOpenGitCicdLiveObservation({ ...run, infrastructureDeploymentId: null }),
    false
  );
  assert.deepEqual(getSafePipelineRunLinks(run), [
    {
      kind: "web",
      label: "Web entry point",
      url: "https://demo.cloudfront.net"
    }
  ]);
});

function createRun(): GitCicdPipelineRun {
  return {
    id: "run-1",
    projectId: "project-1",
    infrastructureDeploymentId: "deployment-1",
    sourceRepositoryId: "repository-1",
    handoffId: null,
    commitSha: "a".repeat(40),
    commitMessage: "demo",
    branch: "main",
    changeScope: "app",
    status: "failed",
    statusMessage: "웹 배포 부분 실패",
    pipelineRunUrl: null,
    appUrl: "https://demo.cloudfront.net",
    apiUrl: "https://demo.cloudfront.net",
    startedAt: "2026-07-15T00:00:00.000Z",
    finishedAt: "2026-07-15T00:05:00.000Z",
    upstreamOrderingToken: "1:1",
    logRevision: "",
    lastRefreshedAt: "2026-07-15T00:05:00.000Z",
    createdAt: "2026-07-15T00:00:00.000Z",
    stages: [],
    release: {
      id: "release-1",
      projectId: "project-1",
      deploymentId: null,
      pipelineRunId: "run-1",
      source: "gitops",
      runtimeTargetKind: "ecs_fargate",
      version: "git-aaaaaaaaaaaa",
      commitSha: "a".repeat(40),
      artifactDigestAlgorithm: "sha256",
      artifactDigest: "b".repeat(64),
      releaseCandidateId: "candidate-1",
      compositeDigest: null,
      providerRevision: null,
      frontendEvidence: null,
      failureStage: "cloudfront_invalidation",
      baselineReleaseId: null,
      outputUrl: "https://demo.cloudfront.net",
      status: "partially_failed",
      healthEvidence: null,
      rollbackEvidence: null,
      startedAt: "2026-07-15T00:00:00.000Z",
      completedAt: "2026-07-15T00:05:00.000Z",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:05:00.000Z"
    }
  };
}
