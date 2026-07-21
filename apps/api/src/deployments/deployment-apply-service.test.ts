import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AwsConnection, TerraformArtifactBundle } from "@sketchcatch/types";
import { runDeploymentApply } from "./deployment-apply-service.js";
import { selectDeploymentStateBaseline } from "./deployment-service.js";
import { createPreparedReleaseSnapshotHash } from "./deployment-preparation-service.js";
import type {
  DeploymentApplyArtifactStorage,
  UploadDeploymentStateInput
} from "./deployment-apply-artifact-storage.js";
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
  ReleaseCandidateRecord,
  SaveDeploymentApplyResultsInput,
  SaveDeploymentApplyStateInput,
  SaveDeploymentPlanInput,
  TerraformArtifactRecord,
  TerraformOutputRecord
} from "./deployment-service.js";
import type { TerraformRunResult } from "./terraform-runner.js";
import { createTerraformArtifactCanonicalContent } from "./terraform-workspace.js";
import {
  createDeploymentPlanOptimizationEvidence,
  createTerraformDesiredStateIdentity
} from "./deployment-optimization.js";
import type {
  ProjectExecutionLeaseRecord,
  ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const planArtifactId = "99999999-9999-4999-8999-999999999999";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");
const terraformArtifactContent = 'terraform { required_version = ">= 1.6.0" }\n';
const terraformArtifactSha256 = createSha256(terraformArtifactContent);
const planBuffer = Buffer.from("approved binary tfplan");
const tfplanSha256 = createSha256(planBuffer);
const expectedTerraformMutationTimeoutMs = 15 * 60 * 1_000;
const releaseCandidateId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

class FakeDeploymentRepository implements DeploymentRepository {
  readonly activeStages: Array<NonNullable<DeploymentRecord["activeStage"]>> = [];
  project: ProjectRecord | undefined = createProjectRecord();
  deployment: DeploymentRecord | undefined = createApprovedDeploymentRecord();
  releaseCandidate: ReleaseCandidateRecord | undefined = createReleaseCandidateRecord();
  terraformArtifact: TerraformArtifactRecord | undefined = createTerraformArtifactRecord();
  planArtifact: DeploymentPlanArtifactRecord | undefined = createPlanArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  deployments: DeploymentRecord[] | null = null;
  relatedDeployments: DeploymentRecord[] = [];
  logs: DeploymentLogRecord[] = [];
  completeCalls = 0;
  completedInput: SaveDeploymentApplyResultsInput | undefined;
  savedInput: SaveDeploymentApplyResultsInput | undefined;
  savedStateInput: SaveDeploymentApplyStateInput | undefined;
  lifecycleEvents: string[] = [];
  synchronizeDeploymentTargetAfterApply?: NonNullable<
    DeploymentRepository["synchronizeDeploymentTargetAfterApply"]
  >;
  failedInput:
    | {
        deploymentId: string;
        failureStage: NonNullable<DeploymentRecord["failureStage"]>;
        errorSummary: string;
        stateObjectKey: string | null | undefined;
        resultWarningSummary: string | null | undefined;
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
    return this.deployment?.id === candidateDeploymentId
      ? this.deployment
      : this.relatedDeployments.find((deployment) => deployment.id === candidateDeploymentId);
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
    if (this.deployments) return this.deployments;
    return this.deployment
      ? [this.deployment, ...this.relatedDeployments]
      : this.relatedDeployments;
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

  async markDeploymentActiveStage(
    candidateDeploymentId: string,
    activeStage: NonNullable<DeploymentRecord["activeStage"]>
  ) {
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) return undefined;
    this.activeStages.push(activeStage);
    this.deployment = { ...this.deployment, activeStage, updatedAt: fixedNow };
    return this.deployment;
  }

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
    this.lifecycleEvents.push("terminal-complete");
    this.completeCalls += 1;
    if (input && "resources" in input) {
      this.completedInput = input as unknown as SaveDeploymentApplyResultsInput;
    }

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

  saveDeploymentApplyResults: DeploymentRepository["saveDeploymentApplyResults"] = async (
    candidateDeploymentId: string,
    input: SaveDeploymentApplyResultsInput
  ) => {
    this.lifecycleEvents.push("results-save");
    this.savedInput = input;
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) return undefined;
    this.deployment = {
      ...this.deployment,
      stateObjectKey: input.stateObjectKey,
      resultWarningSummary: input.resultWarningSummary,
      updatedAt: fixedNow
    };
    return this.deployment;
  };

  async saveDeploymentApplyState(
    candidateDeploymentId: string,
    input: SaveDeploymentApplyStateInput
  ): Promise<DeploymentRecord | undefined> {
    this.lifecycleEvents.push("state-save");
    this.savedStateInput = input;
    if (!this.deployment || this.deployment.id !== candidateDeploymentId) return undefined;
    this.deployment = {
      ...this.deployment,
      stateObjectKey: input.stateObjectKey,
      resultWarningSummary: input.resultWarningSummary,
      updatedAt: fixedNow
    };
    return this.deployment;
  }

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
    this.lifecycleEvents.push("terminal-fail");
    this.failedInput = {
      deploymentId: candidateDeploymentId,
      failureStage: input.failureStage,
      errorSummary: input.errorSummary,
      stateObjectKey: input.stateObjectKey,
      resultWarningSummary: input.resultWarningSummary
    };

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "FAILED",
      failureStage: input.failureStage,
      errorSummary: input.errorSummary,
      stateObjectKey: input.stateObjectKey ?? this.deployment.stateObjectKey,
      resultWarningSummary: input.resultWarningSummary ?? this.deployment.resultWarningSummary,
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
  readonly downloadedStates: Array<{ deploymentId: string; objectKey: string }> = [];
  stateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;
  optimizationEvidenceContent: Buffer | undefined;

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

  async downloadDeploymentState(input: {
    deploymentId: string;
    objectKey: string;
  }): Promise<Buffer> {
    this.downloadedStates.push(input);
    return Buffer.from('{"version":4,"lineage":"test-lineage","serial":7}');
  }

  async downloadDeploymentPlanOptimizationEvidence(): Promise<Buffer | undefined> {
    return this.optimizationEvidenceContent;
  }

  async uploadDeploymentState(input: UploadDeploymentStateInput) {
    this.uploadedStates.push(input);

    return {
      objectKey: this.stateObjectKey
    };
  }
}

test("selectDeploymentStateBaseline sorts serialized creation dates", () => {
  const current = createApprovedDeploymentRecord({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: "2026-01-02T00:00:00.000Z" as unknown as Date,
    stateObjectKey: "deployments/current/state/terraform.tfstate",
    status: "SUCCESS"
  });
  const previous = createApprovedDeploymentRecord({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    createdAt: "2026-01-01T00:00:00.000Z" as unknown as Date,
    stateObjectKey: "deployments/previous/state/terraform.tfstate",
    status: "SUCCESS"
  });

  assert.equal(selectDeploymentStateBaseline(current, [previous]), current);
});

