import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection, DeploymentStatus } from "@sketchcatch/types";
import {
  runDeploymentDestroyPlan,
  type RunDeploymentDestroyPlanOptions
} from "./deployment-destroy-plan-service.js";
import type {
  DeploymentApplyArtifactStorage,
  UploadDeploymentStateInput
} from "./deployment-apply-artifact-storage.js";
import type {
  DeploymentPlanArtifactStorage,
  UploadDeploymentPlanArtifactInput
} from "./deployment-plan-artifact-storage.js";
import type {
  ArchitectureRecord,
  CreateDeploymentRecordInput,
  CreateDeploymentLogRecordInput,
  DeployedResourceRecord,
  DeploymentLogRecord,
  DeploymentPlanArtifactRecord,
  DeploymentRecord,
  DeploymentRepository,
  ProjectAccessContext,
  ProjectRecord,
  SaveDeploymentPlanInput,
  TerraformArtifactRecord,
  TerraformOutputRecord
} from "./deployment-service.js";
import type { TerraformRunResult } from "./terraform-runner.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const planArtifactId = "99999999-9999-4999-8999-999999999999";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");
const terraformArtifactContent = "terraform { required_version = \">= 1.6.0\" }\n";
const terraformArtifactSha256 = createSha256(terraformArtifactContent);
const stateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;

