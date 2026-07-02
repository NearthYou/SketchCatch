import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  AwsConnection,
  CheckFinding
} from "@sketchcatch/types";
import {
  type ArchitectureRecord,
  type CreateDeploymentRecordInput,
  type DeploymentPlanArtifactRecord,
  type DeploymentLogRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext,
  type ProjectRecord,
  type SaveDeploymentPlanInput,
  type TerraformArtifactRecord
} from "./deployment-service.js";
import { runDeploymentPlan } from "./deployment-plan-service.js";
import type {
  DeploymentPlanArtifactStorage,
  UploadDeploymentPlanArtifactInput,
  UploadedDeploymentPlanArtifact
} from "./deployment-plan-artifact-storage.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const userId = "55555555-5555-4555-8555-555555555555";
const planArtifactId = "99999999-9999-4999-8999-999999999999";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");
const terraformArtifactContent = "terraform { required_version = \">= 1.6.0\" }\n";
const terraformArtifactSha256 = createSha256(terraformArtifactContent);

class FakeDeploymentRepository implements DeploymentRepository {
  readonly savedPlans: SaveDeploymentPlanInput[] = [];
  readonly failedDeployments: Array<{
    deploymentId: string;
    failureStage: NonNullable<DeploymentRecord["failureStage"]>;
    errorSummary: string;
  }> = [];
  project: ProjectRecord | undefined = createProjectRecord();
  architecture: ArchitectureRecord | undefined = createArchitectureRecord();
  deployment: DeploymentRecord | undefined = createDeploymentRecord();
  terraformArtifact: TerraformArtifactRecord | undefined = createTerraformArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  logs: DeploymentLogRecord[] = [];
  throwOnSaveDeploymentPlan = false;

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