test("runDeploymentApply blocks a changed state baseline before preparing AWS credentials", async () => {
  const plannedBaselineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const currentBaselineId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const currentStateObjectKey = `deployments/${currentBaselineId}/state/terraform.tfstate`;
  const repository = new FakeDeploymentRepository();
  repository.planArtifact = Object.assign(createPlanArtifactRecord(), {
    stateBaselineDeploymentId: plannedBaselineId,
    stateObjectKey: `deployments/${plannedBaselineId}/state/terraform.tfstate`,
    stateLineageSha256: createSha256("planned-lineage"),
    stateSerial: 6
  });
  repository.deployments = [
    repository.deployment!,
    createApprovedDeploymentRecord({
      id: currentBaselineId,
      approvedPlanArtifactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      currentPlanArtifactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      stateObjectKey: currentStateObjectKey,
      status: "SUCCESS",
      createdAt: new Date("2025-12-31T12:00:00.000Z")
    }),
    createApprovedDeploymentRecord({
      id: plannedBaselineId,
      approvedPlanArtifactId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      currentPlanArtifactId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      stateObjectKey: `deployments/${plannedBaselineId}/state/terraform.tfstate`,
      status: "SUCCESS",
      createdAt: new Date("2025-12-30T12:00:00.000Z")
    })
  ];
  let credentialsPrepared = false;
  let applyRan = false;

  await assert.rejects(
    runDeploymentApply({ deploymentId, accessContext: createAccessContext() }, repository, {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-changed-state-apply",
        mainFilePath: "C:/tmp/sketchcatch-changed-state-apply/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      writeTerraformStateFile: async () => undefined,
      writePlanFile: async () => undefined,
      prepareTerraformAwsCredentialEnv: async () => {
        credentialsPrepared = true;
        return createPreparedCredentials();
      },
      runTerraformApply: async () => {
        applyRan = true;
        return createRunnerResult("apply");
      }
    }),
    /state baseline changed.*new Plan/i
  );

  assert.equal(credentialsPrepared, false);
  assert.equal(applyRan, false);
});

test("runDeploymentApply applies the approved tfplan and stores state resources and outputs", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate"
  });
  const previousDeploymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const previousStateObjectKey = `deployments/${previousDeploymentId}/state/terraform.tfstate`;
  repository.deployments = [
    repository.deployment,
    createApprovedDeploymentRecord({
      id: previousDeploymentId,
      approvedPlanArtifactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdAt: "2025-12-31T00:00:00.000Z" as unknown as Date,
      currentPlanArtifactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      stateObjectKey: previousStateObjectKey,
      status: "SUCCESS"
    })
  ];
  repository.planArtifact = createPlanArtifactRecord({
    stateBaselineDeploymentId: previousDeploymentId,
    stateObjectKey: previousStateObjectKey,
    stateLineageSha256: createSha256("test-lineage"),
    stateSerial: 7
  });
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  const runnerStages: string[] = [];
  let cleanupCalled = false;
  let targetSyncCalls = 0;
  let writtenPlanFile: { filePath: string; content: Buffer } | undefined;
  let restoredState: { filePath: string; content: Buffer } | undefined;

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
      writeTerraformStateFile: async (filePath, content) => {
        restoredState = { filePath, content };
      },
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-apply/main.tf",
        terraformFiles: [],
        cleanup: async () => {
          cleanupCalled = true;
        }
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async (_workdir, options) => {
        assert.equal(options?.timeoutMs, expectedTerraformMutationTimeoutMs);
        runnerStages.push("init");
        return createRunnerResult("init");
      },
      runTerraformApply: async (_workdir, options) => {
        assert.ok(options);
        assert.equal(options.timeoutMs, expectedTerraformMutationTimeoutMs);
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
            api_base_url: {
              sensitive: false,
              value: "https://api.example.com"
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
      executeApplicationRelease: async () => {
        assert.ok(repository.savedInput);
        repository.lifecycleEvents.push("application-release");
        runnerStages.push("application-release");
      },
      synchronizeDeploymentTargetAfterApply: async () => {
        targetSyncCalls += 1;
      },
      reconcileApplicationOutput: async ({ outputs }) => {
        assert.equal(
          outputs.find((output) => output.name === "api_base_url")?.value,
          "https://api.example.com"
        );
        repository.lifecycleEvents.push("output-reconcile");
      },
      generateResultId: createSequentialIdGenerator()
    }
  );

  assert.deepEqual(runnerStages, ["init", "apply", "output", "show-state", "application-release"]);
  assert.deepEqual(repository.lifecycleEvents, [
    "state-save",
    "results-save",
    "output-reconcile",
    "application-release",
    "terminal-complete"
  ]);
  assert.equal(targetSyncCalls, 0);
  assert.deepEqual(repository.activeStages, ["application_release"]);
  assert.equal(cleanupCalled, true);
  assert.match(writtenPlanFile?.filePath ?? "", /[\\/]tfplan$/);
  assert.deepEqual(writtenPlanFile?.content, planBuffer);
  assert.deepEqual(applyArtifactStorage.downloadedStates, [
    { deploymentId: previousDeploymentId, objectKey: previousStateObjectKey }
  ]);
  assert.match(restoredState?.filePath ?? "", /[\\/]terraform\.tfstate$/);
  assert.equal(
    restoredState?.content.toString(),
    '{"version":4,"lineage":"test-lineage","serial":7}'
  );
  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(result.deployment.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.equal(result.deployment.resultWarningSummary, null);
  assert.deepEqual(repository.savedInput?.resources, [
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
  assert.deepEqual(repository.savedInput?.outputs, [
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
      name: "api_base_url",
      value: "https://api.example.com",
      sensitive: false
    },
    {
      id: "result-5",
      deploymentId,
      name: "bucket_name",
      value: "sketchcatch-demo-bucket",
      sensitive: false
    }
  ]);
  assert.deepEqual(
    repository.logs
      .filter((log) => !log.message.startsWith("[duration]"))
      .map((log) => log.message),
    ["init ok", "aws_vpc.main: Creation complete"]
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] terraform lock file upload completed in ")
    )
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] terraform state upload completed in ")
    )
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] deployment apply result save completed in ")
    )
  );
});