class FakeDeploymentRepository implements DeploymentRepository {
  project: ProjectRecord | undefined = createProjectRecord();
  deployment: DeploymentRecord | undefined = createDeploymentRecord();
  terraformArtifact: TerraformArtifactRecord | undefined = createTerraformArtifactRecord();
  planArtifact: DeploymentPlanArtifactRecord | undefined = createPlanArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  logs: DeploymentLogRecord[] = [];
  savedPlans: SaveDeploymentPlanInput[] = [];

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    return this.project?.id === candidateProjectId && this.project.userId === accessContext.userId
      ? this.project
      : undefined;
  }

  async findArchitectureInProject(): Promise<ArchitectureRecord | undefined> {
    return undefined;
  }

  async findTerraformArtifactForArchitecture(): Promise<TerraformArtifactRecord | undefined> {
    return undefined;
  }

  async findTerraformArtifactById(candidateTerraformArtifactId: string) {
    return this.terraformArtifact?.id === candidateTerraformArtifactId
      ? this.terraformArtifact
      : undefined;
  }

  async findVerifiedAwsConnectionById(
    candidateAwsConnectionId: string,
    accessContext: ProjectAccessContext
  ) {
    return this.awsConnection?.id === candidateAwsConnectionId &&
      this.awsConnection.userId === accessContext.userId
      ? this.awsConnection
      : undefined;
  }

  async createDeployment(input: CreateDeploymentRecordInput): Promise<DeploymentRecord> {
    this.deployment = createDeploymentRecord(input);

    return this.deployment;
  }

  async findDeploymentById(candidateDeploymentId: string) {
    return this.deployment?.id === candidateDeploymentId ? this.deployment : undefined;
  }

  async findDeploymentPlanArtifactById(candidatePlanArtifactId: string) {
    return this.planArtifact?.id === candidatePlanArtifactId ? this.planArtifact : undefined;
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

  markDeploymentPlanRunning: DeploymentRepository["markDeploymentPlanRunning"] = async () => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "RUNNING", activeStage: "plan" };

    return this.deployment;
  };

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

  saveDeploymentPlan: DeploymentRepository["saveDeploymentPlan"] = async (input) => {
    this.savedPlans.push(input);

    if (!this.deployment || this.deployment.id !== input.deploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      currentPlanArtifactId: input.planArtifact.id,
      status: input.terminalStatus ?? "PENDING",
      planSummary: input.planSummary,
      isBlocked: input.isBlocked,
      blockedBy: input.blockedBy,
      blockedReason: input.blockedReason,
      failureStage: input.failureStage ?? null,
      errorSummary: input.errorSummary ?? null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async () => this.deployment;

  completeDeploymentApply: DeploymentRepository["completeDeploymentApply"] = async () =>
    this.deployment;

  completeDeploymentDestroy: DeploymentRepository["completeDeploymentDestroy"] = async () =>
    this.deployment;

  failDeployment: DeploymentRepository["failDeployment"] = async (candidateDeploymentId, input) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "FAILED",
      failureStage: input.failureStage,
      errorSummary: input.errorSummary,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  requestDeploymentCancellation: DeploymentRepository["requestDeploymentCancellation"] = async () =>
    this.deployment;

  cancelDeployment: DeploymentRepository["cancelDeployment"] = async (
    candidateDeploymentId,
    input
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "CANCELLED",
      errorSummary: input.errorSummary,
      cancelledAt: fixedNow,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  async recoverInterruptedDeployments(): Promise<DeploymentRecord[]> {
    return [];
  }

  createDeploymentLog: DeploymentRepository["createDeploymentLog"] = async (input) => {
    const deploymentLog = createLogRecord(input);

    this.logs.push(deploymentLog);

    return deploymentLog;
  };

  createDeploymentLogs: DeploymentRepository["createDeploymentLogs"] = async (input) => {
    const deploymentLogs = input.map(createLogRecord);

    this.logs.push(...deploymentLogs);

    return deploymentLogs;
  };

  async getNextDeploymentLogSequence(candidateDeploymentId: string) {
    return (
      this.logs
        .filter((log) => log.deploymentId === candidateDeploymentId)
        .reduce((max, log) => Math.max(max, log.sequence), 0) + 1
    );
  }

  async listDeploymentLogs(candidateDeploymentId: string) {
    return this.logs.filter((log) => log.deploymentId === candidateDeploymentId);
  }

  async listDeployedResources(): Promise<DeployedResourceRecord[]> {
    return [];
  }

  async listTerraformOutputs(): Promise<TerraformOutputRecord[]> {
    return [];
  }
}

class FakePlanArtifactStorage implements DeploymentPlanArtifactStorage {
  uploads: UploadDeploymentPlanArtifactInput[] = [];

  async uploadDeploymentPlanArtifact(input: UploadDeploymentPlanArtifactInput) {
    this.uploads.push(input);

    return {
      objectKey: `deployments/${input.deploymentId}/plans/${input.planArtifactId}.tfplan`,
      sha256: "d".repeat(64)
    };
  }

  async deleteDeploymentPlanArtifact(): Promise<void> {
    return undefined;
  }
}

class FakeApplyArtifactStorage implements DeploymentApplyArtifactStorage {
  downloadedStateObjectKey: string | undefined;

  async downloadDeploymentArtifact(): Promise<Buffer> {
    throw new Error("destroy plan generation should not download a tfplan");
  }

  async downloadDeploymentState(input: { deploymentId: string; objectKey: string }) {
    this.downloadedStateObjectKey = input.objectKey;

    return Buffer.from('{"version":4}');
  }

  async uploadDeploymentState(
    _input: UploadDeploymentStateInput
  ): Promise<{ objectKey: string }> {
    throw new Error("destroy plan generation should not upload state");
  }
}

test("runDeploymentDestroyPlan restores state and stores a destroy plan artifact", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  const runnerStages: string[] = [];
  let writtenState: { filePath: string; content: Buffer } | undefined;

  const result = await runDeploymentDestroyPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      ...createDestroyPlanOptions(runnerStages),
      planArtifactStorage,
      applyArtifactStorage,
      writeTerraformStateFile: async (filePath, content) => {
        writtenState = { filePath, content: Buffer.from(content) };
      },
      generatePlanArtifactId: () => planArtifactId
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(result.deployment.currentPlanArtifactId, planArtifactId);
  assert.equal(result.deployment.isBlocked, false);
  assert.equal(result.deployment.blockedBy, null);
  assert.equal(result.deployment.blockedReason, null);
  assert.equal(applyArtifactStorage.downloadedStateObjectKey, stateObjectKey);
  assert.equal(writtenState?.filePath.endsWith("\\terraform.tfstate"), true);
  assert.deepEqual(writtenState?.content, Buffer.from('{"version":4}'));
  assert.deepEqual(runnerStages, ["init", "destroy-plan", "show-json"]);
  assert.equal(planArtifactStorage.uploads[0]?.planArtifactId, planArtifactId);
  assert.equal(repository.savedPlans[0]?.planArtifact.operation, "destroy");
  assert.equal(repository.savedPlans[0]?.planArtifact.terraformArtifactSha256, terraformArtifactSha256);
  assert.equal(repository.savedPlans[0]?.terminalStatus, "SUCCESS");
  assert.equal(repository.savedPlans[0]?.isBlocked, false);
  assert.equal(repository.savedPlans[0]?.blockedBy, null);
  assert.equal(repository.savedPlans[0]?.blockedReason, null);
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] terraform lock file upload completed in ")
    )
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] terraform destroy plan artifact upload completed in ")
    )
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] deployment destroy plan save completed in ")
    )
  );
  assert.equal(repository.logs.some((log) => log.message.includes("resource_changes")), false);
});

