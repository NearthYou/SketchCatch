import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection, DeploymentPlanSummary } from "@sketchcatch/types";
import {
  approveDeploymentPlan,
  assertDeploymentApplyPreconditions,
  DeploymentApplyPreconditionError,
  revokeDeploymentApproval
} from "./deployment-approval-service.js";
import {
  DeploymentConflictError,
  type ArchitectureRecord,
  type CreateDeploymentRecordInput,
  type DeploymentLogRecord,
  type DeploymentPlanArtifactRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext,
  type ProjectRecord,
  type ReleaseCandidateRecord,
  type SaveDeploymentPlanInput,
  type TerraformArtifactRecord
} from "./deployment-service.js";
import { createPreparedReleaseSnapshotHash } from "./deployment-preparation-service.js";
import {
  createTerraformArtifactCanonicalContent,
  prepareTerraformWorkspace
} from "./terraform-workspace.js";
import { TerraformArtifactSafetyError } from "./terraform-artifact-safety.js";
import { createFilesystemProjectAssetStorage } from "../projects/filesystem-project-asset-storage.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const planArtifactId = "99999999-9999-4999-8999-999999999999";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");
const artifactContent = "terraform { required_version = \">= 1.6.0\" }\n";
const artifactHash = createSha256(artifactContent);
const tfplanHash = "a".repeat(64);
const stateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;