test("runDeploymentApply cleans a full-stack workspace when plan download fails", async () => {
  const repository = new FakeDeploymentRepository();
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  let cleanupCalls = 0;

  applyArtifactStorage.downloadDeploymentArtifact = async () => {
    throw new Error("plan download failed");
  };

  await assert.rejects(
    () =>
      runDeploymentApply({ deploymentId, accessContext: createAccessContext() }, repository, {
          applyArtifactStorage,
          prepareTerraformWorkspace: async () => {
            await new Promise<void>((resolve) => setImmediate(resolve));
            return {
              workdir: "C:/tmp/sketchcatch-terraform-apply",
              mainFilePath: "C:/tmp/sketchcatch-terraform-apply/main.tf",
              terraformFiles: [],
              cleanup: async () => {
                cleanupCalls += 1;
              }
            };
          }
      }),
    /plan download failed/
  );

  assert.equal(cleanupCalls, 1);
});

test("infrastructure ECS apply synchronizes target metadata after result storage", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "infrastructure",
    targetKind: "ecs_fargate"
  });
  const synchronizationInputs: unknown[] = [];
  repository.synchronizeDeploymentTargetAfterApply = async (input) => {
    assert.ok(repository.savedInput);
    repository.lifecycleEvents.push("target-sync");
    synchronizationInputs.push(input);
  };

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-infrastructure-target-sync",
        mainFilePath: "C:/tmp/sketchcatch-infrastructure-target-sync/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: JSON.stringify({ values: { root_module: { resources: [] } } })
        })
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.deepEqual(synchronizationInputs, [
    { projectId, deploymentId, accessContext: createAccessContext() }
  ]);
  assert.deepEqual(repository.lifecycleEvents, [
    "state-save",
    "results-save",
    "target-sync",
    "terminal-complete"
  ]);
});

test("target metadata sync failure records a warning without failing successful apply", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "infrastructure",
    targetKind: "ecs_fargate"
  });

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-target-sync-warning",
        mainFilePath: "C:/tmp/sketchcatch-target-sync-warning/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: JSON.stringify({ values: { root_module: { resources: [] } } })
        }),
      synchronizeDeploymentTargetAfterApply: async () => {
        throw new Error("temporary metadata store outage");
      }
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(repository.completeCalls, 1);
  assert.equal(repository.failedInput, undefined);
  assert.equal(
    repository.logs.some(
      (log) =>
        log.level === "WARN" &&
        log.message ===
          "Deployment target metadata synchronization failed after successful apply: temporary metadata store outage"
    ),
    true
  );
});

test("successful full-stack apply continues release when target sync warning storage also fails", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate"
  });
  const createDeploymentLogs = repository.createDeploymentLogs.bind(repository);
  repository.createDeploymentLogs = async (logs) => {
    if (
      logs.some((log) =>
        log.message.startsWith("Deployment target metadata synchronization failed")
      )
    ) {
      throw new Error("warning persistence unavailable");
    }
    return createDeploymentLogs(logs);
  };
  let releaseCalls = 0;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-target-sync-warning-storage-failure",
        mainFilePath: "C:/tmp/sketchcatch-target-sync-warning-storage-failure/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: JSON.stringify({ values: { root_module: { resources: [] } } })
        }),
      synchronizeDeploymentTargetAfterApply: async () => {
        throw new Error("temporary target metadata failure");
      },
      reconcileApplicationOutput: async () => undefined,
      executeApplicationRelease: async () => {
        releaseCalls += 1;
      }
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(releaseCalls, 1);
  assert.equal(repository.completeCalls, 1);
  assert.equal(repository.failedInput, undefined);
  assertContiguousDeploymentLogSequences(repository);
});

test("successful full-stack apply continues release when warning persistence commits before rejecting", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate"
  });
  installCommitAfterRejectingWarningPersistence(repository);
  let releaseCalls = 0;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-target-sync-warning-ambiguous-commit",
        mainFilePath: "C:/tmp/sketchcatch-target-sync-warning-ambiguous-commit/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: JSON.stringify({ values: { root_module: { resources: [] } } })
        }),
      synchronizeDeploymentTargetAfterApply: async () => {
        throw new Error("temporary target metadata failure");
      },
      reconcileApplicationOutput: async () => undefined,
      executeApplicationRelease: async () => {
        releaseCalls += 1;
      }
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(releaseCalls, 1);
  assert.equal(repository.completeCalls, 1);
  assert.equal(repository.failedInput, undefined);
  assertContiguousDeploymentLogSequences(repository);
});

test("full-stack output reconciliation failure preserves Terraform results and skips release", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate"
  });
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  let releaseCalls = 0;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-output-reconciliation-failure",
        mainFilePath: "C:/tmp/sketchcatch-output-reconciliation-failure/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () =>
        createRunnerResult("output", {
          stdout: JSON.stringify({
            api_base_url: {
              sensitive: false,
              value: "https://api.example.com"
            }
          })
        }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: JSON.stringify({ values: { root_module: { resources: [] } } })
        }),
      reconcileApplicationOutput: async () => {
        throw new Error("DEPLOYMENT_OUTPUT_URL_CONFLICT");
      },
      executeApplicationRelease: async () => {
        releaseCalls += 1;
      },
      generateResultId: createSequentialIdGenerator()
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(releaseCalls, 0);
  assert.equal(repository.completeCalls, 0);
  assert.equal(repository.savedInput?.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.deepEqual(repository.savedInput?.outputs, [
    {
      id: "result-1",
      deploymentId,
      name: "api_base_url",
      value: "https://api.example.com",
      sensitive: false
    }
  ]);
  assert.equal(repository.failedInput?.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.match(repository.failedInput?.errorSummary ?? "", /DEPLOYMENT_OUTPUT_URL_CONFLICT/);
});

test("post-apply failure retries terminal persistence when the first failure update is interrupted", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate"
  });
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  const persistFailure = repository.failDeployment.bind(repository);
  let failureAttempts = 0;
  repository.failDeployment = async (...args) => {
    failureAttempts += 1;
    if (failureAttempts === 1) {
      throw new Error("transient terminal persistence failure");
    }
    return persistFailure(...args);
  };

  await assert.rejects(
    runDeploymentApply({ deploymentId, accessContext: createAccessContext() }, repository, {
        applyArtifactStorage,
        readTerraformArtifactFile: async () => terraformArtifactContent,
        writePlanFile: async () => undefined,
        prepareTerraformWorkspace: async () => ({
          workdir: "C:/tmp/sketchcatch-terminal-persistence-retry",
          mainFilePath: "C:/tmp/sketchcatch-terminal-persistence-retry/main.tf",
          terraformFiles: [],
          cleanup: async () => undefined
        }),
        prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
        runTerraformInit: async () => createRunnerResult("init"),
        runTerraformApply: async () => createRunnerResult("apply"),
        runTerraformOutputJson: async () =>
          createRunnerResult("output", {
            stdout: JSON.stringify({
              api_base_url: {
                sensitive: false,
                value: "https://api.example.com"
              }
            })
          }),
        runTerraformShowStateJson: async () =>
          createRunnerResult("show", {
            stdout: JSON.stringify({ values: { root_module: { resources: [] } } })
          }),
        reconcileApplicationOutput: async () => {
          throw new Error("DEPLOYMENT_OUTPUT_URL_CONFLICT");
        },
        generateResultId: createSequentialIdGenerator()
    }),
    /transient terminal persistence failure/
  );

  assert.equal(failureAttempts, 2);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.deployment?.stateObjectKey, applyArtifactStorage.stateObjectKey);
});

