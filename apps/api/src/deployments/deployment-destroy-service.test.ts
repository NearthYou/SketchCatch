import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection } from "@sketchcatch/types";
import { runDeploymentDestroy } from "./deployment-destroy-service.js";
import type {
  DeploymentApplyArtifactStorage,
  UploadDeploymentStateInput
} from "./deployment-apply-artifact-storage.js";
import type {
  ArchitectureRecord,
  CompleteDeploymentDestroyInput,
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
const planBuffer = Buffer.from("approved binary destroy tfplan");
const tfplanSha256 = createSha256(planBuffer);
const stateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;
const expectedTerraformMutationTimeoutMs = 15 * 60 * 1_000;

class FakeDeploymentRepository implements DeploymentRepository {
  project: ProjectRecord | undefined = createProjectRecord();
  deployment: DeploymentRecord | undefined = createApprovedDestroyDeploymentRecord();
  terraformArtifact: TerraformArtifactRecord | undefined = createTerraformArtifactRecord();
  planArtifact: DeploymentPlanArtifactRecord | undefined = createDestroyPlanArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  logs: DeploymentLogRecord[] = [];
  completedDestroyInput: CompleteDeploymentDestroyInput | undefined;

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
    this.deployment = createApprovedDestroyDeploymentRecord(input);

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

  markDeploymentPlanRunning: DeploymentRepository["markDeploymentPlanRunning"] = async () =>
    this.deployment;

  markDeploymentApplyRunning: DeploymentRepository["markDeploymentApplyRunning"] = async () =>
    this.deployment;

  markDeploymentDestroyRunning: DeploymentRepository["markDeploymentDestroyRunning"] = async () => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "RUNNING", activeStage: "destroy" };

    return this.deployment;
  };

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

    this.deployment = { ...this.deployment, currentPlanArtifactId: input.planArtifact.id };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async () => this.deployment;

  completeDeploymentApply: DeploymentRepository["completeDeploymentApply"] = async () =>
    this.deployment;

  completeDeploymentDestroy: DeploymentRepository["completeDeploymentDestroy"] = async (
    candidateDeploymentId,
    input
  ) => {
    this.completedDestroyInput = input;

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
      approvedAt: null,
      approvedByUserId: null,
      approvedTerraformArtifactId: null,
      approvedPlanArtifactId: null,
      approvedTerraformArtifactHash: null,
      approvedTfplanHash: null,
      approvedAwsAccountId: null,
      approvedAwsRegion: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

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

  cancelDeployment: DeploymentRepository["cancelDeployment"] = async () => this.deployment;

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

class FakeApplyArtifactStorage implements DeploymentApplyArtifactStorage {
  downloadedPlanObjectKey: string | undefined;
  downloadedStateObjectKey: string | undefined;

  async downloadDeploymentArtifact(input: {
    deploymentId: string;
    planArtifactId: string;
    objectKey: string;
  }) {
    this.downloadedPlanObjectKey = input.objectKey;

    return planBuffer;
  }

  async downloadDeploymentState(input: { deploymentId: string; objectKey: string }) {
    this.downloadedStateObjectKey = input.objectKey;

    return Buffer.from('{"version":4}');
  }

  async uploadDeploymentState(
    _input: UploadDeploymentStateInput
  ): Promise<{ objectKey: string }> {
    throw new Error("destroy should not upload final state");
  }
}

test("runDeploymentDestroy retries an approved cleanup after plan failure and clears results", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDestroyDeploymentRecord({
    status: "FAILED",
    failureStage: "plan",
    errorSummary: "Terraform destroy plan timed out"
  });
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  const runnerStages: string[] = [];
  let writtenState: { filePath: string; content: Buffer } | undefined;
  let writtenPlanFile: { filePath: string; content: Buffer } | undefined;

  const result = await runDeploymentDestroy(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writeTerraformStateFile: async (filePath, content) => {
        writtenState = { filePath, content: Buffer.from(content) };
      },
      writePlanFile: async (filePath, content) => {
        writtenPlanFile = { filePath, content: Buffer.from(content) };
      },
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-destroy",
        mainFilePath: "C:/tmp/sketchcatch-terraform-destroy/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => {
        runnerStages.push("init");
        return createRunnerResult("init");
      },
      runTerraformApply: async (_workdir, options) => {
        assert.ok(options);
        assert.equal(options.timeoutMs, expectedTerraformMutationTimeoutMs);
        runnerStages.push("destroy");
        return createRunnerResult("apply", {
          stdout: "aws_instance.web: Destruction complete\n"
        });
      }
    }
  );

  assert.deepEqual(runnerStages, ["init", "destroy"]);
  assert.equal(applyArtifactStorage.downloadedPlanObjectKey, createDestroyPlanArtifactRecord().objectKey);
  assert.equal(applyArtifactStorage.downloadedStateObjectKey, stateObjectKey);
  assert.equal(writtenState?.filePath.endsWith("terraform.tfstate"), true);
  assert.deepEqual(writtenState?.content, Buffer.from('{"version":4}'));
  assert.equal(writtenPlanFile?.filePath.endsWith("tfplan"), true);
  assert.deepEqual(writtenPlanFile?.content, planBuffer);
  assert.equal(result.deployment.status, "DESTROYED");
  assert.equal(result.deployment.stateObjectKey, null);
  assert.equal(result.deployment.currentPlanArtifactId, null);
  assert.equal(result.deployment.approvedPlanArtifactId, null);
  assert.deepEqual(repository.completedDestroyInput, {
    resultWarningSummary: "Deployment was destroyed after a failed deployment cleanup."
  });
  assert.deepEqual(
    repository.logs
      .filter((log) => !log.message.startsWith("[duration]"))
      .map((log) => ({ stage: log.stage, level: log.level, message: log.message })),
    [
      { stage: "destroy", level: "INFO", message: "init ok" },
      { stage: "destroy", level: "INFO", message: "aws_instance.web: Destruction complete" }
    ]
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] terraform lock file upload completed in ")
    )
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] deployment destroy result save completed in ")
    )
  );
});

