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
import { analyzePreDeploymentCheck } from "../services/aiPreDeploymentCheck.js";
import { createCachedTerraformSecurityScanner } from "../services/terraform/trivy-terraform-scan.js";
import type {
  DeploymentPlanArtifactStorage,
  UploadDeploymentPlanArtifactInput,
  UploadedDeploymentPlanArtifact
} from "./deployment-plan-artifact-storage.js";
import { terraformInitTimeoutMs, terraformMutationTimeoutMs } from "./terraform-runner.js";
import { DirectApplicationReleaseError } from "./direct-application-release-service.js";
import type {
  ProjectExecutionLeaseRecord,
  ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import {
  createDeploymentPlanOptimizationEvidence,
  createTerraformDesiredStateIdentity,
  type DeploymentPlanOptimizationEvidence
} from "./deployment-optimization.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const userId = "55555555-5555-4555-8555-555555555555";
const planArtifactId = "99999999-9999-4999-8999-999999999999";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");
const terraformArtifactContent = 'terraform { required_version = ">= 1.6.0" }\n';
const terraformArtifactSha256 = createSha256(terraformArtifactContent);

class FakeDeploymentRepository implements DeploymentRepository {
  readonly activeStages: Array<NonNullable<DeploymentRecord["activeStage"]>> = [];
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
  planArtifact: DeploymentPlanArtifactRecord | undefined = createDeploymentPlanArtifactRecord();
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  relatedDeployments: DeploymentRecord[] = [];
  logs: DeploymentLogRecord[] = [];
  throwOnSaveDeploymentPlan = false;
  readonly accessibleUserIds = new Set([userId]);

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    if (
      !this.project ||
      this.project.id !== candidateProjectId ||
      !this.accessibleUserIds.has(accessContext.userId)
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
      !this.accessibleUserIds.has(accessContext.userId) ||
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
    return this.deployment?.id === candidateDeploymentId
      ? this.deployment
      : this.relatedDeployments.find((deployment) => deployment.id === candidateDeploymentId);
  }

  async findDeploymentPlanArtifactById(
    candidatePlanArtifactId: string
  ): Promise<DeploymentPlanArtifactRecord | undefined> {
    return this.planArtifact?.id === candidatePlanArtifactId ? this.planArtifact : undefined;
  }

  async findRunningDeploymentInProject(): Promise<DeploymentRecord | undefined> {
    return this.deployment?.status === "RUNNING" ? this.deployment : undefined;
  }

  async listDeploymentsByProject(): Promise<DeploymentRecord[]> {
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
  readonly downloadedStates: Array<{ deploymentId: string; objectKey: string }> = [];

  async downloadDeploymentState(input: {
    deploymentId: string;
    objectKey: string;
  }): Promise<Buffer> {
    this.downloadedStates.push(input);
    return Buffer.from('{"version":4,"serial":7}');
  }
  readonly optimizationEvidenceUploads: DeploymentPlanOptimizationEvidence[] = [];
  planContent = Buffer.from("reusable tfplan");
  uploadedPlanSha256 = "0".repeat(64);
  optimizationEvidenceContent: Buffer | undefined;

  async uploadDeploymentPlanArtifact(
    input: UploadDeploymentPlanArtifactInput
  ): Promise<UploadedDeploymentPlanArtifact> {
    this.uploads.push(input);

    return {
      objectKey: `deployments/${input.deploymentId}/plans/${input.planArtifactId}.tfplan`,
      sha256: this.uploadedPlanSha256
    };
  }

  async downloadDeploymentPlanArtifact(): Promise<Buffer> {
    return this.planContent;
  }

  async uploadDeploymentPlanOptimizationEvidence(input: {
    evidence: DeploymentPlanOptimizationEvidence;
  }): Promise<{ objectKey: string }> {
    this.optimizationEvidenceUploads.push(input.evidence);
    this.optimizationEvidenceContent = Buffer.from(JSON.stringify(input.evidence));

    return {
      objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.optimization.json`
    };
  }

  async downloadDeploymentPlanOptimizationEvidence(): Promise<Buffer | undefined> {
    return this.optimizationEvidenceContent;
  }

  async deleteDeploymentPlanArtifact(objectKey: string): Promise<void> {
    this.deletes.push(objectKey);
  }
}

function createPlanLeaseRepository(options: { failHeartbeatAt: number }): {
  repository: ProjectExecutionLeaseRepository;
  readonly releases: number;
} {
  let record: ProjectExecutionLeaseRecord | undefined;
  let heartbeatCount = 0;
  let releases = 0;
  const repository: ProjectExecutionLeaseRepository = {
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
      heartbeatCount += 1;
      if (heartbeatCount >= options.failHeartbeatAt || !record) return undefined;
      record = {
        ...record,
        heartbeatAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now
      };
      return record;
    },
    async setExecutionCoordinates(input) {
      if (!record) return undefined;
      record = {
        ...record,
        ...(input.activeCodeBuildId === undefined
          ? {}
          : { activeCodeBuildId: input.activeCodeBuildId }),
        ...(input.activeWorkerTaskArn === undefined
          ? {}
          : { activeWorkerTaskArn: input.activeWorkerTaskArn }),
        updatedAt: input.now
      };
      return record;
    },
    async release(input) {
      if (!record || input.fencingVersion !== record.fencingVersion) return false;
      releases += 1;
      record = { ...record, status: "released", updatedAt: input.now };
      return true;
    }
  };
  return {
    repository,
    get releases() {
      return releases;
    }
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
    awsAccountIdSnapshot: "123456789012",
    awsRegionSnapshot: "ap-northeast-2",
    awsConnectionNameSnapshot: "123456789012",
    liveProfile: "practice",
    scope: "infrastructure",
    targetKind: null,
    source: "direct",
    releaseId: null,
    releaseCandidateId: null,
    rollbackOfDeploymentId: null,
    rollbackTargetDeploymentId: null,
    preparedDraftRevision: null,
    preparedSnapshotHash: null,
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

test("infrastructure rollback plan restores the current state while planning the previous configuration", async () => {
  const sourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const targetId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    rollbackOfDeploymentId: sourceId,
    rollbackTargetDeploymentId: targetId,
    createdAt: new Date("2026-07-15T12:00:00.000Z")
  });
  repository.relatedDeployments = [
    createDeploymentRecord(sourceId, {
      status: "FAILED",
      stateObjectKey: `deployments/${sourceId}/state/terraform.tfstate`,
      createdAt: new Date("2026-07-15T11:00:00.000Z")
    }),
    createDeploymentRecord(targetId, {
      status: "SUCCESS",
      stateObjectKey: `deployments/${targetId}/state/terraform.tfstate`,
      createdAt: new Date("2026-07-15T10:00:00.000Z")
    })
  ];
  const stateWrites: Array<{ filePath: string; content: Buffer }> = [];
  const stateDownloads: Array<{ deploymentId: string; objectKey: string }> = [];

  const result = await runDeploymentPlan(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      generatePlanArtifactId: () => planArtifactId,
      planArtifactStorage: new FakePlanArtifactStorage(),
      rollbackStateStorage: {
        async downloadDeploymentState(input) {
          stateDownloads.push(input);
          return Buffer.from('{"lineage":"current"}');
        }
      },
      writeTerraformStateFile: async (filePath, content) => {
        stateWrites.push({ filePath, content: Buffer.from(content) });
      },
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-rollback-plan",
        mainFilePath: "C:/tmp/sketchcatch-terraform-rollback-plan/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () => createRunnerResult("init"),
      runTerraformPlan: async () => createRunnerResult("plan"),
      runTerraformShowJson: async () => createRunnerResult("show", { stdout: createPlanJson([]) })
    }
  );

  assert.equal(result.deployment.status, "PENDING");
  assert.deepEqual(stateDownloads, [
    {
      deploymentId: sourceId,
      objectKey: `deployments/${sourceId}/state/terraform.tfstate`
    }
  ]);
  assert.equal(stateWrites[0]?.filePath.endsWith("terraform.tfstate"), true);
  assert.equal(stateWrites[0]?.content.toString("utf8"), '{"lineage":"current"}');
});

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
    deletionStartedAt: null,
    deletionErrorSummary: null,
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

function createSha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function createAccessContext(candidateUserId = userId): ProjectAccessContext {
  return {
    kind: "user",
    userId: candidateUserId
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

test("runDeploymentPlan saves a tfplan artifact, summary, warnings, logs, and current pointer", async () => {
  const planTerraformArtifactContent = `resource "aws_db_instance" "database" {}
`;
  const planTerraformArtifactSha256 = createSha256(planTerraformArtifactContent);
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    scope: "full_stack",
    targetKind: "ecs_fargate",
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
      readTerraformArtifactFile: async () => planTerraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareApplicationArtifact: async () => {
        runnerStages.push("application-artifact");
        return {
          releaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          runtimeTargetKind: "ecs_fargate",
          version: "1.0.0",
          commitSha: "c".repeat(40),
          artifactDigest: "d".repeat(64)
        };
      },
      prepareTerraformWorkspace: async (input) => {
        assert.deepEqual(input, {
          objectKey: "projects/project-id/assets/terraform_file/artifact-main.tf",
          fileName: "main.tf",
          contentType: "application/x-terraform"
        });

        return {
          workdir: "C:/tmp/sketchcatch-terraform-plan",
          mainFilePath: "C:/tmp/sketchcatch-terraform-plan/main.tf",
          terraformFiles: [],
          cleanup: async () => {
            cleanupCalled = true;
          }
        };
      },
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async (_workdir, options) => {
        assert.equal(options?.timeoutMs, terraformInitTimeoutMs);
        runnerStages.push("init");
        assert.ok(options?.onOutputLine);
        const initLines = ["init 1", "init 2", "init 3", "init 4", "init 5"];

        for (const line of initLines) {
          await options.onOutputLine({ line, stream: "stdout" });
        }

        assert(repository.logs.some((log) => log.message === "init 5"));
        return createRunnerResult("init", { stdout: `${initLines.join("\n")}\n` });
      },
      runTerraformPlan: async (_workdir, options) => {
        assert.equal(options?.timeoutMs, terraformMutationTimeoutMs);
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
              address: "aws_db_instance.database",
              type: "aws_db_instance",
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

  assert.deepEqual(runnerStages, ["application-artifact", "init", "plan", "show-json"]);
  assert.deepEqual(repository.activeStages, ["preflight", "plan"]);
  assert.equal(cleanupCalled, true);
  assert.equal(result.deployment.status, "PENDING");
  assert.equal(result.deployment.currentPlanArtifactId, planArtifactId);
  assert.deepEqual(result.deployment.planSummary, {
    createCount: 1,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: [
      {
        id: "terraform_plan:UNSUPPORTED_RESOURCE:apply:aws_db_instance",
        level: "high",
        category: "configuration",
        source: "terraform_plan",
        code: "UNSUPPORTED_RESOURCE",
        message: "MVP live apply does not support Terraform resource type aws_db_instance",
        requiresAcknowledgement: false,
        blocksApproval: false
      }
    ]
  });
  assert.equal(result.deployment.isBlocked, false);
  assert.equal(result.deployment.blockedBy, null);
  assert.equal(result.deployment.blockedReason, null);
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
    terraformArtifactSha256: planTerraformArtifactSha256,
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: "0".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2"
  });
  assert.equal(planArtifactStorage.uploads[0]?.planFilePath.endsWith("tfplan"), true);
  const nonDurationLogs = repository.logs.filter((log) => !log.message.startsWith("[duration]"));
  assert.deepEqual(
    nonDurationLogs
      .filter((log) => !log.message.startsWith("[optimization]"))
      .map((log) => ({
        stage: log.stage,
        level: log.level,
        message: log.message
      })),
    [
      { stage: "init", level: "INFO", message: "init 1" },
      { stage: "init", level: "INFO", message: "init 2" },
      { stage: "init", level: "INFO", message: "init 3" },
      { stage: "init", level: "INFO", message: "init 4" },
      { stage: "init", level: "INFO", message: "init 5" },
      {
        stage: "plan",
        level: "INFO",
        message: "Plan: 1 to add, 0 to change, 0 to destroy."
      },
      { stage: "plan", level: "WARN", message: "show warning only" }
    ]
  );
  assert(
    nonDurationLogs.some(
      (log) =>
        log.message === "[optimization] event=plan_decision outcome=execute reason=cache_miss"
    )
  );
  assert(
    nonDurationLogs.some(
      (log) =>
        log.message ===
        "[optimization] event=resource_change action=create address=aws_db_instance.database"
    )
  );
  assert.equal(planArtifactStorage.optimizationEvidenceUploads.length, 1);
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
  assert.equal(
    repository.logs.some((log) => log.message.includes("resource_changes")),
    false
  );
});

test("runDeploymentPlan records application preflight failures separately from Terraform plan failures", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    scope: "full_stack",
    targetKind: "ecs_fargate"
  });
  let terraformWorkspacePrepared = false;

  await assert.rejects(
    runDeploymentPlan({ deploymentId, accessContext: createAccessContext() }, repository, {
      prepareApplicationArtifact: async () => {
        throw new DirectApplicationReleaseError(
          "The frontend production build failed",
          "PREFLIGHT_FRONTEND_BUILD_FAILED"
        );
      },
      prepareTerraformWorkspace: async () => {
        terraformWorkspacePrepared = true;
        throw new Error("Terraform must not start after a failed preflight");
      }
    }),
    (error) =>
      error instanceof DirectApplicationReleaseError &&
      error.code === "PREFLIGHT_FRONTEND_BUILD_FAILED"
  );

  assert.equal(terraformWorkspacePrepared, false);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.deployment?.failureStage, "preflight");
  assert.match(repository.deployment?.errorSummary ?? "", /frontend production build/i);
});

test("runDeploymentPlan cleans a prepared workspace when a parallel prerequisite fails", async () => {
  const repository = new FakeDeploymentRepository();
  let cleanupCalls = 0;

  repository.findVerifiedAwsConnectionById = async () => {
    throw new Error("connection lookup failed");
  };

  await assert.rejects(
    () =>
      runDeploymentPlan(
        { deploymentId, accessContext: createAccessContext() },
        repository,
        {
          planArtifactStorage: new FakePlanArtifactStorage(),
          prepareTerraformWorkspace: async () => {
            await new Promise<void>((resolve) => setImmediate(resolve));
            return {
              workdir: "C:/tmp/sketchcatch-terraform-plan",
              mainFilePath: "C:/tmp/sketchcatch-terraform-plan/main.tf",
              terraformFiles: [],
              cleanup: async () => {
                cleanupCalls += 1;
              }
            };
          }
        }
      ),
    /connection lookup failed/
  );

  assert.equal(cleanupCalls, 1);
});

test("application scope writes an immutable release approval plan without running Terraform", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const planArtifactStorage = new FakePlanArtifactStorage();
  let writtenPlan: { filePath: string; content: string } | undefined;

  const result = await runDeploymentPlan(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    {
      generatePlanArtifactId: () => planArtifactId,
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareApplicationArtifact: async () => ({
        releaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        runtimeTargetKind: "ecs_fargate",
        version: "1.0.0",
        commitSha: "c".repeat(40),
        artifactDigest: "d".repeat(64)
      }),
      writeApplicationPlanFile: async (filePath, content) => {
        writtenPlan = { filePath, content };
      },
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-application-plan",
        mainFilePath: "C:/tmp/sketchcatch-application-plan/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => {
        throw new Error("application scope must not prepare Terraform credentials");
      },
      runTerraformInit: async () => {
        throw new Error("application scope must not run Terraform init");
      },
      runTerraformPlan: async () => {
        throw new Error("application scope must not run Terraform plan");
      },
      runTerraformShowJson: async () => {
        throw new Error("application scope must not inspect a Terraform plan");
      }
    }
  );

  assert.equal(result.deployment.status, "PENDING");
  assert.deepEqual(result.deployment.planSummary, {
    createCount: 0,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: []
  });
  assert.equal(result.terraform.init, null);
  assert.equal(result.terraform.plan, null);
  assert.deepEqual(repository.activeStages, ["preflight", "plan"]);
  assert.match(writtenPlan?.filePath ?? "", /application-release-plan\.json$/);
  assert.deepEqual(JSON.parse(writtenPlan?.content ?? "{}"), {
    schemaVersion: 1,
    kind: "application_release_plan",
    deploymentId,
    projectId,
    releaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    runtimeTargetKind: "ecs_fargate",
    version: "1.0.0",
    commitSha: "c".repeat(40),
    artifactDigest: "d".repeat(64)
  });
  assert.match(
    planArtifactStorage.uploads[0]?.planFilePath ?? "",
    /application-release-plan\.json$/
  );
});

test("application plan rejects a lost lease fence before saving the approval artifact", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const planArtifactStorage = new FakePlanArtifactStorage();
  const lease = createPlanLeaseRepository({ failHeartbeatAt: 2 });

  await assert.rejects(
    runDeploymentPlan({ deploymentId, accessContext: createAccessContext() }, repository, {
      generatePlanArtifactId: () => planArtifactId,
      planArtifactStorage,
      projectExecutionLeaseRepository: lease.repository,
      leaseHeartbeatIntervalMs: 60_000,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareApplicationArtifact: async () => ({
        releaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        runtimeTargetKind: "ecs_fargate",
        version: "1.0.0",
        commitSha: "c".repeat(40),
        artifactDigest: "d".repeat(64)
      }),
      writeApplicationPlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-application-plan-fence",
        mainFilePath: "C:/tmp/sketchcatch-application-plan-fence/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      })
    }),
    /project release lease/i
  );

  assert.equal(planArtifactStorage.uploads.length, 1);
  assert.equal(planArtifactStorage.deletes.length, 1);
  assert.equal(repository.savedPlans.length, 0);
  assert.equal(lease.releases, 1);
});

test("plan heartbeat failure aborts without a stale terminal write or lease release", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    scope: "application",
    targetKind: "ecs_fargate"
  });
  const lease = createPlanLeaseRepository({ failHeartbeatAt: 1 });

  await assert.rejects(
    runDeploymentPlan({ deploymentId, accessContext: createAccessContext() }, repository, {
      projectExecutionLeaseRepository: lease.repository,
      leaseHeartbeatIntervalMs: 1,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareApplicationArtifact: async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return {
          releaseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          runtimeTargetKind: "ecs_fargate",
          version: "1.0.0",
          commitSha: "c".repeat(40),
          artifactDigest: "d".repeat(64)
        };
      },
      writeApplicationPlanFile: async () => undefined,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-application-plan-heartbeat",
        mainFilePath: "C:/tmp/sketchcatch-application-plan-heartbeat/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      })
    }),
    /project release lease/i
  );

  assert.equal(repository.savedPlans.length, 0);
  assert.equal(repository.failedDeployments.length, 0);
  assert.equal(lease.releases, 0);
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
            data "aws_region" "current" {
            }
          `,
          analyzePreDeployment: () => createAnalysis(),
          prepareTerraformWorkspace: async () => ({
            workdir: "C:/tmp/sketchcatch-terraform-unsafe-plan",
            mainFilePath: "C:/tmp/sketchcatch-terraform-unsafe-plan/main.tf",
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
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.deployment?.failureStage, "plan");
  assert.match(
    repository.deployment?.errorSummary ?? "",
    /data source "aws_region" is not allowed/
  );
  assert.equal(planArtifactStorage.uploads.length, 0);
});

test("runDeploymentPlan blocks an uploaded Terraform bundle matching an analysis-excluded Architecture resource before init", async () => {
  const repository = new FakeDeploymentRepository();
  repository.architecture = createArchitectureRecord({
    nodes: [
      {
        id: "legacy-lambda",
        type: "LAMBDA",
        label: "Legacy Lambda",
        positionX: 0,
        positionY: 0,
        config: {
          analysisExcluded: true,
          terraformResourceType: "aws_lambda_function",
          terraformResourceName: "legacy_lambda"
        }
      },
      {
        id: "supported-vpc",
        type: "VPC",
        label: "VPC",
        positionX: 120,
        positionY: 0,
        config: {}
      }
    ],
    edges: []
  });
  const artifactContent = `resource "aws_vpc" "main" {}
resource "aws_lambda_function" "legacy_lambda" {}`;
  let terraformInitRan = false;
  let terraformPlanRan = false;

  await assert.rejects(
    () =>
      runDeploymentPlan(
        {
          deploymentId,
          accessContext: createAccessContext()
        },
        repository,
        {
          planArtifactStorage: new FakePlanArtifactStorage(),
          readTerraformArtifactFile: async () => artifactContent,
          prepareTerraformWorkspace: async () => ({
            workdir: "C:/tmp/sketchcatch-analysis-excluded-plan",
            mainFilePath: "C:/tmp/sketchcatch-analysis-excluded-plan/main.tf",
            terraformFiles: [
              { fileName: "network.tf", terraformCode: 'resource "aws_vpc" "main" {}' },
              {
                fileName: "compute.tf",
                terraformCode: `resource /* provider type */
"aws_lambda_function"
// logical name
"legacy_lambda"
{}`
              }
            ],
            cleanup: async () => undefined
          }),
          prepareTerraformAwsCredentialEnv: async () => {
            throw new Error("AWS credentials must not be prepared for an excluded resource");
          },
          runTerraformInit: async () => {
            terraformInitRan = true;
            return createRunnerResult("init");
          },
          runTerraformPlan: async () => {
            terraformPlanRan = true;
            return createRunnerResult("plan");
          }
        }
      ),
    /analysis-excluded resource/i
  );

  assert.equal(terraformInitRan, false);
  assert.equal(terraformPlanRan, false);
  assert.equal(repository.deployment?.status, "FAILED");
  assert.equal(repository.deployment?.failureStage, "plan");
});

test("runDeploymentPlan keeps a supported VPC eligible when no excluded identity matches", async () => {
  const repository = new FakeDeploymentRepository();
  repository.architecture = createArchitectureRecord({
    nodes: [
      {
        id: "supported-vpc",
        type: "VPC",
        label: "VPC",
        positionX: 0,
        positionY: 0,
        config: {
          terraformResourceType: "aws_vpc",
          terraformResourceName: "main"
        }
      }
    ],
    edges: []
  });
  const vpcTerraform = 'resource "aws_vpc" "main" {}';
  let terraformPlanRan = false;

  const result = await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      planArtifactStorage: new FakePlanArtifactStorage(),
      readTerraformArtifactFile: async () => vpcTerraform,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-supported-vpc-plan",
        mainFilePath: "C:/tmp/sketchcatch-supported-vpc-plan/main.tf",
        terraformFiles: [{ fileName: "main.tf", terraformCode: vpcTerraform }],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      runTerraformInit: async () =>
        createRunnerResult("init", {
          exitCode: 1,
          stderr: "provider install intentionally stopped after exclusion guard"
        }),
      runTerraformPlan: async () => {
        terraformPlanRan = true;
        return createRunnerResult("plan");
      }
    }
  );

  assert.equal(result.terraform.init?.exitCode, 1);
  assert.equal(terraformPlanRan, false);
  assert.equal(result.deployment.failureStage, "init");
  assert.doesNotMatch(result.deployment.errorSummary ?? "", /analysis-excluded resource/i);
});

test("runDeploymentPlan reuses a verified pending plan without rerunning Plan or PreDeployment", async () => {
  const repository = new FakeDeploymentRepository();
  const planSummary = {
    createCount: 1,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: []
  };
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING",
    currentPlanArtifactId: planArtifactId,
    planSummary,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null
  });
  const planArtifactStorage = new FakePlanArtifactStorage();
  const reusablePlanContent = Buffer.from("verified reusable tfplan");
  const reusablePlanSha256 = createSha256(reusablePlanContent);
  planArtifactStorage.planContent = reusablePlanContent;
  repository.planArtifact = createDeploymentPlanArtifactRecord({
    sha256: reusablePlanSha256
  });
  const desiredStateIdentity = createTerraformDesiredStateIdentity({
    projectId,
    canonicalTerraformBundle: terraformArtifactContent,
    terraformFiles: [{ fileName: "main.tf", terraformCode: terraformArtifactContent }],
    providerLockContent: null,
    target: {
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    state: { lineage: null, serial: null }
  });
  planArtifactStorage.optimizationEvidenceContent = Buffer.from(
    JSON.stringify(
      createDeploymentPlanOptimizationEvidence({
        projectId,
        deploymentId,
        planArtifactId,
        planArtifactSha256: reusablePlanSha256,
        desiredStateIdentity,
        driftVerifiedAt: fixedNow.toISOString(),
        planSummary,
        preDeploymentResult: { findings: [] },
        resourceChanges: [{ resourceAddress: "aws_s3_bucket.assets", action: "create" }]
      })
    )
  );
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
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => {
        throw new Error("Pre-deployment analysis should not rerun for a reusable plan");
      },
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-reuse",
        mainFilePath: "C:/tmp/sketchcatch-terraform-reuse/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      now: () => fixedNow,
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

  assert.deepEqual(runnerStages, ["init"]);
  assert.deepEqual(result.optimization, {
    outcome: "reuse",
    reason: "verified_pending_plan"
  });
  assert.equal(result.deployment.status, "PENDING");
  assert.equal(result.deployment.currentPlanArtifactId, planArtifactId);
  assert.deepEqual(result.deployment.planSummary, planSummary);
  assert.equal(repository.savedPlans.length, 0);
  assert.equal(planArtifactStorage.uploads.length, 0);
  assert(
    repository.logs.some(
      (log) =>
        log.message ===
        "[optimization] event=plan_decision outcome=reuse reason=verified_pending_plan"
    )
  );
});

test("runDeploymentPlan falls back to a fresh Plan when optimization evidence is corrupt", async () => {
  const repository = new FakeDeploymentRepository();
  const previousPlanSummary = {
    createCount: 1,
    updateCount: 0,
    deleteCount: 0,
    replaceCount: 0,
    blocked: false,
    warnings: []
  };
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING",
    currentPlanArtifactId: planArtifactId,
    planSummary: previousPlanSummary
  });
  const planArtifactStorage = new FakePlanArtifactStorage();
  planArtifactStorage.optimizationEvidenceContent = Buffer.from("corrupt evidence");
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
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: () => createAnalysis(),
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-corrupt-cache",
        mainFilePath: "C:/tmp/sketchcatch-terraform-corrupt-cache/main.tf",
        terraformFiles: [],
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
          stdout: createPlanJson([
            {
              address: "aws_s3_bucket.assets",
              mode: "managed",
              type: "aws_s3_bucket",
              change: { actions: ["create"] }
            }
          ])
        });
      }
    }
  );

  assert.deepEqual(runnerStages, ["init", "plan", "show-json"]);
  assert.deepEqual(result.optimization, {
    outcome: "fallback_execute",
    reason: "cache_validation_failed"
  });
  assert.equal(repository.savedPlans.length, 1);
});