function createVerifiedNoChangeApplyScenario(
  planSummary: NonNullable<DeploymentRecord["planSummary"]> = {
    createCount: 0,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: []
  }
): {
  repository: FakeDeploymentRepository;
  applyArtifactStorage: FakeApplyArtifactStorage;
  existingStateObjectKey: string;
} {
  const repository = new FakeDeploymentRepository();
  const existingStateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;
  repository.deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate",
    stateObjectKey: existingStateObjectKey,
    planSummary
  });
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  repository.planArtifact = createPlanArtifactRecord({
    stateBaselineDeploymentId: deploymentId,
    stateObjectKey: existingStateObjectKey,
    stateLineageSha256: createSha256("test-lineage"),
    stateSerial: 7
  });
  applyArtifactStorage.optimizationEvidenceContent = Buffer.from(
    JSON.stringify(
      createDeploymentPlanOptimizationEvidence({
        projectId,
        deploymentId,
        planArtifactId,
        planArtifactSha256: tfplanSha256,
        desiredStateIdentity: createTerraformDesiredStateIdentity({
          projectId,
          canonicalTerraformBundle: terraformArtifactContent,
          terraformFiles: [{ fileName: "main.tf", terraformCode: terraformArtifactContent }],
          providerLockContent: null,
          target: {
            provider: "aws",
            accountId: "123456789012",
            region: "ap-northeast-2"
          },
          state: { lineage: "test-lineage", serial: 7 }
        }),
        driftVerifiedAt: fixedNow.toISOString(),
        planSummary: repository.deployment.planSummary!,
        preDeploymentResult: { findings: [] },
        resourceChanges: []
      })
    )
  );
  return { repository, applyArtifactStorage, existingStateObjectKey };
}

test("an approved import-only Plan executes Terraform apply instead of the no-change shortcut", async () => {
  const { repository, applyArtifactStorage } = createVerifiedNoChangeApplyScenario({
    createCount: 0,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    importCount: 1,
    blocked: false,
    warnings: []
  });
  let credentialsPrepared = 0;
  let applyCalls = 0;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      writeTerraformStateFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-import-only-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-import-only-apply/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => {
        credentialsPrepared += 1;
        return createPreparedCredentials();
      },
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => {
        applyCalls += 1;
        return createRunnerResult("apply");
      },
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: '{"values":{"root_module":{"resources":[]}}}'
        }),
      reconcileApplicationOutput: async () => undefined,
      executeApplicationRelease: async () => undefined,
      now: () => fixedNow
    }
  );

  assert.equal(
    result.deployment.status,
    "SUCCESS",
    repository.failedInput?.errorSummary ?? "import-only apply failed without an error summary"
  );
  assert.equal(credentialsPrepared, 1);
  assert.equal(applyCalls, 1);
});

test("no-change Apply preserves release when target sync warning storage fails", async () => {
  const repository = new FakeDeploymentRepository();
  const createDeploymentLogs = repository.createDeploymentLogs.bind(repository);
  repository.createDeploymentLogs = async (logs) => {
    if (
      logs.some((log) =>
        log.message.startsWith("Deployment target metadata synchronization failed")
      )
    ) {
      throw new Error("warning persistence unavailable");
    }
    return createDeploymentLogs(logs);
  };
  const existingStateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;
  repository.deployment = createApprovedDeploymentRecord({
    scope: "full_stack",
    targetKind: "ecs_fargate",
    stateObjectKey: existingStateObjectKey,
    planSummary: {
      createCount: 0,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: false,
      warnings: []
    }
  });
  const noChangePlanSummary = repository.deployment.planSummary!;
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  repository.planArtifact = createPlanArtifactRecord({
    stateBaselineDeploymentId: deploymentId,
    stateObjectKey: existingStateObjectKey,
    stateLineageSha256: createSha256("test-lineage"),
    stateSerial: 7
  });
  applyArtifactStorage.optimizationEvidenceContent = Buffer.from(
    JSON.stringify(
      createDeploymentPlanOptimizationEvidence({
        projectId,
        deploymentId,
        planArtifactId,
        planArtifactSha256: tfplanSha256,
        desiredStateIdentity: createTerraformDesiredStateIdentity({
          projectId,
          canonicalTerraformBundle: terraformArtifactContent,
          terraformFiles: [{ fileName: "main.tf", terraformCode: terraformArtifactContent }],
          providerLockContent: null,
          target: {
            provider: "aws",
            accountId: "123456789012",
            region: "ap-northeast-2"
          },
          state: { lineage: "test-lineage", serial: 7 }
        }),
        driftVerifiedAt: fixedNow.toISOString(),
        planSummary: noChangePlanSummary,
        preDeploymentResult: { findings: [] },
        resourceChanges: []
      })
    )
  );
  let credentialsPrepared = false;
  let terraformRan = false;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writeTerraformStateFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-no-change-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-no-change-apply/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => {
        credentialsPrepared = true;
        throw new Error("No-change Apply must not prepare Terraform credentials");
      },
      runTerraformInit: async () => {
        terraformRan = true;
        throw new Error("No-change Apply must not run Terraform init");
      },
      runTerraformApply: async () => {
        terraformRan = true;
        throw new Error("No-change Apply must not run Terraform apply");
      },
      synchronizeDeploymentTargetAfterApply: async () => {
        throw new Error("temporary target metadata failure");
      },
      executeApplicationRelease: async () => {
        repository.lifecycleEvents.push("application-release");
      },
      now: () => fixedNow
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(credentialsPrepared, false);
  assert.equal(terraformRan, false);
  assert.equal(repository.savedInput?.stateObjectKey, existingStateObjectKey);
  assert.deepEqual(repository.lifecycleEvents, [
    "results-save",
    "application-release",
    "terminal-complete"
  ]);
  assert(
    repository.logs.some(
      (log) =>
        log.message ===
        "[optimization] event=apply_decision outcome=no_change reason=terraform_plan_no_changes"
      )
  );
  assertContiguousDeploymentLogSequences(repository);
});