  async findArchitectureInProject(candidateArchitectureId: string, candidateProjectId: string) {
    if (
      !this.architecture ||
      this.architecture.id !== candidateArchitectureId ||
      this.architecture.projectId !== candidateProjectId
    ) {
      return undefined;
    }

    return this.architecture;
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

  async findDeploymentPlanArtifactById(
    candidatePlanArtifactId: string
  ): Promise<DeploymentPlanArtifactRecord | undefined> {
    return createDeploymentPlanArtifactRecord({ id: candidatePlanArtifactId });
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

    this.deployment = {
      ...this.deployment,
      status,
      ...(status === "RUNNING" ? clearDeploymentApprovalSnapshot() : {}),
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  markDeploymentInitRunning: DeploymentRepository["markDeploymentInitRunning"] = async (
    candidateDeploymentId
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      ...clearDeploymentApprovalSnapshot(),
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  markDeploymentPlanRunning: DeploymentRepository["markDeploymentPlanRunning"] = async (
    candidateDeploymentId
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      activeStage: "plan",
      ...clearDeploymentApprovalSnapshot(),
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  markDeploymentApplyRunning: DeploymentRepository["markDeploymentApplyRunning"] = async (
    candidateDeploymentId
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  markDeploymentDestroyRunning: DeploymentRepository["markDeploymentDestroyRunning"] = async (
    candidateDeploymentId
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      activeStage: "destroy",
      updatedAt: fixedNow
    };

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

  saveDeploymentPlan: DeploymentRepository["saveDeploymentPlan"] = async (input) => {
    this.savedPlans.push(input);

    if (this.throwOnSaveDeploymentPlan) {
      throw new Error("RDS save failed");
    }

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
      ...clearDeploymentApprovalSnapshot(),
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  approveDeployment: DeploymentRepository["approveDeployment"] = async () => this.deployment;

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
      ...clearDeploymentApprovalSnapshot(),
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  failDeployment: DeploymentRepository["failDeployment"] = async (candidateDeploymentId, input) => {
    this.failedDeployments.push({
      deploymentId: candidateDeploymentId,
      failureStage: input.failureStage,
      errorSummary: input.errorSummary
    });

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

  requestDeploymentCancellation: DeploymentRepository["requestDeploymentCancellation"] = async (
    candidateDeploymentId
  ) => {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = { ...this.deployment, cancelRequestedAt: fixedNow, updatedAt: fixedNow };

    return this.deployment;
  };

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
      activeStage: null,
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
    const deploymentLog = { ...input, createdAt: fixedNow };

    this.logs.push(deploymentLog);

    return deploymentLog;
  };

  createDeploymentLogs: DeploymentRepository["createDeploymentLogs"] = async (input) => {
    const deploymentLogs = input.map((log) => ({ ...log, createdAt: fixedNow }));

    this.logs.push(...deploymentLogs);

    return deploymentLogs;
  };

  async getNextDeploymentLogSequence(candidateDeploymentId: string) {
    const maxSequence = this.logs
      .filter((log) => log.deploymentId === candidateDeploymentId)
      .reduce((max, log) => Math.max(max, log.sequence), 0);

    return maxSequence + 1;
  }

  async listDeploymentLogs(candidateDeploymentId: string) {
    return this.logs.filter((log) => log.deploymentId === candidateDeploymentId);
  }

  async listDeployedResources() {
    return [];
  }

  async listTerraformOutputs() {
    return [];
  }
}

class FakePlanArtifactStorage implements DeploymentPlanArtifactStorage {
  readonly uploads: UploadDeploymentPlanArtifactInput[] = [];
  readonly deletes: string[] = [];

  async uploadDeploymentPlanArtifact(
    input: UploadDeploymentPlanArtifactInput
  ): Promise<UploadedDeploymentPlanArtifact> {
    this.uploads.push(input);

    return {
      objectKey: `deployments/${input.deploymentId}/plans/${input.planArtifactId}.tfplan`,
      sha256: "0".repeat(64)
    };
  }

  async deleteDeploymentPlanArtifact(objectKey: string): Promise<void> {
    this.deletes.push(objectKey);
  }
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
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function createDeploymentPlanArtifactRecord(
  overrides: Partial<DeploymentPlanArtifactRecord> = {}
): DeploymentPlanArtifactRecord {
  return {
    id: planArtifactId,
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256,
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: "0".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: fixedNow,
    ...overrides
  };
}

function clearDeploymentApprovalSnapshot(): Pick<
  DeploymentRecord,
  | "approvedAt"
  | "approvedByUserId"
  | "approvedTerraformArtifactId"
  | "approvedPlanArtifactId"
  | "approvedTerraformArtifactHash"
  | "approvedTfplanHash"
  | "approvedAwsAccountId"
  | "approvedAwsRegion"
> {
  return {
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null
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

function createArchitectureRecord(
  architectureJson: ArchitectureJson = { nodes: [], edges: [] },
  overrides: Partial<ArchitectureRecord> = {}
): ArchitectureRecord {
  return {
    id: architectureId,
    projectId,
    version: 1,
    source: "manual",
    architectureJson,
    createdAt: fixedNow,
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

function createAccessContext(): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}

function createPreparedCredentials() {
  return {
    env: {
      AWS_ACCESS_KEY_ID: "temporary-access-key-id",
      AWS_SECRET_ACCESS_KEY: "temporary-secret-access-key",
      AWS_SESSION_TOKEN: "temporary-session-token",
      AWS_REGION: "ap-northeast-2"
    },
    accountId: "123456789012",
    callerArn:
      "arn:aws:sts::123456789012:assumed-role/SketchCatchTerraformExecutionRole/sketchcatch-terraform",
    region: "ap-northeast-2"
  };
}

function createAnalysis(findings: CheckFinding[] = []): AiPreDeploymentAnalysisResult {
  const analysis = {
    summary: "ok",
    totalMonthlyEstimate: {
      amount: 0,
      currency: "USD" as const,
      pricingAssumption: "test"
    },
    resourceCostEstimates: [],
    findings,
    checklist: [],
    suggestions: []
  };

  return analysis;
}

function createRunnerResult(
  stage: string,
  overrides: Partial<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }> = {}
) {
  return {
    command: ["terraform", stage],
    exitCode: overrides.exitCode ?? 0,
    stdout: overrides.stdout ?? `${stage} ok\n`,
    stderr: overrides.stderr ?? "",
    timedOut: overrides.timedOut ?? false
  };
}

function createPlanJson(resourceChanges: unknown[]): string {
  return JSON.stringify({
    format_version: "1.2",
    resource_changes: resourceChanges
  });
}

test("runDeploymentPlan saves a tfplan artifact, summary, block, logs, and current pointer", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: "88888888-8888-4888-8888-888888888888",
    approvedTerraformArtifactHash: "a".repeat(64),
    approvedTfplanHash: "b".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2"
  });
  const planArtifactStorage = new FakePlanArtifactStorage();
  const runnerStages: string[] = [];
  let cleanupCalled = false;

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      generatePlanArtifactId: () => planArtifactId,
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async (input) => {
        assert.deepEqual(input, {
          objectKey: "projects/project-id/assets/terraform_file/artifact-main.tf",
          fileName: "main.tf"
        });

        return {
          workdir: "C:/tmp/sketchcatch-terraform-plan",
          mainFilePath: "C:/tmp/sketchcatch-terraform-plan/main.tf",
          cleanup: async () => {
            cleanupCalled = true;
          }
        };
      },
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => {
        runnerStages.push("init");
        return createRunnerResult("init");
      },
      runTerraformPlan: async () => {
        runnerStages.push("plan");
        return createRunnerResult("plan", {
          stdout: "Plan: 1 to add, 0 to change, 0 to destroy.\n"
        });
      },
      runTerraformShowJson: async () => {
        runnerStages.push("show-json");
        return createRunnerResult("show", {
          stdout: createPlanJson([
            {
              address: "aws_s3_bucket.example",
              change: {
                actions: ["create"]
              }
            }
          ]),
          stderr: "show warning only\n"
        });
      }
    }
  );

  assert.deepEqual(runnerStages, ["init", "plan", "show-json"]);
  assert.equal(cleanupCalled, true);
  assert.equal(result.deployment.status, "PENDING");
  assert.equal(result.deployment.currentPlanArtifactId, planArtifactId);
  assert.deepEqual(result.deployment.planSummary, {
    createCount: 1,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: true,
    warnings: []
  });
  assert.equal(result.deployment.isBlocked, true);
  assert.equal(result.deployment.blockedBy, "missing_approval");
  assert.equal(result.deployment.approvedAt, null);
  assert.equal(result.deployment.approvedByUserId, null);
  assert.equal(result.deployment.approvedTerraformArtifactId, null);
  assert.equal(result.deployment.approvedPlanArtifactId, null);
  assert.equal(result.deployment.approvedTerraformArtifactHash, null);
  assert.equal(result.deployment.approvedTfplanHash, null);
  assert.equal(result.deployment.approvedAwsAccountId, null);
  assert.equal(result.deployment.approvedAwsRegion, null);
  assert.deepEqual(repository.savedPlans[0]?.planArtifact, {
    id: planArtifactId,
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256,
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: "0".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2"
  });
  assert.equal(planArtifactStorage.uploads[0]?.planFilePath.endsWith("tfplan"), true);
  assert.deepEqual(
    repository.logs
      .filter((log) => !log.message.startsWith("[duration]"))
      .map((log) => ({
        stage: log.stage,
        level: log.level,
        message: log.message
      })),
    [
      { stage: "init", level: "INFO", message: "init ok" },
      {
        stage: "plan",
        level: "INFO",
        message: "Plan: 1 to add, 0 to change, 0 to destroy."
      },
      { stage: "plan", level: "WARN", message: "show warning only" }
    ]
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] terraform lock file upload completed in ")
    )
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] terraform plan artifact upload completed in ")
    )
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] deployment plan save completed in ")
    )
  );
  assert.equal(repository.logs.some((log) => log.message.includes("resource_changes")), false);
});