class FakeDeploymentRepository implements DeploymentRepository {
  deployment: DeploymentRecord | undefined = createDeploymentRecord();
  project: ProjectRecord | undefined = createProjectRecord();
  terraformArtifact: TerraformArtifactRecord | undefined = createTerraformArtifactRecord();
  planArtifact: DeploymentPlanArtifactRecord | undefined = createPlanArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  releaseCandidate: ReleaseCandidateRecord | undefined;
  readonly approvals: Array<{
    deploymentId: string;
    input: Parameters<DeploymentRepository["approveDeployment"]>[1];
  }> = [];
  readonly revokedApprovals: string[] = [];

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      this.project.userId !== accessContext.userId
    ) {
      return undefined;
    }

    return this.project;
  }

  async findArchitectureInProject(): Promise<ArchitectureRecord | undefined> {
    return undefined;
  }

  async findTerraformArtifactForArchitecture(): Promise<TerraformArtifactRecord | undefined> {
    return undefined;
  }

  async findTerraformArtifactById(candidateTerraformArtifactId: string) {
    if (!this.terraformArtifact || this.terraformArtifact.id !== candidateTerraformArtifactId) {
      return undefined;
    }

    return this.terraformArtifact;
  }

  async findVerifiedAwsConnectionById(
    candidateAwsConnectionId: string,
    accessContext: ProjectAccessContext
  ) {
    if (
      !this.awsConnection ||
      this.awsConnection.id !== candidateAwsConnectionId ||
      this.awsConnection.userId !== accessContext.userId ||
      this.awsConnection.status !== "verified"
    ) {
      return undefined;
    }

    return this.awsConnection;
  }

  async createDeployment(input: CreateDeploymentRecordInput): Promise<DeploymentRecord> {
    this.deployment = createDeploymentRecord(input.id, input);

    return this.deployment;
  }

  async findDeploymentById(candidateDeploymentId: string) {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    return this.deployment;
  }

  async findDeploymentPlanArtifactById(candidatePlanArtifactId: string) {
    if (!this.planArtifact || this.planArtifact.id !== candidatePlanArtifactId) {
      return undefined;
    }

    return this.planArtifact;
  }

  async findReleaseCandidateById(candidateId: string) {
    return this.releaseCandidate?.id === candidateId ? this.releaseCandidate : undefined;
  }

  async findRunningDeploymentInProject(): Promise<DeploymentRecord | undefined> {
    return this.deployment?.status === "RUNNING" ? this.deployment : undefined;
  }

  async listDeploymentsByProject(): Promise<DeploymentRecord[]> {
    return this.deployment ? [this.deployment] : [];
  }

  updateDeploymentStatus: DeploymentRepository["updateDeploymentStatus"] = async (
    candidateDeploymentId,
    status
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status, updatedAt: fixedNow };

    return this.deployment;
  };

  markDeploymentInitRunning: DeploymentRepository["markDeploymentInitRunning"] = async () =>
    this.deployment;

  markDeploymentPlanRunning: DeploymentRepository["markDeploymentPlanRunning"] = async () =>
    this.deployment;

  markDeploymentApplyRunning: DeploymentRepository["markDeploymentApplyRunning"] = async () =>
    this.deployment;

  markDeploymentDestroyRunning: DeploymentRepository["markDeploymentDestroyRunning"] = async () =>
    this.deployment;

  markDeploymentInitSucceeded: DeploymentRepository["markDeploymentInitSucceeded"] = async () =>
    this.deployment;

  updateDeploymentPlan: DeploymentRepository["updateDeploymentPlan"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input, updatedAt: fixedNow };

    return this.deployment;
  };

  saveDeploymentPlan: DeploymentRepository["saveDeploymentPlan"] = async (
    input: SaveDeploymentPlanInput
  ) => {
    if (!this.deployment || this.deployment.id !== input.deploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      currentPlanArtifactId: input.planArtifact.id,
      planSummary: input.planSummary,
      isBlocked: input.isBlocked,
      blockedBy: input.blockedBy,
      blockedReason: input.blockedReason
    };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async (
    candidateDeploymentId,
    input
  ) => {
    this.approvals.push({ deploymentId: candidateDeploymentId, input });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      ...input,
      status: input.status ?? "PENDING",
      isBlocked: false,
      blockedBy: null,
      blockedReason: null,
      ...(input.preserveFailureDetails ? {} : { failureStage: null, errorSummary: null }),
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  revokeDeploymentApproval: NonNullable<DeploymentRepository["revokeDeploymentApproval"]> = async (
    candidateDeploymentId,
    input
  ) => {
    this.revokedApprovals.push(candidateDeploymentId);

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      approvedAt: null,
      approvedByUserId: null,
      approvedTerraformArtifactId: null,
      approvedPlanArtifactId: null,
      approvedTerraformArtifactHash: null,
      approvedTfplanHash: null,
      approvedAwsAccountId: null,
      approvedAwsRegion: null,
      approvedPreparedSnapshotHash: null,
      status: "PENDING",
      isBlocked: true,
      blockedBy: "missing_approval",
      blockedReason: input.blockedReason,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  saveDeploymentApplyResults: DeploymentRepository["saveDeploymentApplyResults"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      stateObjectKey: input.stateObjectKey,
      resultWarningSummary: input.resultWarningSummary,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  completeDeploymentApply: DeploymentRepository["completeDeploymentApply"] = async (
    candidateDeploymentId
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "SUCCESS",
      failureStage: null,
      errorSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  completeDeploymentDestroy: DeploymentRepository["completeDeploymentDestroy"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "DESTROYED",
      currentPlanArtifactId: null,
      stateObjectKey: null,
      resultWarningSummary: input.resultWarningSummary,
      failureStage: null,
      errorSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  failDeployment: DeploymentRepository["failDeployment"] = async (candidateDeploymentId, input) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "FAILED", ...input, updatedAt: fixedNow };

    return this.deployment;
  };

  requestDeploymentCancellation: DeploymentRepository["requestDeploymentCancellation"] = async () =>
    this.deployment;

  cancelDeployment: DeploymentRepository["cancelDeployment"] = async () => this.deployment;

  async recoverInterruptedDeployments(): Promise<DeploymentRecord[]> {
    return [];
  }

  createDeploymentLog: DeploymentRepository["createDeploymentLog"] = async (input) => ({
    ...input,
    createdAt: fixedNow
  });

  createDeploymentLogs: DeploymentRepository["createDeploymentLogs"] = async (input) =>
    input.map((log) => ({ ...log, createdAt: fixedNow }));

  async getNextDeploymentLogSequence(): Promise<number> {
    return 1;
  }

  async listDeploymentLogs(): Promise<DeploymentLogRecord[]> {
    return [];
  }

  async listDeployedResources() {
    return [];
  }

  async listTerraformOutputs() {
    return [];
  }
}

test("approveDeploymentPlan stores the approved artifact plan and AWS snapshot", async () => {
  const repository = new FakeDeploymentRepository();

  const deployment = await approveDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      downloadTerraformArtifact: async () => artifactContent,
      now: () => fixedNow
    }
  );

  assert.equal(deployment.isBlocked, false);
  assert.equal(deployment.blockedBy, null);
  assert.equal(deployment.planSummary?.blocked, false);
  assert.equal(deployment.approvedAt?.toISOString(), fixedNow.toISOString());
  assert.equal(deployment.approvedByUserId, userId);
  assert.equal(deployment.approvedTerraformArtifactId, terraformArtifactId);
  assert.equal(deployment.approvedPlanArtifactId, planArtifactId);
  assert.equal(deployment.approvedTerraformArtifactHash, artifactHash);
  assert.equal(deployment.approvedTfplanHash, tfplanHash);
  assert.equal(deployment.approvedAwsAccountId, "123456789012");
  assert.equal(deployment.approvedAwsRegion, "ap-northeast-2");
  assert.deepEqual(repository.approvals[0]?.input, {
    approvedByUserId: userId,
    approvedAt: fixedNow,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: artifactHash,
    approvedTfplanHash: tfplanHash,
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    approvedPreparedSnapshotHash: null,
    planSummary: {
      ...createPlanSummary(),
      blocked: false
    },
    status: "PENDING",
    preserveFailureDetails: false
  });
});

test("revokeDeploymentApproval clears approval and returns the apply plan to approval", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = {
    ...repository.deployment!,
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: artifactHash,
    approvedTfplanHash: tfplanHash,
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    status: "PENDING",
    isBlocked: false,
    blockedBy: null,
    blockedReason: null
  };

  const deployment = await revokeDeploymentApproval(
    { deploymentId, accessContext: createAccessContext() },
    repository
  );

  assert.equal(deployment.approvedAt, null);
  assert.equal(deployment.approvedPlanArtifactId, null);
  assert.equal(deployment.status, "PENDING");
  assert.equal(deployment.isBlocked, true);
  assert.equal(deployment.blockedBy, "missing_approval");
  assert.equal(deployment.blockedReason, "Terraform Plan requires user approval before apply");
  assert.deepEqual(repository.revokedApprovals, [deploymentId]);
});