test("no-change full-stack release preserves partial failure with the active fence and signal", async () => {
  const { repository, applyArtifactStorage } = createVerifiedNoChangeApplyScenario();
  const leaseRepository = createApplyLeaseRepository();
  let receivedSignal: AbortSignal | undefined;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      projectExecutionLeaseRepository: leaseRepository,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writeTerraformStateFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-no-change-partial-release",
        mainFilePath: "C:/tmp/sketchcatch-no-change-partial-release/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      executeApplicationRelease: async (input) => {
        assert.deepEqual(input.leaseFence, {
          projectId,
          holderId: deploymentId,
          fencingVersion: 1
        });
        receivedSignal = input.abortSignal;
        assert(repository.deployment);
        repository.deployment = {
          ...repository.deployment,
          status: "PARTIALLY_FAILED",
          failureStage: "application_release",
          errorSummary: "Application release partially failed at frontend_activation"
        };
        return "partially_failed";
      },
      now: () => fixedNow
    }
  );

  assert.ok(receivedSignal);
  assert.equal(result.deployment.status, "PARTIALLY_FAILED");
  assert.equal(repository.completeCalls, 0);
});

test("no-change Apply remains successful when warning persistence commits before rejecting", async () => {
  const { repository, applyArtifactStorage, existingStateObjectKey } =
    createVerifiedNoChangeApplyScenario();
  installCommitAfterRejectingWarningPersistence(repository);
  let releaseCalls = 0;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writeTerraformStateFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-no-change-warning-ambiguous-commit",
        mainFilePath: "C:/tmp/sketchcatch-no-change-warning-ambiguous-commit/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => {
        throw new Error("No-change Apply must not prepare Terraform credentials");
      },
      runTerraformInit: async () => {
        throw new Error("No-change Apply must not run Terraform init");
      },
      runTerraformApply: async () => {
        throw new Error("No-change Apply must not run Terraform apply");
      },
      synchronizeDeploymentTargetAfterApply: async () => {
        throw new Error("temporary target metadata failure");
      },
      executeApplicationRelease: async () => {
        releaseCalls += 1;
      },
      now: () => fixedNow
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(repository.savedInput?.stateObjectKey, existingStateObjectKey);
  assert.equal(releaseCalls, 1);
  assert.equal(repository.completeCalls, 1);
  assert.equal(repository.failedInput, undefined);
  assertContiguousDeploymentLogSequences(repository);
});

test("runDeploymentApply safely falls back when no-change evidence cannot be verified", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    planSummary: {
      createCount: 0,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: false,
      warnings: []
    }
  });
  let applyCalls = 0;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-no-change-fallback",
        mainFilePath: "C:/tmp/sketchcatch-terraform-no-change-fallback/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => {
        applyCalls += 1;
        return createRunnerResult("apply");
      },
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", { stdout: '{"values":{"root_module":{"resources":[]}}}' })
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(applyCalls, 1);
  assert(
    repository.logs.some(
      (log) =>
        log.message ===
        "[optimization] event=apply_decision outcome=fallback_execute reason=cache_validation_failed"
    )
  );
});

test("application scope releases the approved artifact without Terraform init or apply", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  const stages: string[] = [];
  let targetSyncCalls = 0;

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-application-release",
        mainFilePath: "C:/tmp/sketchcatch-application-release/main.tf",
        terraformFiles: [],
        cleanup: async () => {
          stages.push("cleanup");
        }
      }),
      prepareTerraformAwsCredentialEnv: async () => {
        throw new Error("application scope must not prepare Terraform credentials");
      },
      runTerraformInit: async () => {
        throw new Error("application scope must not run Terraform init");
      },
      runTerraformApply: async () => {
        throw new Error("application scope must not run Terraform apply");
      },
      runTerraformOutputJson: async () => {
        throw new Error("application scope must not read Terraform outputs");
      },
      runTerraformShowStateJson: async () => {
        throw new Error("application scope must not inspect Terraform state");
      },
      synchronizeDeploymentTargetAfterApply: async () => {
        targetSyncCalls += 1;
      },
      executeApplicationRelease: async () => {
        stages.push("application-release");
      }
    }
  );

  assert.deepEqual(stages, ["application-release", "cleanup"]);
  assert.deepEqual(repository.activeStages, ["application_release"]);
  assert.equal(result.deployment.status, "SUCCESS");
  assert.deepEqual(result.terraform, {
    init: null,
    apply: null,
    outputJson: null,
    showStateJson: null
  });
  assert.equal(repository.savedInput, undefined);
  assert.equal(repository.completeCalls, 1);
  assert.equal(applyArtifactStorage.uploadedStates.length, 0);
  assert.equal(targetSyncCalls, 0);
});

test("application release exceptions are classified as application_release failures", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "application",
    targetKind: "ecs_fargate"
  });

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-application-release-failure",
        mainFilePath: "C:/tmp/sketchcatch-application-release-failure/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      executeApplicationRelease: async () => {
        throw new Error("ECS service did not become healthy");
      }
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "application_release");
  assert.match(result.deployment.errorSummary ?? "", /ECS service did not become healthy/);
});

test("application scope cleans its prepared workspace when plan download fails", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  let cleanupCalls = 0;

  applyArtifactStorage.downloadDeploymentArtifact = async () => {
    throw new Error("plan download failed");
  };

  await assert.rejects(
    () =>
      runDeploymentApply({ deploymentId, accessContext: createAccessContext() }, repository, {
          applyArtifactStorage,
          readTerraformArtifactFile: async () => terraformArtifactContent,
          prepareTerraformWorkspace: async () => {
            await new Promise<void>((resolve) => setImmediate(resolve));
            return {
              workdir: "C:/tmp/sketchcatch-application-release",
              mainFilePath: "C:/tmp/sketchcatch-application-release/main.tf",
              terraformFiles: [],
              cleanup: async () => {
                cleanupCalls += 1;
              }
            };
          }
      }),
    /plan download failed/
  );

  assert.equal(cleanupCalls, 1);
});

test("application partial failure preserves the successful ECS state without completing Deployment", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-partial-release",
        mainFilePath: "C:/tmp/sketchcatch-partial-release/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      executeApplicationRelease: async () => {
        assert(repository.deployment);
        repository.deployment = {
          ...repository.deployment,
          status: "PARTIALLY_FAILED",
          failureStage: "application_release",
          errorSummary: "Application release partially failed at frontend_activation"
        };
        return "partially_failed";
      }
    }
  );

  assert.equal(result.deployment.status, "PARTIALLY_FAILED");
  assert.equal(result.deployment.failureStage, "application_release");
  assert.equal(repository.completeCalls, 0);
});