test("runDeploymentPlan rejects unsafe Terraform before preparing AWS credentials", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  let cleanupCalled = false;
  let credentialsPrepared = false;
  let terraformRan = false;

  await assert.rejects(
    () =>
      runDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          planArtifactStorage,
          readTerraformArtifactFile: async () => `
            data "aws_caller_identity" "current" {
            }
          `,
          analyzePreDeployment: () => createAnalysis(),
          prepareTerraformWorkspace: async () => ({
            workdir: "C:/tmp/sketchcatch-terraform-unsafe-plan",
            mainFilePath: "C:/tmp/sketchcatch-terraform-unsafe-plan/main.tf",
            cleanup: async () => {
              cleanupCalled = true;
            }
          }),
          prepareTerraformAwsCredentialEnv: async () => {
            credentialsPrepared = true;
            throw new Error("AWS credentials should not be prepared");
          },
          runTerraformInit: async () => {
            terraformRan = true;
            throw new Error("Terraform init should not run");
          }
        }
      ),
    /data source "aws_caller_identity" is not allowed/
  );

  assert.equal(cleanupCalled, true);
  assert.equal(credentialsPrepared, false);
  assert.equal(terraformRan, false);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.deployment?.failureStage, "plan");
  assert.match(repository.deployment?.errorSummary ?? "", /data source "aws_caller_identity" is not allowed/);
  assert.equal(planArtifactStorage.uploads.length, 0);
});