test("approveDeploymentPlan reads local Terraform artifacts from project asset storage", async () => {
  const repository = new FakeDeploymentRepository();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "sketchcatch-approval-assets-"));
  const assetRoot = join(await realpath(temporaryRoot), "project-assets");
  const projectAssetStorage = createFilesystemProjectAssetStorage({ rootDirectory: assetRoot });
  const terraformArtifact = repository.terraformArtifact;
  assert.ok(terraformArtifact);

  try {
    await projectAssetStorage.putObject({
      objectKey: terraformArtifact.objectKey,
      contentType: terraformArtifact.contentType,
      body: artifactContent
    });

    const deployment = await approveDeploymentPlan(
      {
        deploymentId,
        accessContext: createAccessContext()
      },
      repository,
      {
        projectAssetStorage,
        now: () => fixedNow
      }
    );

    assert.equal(deployment.approvedPlanArtifactId, planArtifactId);
    assert.equal(deployment.approvedTerraformArtifactHash, artifactHash);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("approveDeploymentPlan accepts the same multi-file artifact used by plan", async () => {
  const repository = new FakeDeploymentRepository();
  const rootDir = await mkdtemp(join(tmpdir(), "sketchcatch-approval-test-"));
  const bundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "providers.tf", terraformCode: 'terraform { required_version = ">= 1.6.0" }\n' },
      { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}\n' }
    ]
  });
  const workspace = await prepareTerraformWorkspace(
    {
      objectKey: "projects/project-id/assets/terraform_file/terraform-files.json",
      fileName: "terraform-files.json",
      contentType: "application/vnd.sketchcatch.terraform-files+json"
    },
    {
      rootDir,
      downloadTerraformArtifact: async () => bundle
    }
  );

  try {
    repository.terraformArtifact = createTerraformArtifactRecord({
      fileName: "terraform-files.json",
      contentType: "application/vnd.sketchcatch.terraform-files+json"
    });
    repository.planArtifact = createPlanArtifactRecord({
      terraformArtifactSha256: createSha256(await readFile(workspace.mainFilePath, "utf8"))
    });

    const deployment = await approveDeploymentPlan(
      {
        deploymentId,
        accessContext: createAccessContext()
      },
      repository,
      {
        downloadTerraformArtifact: async () => bundle,
        now: () => fixedNow
      }
    );

    assert.equal(deployment.approvedPlanArtifactId, planArtifactId);
    assert.equal(
      deployment.approvedTerraformArtifactHash,
      repository.planArtifact.terraformArtifactSha256
    );
  } finally {
    await workspace.cleanup();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("approveDeploymentPlan rejects unsafe Terraform inside a multi-file artifact", async () => {
  const repository = new FakeDeploymentRepository();
  const artifactInput = {
    objectKey: "projects/project-id/assets/terraform_file/terraform-files.json",
    fileName: "terraform-files.json",
    contentType: "application/vnd.sketchcatch.terraform-files+json"
  };
  const unsafeBundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "providers.tf", terraformCode: "terraform {}\n" },
      {
        fileName: "main.tf",
        terraformCode: 'module "untrusted" { source = "https://example.invalid/module.zip" }\n'
      }
    ]
  });
  repository.terraformArtifact = createTerraformArtifactRecord({
    fileName: artifactInput.fileName,
    contentType: artifactInput.contentType
  });
  repository.planArtifact = createPlanArtifactRecord({
    terraformArtifactSha256: createSha256(
      createTerraformArtifactCanonicalContent(artifactInput, unsafeBundle).toString("utf8")
    )
  });

  await assert.rejects(
    () =>
      approveDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          downloadTerraformArtifact: async () => unsafeBundle,
          now: () => fixedNow
        }
      ),
    TerraformArtifactSafetyError
  );
});

