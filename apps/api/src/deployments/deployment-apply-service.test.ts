import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection } from "@sketchcatch/types";
import { runDeploymentApply } from "./deployment-apply-service.js";
import type {
  DeploymentApplyArtifactStorage,
  UploadDeploymentStateInput
} from "./deployment-apply-artifact-storage.js";
import type {
  ArchitectureRecord,
  CompleteDeploymentApplyInput,
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
const planBuffer = Buffer.from("approved binary tfplan");
const tfplanSha256 = createSha256(planBuffer);

class FakeDeploymentRepository implements DeploymentRepository {
  project: ProjectRecord | undefined = createProjectRecord();
  deployment: DeploymentRecord | undefined = createApprovedDeploymentRecord();
  terraformArtifact: TerraformArtifactRecord | undefined = createTerraformArtifactRecord();
  planArtifact: DeploymentPlanArtifactRecord | undefined = createPlanArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  logs: DeploymentLogRecord[] = [];
  completedInput: CompleteDeploymentApplyInput | undefined;
  failedInput:
    | {
        deploymentId: string;
        failureStage: NonNullable<DeploymentRecord["failureStage"]>;
        errorSummary: string;
      }
    | undefined;

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
    this.deployment = createApprovedDeploymentRecord(input);

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

  approveDeployment: DeploymentRepository["approveDeployment"] = async () => this.deployment;

  completeDeploymentApply: DeploymentRepository["completeDeploymentApply"] = async (
    candidateDeploymentId,
    input
  ) => {
    this.completedInput = input;

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

  failDeployment: DeploymentRepository["failDeployment"] = async (candidateDeploymentId, input) => {
    this.failedInput = {
      deploymentId: candidateDeploymentId,
      failureStage: input.failureStage,
      errorSummary: input.errorSummary
    };

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
  readonly uploadedStates: UploadDeploymentStateInput[] = [];
  stateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;

  async downloadDeploymentArtifact(input: {
    deploymentId: string;
    planArtifactId: string;
    objectKey: string;
  }): Promise<Buffer> {
    assert.deepEqual(input, {
      deploymentId,
      planArtifactId,
      objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`
    });

    return planBuffer;
  }

  async uploadDeploymentState(input: UploadDeploymentStateInput) {
    this.uploadedStates.push(input);

    return {
      objectKey: this.stateObjectKey
    };
  }
}

test("runDeploymentApply applies the approved tfplan and stores state resources and outputs", async () => {
  const repository = new FakeDeploymentRepository();
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  const runnerStages: string[] = [];
  let cleanupCalled = false;
  let writtenPlanFile: { filePath: string; content: Buffer } | undefined;

  const result = await runDeploymentApply(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async (filePath, content) => {
        writtenPlanFile = {
          filePath,
          content: Buffer.from(content)
        };
      },
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-apply/main.tf",
        cleanup: async () => {
          cleanupCalled = true;
        }
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => {
        runnerStages.push("init");
        return createRunnerResult("init");
      },
      runTerraformApply: async () => {
        runnerStages.push("apply");
        return createRunnerResult("apply", {
          stdout: "aws_vpc.main: Creation complete\n"
        });
      },
      runTerraformOutputJson: async () => {
        runnerStages.push("output");
        return createRunnerResult("output", {
          stdout: JSON.stringify({
            bucket_name: {
              sensitive: false,
              value: "sketchcatch-demo-bucket"
            },
            admin_password: {
              sensitive: true,
              value: "do-not-store"
            }
          })
        });
      },
      runTerraformShowStateJson: async () => {
        runnerStages.push("show-state");
        return createRunnerResult("show", {
          stdout: JSON.stringify({
            values: {
              root_module: {
                resources: [
                  {
                    address: "aws_vpc.main",
                    mode: "managed",
                    type: "aws_vpc",
                    provider_name: "registry.terraform.io/hashicorp/aws",
                    values: {
                      id: "vpc-123456"
                    }
                  },
                  {
                    address: "data.aws_ami.ubuntu",
                    mode: "data",
                    type: "aws_ami",
                    provider_name: "registry.terraform.io/hashicorp/aws",
                    values: {
                      id: "ami-ignored"
                    }
                  }
                ],
                child_modules: [
                  {
                    resources: [
                      {
                        address: "module.web.aws_instance.server",
                        mode: "managed",
                        type: "aws_instance",
                        provider_name: "registry.terraform.io/hashicorp/aws",
                        values: {
                          id: "i-1234567890abcdef0"
                        }
                      }
                    ]
                  }
                ]
              }
            }
          })
        });
      },
      generateResultId: createSequentialIdGenerator()
    }
  );

  assert.deepEqual(runnerStages, ["init", "apply", "output", "show-state"]);
  assert.equal(cleanupCalled, true);
  assert.equal(writtenPlanFile?.filePath.endsWith("\\tfplan"), true);
  assert.deepEqual(writtenPlanFile?.content, planBuffer);
  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(result.deployment.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.equal(result.deployment.resultWarningSummary, null);
  assert.deepEqual(repository.completedInput?.resources, [
    {
      id: "result-1",
      deploymentId,
      terraformAddress: "aws_vpc.main",
      terraformType: "aws_vpc",
      providerName: "registry.terraform.io/hashicorp/aws",
      resourceId: "vpc-123456",
      region: "ap-northeast-2"
    },
    {
      id: "result-2",
      deploymentId,
      terraformAddress: "module.web.aws_instance.server",
      terraformType: "aws_instance",
      providerName: "registry.terraform.io/hashicorp/aws",
      resourceId: "i-1234567890abcdef0",
      region: "ap-northeast-2"
    }
  ]);
  assert.deepEqual(repository.completedInput?.outputs, [
    {
      id: "result-3",
      deploymentId,
      name: "admin_password",
      value: null,
      sensitive: true
    },
    {
      id: "result-4",
      deploymentId,
      name: "bucket_name",
      value: "sketchcatch-demo-bucket",
      sensitive: false
    }
  ]);
  assert.deepEqual(
    repository.logs.map((log) => log.message),
    ["init ok", "aws_vpc.main: Creation complete"]
  );
});

test("runDeploymentApply rejects unsafe Terraform before preparing AWS credentials", async () => {
  const repository = new FakeDeploymentRepository();
  let cleanupCalled = false;
  let credentialsPrepared = false;
  let terraformRan = false;
  let planWritten = false;

  await assert.rejects(
    () =>
      runDeploymentApply(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          applyArtifactStorage: new FakeApplyArtifactStorage(),
          readTerraformArtifactFile: async () => `
            data "aws_caller_identity" "current" {
            }
          `,
          writePlanFile: async () => {
            planWritten = true;
          },
          prepareTerraformWorkspace: async () => ({
            workdir: "C:/tmp/sketchcatch-terraform-unsafe-apply",
            mainFilePath: "C:/tmp/sketchcatch-terraform-unsafe-apply/main.tf",
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
  assert.equal(planWritten, false);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.failedInput?.failureStage, "apply");
  assert.match(repository.failedInput?.errorSummary ?? "", /data source "aws_caller_identity" is not allowed/);
});

test("runDeploymentApply marks apply failures failed and masks secret output", async () => {
  const repository = new FakeDeploymentRepository();

  const result = await runDeploymentApply(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-apply/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () =>
        createRunnerResult("apply", {
          exitCode: 1,
          stdout: "",
          stderr: "aws_secret_access_key=very-secret\napply failed\n"
        })
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "apply");
  assert.equal(repository.failedInput?.failureStage, "apply");
  assert.equal(repository.failedInput?.errorSummary, "[REDACTED]");
  assert.deepEqual(
    repository.logs.map((log) => ({
      level: log.level,
      message: log.message
    })),
    [
      { level: "INFO", message: "init ok" },
      { level: "ERROR", message: "[REDACTED]" },
      { level: "ERROR", message: "apply failed" }
    ]
  );
});

test("runDeploymentApply keeps successful apply as success when post-apply parsing warns", async () => {
  const repository = new FakeDeploymentRepository();

  const result = await runDeploymentApply(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-apply/main.tf",
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () =>
        createRunnerResult("output", {
          stdout: "not-json"
        }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: JSON.stringify({
            values: {
              root_module: {}
            }
          })
        })
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.match(
    result.deployment.resultWarningSummary ?? "",
    /Terraform output parse failed after successful apply/
  );
  assert.equal(repository.completedInput?.outputs.length, 0);
  assert.equal(repository.completedInput?.resources.length, 0);
  assert.equal(
    repository.logs.some((log) =>
      log.message.includes("Terraform output parse failed after successful apply")
    ),
    true
  );
});

function createApprovedDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return {
    id: deploymentId,
    projectId,
    architectureId,
    terraformArtifactId,
    awsConnectionId,
    currentPlanArtifactId: planArtifactId,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "RUNNING",
    activeStage: "apply",
    planSummary: {
      createCount: 1,
      updateCount: 0,
      deleteCount: 0,
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
    completedAt: null,
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

function createRunnerResult(
  stage: string,
  overrides: Partial<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }> = {}
): TerraformRunResult {
  return {
    command: ["terraform", stage],
    exitCode: overrides.exitCode ?? 0,
    stdout: overrides.stdout ?? `${stage} ok\n`,
    stderr: overrides.stderr ?? "",
    timedOut: overrides.timedOut ?? false
  };
}

function createLogRecord(input: CreateDeploymentLogRecordInput): DeploymentLogRecord {
  return {
    ...input,
    createdAt: fixedNow
  };
}

function createAccessContext(): ProjectAccessContext {
  return {
    kind: "user",
    userId
  };
}

function createSequentialIdGenerator(): () => string {
  let index = 0;

  return () => {
    index += 1;

    return `result-${index}`;
  };
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}
