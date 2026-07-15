import assert from "node:assert/strict";
import { test } from "node:test";
import type { Deployment, GitCicdMonitoringConfig, SourceRepository } from "@sketchcatch/types";
import { buildGitCicdHandoffRequest, selectGitCicdSourceDeployment } from "./cicd-handoff";

function deployment(
  overrides: Partial<Deployment> & Pick<Deployment, "id" | "createdAt">
): Deployment {
  const { createdAt, id, ...remainingOverrides } = overrides;

  return {
    id,
    projectId: "project-1",
    architectureId: "architecture-1",
    terraformArtifactId: "terraform-1",
    awsConnectionId: "connection-1",
    liveProfile: "practice",
    scope: "full_stack",
    targetKind: "ecs_fargate",
    source: "direct",
    releaseId: null,
    currentPlanArtifactId: "plan-1",
    currentPlanOperation: "apply",
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "PENDING",
    activeStage: null,
    planSummary: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: "2026-07-15T00:00:00.000Z",
    approvedByUserId: "user-1",
    approvedTerraformArtifactId: "terraform-1",
    approvedPlanArtifactId: "approved-plan-1",
    approvedTerraformArtifactHash: "terraform-hash",
    approvedTfplanHash: "plan-hash",
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt,
    updatedAt: createdAt,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    ...remainingOverrides
  };
}

test("selects the latest directly approved apply plan for a Git handoff", () => {
  const selected = selectGitCicdSourceDeployment([
    deployment({ id: "older-approved", createdAt: "2026-07-13T00:00:00.000Z" }),
    deployment({
      id: "newer-unapproved",
      createdAt: "2026-07-15T00:00:00.000Z",
      approvedPlanArtifactId: null
    }),
    deployment({ id: "latest-approved", createdAt: "2026-07-14T00:00:00.000Z" })
  ]);

  assert.equal(selected?.id, "latest-approved");
});

test("uses the server-recorded approved plan artifact as the user acceptance id", () => {
  const sourceDeployment = deployment({
    id: "deployment-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    approvedPlanArtifactId: "approved-plan-artifact"
  });
  const repository = {
    id: "repository-1",
    owner: "whiskend",
    name: "audience-live-check"
  } as SourceRepository;
  const monitoringConfig = {
    monitorBranch: "main"
  } as GitCicdMonitoringConfig;

  const request = buildGitCicdHandoffRequest({
    deployment: sourceDeployment,
    monitoringConfig,
    repository
  });

  assert.equal(request.userAcceptedChangeId, "approved-plan-artifact");
  assert.equal(request.sourceDeploymentId, "deployment-1");
  assert.equal(request.sourceRepositoryId, "repository-1");
  assert.equal(request.targetBranch, "main");
  assert.equal(request.deploymentMode, "infra_and_app");
});