test("runDeploymentPlan reuses an unchanged pending plan artifact without rerunning Terraform", async () => {
  const repository = new FakeDeploymentRepository();
  const planSummary = {
    createCount: 1,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: true,
    warnings: []
  };
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING",
    currentPlanArtifactId: planArtifactId,
    planSummary,
    isBlocked: true,
    blockedBy: "missing_approval",
    blockedReason: "Terraform Plan requires user approval before apply"
  });
  const planArtifactStorage = new FakePlanArtifactStorage();
  const runnerStages: string[] = [];

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext(),
      startedFromStatus: "PENDING"
    },
    repository,
    {
      generatePlanArtifactId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      planArtifactStorage,
      readTerraformArtifactFile: async () => {
        throw new Error("Terraform artifact should not be read for a reusable plan");
      },
      analyzePreDeployment: () => {
        throw new Error("Pre-deployment analysis should not rerun for a reusable plan");
      },
      prepareTerraformWorkspace: async () => {
        throw new Error("Terraform workspace should not be restored for a reusable plan");
      },
      prepareTerraformAwsCredentialEnv: async () => {
        throw new Error("AWS credentials should not be prepared for a reusable plan");
      },
      runTerraformInit: async () => {
        runnerStages.push("init");
        return createRunnerResult("init");
      },
      runTerraformPlan: async () => {
        runnerStages.push("plan");
        return createRunnerResult("plan");
      },
      runTerraformShowJson: async () => {
        runnerStages.push("show-json");
        return createRunnerResult("show");
      }
    }
  );

  assert.deepEqual(runnerStages, []);
  assert.equal(result.deployment.status, "PENDING");
  assert.equal(result.deployment.currentPlanArtifactId, planArtifactId);
  assert.deepEqual(result.deployment.planSummary, planSummary);
  assert.equal(repository.savedPlans.length, 0);
  assert.equal(planArtifactStorage.uploads.length, 0);
  assert.equal(repository.logs.length, 0);
});

test("runDeploymentPlan does not reuse an existing plan after a completed deployment", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING",
    currentPlanArtifactId: planArtifactId,
    planSummary: {
      createCount: 1,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: true,
      warnings: []
    },
    isBlocked: true,
    blockedBy: "missing_approval",
    blockedReason: "Terraform Plan requires user approval before apply"
  });
  const planArtifactStorage = new FakePlanArtifactStorage();
  const runnerStages: string[] = [];

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext(),
      startedFromStatus: "SUCCESS"
    },
    repository,
    {
      generatePlanArtifactId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-rerun-after-success",
        mainFilePath: "C:/tmp/sketchcatch-terraform-rerun-after-success/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => {
        runnerStages.push("init");
        return createRunnerResult("init");
      },
      runTerraformPlan: async () => {
        runnerStages.push("plan");
        return createRunnerResult("plan");
      },
      runTerraformShowJson: async () => {
        runnerStages.push("show-json");
        return createRunnerResult("show", {
          stdout: createPlanJson([])
        });
      }
    }
  );

  assert.deepEqual(runnerStages, ["init", "plan", "show-json"]);
  assert.equal(result.deployment.currentPlanArtifactId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(repository.savedPlans.length, 1);
  assert.equal(planArtifactStorage.uploads.length, 1);
});

test("runDeploymentPlan blocks destructive or high-risk plans with risk_analysis", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      generatePlanArtifactId: () => planArtifactId,
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () =>
        createAnalysis([
          {
            id: "finding-1",
            category: "security",
            severity: "high",
            resourceId: "sg-1",
            title: "Public ingress",
            description: "0.0.0.0/0",
            recommendation: "Restrict CIDR"
          }
        ]),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-risk",
        mainFilePath: "C:/tmp/sketchcatch-terraform-risk/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformPlan: async () => createRunnerResult("plan"),
      runTerraformShowJson: async () =>
        createRunnerResult("show", {
          stdout: createPlanJson([
            {
              address: "aws_s3_bucket.old",
              change: {
                actions: ["delete"]
              }
            },
            {
              address: "aws_instance.example",
              change: {
                actions: ["delete", "create"]
              }
            }
          ])
        })
    }
  );

  assert.equal(result.deployment.blockedBy, "risk_analysis");
  assert.equal(result.deployment.planSummary?.deleteCount, 1);
  assert.equal(result.deployment.planSummary?.replaceCount, 1);
  assert.deepEqual(result.deployment.planSummary?.warnings, [
    {
      level: "high",
      message: "Public ingress: Restrict CIDR",
      relatedResourceId: "sg-1"
    }
  ]);
});