test("runDeploymentPlan treats invalid Terraform state identity as a cache miss", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  const runnerStages: string[] = [];

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
        workdir: "C:/tmp/sketchcatch-terraform-invalid-state",
        mainFilePath: "C:/tmp/sketchcatch-terraform-invalid-state/main.tf",
        terraformFiles: [],
        cleanup: async () => undefined
      }),
      prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
      readTerraformLockFile: async () => "",
      readTerraformStateFile: async () => "{not-json",
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
        return createRunnerResult("show", { stdout: createPlanJson([]) });
      }
    }
  );

  assert.deepEqual(runnerStages, ["init", "plan", "show-json"]);
  assert.deepEqual(result.optimization, {
    outcome: "no_change",
    reason: "terraform_plan_no_changes"
  });
});

test("runDeploymentPlan executes concurrent Plan requests for one deployment only once across users", async () => {
  const repository = new FakeDeploymentRepository();
  const collaboratorUserId = "66666666-6666-4666-8666-666666666666";
  repository.accessibleUserIds.add(collaboratorUserId);
  const planArtifactStorage = new FakePlanArtifactStorage();
  let planCalls = 0;
  let notifyPlanStarted: (() => void) | undefined;
  let releasePlan: (() => void) | undefined;
  const planStarted = new Promise<void>((resolve) => {
    notifyPlanStarted = resolve;
  });
  const planGate = new Promise<void>((resolve) => {
    releasePlan = resolve;
  });
  const options = {
    generatePlanArtifactId: () => planArtifactId,
    planArtifactStorage,
    readTerraformArtifactFile: async () => terraformArtifactContent,
    analyzePreDeployment: () => createAnalysis(),
    prepareTerraformWorkspace: async () => ({
      workdir: "C:/tmp/sketchcatch-terraform-single-flight",
      mainFilePath: "C:/tmp/sketchcatch-terraform-single-flight/main.tf",
      terraformFiles: [],
      cleanup: async () => undefined
    }),
    prepareTerraformAwsCredentialEnv: async () => createPreparedCredentials(),
    runTerraformInit: async () => createRunnerResult("init"),
    runTerraformPlan: async () => {
      planCalls += 1;
      notifyPlanStarted?.();
      await planGate;
      return createRunnerResult("plan");
    },
    runTerraformShowJson: async () => createRunnerResult("show", { stdout: createPlanJson([]) })
  };

  const first = runDeploymentPlan(
    { deploymentId, accessContext: createAccessContext() },
    repository,
    options
  );
  await planStarted;
  const second = runDeploymentPlan(
    { deploymentId, accessContext: createAccessContext(collaboratorUserId) },
    repository,
    options
  );
  releasePlan?.();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(planCalls, 1);
  assert.equal(repository.savedPlans.length, 1);
  assert.deepEqual(firstResult.optimization, {
    outcome: "no_change",
    reason: "terraform_plan_no_changes"
  });
  assert.deepEqual(secondResult.optimization, {
    outcome: "reuse",
    reason: "concurrent_plan_joined"
  });
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
      blocked: false,
      warnings: []
    },
    isBlocked: false,
    blockedBy: null,
    blockedReason: null
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
        terraformFiles: [],
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
  assert.deepEqual(result.optimization, {
    outcome: "no_change",
    reason: "terraform_plan_no_changes"
  });
  assert.equal(result.deployment.currentPlanArtifactId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(repository.savedPlans.length, 1);
  assert.equal(planArtifactStorage.uploads.length, 1);
});

