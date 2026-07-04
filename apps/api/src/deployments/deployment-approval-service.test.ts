import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection, DeploymentPlanSummary } from "@sketchcatch/types";
import {
  approveDeploymentPlan,
  assertDeploymentApplyPreconditions,
  assertDeploymentDestroyPreconditions
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
  type SaveDeploymentPlanInput,
  type TerraformArtifactRecord
} from "./deployment-service.js";

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
  readonly approvals: Array<{
    deploymentId: string;
    input: Parameters<DeploymentRepository["approveDeployment"]>[1];
  }> = [];

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

  completeDeploymentApply: DeploymentRepository["completeDeploymentApply"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "SUCCESS",
      stateObjectKey: input.stateObjectKey,
      resultWarningSummary: input.resultWarningSummary,
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
    planSummary: {
      ...createPlanSummary(),
      blocked: false
    },
    status: "PENDING",
    preserveFailureDetails: false
  });
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

test("approveDeploymentPlan rejects risk blocked deployments", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(undefined, {
    isBlocked: true,
    blockedBy: "risk_analysis",
    blockedReason: "Plan includes delete or replace changes"
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
      assert.equal((error as Error).message, "Blocked deployment cannot be approved");

      return true;
    }
  );
  assert.equal(repository.approvals.length, 0);
});

test("approveDeploymentPlan requires acknowledgement for medium and low warnings", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(undefined, {
    planSummary: {
      ...createPlanSummary(),
      warnings: [
        {
          id: "pre_deployment_check:configuration-review-subnet-1",
          level: "medium",
          category: "configuration",
          source: "pre_deployment_check",
          code: "UNKNOWN_TERRAFORM_ACTION",
          message: "Review subnet setting",
          requiresAcknowledgement: true,
          blocksApproval: false
        }
      ]
    }
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
    /Deployment warnings must be acknowledged before approval/
  );

  const deployment = await approveDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext(),
      acknowledgedWarningIds: ["pre_deployment_check:configuration-review-subnet-1"]
    },
    repository,
    {
      downloadTerraformArtifact: async () => artifactContent,
      now: () => fixedNow
    }
  );

  assert.equal(deployment.isBlocked, false);
});

test("approveDeploymentPlan rejects blocking warnings even if blockedBy is missing_approval", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(undefined, {
    planSummary: {
      ...createPlanSummary(),
      warnings: [
        {
          id: "pre_deployment_check:security-open-ssh-sg-1",
          level: "high",
          category: "security",
          source: "pre_deployment_check",
          code: "PUBLIC_SSH",
          message: "Public SSH",
          requiresAcknowledgement: false,
          blocksApproval: true
        }
      ]
    }
  });

  await assert.rejects(
    () =>
      approveDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext(),
          acknowledgedWarningIds: ["pre_deployment_check:security-open-ssh-sg-1"]
        },
        repository,
        {
          downloadTerraformArtifact: async () => artifactContent,
          now: () => fixedNow
        }
      ),
    /High risk deployment warnings cannot be approved/
  );
  assert.equal(repository.approvals.length, 0);
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
            data "aws_caller_identity" "current" {
            }
          `,
          now: () => fixedNow
        }
      ),
    /data source "aws_caller_identity" is not allowed/
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

  assert.throws(
    () =>
      assertDeploymentApplyPreconditions({
        deployment: {
          ...approvedDeployment,
          isBlocked: true,
          blockedBy: "missing_approval",
          blockedReason: "approval required"
        },
        currentPlanArtifact,
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection
      }),
    /Blocked deployment cannot be applied/
  );
});

test("assertDeploymentDestroyPreconditions blocks artifact plan and AWS drift", () => {
  const approvedDeployment = createApprovedDeploymentRecord({
    status: "SUCCESS",
    stateObjectKey
  });
  const currentPlanArtifact = createPlanArtifactRecord({
    operation: "destroy"
  });
  const currentAwsConnection = createVerifiedAwsConnection();

  assert.doesNotThrow(() =>
    assertDeploymentDestroyPreconditions({
      deployment: approvedDeployment,
      currentPlanArtifact,
      currentTerraformArtifactHash: artifactHash,
      currentTfplanHash: tfplanHash,
      currentAwsConnection,
      sourceStatus: "SUCCESS",
      sourceFailureStage: null
    })
  );

  assert.throws(
    () =>
      assertDeploymentDestroyPreconditions({
        deployment: approvedDeployment,
        currentPlanArtifact: createPlanArtifactRecord({ operation: "apply" }),
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection,
        sourceStatus: "SUCCESS",
        sourceFailureStage: null
      }),
    /Terraform destroy plan is required before destroy/
  );

  assert.throws(
    () =>
      assertDeploymentDestroyPreconditions({
        deployment: {
          ...approvedDeployment,
          isBlocked: true,
          blockedBy: "missing_approval",
          blockedReason: "approval required"
        },
        currentPlanArtifact,
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection,
        sourceStatus: "SUCCESS",
        sourceFailureStage: null
      }),
    /Blocked deployment cannot be destroyed/
  );

  assert.throws(
    () =>
      assertDeploymentDestroyPreconditions({
        deployment: approvedDeployment,
        currentPlanArtifact,
        currentTerraformArtifactHash: "changed-artifact-hash",
        currentTfplanHash: tfplanHash,
        currentAwsConnection,
        sourceStatus: "SUCCESS",
        sourceFailureStage: null
      }),
    /Terraform artifact content changed after approval/
  );

  assert.throws(
    () =>
      assertDeploymentDestroyPreconditions({
        deployment: approvedDeployment,
        currentPlanArtifact,
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: "b".repeat(64),
        currentAwsConnection,
        sourceStatus: "SUCCESS",
        sourceFailureStage: null
      }),
    /Terraform plan changed before destroy/
  );

  assert.throws(
    () =>
      assertDeploymentDestroyPreconditions({
        deployment: approvedDeployment,
        currentPlanArtifact,
        currentTerraformArtifactHash: artifactHash,
        currentTfplanHash: tfplanHash,
        currentAwsConnection: createVerifiedAwsConnection({ region: "us-east-1" }),
        sourceStatus: "SUCCESS",
        sourceFailureStage: null
      }),
    /AWS region changed before destroy/
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
      /Deployment approval is required before apply/,
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
    awsConnectionId,
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

function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: projectId,
    userId,
    name: "Test Project",
    description: null,
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