test("runDeploymentDestroy reports Terraform apply timeouts without marking duration as completed", async () => {
  const repository = new FakeDeploymentRepository();

  const result = await runDeploymentDestroy(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writeTerraformStateFile: async () => undefined,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-destroy",
        mainFilePath: "C:/tmp/sketchcatch-terraform-destroy/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async (_workdir, options) => {
        assert.ok(options);
        assert.equal(options.timeoutMs, expectedTerraformMutationTimeoutMs);

        return createRunnerResult("apply", {
          exitCode: 143,
          stdout:
            "aws_instance.web: Still destroying... [id=i-1234567890abcdef0, 00m50s elapsed]\n",
          timedOut: true,
          durationMs: 60_000
        });
      }
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "destroy");
  assert.equal(
    result.deployment.errorSummary,
    "Terraform destroy timed out. AWS resources may have been partially deleted; verify resources before retry."
  );
  assert(
    repository.logs.some(
      (log) => log.message === "[duration] terraform apply tfplan timed out after 60.0s"
    )
  );
});

function createApprovedDestroyDeploymentRecord(
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
    planSummary: {
      createCount: 0,
      updateCount: 0,
      deleteCount: 1,
      replaceCount: 0,
      blocked: false,
      warnings: []
    },
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: terraformArtifactSha256,
    approvedTfplanHash: tfplanSha256,
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    startedAt: fixedNow,
    completedAt: fixedNow,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createDestroyPlanArtifactRecord(
  overrides: Partial<DeploymentPlanArtifactRecord> = {}
): DeploymentPlanArtifactRecord {
  return {
    id: planArtifactId,
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256,
    operation: "destroy",
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: tfplanSha256,
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