test("approveDeploymentPlan rejects drift inside a multi-file artifact", async () => {
  const repository = new FakeDeploymentRepository();
  const artifactInput = {
    objectKey: "projects/project-id/assets/terraform_file/terraform-files.json",
    fileName: "terraform-files.json",
    contentType: "application/vnd.sketchcatch.terraform-files+json"
  };
  const plannedBundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "providers.tf", terraformCode: "terraform {}\n" },
      { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}\n' }
    ]
  });
  const changedBundle = JSON.stringify({
    schemaVersion: 1,
    files: [
      { fileName: "providers.tf", terraformCode: "terraform {}\n" },
      { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "changed" {}\n' }
    ]
  });
  repository.terraformArtifact = createTerraformArtifactRecord({
    fileName: artifactInput.fileName,
    contentType: artifactInput.contentType
  });
  repository.planArtifact = createPlanArtifactRecord({
    terraformArtifactSha256: createSha256(
      createTerraformArtifactCanonicalContent(artifactInput, plannedBundle).toString("utf8")
    )
  });

  await assert.rejects(
    () =>
      approveDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          downloadTerraformArtifact: async () => changedBundle,
          now: () => fixedNow
        }
      ),
    /Terraform artifact changed after plan/
  );
});

test("approveDeploymentPlan preserves failed cleanup state for destroy approvals", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(undefined, {
    status: "FAILED",
    stateObjectKey,
    failureStage: "apply",
    errorSummary: "previous apply failed after creating resources",
    planSummary: {
      createCount: 0,
      updateCount: 0,
      deleteCount: 1,
      replaceCount: 0,
      blocked: true,
      warnings: []
    },
    isBlocked: true,
    blockedBy: "missing_approval",
    blockedReason: "Terraform Destroy Plan requires user approval before destroy"
  });
  repository.planArtifact = createPlanArtifactRecord({
    operation: "destroy"
  });

  const deployment = await approveDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      downloadTerraformArtifact: async () => artifactContent,
      now: () => fixedNow
    }
  );

  assert.equal(deployment.status, "FAILED");
  assert.equal(deployment.failureStage, "apply");
  assert.equal(deployment.errorSummary, "previous apply failed after creating resources");
  assert.equal(deployment.isBlocked, false);
  assert.deepEqual(repository.approvals[0]?.input, {
    approvedByUserId: userId,
    approvedAt: fixedNow,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: artifactHash,
    approvedTfplanHash: tfplanHash,
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    approvedPreparedSnapshotHash: null,
    planSummary: {
      createCount: 0,
      updateCount: 0,
      deleteCount: 1,
      replaceCount: 0,
      blocked: false,
      warnings: []
    },
    status: "FAILED",
    preserveFailureDetails: true
  });
});

