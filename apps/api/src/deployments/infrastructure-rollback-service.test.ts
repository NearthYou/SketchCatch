import assert from "node:assert/strict";
import test from "node:test";
import type { AwsConnection } from "@sketchcatch/types";
import {
  DeploymentConflictError,
  DeploymentNotFoundError,
  type CreateDeploymentRecordInput,
  type DeploymentRecord,
  type DeploymentRepository
} from "./deployment-service.js";
import { prepareInfrastructureRollback } from "./infrastructure-rollback-service.js";

const accessContext = { kind: "user" as const, userId: "user-1" };

test("infrastructure rollback creates a new pending deployment from the previous successful configuration", async () => {
  const target = deployment({
    id: "deployment-target",
    status: "SUCCESS",
    terraformArtifactId: "artifact-old",
    architectureId: "architecture-old",
    stateObjectKey: "deployments/deployment-target/state/terraform.tfstate",
    createdAt: new Date("2026-07-15T10:00:00.000Z")
  });
  const source = deployment({
    id: "deployment-current",
    status: "FAILED",
    failureStage: "apply",
    terraformArtifactId: "artifact-new",
    stateObjectKey: "deployments/deployment-current/state/terraform.tfstate",
    createdAt: new Date("2026-07-15T11:00:00.000Z")
  });
  const repository = repositoryWith([source, target]);

  const result = await prepareInfrastructureRollback(
    { deploymentId: source.id, accessContext },
    repository,
    () => "deployment-rollback"
  );

  assert.equal(result.id, "deployment-rollback");
  assert.equal(result.status, "PENDING");
  assert.equal(result.scope, "infrastructure");
  assert.equal(result.terraformArtifactId, target.terraformArtifactId);
  assert.equal(result.architectureId, target.architectureId);
  assert.equal(result.rollbackOfDeploymentId, source.id);
  assert.equal(result.rollbackTargetDeploymentId, target.id);
});

test("infrastructure rollback rejects a source without current Terraform state", async () => {
  const source = deployment({
    id: "deployment-current",
    status: "FAILED",
    failureStage: "apply",
    stateObjectKey: null
  });

  await assert.rejects(
    prepareInfrastructureRollback(
      { deploymentId: source.id, accessContext },
      repositoryWith([source]),
      () => "deployment-rollback"
    ),
    (error: unknown) =>
      error instanceof DeploymentConflictError && /current Terraform state/u.test(error.message)
  );
});

test("infrastructure rollback does not offer an unrelated account or region as a target", async () => {
  const source = deployment({
    id: "deployment-current",
    status: "FAILED",
    failureStage: "apply",
    stateObjectKey: "deployments/deployment-current/state/terraform.tfstate",
    createdAt: new Date("2026-07-15T11:00:00.000Z")
  });
  const otherRegion = deployment({
    id: "deployment-other-region",
    status: "SUCCESS",
    awsRegionSnapshot: "us-east-1",
    stateObjectKey: "deployments/deployment-other-region/state/terraform.tfstate",
    createdAt: new Date("2026-07-15T10:00:00.000Z")
  });

  await assert.rejects(
    prepareInfrastructureRollback(
      { deploymentId: source.id, accessContext },
      repositoryWith([source, otherRegion]),
      () => "deployment-rollback"
    ),
    (error: unknown) =>
      error instanceof DeploymentNotFoundError && /previous successful/u.test(error.message)
  );
});

test("infrastructure rollback rejects a stale source after a newer state-bearing deployment", async () => {
  const source = deployment({
    id: "deployment-stale",
    status: "FAILED",
    failureStage: "apply",
    stateObjectKey: "deployments/deployment-stale/state/terraform.tfstate",
    createdAt: new Date("2026-07-15T11:00:00.000Z")
  });
  const newer = deployment({
    id: "deployment-newer",
    status: "SUCCESS",
    stateObjectKey: "deployments/deployment-newer/state/terraform.tfstate",
    createdAt: new Date("2026-07-15T12:00:00.000Z")
  });
  const target = deployment({
    id: "deployment-target",
    status: "SUCCESS",
    stateObjectKey: "deployments/deployment-target/state/terraform.tfstate",
    createdAt: new Date("2026-07-15T10:00:00.000Z")
  });

  await assert.rejects(
    prepareInfrastructureRollback(
      { deploymentId: source.id, accessContext },
      repositoryWith([newer, source, target]),
      () => "deployment-rollback"
    ),
    (error: unknown) =>
      error instanceof DeploymentConflictError && /no longer current/u.test(error.message)
  );
});

function repositoryWith(records: DeploymentRecord[]): DeploymentRepository {
  let created: DeploymentRecord | undefined;
  const connection: AwsConnection = {
    id: "connection-1",
    userId: accessContext.userId,
    accountId: "123456789012",
    region: "ap-northeast-2",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "external-id",
    status: "verified",
    lastVerifiedAt: "2026-07-15T09:00:00.000Z",
    createdAt: "2026-07-15T09:00:00.000Z",
    updatedAt: "2026-07-15T09:00:00.000Z"
  };
  const repository: Partial<DeploymentRepository> = {
    async findAccessibleProject(projectId) {
      return projectId === "project-1" ? ({ id: projectId } as never) : undefined;
    },
    async findArchitectureInProject(architectureId, projectId) {
      return projectId === "project-1" ? ({ id: architectureId, projectId } as never) : undefined;
    },
    async findTerraformArtifactForArchitecture(terraformArtifactId, projectId, architectureId) {
      return {
        id: terraformArtifactId,
        projectId,
        architectureId,
        assetType: "terraform_file",
        objectKey: `projects/${projectId}/${terraformArtifactId}`,
        fileName: "terraform-files.json",
        contentType: "application/vnd.sketchcatch.terraform-files+json"
      };
    },
    async findTerraformArtifactById() {
      return undefined;
    },
    async findVerifiedAwsConnectionById(connectionId) {
      return connectionId === connection.id ? connection : undefined;
    },
    async createDeployment(input: CreateDeploymentRecordInput) {
      created = deployment({ ...input });
      return created;
    },
    async findDeploymentById(deploymentId) {
      return records.find((record) => record.id === deploymentId) ?? created;
    },
    async findDeploymentPlanArtifactById() {
      return undefined;
    },
    async findRunningDeploymentInProject(projectId) {
      return records.find(
        (record) => record.projectId === projectId && record.status === "RUNNING"
      );
    },
    async listDeploymentsByProject(projectId) {
      return records.filter((record) => record.projectId === projectId);
    }
  };
  return repository as DeploymentRepository;
}

function deployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  const createdAt = overrides.createdAt ?? new Date("2026-07-15T11:00:00.000Z");
  return {
    id: "deployment-current",
    projectId: "project-1",
    architectureId: "architecture-current",
    terraformArtifactId: "artifact-current",
    preparationKey: null,
    awsConnectionId: "connection-1",
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    awsConnectionNameSnapshot: "demo",
    liveProfile: "practice",
    scope: "infrastructure",
    targetKind: "ecs_fargate",
    source: "direct",
    releaseId: null,
    releaseCandidateId: null,
    rollbackOfDeploymentId: null,
    rollbackTargetDeploymentId: null,
    preparedDraftRevision: null,
    preparedSnapshotHash: null,
    approvedPreparedSnapshotHash: null,
    currentPlanArtifactId: null,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "PENDING",
    activeStage: null,
    planSummary: null,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}