test("application cancellation completes only after ECS rollback result is persisted", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-cancelled-release",
        mainFilePath: "C:/tmp/sketchcatch-cancelled-release/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      executeApplicationRelease: async () => "cancelled"
    }
  );

  assert.equal(result.deployment.status, "CANCELLED");
  assert.match(result.deployment.errorSummary ?? "", /safely cancelled/);
  assert.equal(repository.completeCalls, 0);
});

test("application cancellation after frontend activation preserves partial state", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => terraformArtifactContent,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-partial-cancelled-release",
        mainFilePath: "C:/tmp/sketchcatch-partial-cancelled-release/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      executeApplicationRelease: async () => {
        assert(repository.deployment);
        repository.deployment = {
          ...repository.deployment,
          status: "PARTIALLY_CANCELED",
          failureStage: "application_release",
          errorSummary: "Application release was cancelled after frontend_activation"
        };
        return "partially_cancelled";
      }
    }
  );

  assert.equal(result.deployment.status, "PARTIALLY_CANCELED");
  assert.equal(repository.completeCalls, 0);
});

test("runDeploymentApply materializes archive data files before applying an approved plan", async () => {
  const archiveTerraformArtifact = `
    data/* materialized before approved apply */"archive_file"/* label */"handler"{
      type = "zip"
      source_content = "exports.handler = async () => ({ statusCode: 200 })"
      source_content_filename = "index.js"
      output_path = "./handler.zip"
    }

    resource "aws_s3_object" "handler" {
      bucket = "sketchcatch-demo-bucket"
      key    = "handler.zip"
      source = data.archive_file.handler.output_path
    }
  `;
  const terraformFiles: TerraformArtifactBundle["files"] = [
    { fileName: "providers.tf", terraformCode: "terraform {}\n" },
    { fileName: "lambda.tf", terraformCode: archiveTerraformArtifact }
  ];
  const artifactInput = {
    objectKey: "projects/project-id/assets/terraform_file/terraform-files.json",
    fileName: "terraform-files.json",
    contentType: "application/vnd.sketchcatch.terraform-files+json"
  };
  const bundle = JSON.stringify({ schemaVersion: 1, files: terraformFiles });
  const canonicalBundle = createTerraformArtifactCanonicalContent(artifactInput, bundle);
  const repository = new FakeDeploymentRepository();
  repository.terraformArtifact = createTerraformArtifactRecord({
    fileName: artifactInput.fileName,
    contentType: artifactInput.contentType
  });
  repository.deployment = createApprovedDeploymentRecord({
    approvedTerraformArtifactHash: createSha256(canonicalBundle),
    liveProfile: "demo_web_service_with_rds"
  });
  const runnerStages: string[] = [];

  const result = await runDeploymentApply(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage: new FakeApplyArtifactStorage(),
      readTerraformArtifactFile: async () => canonicalBundle,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-archive-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-archive-apply/main.tf",
        terraformFiles,
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => {
        runnerStages.push("init");
        return createRunnerResult("init");
      },
      runTerraformPlan: async (_workdir, options) => {
        if (!options) {
          throw new Error("Terraform materialization options are required");
        }

        assert.equal(options.planFileName, "materialize.tfplan");
        runnerStages.push("materialize");
        return createRunnerResult("plan");
      },
      runTerraformApply: async () => {
        runnerStages.push("apply");
        return createRunnerResult("apply");
      },
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", { stdout: JSON.stringify({ values: { root_module: {} } }) })
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.deepEqual(runnerStages, ["init", "materialize", "apply"]);
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
            data "aws_region" "current" {
            }
          `,
          writePlanFile: async () => {
            planWritten = true;
          },
          prepareTerraformWorkspace: async () => ({
            workdir: "C:/tmp/sketchcatch-terraform-unsafe-apply",
            mainFilePath: "C:/tmp/sketchcatch-terraform-unsafe-apply/main.tf",
            terraformFiles: [],
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
    /data source "aws_region" is not allowed/
  );

  assert.equal(cleanupCalled, true);
  assert.equal(credentialsPrepared, false);
  assert.equal(terraformRan, false);
  assert.equal(planWritten, false);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.failedInput?.failureStage, "apply");
  assert.match(
    repository.failedInput?.errorSummary ?? "",
    /data source "aws_region" is not allowed/
  );
});

test("runDeploymentApply rejects approval snapshot drift before credentials or Terraform", async () => {
  const cases: Array<{
    name: string;
    expectedError: RegExp;
    mutateRepository?: (repository: FakeDeploymentRepository) => void;
    readTerraformArtifactFile?: () => Promise<Buffer | Uint8Array | string>;
  }> = [
    {
      name: "artifact hash drift",
      expectedError: /Terraform artifact content changed after approval/,
      readTerraformArtifactFile: async () => `${terraformArtifactContent}# drift\n`
    },
    {
      name: "tfplan hash drift",
      expectedError: /Terraform plan changed before apply/,
      mutateRepository: (repository) => {
        repository.deployment = createApprovedDeploymentRecord({
          approvedTfplanHash: "b".repeat(64)
        });
      }
    },
    {
      name: "AWS account drift",
      expectedError: /AWS account changed before apply/,
      mutateRepository: (repository) => {
        repository.awsConnection = createVerifiedAwsConnection({ accountId: "999999999999" });
      }
    },
    {
      name: "AWS region drift",
      expectedError: /AWS region changed before apply/,
      mutateRepository: (repository) => {
        repository.awsConnection = createVerifiedAwsConnection({ region: "us-east-1" });
      }
    }
  ];

  for (const testCase of cases) {
    const repository = new FakeDeploymentRepository();
    let cleanupCalled = false;
    let credentialsPrepared = false;
    let terraformRan = false;
    let planWritten = false;

    testCase.mutateRepository?.(repository);

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
            readTerraformArtifactFile:
              testCase.readTerraformArtifactFile ?? (async () => terraformArtifactContent),
            writePlanFile: async () => {
              planWritten = true;
            },
            prepareTerraformWorkspace: async () => ({
              workdir: "C:/tmp/sketchcatch-terraform-drift-apply",
              mainFilePath: "C:/tmp/sketchcatch-terraform-drift-apply/main.tf",
              terraformFiles: [],
              cleanup: async () => {
                cleanupCalled = true;
              }
            }),
            prepareTerraformAwsCredentialEnv: async () => {
              credentialsPrepared = true;

              return createPreparedCredentials();
            },
            runTerraformInit: async () => {
              terraformRan = true;

              return createRunnerResult("init");
            }
          }
        ),
      (error) => {
        assert.equal(error instanceof Error, true, testCase.name);
        assert.match((error as Error).message, testCase.expectedError, testCase.name);

        return true;
      }
    );

    assert.equal(cleanupCalled, true, testCase.name);
    assert.equal(credentialsPrepared, false, testCase.name);
    assert.equal(terraformRan, false, testCase.name);
    assert.equal(planWritten, false, testCase.name);
    assert.equal(repository.deployment?.status, "FAILED", testCase.name);
    assert.equal(repository.failedInput?.failureStage, "approval", testCase.name);
    assert.match(repository.failedInput?.errorSummary ?? "", testCase.expectedError, testCase.name);
    assert.equal(
      repository.logs.some((log) => log.message.includes("Apply blocked before Terraform apply")),
      true,
      testCase.name
    );
  }
});