test("runDeploymentPlan records destructive or high-risk warnings without blocking plan state", async () => {
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
        terraformFiles: [],
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

  assert.equal(result.deployment.isBlocked, false);
  assert.equal(result.deployment.blockedBy, null);
  assert.equal(result.deployment.blockedReason, null);
  assert.equal(result.deployment.planSummary?.deleteCount, 1);
  assert.equal(result.deployment.planSummary?.replaceCount, 1);
  assert.deepEqual(result.deployment.planSummary?.warnings, [
    {
      id: "pre_deployment_check:finding-1",
      level: "high",
      category: "security",
      source: "pre_deployment_check",
      code: "PUBLIC_SSH",
      message: "Public ingress: Restrict CIDR",
      relatedFindingId: "finding-1",
      relatedResourceId: "sg-1",
      requiresAcknowledgement: false,
      blocksApproval: false
    },
    {
      id: "terraform_plan:DESTRUCTIVE_CHANGE:apply",
      level: "high",
      category: "configuration",
      source: "terraform_plan",
      code: "DESTRUCTIVE_CHANGE",
      message: "Terraform apply plan includes delete or replace changes",
      requiresAcknowledgement: false,
      blocksApproval: false
    }
  ]);
});

test("runDeploymentPlan feeds Terraform artifact content into Trivy-backed safety analysis", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  let analyzedTerraformFiles: readonly {
    readonly fileName: string;
    readonly terraformCode: string;
  }[] = [];
  const terraformFiles = [
    {
      fileName: "providers.tf",
      terraformCode: 'terraform { required_version = ">= 1.6.0" }\n'
    },
    {
      fileName: "main.tf",
      terraformCode: 'resource "aws_security_group" "open_ssh" {}\n'
    }
  ];

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
      analyzePreDeployment: async (input) => {
        analyzedTerraformFiles = input.terraformFiles ?? [];

        return createAnalysis([
          {
            id: "trivy:aws-0107:main.tf:aws_security_group.open_ssh:13",
            category: "network",
            severity: "high",
            resourceId: "aws_security_group.open_ssh",
            sourceLocation: {
              fileName: "main.tf",
              line: 13,
              resourceAddress: "aws_security_group.open_ssh"
            },
            title:
              "Security groups should not allow unrestricted ingress to SSH or RDP from any IP address.",
            description: "Public SSH is exposed.",
            recommendation: "Restrict SSH to a trusted CIDR."
          }
        ]);
      },
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-trivy-plan",
        mainFilePath: "C:/tmp/sketchcatch-terraform-trivy-plan/main.tf",
        terraformFiles,
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

  assert.deepEqual(analyzedTerraformFiles, terraformFiles);
  assert.deepEqual(result.deployment.planSummary?.warnings, [
    {
      id: "pre_deployment_check:trivy:aws-0107:main.tf:aws_security_group.open_ssh:13",
      level: "high",
      category: "network",
      source: "pre_deployment_check",
      code: "PUBLIC_SSH",
      message:
        "Security groups should not allow unrestricted ingress to SSH or RDP from any IP address.: Restrict SSH to a trusted CIDR.",
      relatedFindingId: "trivy:aws-0107:main.tf:aws_security_group.open_ssh:13",
      relatedResourceId: "aws_security_group.open_ssh",
      sourceLocation: {
        fileName: "main.tf",
        line: 13,
        resourceAddress: "aws_security_group.open_ssh"
      },
      requiresAcknowledgement: false,
      blocksApproval: false
    }
  ]);
});