test("approveDeploymentPlan allows full-stack destroy after its ReleaseCandidate failed", async () => {
  const repository = new FakeDeploymentRepository();
  const candidate = { ...createReleaseCandidateRecord(), status: "failed" as const };
  const preparedSnapshotHash = createPreparedReleaseSnapshotHash({
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    compositeDigest: candidate.compositeDigest,
    configFingerprint: candidate.configFingerprint
  });
  repository.releaseCandidate = candidate;
  repository.deployment = createDeploymentRecord(undefined, {
    status: "FAILED",
    scope: "full_stack",
    targetKind: "ecs_fargate",
    releaseCandidateId: candidate.id,
    preparedSnapshotHash,
    stateObjectKey,
    failureStage: "destroy",
    errorSummary: "previous destroy lost its execution lease"
  });
  repository.planArtifact = createPlanArtifactRecord({ operation: "destroy" });

  const deployment = await approveDeploymentPlan(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      downloadTerraformArtifact: async () => artifactContent,
      now: () => fixedNow
    }
  );

  assert.equal(deployment.status, "FAILED");
  assert.equal(deployment.approvedPreparedSnapshotHash, preparedSnapshotHash);
});

test("approveDeploymentPlan allows plans with legacy blocking safety warnings", async () => {
  const repository = new FakeDeploymentRepository();
  const warning = createBlockingWarning();
  repository.deployment = createDeploymentRecord(undefined, {
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    planSummary: {
      ...createPlanSummary(),
      blocked: false,
      warnings: [warning]
    }
  });

  const deployment = await approveDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      downloadTerraformArtifact: async () => artifactContent,
      now: () => fixedNow
    }
  );

  assert.equal(repository.approvals.length, 1);
  assert.equal(deployment.approvedAt, fixedNow);
});

test("approveDeploymentPlan allows acknowledgement-only warnings without acknowledgement ids", async () => {
  const repository = new FakeDeploymentRepository();
  const warning = createAcknowledgementWarning();
  repository.deployment = createDeploymentRecord(undefined, {
    planSummary: {
      ...createPlanSummary(),
      blocked: false,
      warnings: [warning]
    }
  });

  const deployment = await approveDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext(),
      acknowledgedWarningIds: []
    },
    repository,
    {
      downloadTerraformArtifact: async () => artifactContent,
      now: () => fixedNow
    }
  );

  assert.equal(deployment.approvedByUserId, userId);
  assert.deepEqual(deployment.planSummary?.warnings, [warning]);
});

test("approveDeploymentPlan rejects unsafe Terraform artifacts before approval", async () => {
  const repository = new FakeDeploymentRepository();

  await assert.rejects(
    () =>
      approveDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          downloadTerraformArtifact: async () => `
            data "aws_region" "current" {
            }
          `,
          now: () => fixedNow
        }
      ),
    /data source "aws_region" is not allowed/
  );

  assert.equal(repository.approvals.length, 0);
});

test("approveDeploymentPlan rejects Terraform artifact drift after plan", async () => {
  const repository = new FakeDeploymentRepository();

  await assert.rejects(
    () =>
      approveDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          downloadTerraformArtifact: async () => "changed terraform content",
          now: () => fixedNow
        }
      ),
    (error) => {
      assert.equal(error instanceof DeploymentConflictError, true);
      assert.equal((error as Error).message, "Terraform artifact changed after plan");

      return true;
    }
  );
  assert.equal(repository.approvals.length, 0);
});

test("approveDeploymentPlan rejects plan artifacts without Terraform artifact hash", async () => {
  const repository = new FakeDeploymentRepository();
  repository.planArtifact = createPlanArtifactRecord({
    terraformArtifactSha256: null
  });

  await assert.rejects(
    () =>
      approveDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          downloadTerraformArtifact: async () => artifactContent,
          now: () => fixedNow
        }
      ),
    (error) => {
      assert.equal(error instanceof DeploymentConflictError, true);
      assert.equal((error as Error).message, "Terraform Plan must be regenerated before approval");

      return true;
    }
  );
  assert.equal(repository.approvals.length, 0);
});

test("assertDeploymentApplyPreconditions blocks artifact plan and AWS drift", () => {
  const approvedDeployment = createApprovedDeploymentRecord();
  const currentPlanArtifact = createPlanArtifactRecord();
  const currentAwsConnection = createVerifiedAwsConnection();

  assert.doesNotThrow(() =>
    assertDeploymentApplyPreconditions({
      deployment: approvedDeployment,
      currentPlanArtifact,
      currentTerraformArtifactHash: artifactHash,
      currentTfplanHash: tfplanHash,
      currentAwsConnection
    })
  );

  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment: { ...approvedDeployment, terraformArtifactId: "changed-artifact-id" },
        currentPlanArtifact,
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection
      }),
    /Terraform artifact changed after approval/
  );

  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment: approvedDeployment,
        currentPlanArtifact,
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: "b".repeat(64),
        currentAwsConnection
      }),
    /Terraform plan changed before apply/
  );

  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment: approvedDeployment,
        currentPlanArtifact,
        currentTerraformArtifactHash: "changed-artifact-hash",
        currentTfplanHash: tfplanHash,
        currentAwsConnection
      }),
    /Terraform artifact content changed after approval/
  );

  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment: approvedDeployment,
        currentPlanArtifact,
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection: createVerifiedAwsConnection({ accountId: "999999999999" })
      }),
    /AWS account changed before apply/
  );
});