test("runDeploymentPlan marks plan validation failures failed and masks secret output", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  let showJsonRan = false;

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-validate-fail",
        mainFilePath: "C:/tmp/sketchcatch-terraform-validate-fail/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformPlan: async () =>
        createRunnerResult("plan", {
          exitCode: 1,
          stderr: "Error: aws_secret_access_key = super-secret\n"
        }),
      runTerraformShowJson: async () => {
        showJsonRan = true;
        return createRunnerResult("show");
      }
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "plan");
  assert.equal(result.deployment.errorSummary, "Error: [REDACTED]");
  assert.equal(showJsonRan, false);
  assert.equal(planArtifactStorage.uploads.length, 0);
  assert.equal(repository.logs.some((log) => log.message.includes("super-secret")), false);
});

test("runDeploymentPlan stops at init failures before plan", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  let planRan = false;
  repository.deployment = createDeploymentRecord(deploymentId, {
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: terraformArtifactSha256,
    approvedTfplanHash: "0".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2"
  });

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-init-fail",
        mainFilePath: "C:/tmp/sketchcatch-terraform-init-fail/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () =>
        createRunnerResult("init", {
          exitCode: 1,
          stderr: "Error: provider install failed\n"
        }),
      runTerraformPlan: async () => {
        planRan = true;
        return createRunnerResult("plan");
      }
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "init");
  assert.equal(result.deployment.errorSummary, "Error: provider install failed");
  assert.equal(result.deployment.approvedAt, null);
  assert.equal(result.deployment.approvedByUserId, null);
  assert.equal(result.deployment.approvedTerraformArtifactId, null);
  assert.equal(result.deployment.approvedPlanArtifactId, null);
  assert.equal(result.deployment.approvedTerraformArtifactHash, null);
  assert.equal(result.deployment.approvedTfplanHash, null);
  assert.equal(result.deployment.approvedAwsAccountId, null);
  assert.equal(result.deployment.approvedAwsRegion, null);
  assert.equal(planRan, false);
  assert.equal(planArtifactStorage.uploads.length, 0);
});

test("runDeploymentPlan stops at plan failures before show-json or artifact upload", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  let showJsonRan = false;

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-plan-fail",
        mainFilePath: "C:/tmp/sketchcatch-terraform-plan-fail/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformPlan: async () =>
        createRunnerResult("plan", {
          exitCode: 1,
          stderr: "Error: unsupported argument\n"
        }),
      runTerraformShowJson: async () => {
        showJsonRan = true;
        return createRunnerResult("show");
      }
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "plan");
  assert.equal(result.deployment.errorSummary, "Error: unsupported argument");
  assert.equal(showJsonRan, false);
  assert.equal(planArtifactStorage.uploads.length, 0);
});

test("runDeploymentPlan deletes uploaded tfplan and preserves the old pointer when saving fails", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  const oldPlanArtifactId = "88888888-8888-4888-8888-888888888888";
  repository.deployment = createDeploymentRecord(deploymentId, {
    currentPlanArtifactId: oldPlanArtifactId
  });
  repository.throwOnSaveDeploymentPlan = true;

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      generatePlanArtifactId: () => planArtifactId,
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-save-fail",
        mainFilePath: "C:/tmp/sketchcatch-terraform-save-fail/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformPlan: async () => createRunnerResult("plan"),
      runTerraformShowJson: async () =>
        createRunnerResult("show", {
          stdout: createPlanJson([])
        })
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "plan");
  assert.equal(result.deployment.errorSummary, "RDS save failed");
  assert.equal(result.deployment.currentPlanArtifactId, oldPlanArtifactId);
  assert.deepEqual(planArtifactStorage.deletes, [
    `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`
  ]);
});