test("runDeploymentPlan reuses the button scan snapshot when the artifact SHA is unchanged", async () => {
  const repository = new FakeDeploymentRepository();
  const planArtifactStorage = new FakePlanArtifactStorage();
  let trivyScanCount = 0;
  const terraformSecurityScanner = createCachedTerraformSecurityScanner({
    scan: async () => {
      trivyScanCount += 1;
      return [];
    }
  });
  const analyzeWithSharedSnapshot = (input: Parameters<typeof analyzePreDeploymentCheck>[0]) =>
    analyzePreDeploymentCheck(input, { terraformSecurityScanner });

  await analyzeWithSharedSnapshot({
    architectureJson: { nodes: [], edges: [] },
    artifactSha256: terraformArtifactSha256,
    terraformFiles: [
      {
        fileName: "main.tf",
        terraformCode: terraformArtifactContent
      }
    ]
  });

  await runDeploymentPlan(
    {
      deploymentId,
      accessContext: createAccessContext()
    },
    repository,
    {
      generatePlanArtifactId: () => planArtifactId,
      planArtifactStorage,
      readTerraformArtifactFile: async () => terraformArtifactContent,
      analyzePreDeployment: analyzeWithSharedSnapshot,
      prepareTerraformWorkspace: async () => ({
        workdir: "C:/tmp/sketchcatch-terraform-snapshot-plan",
        mainFilePath: "C:/tmp/sketchcatch-terraform-snapshot-plan/main.tf",
        terraformFiles: [
          {
            fileName: "main.tf",
            terraformCode: terraformArtifactContent
          }
        ],
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

  assert.equal(createSha256(terraformArtifactContent), terraformArtifactSha256);
  assert.equal(trivyScanCount, 1);
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
        terraformFiles: [],
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
  assert.equal(
    repository.logs.some((log) => log.message.includes("super-secret")),
    false
  );
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
        terraformFiles: [],
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
        terraformFiles: [],
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
        terraformFiles: [],
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