test("assertDeploymentApplyPreconditions rejects AWS region drift before apply", () => {
  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment: createApprovedDeploymentRecord(),
        currentPlanArtifact: createPlanArtifactRecord(),
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection: createVerifiedAwsConnection({ region: "us-east-1" })
      }),
    /AWS region changed before apply/
  );
});

test("assertDeploymentApplyPreconditions rejects prepared draft drift after approval", () => {
  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment: createApprovedDeploymentRecord({
          preparedDraftRevision: 7,
          preparedSnapshotHash: "c".repeat(64),
          approvedPreparedSnapshotHash: "d".repeat(64)
        }),
        currentPlanArtifact: createPlanArtifactRecord(),
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection: createVerifiedAwsConnection()
      }),
    (error) => {
      assert.equal(error instanceof DeploymentApplyPreconditionError, true);
      assert.equal(
        (error as DeploymentApplyPreconditionError).reason,
        "approval_snapshot"
      );
      assert.match((error as Error).message, /project draft changed after approval/i);
      return true;
    }
  );
});

test("assertDeploymentApplyPreconditions pins the approved ReleaseCandidate", () => {
  const candidate = createReleaseCandidateRecord();
  const snapshot = createPreparedReleaseSnapshotHash({
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    compositeDigest: candidate.compositeDigest,
    configFingerprint: candidate.configFingerprint
  });
  const deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate",
    releaseCandidateId: candidate.id,
    preparedSnapshotHash: snapshot,
    approvedPreparedSnapshotHash: snapshot
  });

  assert.doesNotThrow(() =>
    assertDeploymentApplyPreconditions({
      deployment,
      currentPlanArtifact: createPlanArtifactRecord(),
      currentTerraformArtifactHash: artifactHash,
      currentTfplanHash: tfplanHash,
      currentAwsConnection: createVerifiedAwsConnection(),
      currentReleaseCandidate: candidate,
      now: fixedNow
    })
  );
  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment,
        currentPlanArtifact: createPlanArtifactRecord(),
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection: createVerifiedAwsConnection(),
        currentReleaseCandidate: { ...candidate, expiresAt: fixedNow },
        now: fixedNow
      }),
    (error) =>
      error instanceof DeploymentApplyPreconditionError &&
      error.reason === "release_candidate"
  );
});

test("assertDeploymentApplyPreconditions rejects missing approval snapshot fields", () => {
  const requiredSnapshotFields: Array<keyof DeploymentRecord> = [
    "approvedAt",
    "approvedByUserId",
    "approvedTerraformArtifactId",
    "approvedPlanArtifactId",
    "approvedTerraformArtifactHash",
    "approvedTfplanHash",
    "approvedAwsAccountId",
    "approvedAwsRegion"
  ];

  for (const field of requiredSnapshotFields) {
    assert.throws(
      () =>
        assertDeploymentApplyPreconditions({
          deployment: {
            ...createApprovedDeploymentRecord(),
            [field]: null
          },
          currentPlanArtifact: createPlanArtifactRecord(),
          currentTerraformArtifactHash: artifactHash,
          currentTfplanHash: tfplanHash,
          currentAwsConnection: createVerifiedAwsConnection()
        }),
      (error) => {
        assert.equal(error instanceof DeploymentApplyPreconditionError, true, String(field));
        assert.match(
          (error as Error).message,
          new RegExp(`Deployment approval snapshot is incomplete before apply: missing ${String(field)}`),
          String(field)
        );

        return true;
      },
      String(field)
    );
  }
});

function createAccessContext(): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}