test("runDeploymentApply marks apply failures failed and masks secret output", async () => {
  const repository = new FakeDeploymentRepository();
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  let targetSyncCalls = 0;

  const result = await runDeploymentApply(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-apply/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () =>
        createRunnerResult("apply", {
          exitCode: 1,
          stdout: "",
          stderr: "aws_secret_access_key=very-secret\napply failed\n"
        }),
      synchronizeDeploymentTargetAfterApply: async () => {
        targetSyncCalls += 1;
      }
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "apply");
  assert.equal(repository.failedInput?.failureStage, "apply");
  assert.equal(repository.failedInput?.errorSummary, "[REDACTED]");
  assert.equal(repository.failedInput?.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.match(repository.failedInput?.resultWarningSummary ?? "", /Partial Terraform state/);
  assert.equal(result.deployment.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.equal(
    result.deployment.resultWarningSummary,
    "Partial Terraform state was saved after failed apply for explicit cleanup destroy."
  );
  assert.deepEqual(repository.lifecycleEvents, ["state-save", "terminal-fail"]);
  assert.equal(applyArtifactStorage.uploadedStates.length, 1);
  assert.equal(targetSyncCalls, 0);
  assert.equal(applyArtifactStorage.uploadedStates[0]?.deploymentId, deploymentId);
  assert.match(
    applyArtifactStorage.uploadedStates[0]?.stateFilePath ?? "",
    /sketchcatch-terraform-apply[\\/]terraform\.tfstate$/
  );
  assert.deepEqual(
    repository.logs
      .filter((log) => !log.message.startsWith("[duration]"))
      .map((log) => ({
        level: log.level,
        message: log.message
      })),
    [
      { level: "INFO", message: "init ok" },
      { level: "ERROR", message: "[REDACTED]" },
      { level: "ERROR", message: "apply failed" },
      {
        level: "WARN",
        message:
          "Partial Terraform state was saved after failed apply for explicit cleanup destroy."
      }
    ]
  );
  assert(
    repository.logs.some((log) =>
      log.message.startsWith("[duration] partial terraform state upload completed in ")
    )
  );
});

test("runDeploymentApply persists partial state before terminal failure recording", async () => {
  const repository = new FakeDeploymentRepository();
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  const createDeploymentLogs = repository.createDeploymentLogs.bind(repository);
  repository.createDeploymentLogs = async (logs) => {
    if (
      logs.some((log) =>
        log.message.startsWith("[duration] partial terraform state upload completed in ")
      )
    ) {
      throw new Error("simulated interruption immediately after partial state upload");
    }
    return createDeploymentLogs(logs);
  };
  repository.failDeployment = async () => {
    throw new Error("simulated process interruption before terminal failure recording");
  };

  await assert.rejects(
    runDeploymentApply(
      {
        deploymentId,
        accessContext: createAccessContext()
      },
      repository,
      {
        applyArtifactStorage,
        readTerraformArtifactFile: async () => terraformArtifactContent,
        writePlanFile: async () => undefined,
        prepareTerraformWorkspace: async () => ({
          workdir: "C:/tmp/sketchcatch-terraform-partial-state",
          mainFilePath: "C:/tmp/sketchcatch-terraform-partial-state/main.tf",
          terraformFiles: [],
          cleanup: async () => undefined
        }),
        prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
        runTerraformInit: async () => createRunnerResult("init"),
        runTerraformApply: async () =>
          createRunnerResult("apply", {
            exitCode: 1,
            stderr: "apply failed after changing resources"
          })
      }
    ),
    /simulated process interruption before terminal failure recording/
  );

  assert.equal(applyArtifactStorage.uploadedStates.length, 1);
  assert.equal(repository.deployment?.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.equal(
    repository.deployment?.resultWarningSummary,
    "Partial Terraform state was saved after failed apply for explicit cleanup destroy."
  );
});

test("runDeploymentApply reports apply timeouts with a partial resource warning", async () => {
  const repository = new FakeDeploymentRepository();
  const applyArtifactStorage = new FakeApplyArtifactStorage();

  const result = await runDeploymentApply(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-apply/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () =>
        createRunnerResult("apply", {
          exitCode: 143,
          stdout: "aws_instance.web: Still creating... [id=i-1234567890abcdef0, 00m50s elapsed]\n",
          timedOut: true
        })
    }
  );

  assert.equal(result.deployment.status, "FAILED");
  assert.equal(result.deployment.failureStage, "apply");
  assert.equal(
    repository.failedInput?.errorSummary,
    "Terraform apply timed out. AWS resources may have been partially changed; verify resources before retry."
  );
  assert.equal(repository.failedInput?.stateObjectKey, applyArtifactStorage.stateObjectKey);
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
        terraformFiles: [],
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
  assert.equal(repository.savedInput?.outputs.length, 0);
  assert.equal(repository.savedInput?.resources.length, 0);
  assert.equal(
    repository.logs.some((log) =>
      log.message.includes("Terraform output parse failed after successful apply")
    ),
    true
  );
});

test("successful apply checkpoints state and stays successful when result persistence fails", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({ scope: "infrastructure" });
  repository.saveDeploymentApplyResults = async () => {
    repository.lifecycleEvents.push("results-save-failed");
    throw new Error("temporary result transaction outage");
  };
  const applyArtifactStorage = new FakeApplyArtifactStorage();

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-result-save-warning",
        mainFilePath: "C:/tmp/sketchcatch-result-save-warning/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", {
          stdout: JSON.stringify({ values: { root_module: { resources: [] } } })
        })
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(repository.failedInput, undefined);
  assert.equal(repository.savedStateInput?.stateObjectKey, applyArtifactStorage.stateObjectKey);
  assert.match(
    repository.savedStateInput?.resultWarningSummary ?? "",
    /result persistence failed after successful apply/i
  );
  assert.deepEqual(repository.lifecycleEvents, [
    "state-save",
    "results-save-failed",
    "state-save",
    "terminal-complete"
  ]);
});

function createApprovedDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  const deployment: DeploymentRecord = {
    id: deploymentId,
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
    approvedPreparedSnapshotHash: null,
    startedAt: fixedNow,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
  if (deployment.scope !== "infrastructure" && deployment.releaseCandidateId === null) {
    const candidate = createReleaseCandidateRecord();
    const snapshot = createPreparedReleaseSnapshotHash({
      candidateId: candidate.id,
      commitSha: candidate.commitSha,
      compositeDigest: candidate.compositeDigest,
      configFingerprint: candidate.configFingerprint
    });
    return {
      ...deployment,
      releaseCandidateId: candidate.id,
      preparedSnapshotHash: snapshot,
      approvedPreparedSnapshotHash: snapshot
    };
  }
  return deployment;
}

function installCommitAfterRejectingWarningPersistence(repository: FakeDeploymentRepository): void {
  const createDeploymentLogs = repository.createDeploymentLogs.bind(repository);
  repository.createDeploymentLogs = async (logs) => {
    if (
      logs.some((candidate) =>
        repository.logs.some(
          (persisted) =>
            persisted.deploymentId === candidate.deploymentId &&
            persisted.sequence === candidate.sequence
        )
      )
    ) {
      throw new Error("duplicate deployment log sequence");
    }
    const persisted = await createDeploymentLogs(logs);
    if (
      logs.some((log) =>
        log.message.startsWith("Deployment target metadata synchronization failed")
      )
    ) {
      throw new Error("warning persistence response unavailable after commit");
    }
    return persisted;
  };
}

function assertContiguousDeploymentLogSequences(repository: FakeDeploymentRepository): void {
  const sequences = repository.logs
    .filter((log) => log.deploymentId === deploymentId)
    .map((log) => log.sequence)
    .sort((left, right) => left - right);
  assert.deepEqual(
    sequences,
    Array.from({ length: sequences.length }, (_, index) => index + 1)
  );
}

test("infrastructure rollback apply restores the same current state used by the approved plan", async () => {
  const sourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const targetId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const repository = new FakeDeploymentRepository();
  repository.deployment = createApprovedDeploymentRecord({
    rollbackOfDeploymentId: sourceId,
    rollbackTargetDeploymentId: targetId,
    createdAt: new Date("2026-07-15T12:00:00.000Z")
  });
  repository.relatedDeployments = [
    createApprovedDeploymentRecord({
      id: sourceId,
      status: "FAILED",
      stateObjectKey: `deployments/${sourceId}/state/terraform.tfstate`,
      createdAt: new Date("2026-07-15T11:00:00.000Z")
    }),
    createApprovedDeploymentRecord({
      id: targetId,
      status: "SUCCESS",
      stateObjectKey: `deployments/${targetId}/state/terraform.tfstate`,
      currentPlanArtifactId: null,
      createdAt: new Date("2026-07-15T10:00:00.000Z")
    })
  ];
  const stateWrites: Array<{ filePath: string; content: Buffer }> = [];
  const applyArtifactStorage = new FakeApplyArtifactStorage();
  applyArtifactStorage.downloadDeploymentState = async (input) => {
    assert.deepEqual(input, {
      deploymentId: sourceId,
      objectKey: `deployments/${sourceId}/state/terraform.tfstate`
    });
    return Buffer.from('{"lineage":"current","serial":7}');
  };
  repository.planArtifact = createPlanArtifactRecord({
    stateBaselineDeploymentId: sourceId,
    stateObjectKey: `deployments/${sourceId}/state/terraform.tfstate`,
    stateLineageSha256: createSha256("current"),
    stateSerial: 7
  });

  const result = await runDeploymentApply(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      applyArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      writePlanFile: async () => undefined,
      writeTerraformStateFile: async (filePath, content) => {
        stateWrites.push({ filePath, content: Buffer.from(content) });
      },
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-rollback-apply",
        mainFilePath: "C:/tmp/sketchcatch-terraform-rollback-apply/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformApply: async () => createRunnerResult("apply"),
      runTerraformOutputJson: async () => createRunnerResult("output", { stdout: "{}" }),
      runTerraformShowStateJson: async () =>
        createRunnerResult("show", { stdout: JSON.stringify({ values: { root_module: {} } }) })
    }
  );

  assert.equal(result.deployment.status, "SUCCESS");
  assert.equal(stateWrites[0]?.filePath.endsWith("terraform.tfstate"), true);
  assert.equal(stateWrites[0]?.content.toString("utf8"), '{"lineage":"current","serial":7}');
});

function createReleaseCandidateRecord(): ReleaseCandidateRecord {
  return {
    id: releaseCandidateId,
    projectId,
    deploymentId,
    pipelineRunId: null,
    buildEnvironmentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    commitSha: "a".repeat(40),
    configFingerprint: "b".repeat(64),
    compositeDigest: "c".repeat(64),
    apiOciDigest: "d".repeat(64),
    apiArchiveDigest: "e".repeat(64),
    frontendArchiveDigest: "f".repeat(64),
    frontendManifestDigest: "1".repeat(64),
    frontendIndexDigest: "2".repeat(64),
    apiArchiveObjectKey: `deployments/${deploymentId}/release-candidates/${releaseCandidateId}/api-image.oci.tar`,
    apiArchiveObjectVersionId: "api-v1",
    apiArchiveByteSize: 100,
    frontendArchiveObjectKey: `deployments/${deploymentId}/release-candidates/${releaseCandidateId}/frontend.tar.zst`,
    frontendArchiveObjectVersionId: "frontend-v1",
    frontendArchiveByteSize: 200,
    frontendManifestObjectKey: `deployments/${deploymentId}/release-candidates/${releaseCandidateId}/frontend-manifest.json`,
    frontendManifestObjectVersionId: "manifest-v1",
    manifestObjectKey: `deployments/${deploymentId}/release-candidates/${releaseCandidateId}/candidate-manifest.json`,
    manifestObjectVersionId: "candidate-v1",
    status: "pending",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    frontendRetryExpiresAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
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
    sha256: tfplanSha256,
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

function createApplyLeaseRepository(): ProjectExecutionLeaseRepository {
  let record: ProjectExecutionLeaseRecord | undefined;
  return {
    async acquire(input) {
      record = {
        projectId: input.projectId,
        holderId: input.holderId,
        source: input.source,
        fencingVersion: 1,
        status: "active",
        activeCodeBuildId: null,
        activeWorkerTaskArn: null,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now
      };
      return record;
    },
    async find() {
      return record;
    },
    async heartbeat(input) {
      if (!record) return undefined;
      record = { ...record, heartbeatAt: input.now, expiresAt: input.expiresAt };
      return record;
    },
    async setExecutionCoordinates() {
      return record;
    },
    async release(input) {
      if (!record) return false;
      record = { ...record, status: "released", updatedAt: input.now };
      return true;
    }
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