test("runDeploymentDestroyPlan only allows success or cleanup-capable failed deployments", async () => {
  const rejectedStatuses: Array<{
    status: DeploymentStatus;
    failureStage: DeploymentRecord["failureStage"];
  }> = [
    { status: "PENDING", failureStage: null },
    { status: "RUNNING", failureStage: null },
    { status: "CANCELLED", failureStage: null },
    { status: "DESTROYED", failureStage: null },
    { status: "FAILED", failureStage: "plan" }
  ];

  for (const rejected of rejectedStatuses) {
    const repository = new FakeDeploymentRepository();
    repository.deployment = createDeploymentRecord({
      status: rejected.status,
      failureStage: rejected.failureStage,
      stateObjectKey
    });

    await assert.rejects(
      () =>
        runDeploymentDestroyPlan(
          {
            deploymentId,
            accessContext: createAccessContext()
          },
          repository,
          createDestroyPlanOptions([])
        ),
      /Deployment cannot be destroyed in this state/
    );
  }
});

function createDestroyPlanOptions(runnerStages: string[]): RunDeploymentDestroyPlanOptions {
  return {
    readTerraformArtifactFile: async () => terraformArtifactContent,
    prepareTerraformWorkspace: async () => ({
      workdir: "C:/tmp/sketchcatch-terraform-destroy-plan",
      mainFilePath: "C:/tmp/sketchcatch-terraform-destroy-plan/main.tf",
      cleanup: async () => undefined
    }),
    prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
    runTerraformInit: async () => {
      runnerStages.push("init");
      return createRunnerResult("init");
    },
    runTerraformDestroyPlan: async () => {
      runnerStages.push("destroy-plan");
      return createRunnerResult("plan");
    },
    runTerraformShowJson: async () => {
      runnerStages.push("show-json");
      return createRunnerResult("show", {
        stdout: JSON.stringify({
          resource_changes: [
            {
              address: "aws_instance.web",
              mode: "managed",
              type: "aws_instance",
              change: {
                actions: ["delete"]
              }
            }
          ]
        })
      });
    }
  };
}

function createDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return {
    id: deploymentId,
    projectId,
    architectureId,
    terraformArtifactId,
    awsConnectionId,
    liveProfile: "practice",
    currentPlanArtifactId: planArtifactId,
    stateObjectKey,
    resultWarningSummary: null,
    status: "SUCCESS",
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
    completedAt: fixedNow,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
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
    terraformArtifactSha256,
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: "a".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: fixedNow,
    ...overrides
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
    objectKey: "projects/project-id/assets/terraform_file/main.tf",
    fileName: "main.tf",
    contentType: "text/plain",
    ...overrides
  };
}

function createVerifiedAwsConnection(overrides: Partial<AwsConnection> = {}): AwsConnection {
  return {
    id: awsConnectionId,
    userId,
    accountId: "123456789012",
    roleArn: "arn:aws:iam::123456789012:role/SketchCatchTerraformExecutionRole",
    externalId: "external-id",
    region: "ap-northeast-2",
    status: "verified",
    lastVerifiedAt: fixedNow.toISOString(),
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
    ...overrides
  };
}

function createAccessContext(): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}

function createPreparedCredentials(): {
  env: {
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_SESSION_TOKEN: string;
    AWS_REGION: string;
  };
  accountId: string;
  callerArn: string;
  region: string;
} {
  return {
    env: {
      AWS_ACCESS_KEY_ID: "temporary-access-key-id",
      AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
      AWS_SESSION_TOKEN: "temporary-session-token",
      AWS_REGION: "ap-northeast-2"
    },
    accountId: "123456789012",
    callerArn: "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/test",
    region: "ap-northeast-2"
  };
}

function createRunnerResult(
  command: string,
  overrides: Partial<TerraformRunResult> = {}
): TerraformRunResult {
  return {
    command: ["terraform", command],
    exitCode: 0,
    stdout: `${command} ok\n`,
    stderr: "",
    timedOut: false,
    ...overrides
  };
}

function createLogRecord(input: CreateDeploymentLogRecordInput): DeploymentLogRecord {
  return {
    ...input,
    createdAt: fixedNow
  };
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}