function createDeploymentRecord(
  id = deploymentId,
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return {
    id,
    projectId,
    architectureId,
    terraformArtifactId,
    preparationKey: null,
    awsConnectionId,
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    awsConnectionNameSnapshot: "123456789012",
    liveProfile: "demo_web_service",
    scope: "infrastructure",
    targetKind: null,
    source: "direct",
    releaseId: null,
    releaseCandidateId: null,
    rollbackOfDeploymentId: null,
    rollbackTargetDeploymentId: null,
    preparedDraftRevision: null,
    preparedSnapshotHash: null,
    currentPlanArtifactId: planArtifactId,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "PENDING",
    activeStage: null,
    planSummary: createPlanSummary(),
    isBlocked: true,
    blockedBy: "missing_approval",
    blockedReason: "Terraform Plan requires user approval before apply",
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
    approvedPreparedSnapshotHash: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createApprovedDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return createDeploymentRecord(undefined, {
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    planSummary: {
      ...createPlanSummary(),
      blocked: false
    },
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: artifactHash,
    approvedTfplanHash: tfplanHash,
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    ...overrides
  });
}

function createPlanSummary(): DeploymentPlanSummary {
  return {
    createCount: 1,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: true,
    warnings: []
  };
}

function createReleaseCandidateRecord(): ReleaseCandidateRecord {
  return {
    id: "candidate-1",
    projectId,
    deploymentId,
    pipelineRunId: null,
    buildEnvironmentId: "build-environment-1",
    commitSha: "a".repeat(40),
    configFingerprint: "b".repeat(64),
    compositeDigest: "c".repeat(64),
    apiOciDigest: "d".repeat(64),
    apiArchiveDigest: "1".repeat(64),
    frontendArchiveDigest: "e".repeat(64),
    frontendManifestDigest: "f".repeat(64),
    frontendIndexDigest: "2".repeat(64),
    apiArchiveObjectKey: "deployments/deployment/release-candidates/candidate/api-image.oci.tar",
    apiArchiveObjectVersionId: "api-version",
    apiArchiveByteSize: 100,
    frontendArchiveObjectKey: "deployments/deployment/release-candidates/candidate/frontend.tar.zst",
    frontendArchiveObjectVersionId: "frontend-version",
    frontendArchiveByteSize: 200,
    frontendManifestObjectKey:
      "deployments/deployment/release-candidates/candidate/frontend-manifest.json",
    frontendManifestObjectVersionId: "frontend-manifest-version",
    manifestObjectKey: "deployments/deployment/release-candidates/candidate/candidate-manifest.json",
    manifestObjectVersionId: "candidate-manifest-version",
    status: "pending",
    expiresAt: new Date(fixedNow.getTime() + 60_000),
    frontendRetryExpiresAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
}

function createBlockingWarning(): DeploymentPlanSummary["warnings"][number] {
  return {
    id: "pre_deployment_check:security-open-ssh",
    level: "high",
    category: "security",
    source: "pre_deployment_check",
    code: "PUBLIC_SSH",
    message: "Public SSH: Restrict CIDR",
    relatedFindingId: "security-open-ssh",
    relatedResourceId: "sg-app",
    requiresAcknowledgement: false,
    blocksApproval: true
  };
}

function createAcknowledgementWarning(): DeploymentPlanSummary["warnings"][number] {
  return {
    id: "pre_deployment_check:cost-risk",
    level: "medium",
    category: "cost",
    source: "pre_deployment_check",
    code: "TRIVY_MISCONFIGURATION",
    message: "Cost risk: Review before apply",
    relatedFindingId: "cost-risk",
    requiresAcknowledgement: true,
    blocksApproval: false
  };
}

function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: projectId,
    userId,
    name: "Test Project",
    description: null,
    deletionStartedAt: null,
    deletionErrorSummary: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createTerraformArtifactRecord(
  overrides: Partial<TerraformArtifactRecord> = {}
): TerraformArtifactRecord {
  return {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/assets/terraform_file/artifact-main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform",
    ...overrides
  };
}

function createPlanArtifactRecord(
  overrides: Partial<DeploymentPlanArtifactRecord> = {}
): DeploymentPlanArtifactRecord {
  return {
    id: planArtifactId,
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256: artifactHash,
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: tfplanHash,
    accountId: "123456789012",
    region: "ap-northeast-2",
    stateBaselineDeploymentId: null,
    stateObjectKey: null,
    stateLineageSha256: null,
    stateSerial: null,
    createdAt: fixedNow,
    ...overrides
  };
}

function createVerifiedAwsConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    id: awsConnectionId,
    userId,
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "sc_conn_77777777-7777-4777-8777-777777777777_random",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: "2026-06-26T00:00:00.000Z",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides
  };
}

function createSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
