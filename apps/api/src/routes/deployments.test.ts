import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type {
  AwsConnection,
  DeploymentFailureExplanationResponse,
  RecentSuccessfulDeploymentProjectListResponse
} from "@sketchcatch/types";
import { createAccessToken } from "../auth/tokens.js";
import type { DatabaseClient } from "../db/client.js";
import type {
  RunDeploymentInitInput,
  RunDeploymentInitResult
} from "../deployments/deployment-init-service.js";
import type {
  RunDeploymentPlanInput,
  RunDeploymentPlanResult
} from "../deployments/deployment-plan-service.js";
import type {
  RunDeploymentApplyInput,
  RunDeploymentApplyResult
} from "../deployments/deployment-apply-service.js";
import type {
  RunDeploymentDestroyPlanInput,
  RunDeploymentDestroyPlanResult
} from "../deployments/deployment-destroy-plan-service.js";
import type {
  RunDeploymentDestroyInput,
  RunDeploymentDestroyResult
} from "../deployments/deployment-destroy-service.js";
import type { ApproveDeploymentPlanInput } from "../deployments/deployment-approval-service.js";
import type { PruneProjectDeploymentStorageResult } from "../deployments/deployment-retention.js";
import { users } from "../db/schema.js";
import type { CreateLlmExplanation } from "../services/aiLlmExplanation.js";
import {
  type ApproveDeploymentInput,
  type ArchitectureRecord,
  type CreateDeploymentRecordInput,
  type SaveDeploymentPlanInput,
  type DeployedResourceRecord,
  type DeploymentProjectRecord,
  type DeploymentPlanArtifactRecord,
  type DeploymentLogRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext,
  type ProjectAssetRecord,
  type ProjectRecord,
  type TerraformOutputRecord,
  type TerraformArtifactRecord
} from "../deployments/deployment-service.js";
import { registerDeploymentRoutes, writeDeploymentLogStreamChunk } from "./deployments.js";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";
import type { RuntimeCache } from "../runtime-cache/index.js";
import {
  createDeploymentRuntimeCacheKey,
  deploymentLogCursorCacheNamespace,
  deploymentStatusCacheNamespace,
  type DeploymentLogStreamCursorSnapshot,
  type DeploymentRuntimeStatusSnapshot
} from "../deployments/deployment-runtime-cache.js";
import type {
  CreateDeploymentJobInput,
  DeploymentJobRecord,
  DeploymentJobRepository
} from "../deployments/deployment-job-service.js";
import type {
  DeploymentWorkerDispatcher,
  InspectDeploymentWorkerInput,
  DispatchDeploymentWorkerInput,
  StopDeploymentWorkerInput
} from "../deployments/deployment-worker-dispatcher.js";

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-auth-token-secret-with-at-least-32-characters";

type DeploymentResponse = {
  deployment: {
    id: string;
    projectId: string;
    architectureId: string;
    terraformArtifactId: string;
    awsConnectionId: string | null;
    consolePhase: "validation" | "approval" | "deployment";
    preparedDraftRevision: number | null;
    preparedSnapshotHash: string | null;
    approvedPreparedSnapshotHash: string | null;
    currentPlanArtifactId: string | null;
    currentPlanOperation: "apply" | "destroy" | null;
    stateObjectKey: string | null;
    resultWarningSummary: string | null;
    status: string;
    activeStage: string | null;
    planSummary: unknown;
    isBlocked: boolean;
    blockedBy: string | null;
    blockedReason: string | null;
    failureStage: string | null;
    errorSummary: string | null;
    approvedAt: string | null;
    approvedByUserId: string | null;
    approvedTerraformArtifactId: string | null;
    approvedPlanArtifactId: string | null;
    approvedTerraformArtifactHash: string | null;
    approvedTfplanHash: string | null;
    approvedAwsAccountId: string | null;
    approvedAwsRegion: string | null;
    startedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    cancelRequestedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

type DeploymentListResponse = {
  deployments: DeploymentResponse["deployment"][];
};

type DeploymentLogsResponse = {
  logs: DeploymentLogRecord[];
};

type DeploymentResourcesResponse = {
  resources: Array<{
    id: string;
    deploymentId: string;
    terraformAddress: string;
    terraformType: string;
    providerName: string | null;
    resourceId: string | null;
    region: string;
    createdAt: string;
  }>;
};

type TerraformOutputsResponse = {
  outputs: Array<{
    id: string;
    deploymentId: string;
    name: string;
    value: unknown | null;
    sensitive: boolean;
    createdAt: string;
  }>;
};

type UserRecord = typeof users.$inferSelect;

type RepositoryCall =
  | {
      name: "findAccessibleProject";
      projectId: string;
      accessContext: ProjectAccessContext;
    }
  | {
      name: "findArchitectureInProject";
      architectureId: string;
      projectId: string;
    }
  | {
      name: "findTerraformArtifactForArchitecture";
      terraformArtifactId: string;
      projectId: string;
      architectureId: string;
    }
  | {
      name: "findTerraformArtifactById";
      terraformArtifactId: string;
    }
  | {
      name: "findVerifiedAwsConnectionById";
      awsConnectionId: string;
      accessContext: ProjectAccessContext;
    }
  | {
      name: "createDeployment";
      input: CreateDeploymentRecordInput;
    }
  | {
      name: "findDeploymentById";
      deploymentId: string;
    }
  | {
      name: "listDeploymentsByProject";
      projectId: string;
    }
  | {
      name: "listDeploymentLogs";
      deploymentId: string;
      options?: {
        afterSequence?: number;
        limit?: number;
      };
    }
  | {
      name: "listDeployedResources";
      deploymentId: string;
    }
  | {
      name: "listTerraformOutputs";
      deploymentId: string;
    }
  | {
      name: "findRunningDeploymentInProject";
      projectId: string;
    }
  | {
      name: "listDeploymentProjectRows";
      accessContext: ProjectAccessContext;
    }
  | {
      name: "markDeploymentInitSucceeded";
      deploymentId: string;
    }
  | {
      name: "markDeploymentInitRunning";
      deploymentId: string;
    }
  | {
      name: "markDeploymentPlanRunning";
      deploymentId: string;
    }
  | {
      name: "markDeploymentApplyRunning";
      deploymentId: string;
    }
  | {
      name: "markDeploymentDestroyRunning";
      deploymentId: string;
    }
  | {
      name: "saveDeploymentPlan";
      input: SaveDeploymentPlanInput;
    }
  | {
      name: "findDeploymentPlanArtifactById";
      planArtifactId: string;
    }
  | {
      name: "approveDeployment";
      deploymentId: string;
      input: ApproveDeploymentInput;
    };

const projectId = "11111111-1111-4111-8111-111111111111";
const architectureId = "22222222-2222-4222-8222-222222222222";
const terraformArtifactId = "33333333-3333-4333-8333-333333333333";
const deploymentId = "44444444-4444-4444-8444-444444444444";
const awsConnectionId = "77777777-7777-4777-8777-777777777777";
const planArtifactId = "99999999-9999-4999-8999-999999999999";
const userId = "55555555-5555-4555-8555-555555555555";
const fixedNow = new Date("2026-01-01T00:00:00.000Z");
const stateObjectKey = `deployments/${deploymentId}/state/terraform.tfstate`;

type TerraformArtifactRecordReference = {
  id: string;
  projectId: string;
  architectureId: string | null;
  assetType: "terraform_file";
  objectKey: string;
  fileName: string;
  contentType: string;
};

class FakeDeploymentRepository implements DeploymentRepository {
  readonly calls: RepositoryCall[] = [];
  project: ProjectRecord | undefined = createProjectRecord();
  architecture: ArchitectureRecord | undefined = createArchitectureRecord();
  terraformArtifact: ProjectAssetRecord | undefined = createProjectAssetRecord();
  terraformArtifactById: TerraformArtifactRecordReference | undefined = {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/terraform/main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform"
  };
  awsConnection: AwsConnection | undefined = createVerifiedAwsConnection();
  deployment: DeploymentRecord | undefined = createDeploymentRecord(deploymentId);
  planArtifact: DeploymentPlanArtifactRecord | undefined = createDeploymentPlanArtifactRecord();
  deployments: DeploymentRecord[] = [createDeploymentRecord(deploymentId)];
  deploymentProjectRows: DeploymentProjectRecord[] = [
    {
      project: createProjectRecord(),
      deployment: createDeploymentRecord(deploymentId)
    }
  ];
  logs: DeploymentLogRecord[] = [];
  resources: DeployedResourceRecord[] = [];
  outputs: TerraformOutputRecord[] = [];
  projectDraft:
    | {
        revision: number;
        diagramJson: { nodes: []; edges: []; viewport: { x: number; y: number; zoom: number } };
        terraformFiles: Array<{ fileName: string; terraformCode: string }>;
      }
    | undefined = {
    revision: 7,
    diagramJson: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    terraformFiles: [
      { fileName: "main.tf", terraformCode: 'resource "aws_s3_bucket" "assets" {}' }
    ]
  };

  async findProjectDraftForPreparation() {
    return this.projectDraft;
  }

  async findProjectTargetForPreparation() {
    return undefined;
  }

  async findAccessibleProject(candidateProjectId: string, accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "findAccessibleProject",
      projectId: candidateProjectId,
      accessContext
    });

    return this.project;
  }

  async findArchitectureInProject(candidateArchitectureId: string, candidateProjectId: string) {
    this.calls.push({
      name: "findArchitectureInProject",
      architectureId: candidateArchitectureId,
      projectId: candidateProjectId
    });

    return this.architecture;
  }

  async findTerraformArtifactForArchitecture(
    candidateTerraformArtifactId: string,
    candidateProjectId: string,
    candidateArchitectureId: string
  ): Promise<TerraformArtifactRecord | undefined> {
    this.calls.push({
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId: candidateTerraformArtifactId,
      projectId: candidateProjectId,
      architectureId: candidateArchitectureId
    });

    if (
      !this.terraformArtifact ||
      this.terraformArtifact.id !== candidateTerraformArtifactId ||
      this.terraformArtifact.projectId !== candidateProjectId ||
      this.terraformArtifact.architectureId !== candidateArchitectureId ||
      this.terraformArtifact.assetType !== "terraform_file" ||
      this.terraformArtifact.uploadStatus !== "uploaded"
    ) {
      return undefined;
    }

    return {
      ...this.terraformArtifact,
      assetType: "terraform_file"
    };
  }

  async findTerraformArtifactById(candidateTerraformArtifactId: string) {
    this.calls.push({
      name: "findTerraformArtifactById",
      terraformArtifactId: candidateTerraformArtifactId
    });

    if (
      !this.terraformArtifactById ||
      this.terraformArtifactById.id !== candidateTerraformArtifactId
    ) {
      return undefined;
    }

    return this.terraformArtifactById;
  }

  async findVerifiedAwsConnectionById(
    candidateAwsConnectionId: string,
    accessContext: ProjectAccessContext
  ) {
    this.calls.push({
      name: "findVerifiedAwsConnectionById",
      awsConnectionId: candidateAwsConnectionId,
      accessContext
    });

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
    this.calls.push({
      name: "createDeployment",
      input
    });

    this.deployment = createDeploymentRecord(input.id, input);

    return this.deployment;
  }

  async findDeploymentById(candidateDeploymentId: string) {
    this.calls.push({
      name: "findDeploymentById",
      deploymentId: candidateDeploymentId
    });

    return this.deployment;
  }

  async findDeploymentPlanArtifactById(candidatePlanArtifactId: string) {
    this.calls.push({
      name: "findDeploymentPlanArtifactById",
      planArtifactId: candidatePlanArtifactId
    });

    if (!this.planArtifact || this.planArtifact.id !== candidatePlanArtifactId) {
      return undefined;
    }

    return this.planArtifact;
  }

  async findRunningDeploymentInProject(candidateProjectId: string) {
    this.calls.push({
      name: "findRunningDeploymentInProject",
      projectId: candidateProjectId
    });

    return this.deployments.find(
      (deployment) => deployment.projectId === candidateProjectId && deployment.status === "RUNNING"
    );
  }

  async listDeploymentProjectRows(accessContext: ProjectAccessContext) {
    this.calls.push({
      name: "listDeploymentProjectRows",
      accessContext
    });

    return this.deploymentProjectRows;
  }

  async listDeploymentsByProject(candidateProjectId: string) {
    this.calls.push({
      name: "listDeploymentsByProject",
      projectId: candidateProjectId
    });

    return this.deployments;
  }

  updateDeploymentStatus: DeploymentRepository["updateDeploymentStatus"] = async (
    _deploymentId,
    status
  ) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status,
      ...(status === "RUNNING" ? clearDeploymentApprovalSnapshot() : {})
    };

    return this.deployment;
  };

  markDeploymentInitRunning: DeploymentRepository["markDeploymentInitRunning"] = async (
    candidateDeploymentId
  ) => {
    this.calls.push({
      name: "markDeploymentInitRunning",
      deploymentId: candidateDeploymentId
    });

    if (
      !this.deployment ||
      this.deployment.id !== candidateDeploymentId ||
      this.deployment.status === "RUNNING"
    ) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      ...clearDeploymentApprovalSnapshot()
    };

    return this.deployment;
  };

  markDeploymentPlanRunning: DeploymentRepository["markDeploymentPlanRunning"] = async (
    candidateDeploymentId
  ) => {
    this.calls.push({
      name: "markDeploymentPlanRunning",
      deploymentId: candidateDeploymentId
    });

    if (
      !this.deployment ||
      this.deployment.id !== candidateDeploymentId ||
      this.deployment.status === "RUNNING"
    ) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      activeStage: "plan",
      failureStage: null,
      errorSummary: null,
      ...clearDeploymentApprovalSnapshot()
    };

    return this.deployment;
  };

  updateDeploymentPlan: DeploymentRepository["updateDeploymentPlan"] = async (
    _deploymentId,
    input
  ) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, ...input };

    return this.deployment;
  };

  markDeploymentApplyRunning: DeploymentRepository["markDeploymentApplyRunning"] = async (
    candidateDeploymentId
  ) => {
    this.calls.push({
      name: "markDeploymentApplyRunning",
      deploymentId: candidateDeploymentId
    });

    if (
      !this.deployment ||
      this.deployment.id !== candidateDeploymentId ||
      this.deployment.status === "RUNNING"
    ) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      failureStage: null,
      errorSummary: null,
      resultWarningSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  markDeploymentDestroyRunning: DeploymentRepository["markDeploymentDestroyRunning"] = async (
    candidateDeploymentId
  ) => {
    this.calls.push({
      name: "markDeploymentDestroyRunning",
      deploymentId: candidateDeploymentId
    });

    if (
      !this.deployment ||
      this.deployment.id !== candidateDeploymentId ||
      this.deployment.status === "RUNNING"
    ) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "RUNNING",
      activeStage: "destroy",
      failureStage: null,
      errorSummary: null,
      resultWarningSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

  saveDeploymentPlan: DeploymentRepository["saveDeploymentPlan"] = async (input) => {
    this.calls.push({
      name: "saveDeploymentPlan",
      input
    });

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

  approveDeployment: DeploymentRepository["approveDeployment"] = async (
    candidateDeploymentId,
    input
  ) => {
    this.calls.push({
      name: "approveDeployment",
      deploymentId: candidateDeploymentId,
      input
    });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      ...input,
      status: "PENDING",
      isBlocked: false,
      blockedBy: null,
      blockedReason: null,
      failureStage: null,
      errorSummary: null,
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

    this.resources = input.resources.map((resource) => ({ ...resource, createdAt: fixedNow }));
    this.outputs = input.outputs.map((output) => ({ ...output, createdAt: fixedNow }));
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

  failDeployment: DeploymentRepository["failDeployment"] = async (_deploymentId, input) => {
    if (!this.deployment) {
      return undefined;
    }

    this.deployment = { ...this.deployment, status: "FAILED", ...input };

    return this.deployment;
  };

  requestDeploymentCancellation: DeploymentRepository["requestDeploymentCancellation"] = async (
    candidateDeploymentId
  ) => {
    if (
      !this.deployment ||
      this.deployment.id !== candidateDeploymentId ||
      this.deployment.status !== "RUNNING"
    ) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      cancelRequestedAt: fixedNow,
      updatedAt: fixedNow
    };

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

  markDeploymentInitSucceeded: DeploymentRepository["markDeploymentInitSucceeded"] = async (
    candidateDeploymentId
  ) => {
    this.calls.push({
      name: "markDeploymentInitSucceeded",
      deploymentId: candidateDeploymentId
    });

    if (!this.deployment || this.deployment.id !== candidateDeploymentId) {
      return undefined;
    }

    this.deployment = {
      ...this.deployment,
      status: "PENDING",
      failureStage: null,
      errorSummary: null,
      updatedAt: fixedNow
    };

    return this.deployment;
  };

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

  async listDeploymentLogs(
    candidateDeploymentId: string,
    options?: {
      afterSequence?: number;
      limit?: number;
    }
  ) {
    this.calls.push({
      name: "listDeploymentLogs",
      deploymentId: candidateDeploymentId,
      ...(options ? { options } : {})
    });

    const logs = this.logs.filter(
      (log) =>
        log.deploymentId === candidateDeploymentId &&
        (options?.afterSequence === undefined || log.sequence > options.afterSequence)
    );

    return options?.limit === undefined ? logs : logs.slice(0, options.limit);
  }

  async listDeployedResources(candidateDeploymentId: string) {
    this.calls.push({
      name: "listDeployedResources",
      deploymentId: candidateDeploymentId
    });

    return this.resources.filter((resource) => resource.deploymentId === candidateDeploymentId);
  }

  async listTerraformOutputs(candidateDeploymentId: string) {
    this.calls.push({
      name: "listTerraformOutputs",
      deploymentId: candidateDeploymentId
    });

    return this.outputs.filter((output) => output.deploymentId === candidateDeploymentId);
  }
}

class FakeDeploymentJobRepository implements DeploymentJobRepository {
  readonly jobs = new Map<string, DeploymentJobRecord>();
  nextId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  async createDeploymentJob(
    input: CreateDeploymentJobInput & {
      id: string;
    }
  ) {
    const job: DeploymentJobRecord = {
      id: this.nextId,
      deploymentId: input.deploymentId,
      operation: input.operation,
      status: "QUEUED",
      requestedByUserId: input.accessContext.userId,
      accessContext: input.accessContext,
      startedFromStatus: input.startedFromStatus,
      startedFromFailureStage: input.startedFromFailureStage ?? null,
      ecsTaskArn: null,
      errorSummary: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      createdAt: fixedNow,
      updatedAt: fixedNow
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async findActiveDeploymentJob(candidateDeploymentId: string) {
    return [...this.jobs.values()].find(
      (job) =>
        job.deploymentId === candidateDeploymentId &&
        ["QUEUED", "DISPATCHING", "RUNNING"].includes(job.status)
    );
  }

  async listActiveDeploymentJobs() {
    return [...this.jobs.values()].filter((job) =>
      ["QUEUED", "DISPATCHING", "RUNNING"].includes(job.status)
    );
  }

  async findDeploymentJobById(jobId: string) {
    return this.jobs.get(jobId);
  }

  async markDeploymentJobDispatching(jobId: string) {
    return this.updateJob(jobId, {
      status: "DISPATCHING",
      updatedAt: fixedNow
    });
  }

  async markDeploymentJobRunning(
    jobId: string,
    input: {
      ecsTaskArn?: string | null;
    }
  ) {
    return this.updateJob(jobId, {
      status: "RUNNING",
      ...(input.ecsTaskArn !== undefined ? { ecsTaskArn: input.ecsTaskArn } : {}),
      startedAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  async recordDeploymentJobTaskArn(
    jobId: string,
    input: {
      ecsTaskArn: string;
    }
  ) {
    return this.updateJob(jobId, {
      ecsTaskArn: input.ecsTaskArn,
      updatedAt: fixedNow
    });
  }

  async completeDeploymentJob(jobId: string) {
    return this.updateJob(jobId, {
      status: "SUCCEEDED",
      completedAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  async failDeploymentJob(
    jobId: string,
    input: {
      errorSummary: string;
    }
  ) {
    return this.updateJob(jobId, {
      status: "FAILED",
      errorSummary: input.errorSummary,
      failedAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  async cancelDeploymentJob(
    jobId: string,
    input: {
      errorSummary?: string | null;
    }
  ) {
    return this.updateJob(jobId, {
      status: "CANCELLED",
      errorSummary: input.errorSummary ?? null,
      cancelledAt: fixedNow,
      updatedAt: fixedNow
    });
  }

  private updateJob(jobId: string, patch: Partial<DeploymentJobRecord>) {
    const job = this.jobs.get(jobId);

    if (!job) {
      return undefined;
    }

    const updatedJob = { ...job, ...patch };
    this.jobs.set(jobId, updatedJob);
    return updatedJob;
  }
}

class FakeDeploymentWorkerDispatcher implements DeploymentWorkerDispatcher {
  readonly dispatchCalls: DispatchDeploymentWorkerInput[] = [];
  readonly stopCalls: StopDeploymentWorkerInput[] = [];
  taskArn: string | null =
    "arn:aws:ecs:ap-northeast-2:555980271919:task/sketchcatch-production-worker/task-id";
  stopResult = true;

  async dispatch(input: DispatchDeploymentWorkerInput) {
    this.dispatchCalls.push(input);
    return {
      taskArn: this.taskArn
    };
  }

  async inspect(input: InspectDeploymentWorkerInput) {
    return input.job.ecsTaskArn
      ? { state: "ACTIVE" as const, lastStatus: "RUNNING" }
      : { state: "MISSING" as const, lastStatus: null };
  }

  async stop(input: StopDeploymentWorkerInput) {
    this.stopCalls.push(input);
    return {
      stopped: this.stopResult
    };
  }
}

type DeploymentRouteTestOptions = {
  pruneProjectDeploymentStorage?: (input: {
    db: DatabaseClient["db"];
    projectId: string;
  }) => Promise<PruneProjectDeploymentStorageResult>;
  runDeploymentInit?: (
    input: RunDeploymentInitInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentInitResult>;
  runDeploymentPlan?: (
    input: RunDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentPlanResult>;
  approveDeploymentPlan?: (
    input: ApproveDeploymentPlanInput,
    repository: DeploymentRepository
  ) => Promise<DeploymentRecord>;
  revokeDeploymentApproval?: (
    input: { deploymentId: string; accessContext: ProjectAccessContext },
    repository: DeploymentRepository
  ) => Promise<DeploymentRecord>;
  runDeploymentApply?: (
    input: RunDeploymentApplyInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentApplyResult>;
  runDeploymentDestroyPlan?: (
    input: RunDeploymentDestroyPlanInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentDestroyPlanResult>;
  runDeploymentDestroy?: (
    input: RunDeploymentDestroyInput,
    repository: DeploymentRepository
  ) => Promise<RunDeploymentDestroyResult>;
  createLlmExplanation?: CreateLlmExplanation;
  createDeploymentJobRepository?: (db: DatabaseClient["db"]) => DeploymentJobRepository;
  runtimeCache?: RuntimeCache;
  userRows?: UserRecord[];
  workerDispatcher?: DeploymentWorkerDispatcher;
  workerDispatchMode?: "in_process" | "ecs";
};

async function buildDeploymentTestApp(
  repository: DeploymentRepository,
  routeOptions: DeploymentRouteTestOptions = {}
) {
  const app = Fastify({ logger: false });
  const fakeAuthDb = new DeploymentRouteFakeAuthDb(routeOptions.userRows ?? [createUserRecord()]);

  await app.register(registerDeploymentRoutes, {
    prefix: "/api",
    getDatabaseClient: () => fakeAuthDb.client,
    createDeploymentRepository: () => repository,
    ...(routeOptions.pruneProjectDeploymentStorage
      ? { pruneProjectDeploymentStorage: routeOptions.pruneProjectDeploymentStorage }
      : {}),
    ...(routeOptions.runDeploymentInit
      ? { runDeploymentInit: routeOptions.runDeploymentInit }
      : {}),
    ...(routeOptions.runDeploymentPlan
      ? { runDeploymentPlan: routeOptions.runDeploymentPlan }
      : {}),
    ...(routeOptions.approveDeploymentPlan
      ? { approveDeploymentPlan: routeOptions.approveDeploymentPlan }
      : {}),
    ...(routeOptions.revokeDeploymentApproval
      ? { revokeDeploymentApproval: routeOptions.revokeDeploymentApproval }
      : {}),
    ...(routeOptions.runDeploymentApply
      ? { runDeploymentApply: routeOptions.runDeploymentApply }
      : {}),
    ...(routeOptions.runDeploymentDestroyPlan
      ? { runDeploymentDestroyPlan: routeOptions.runDeploymentDestroyPlan }
      : {}),
    ...(routeOptions.runDeploymentDestroy
      ? { runDeploymentDestroy: routeOptions.runDeploymentDestroy }
      : {}),
    ...(routeOptions.createLlmExplanation
      ? { createLlmExplanation: routeOptions.createLlmExplanation }
      : {}),
    ...(routeOptions.createDeploymentJobRepository
      ? { createDeploymentJobRepository: routeOptions.createDeploymentJobRepository }
      : {}),
    ...(routeOptions.workerDispatcher ? { workerDispatcher: routeOptions.workerDispatcher } : {}),
    ...(routeOptions.workerDispatchMode
      ? { workerDispatchMode: routeOptions.workerDispatchMode }
      : {}),
    ...(routeOptions.runtimeCache ? { runtimeCache: routeOptions.runtimeCache } : {})
  });

  return app;
}

function createDeploymentRecord(
  id: string,
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return {
    id,
    projectId,
    architectureId,
    terraformArtifactId,
    awsConnectionId,
    liveProfile: "practice",
    scope: "infrastructure",
    targetKind: null,
    source: "direct",
    releaseId: null,
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

function createDeploymentPlanArtifactRecord(
  overrides: Partial<DeploymentPlanArtifactRecord> = {}
): DeploymentPlanArtifactRecord {
  return {
    id: planArtifactId,
    deploymentId,
    terraformArtifactId,
    terraformArtifactSha256: "c".repeat(64),
    operation: "apply",
    objectKey: `deployments/${deploymentId}/plans/${planArtifactId}.tfplan`,
    sha256: "a".repeat(64),
    accountId: "123456789012",
    region: "ap-northeast-2",
    createdAt: fixedNow,
    ...overrides
  };
}

function createDeployedResourceRecord(
  overrides: Partial<DeployedResourceRecord> = {}
): DeployedResourceRecord {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    deploymentId,
    terraformAddress: "aws_vpc.main",
    terraformType: "aws_vpc",
    providerName: "registry.terraform.io/hashicorp/aws",
    resourceId: "vpc-0123456789abcdef0",
    region: "ap-northeast-2",
    createdAt: fixedNow,
    ...overrides
  };
}

function createTerraformOutputRecord(
  overrides: Partial<TerraformOutputRecord> = {}
): TerraformOutputRecord {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    deploymentId,
    name: "vpc_id",
    value: "vpc-0123456789abcdef0",
    sensitive: false,
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

function createArchitectureRecord(overrides: Partial<ArchitectureRecord> = {}): ArchitectureRecord {
  return {
    id: architectureId,
    projectId,
    version: 1,
    source: "manual",
    architectureJson: {
      nodes: [],
      edges: []
    },
    createdAt: fixedNow,
    ...overrides
  };
}

function createProjectAssetRecord(overrides: Partial<ProjectAssetRecord> = {}): ProjectAssetRecord {
  return {
    id: terraformArtifactId,
    projectId,
    architectureId,
    assetType: "terraform_file",
    objectKey: "projects/project-id/terraform/main.tf",
    fileName: "main.tf",
    contentType: "application/x-terraform",
    byteSize: null,
    uploadStatus: "uploaded",
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

function createDeploymentBody() {
  return {
    architectureId,
    terraformArtifactId,
    awsConnectionId
  };
}

function createUserRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: userId,
    username: "deployment-user",
    email: "deployment@example.com",
    nickname: "Deployment User",
    passwordHash: "unused",
    createdAt: fixedNow,
    updatedAt: fixedNow,
    deletedAt: null,
    ...overrides
  };
}

function createThrowingRuntimeCache(): RuntimeCache {
  return {
    backend: "memory",
    async isAvailable() {
      return false;
    },
    async get() {
      throw new Error("runtime cache get failed");
    },
    async set() {
      throw new Error("runtime cache set failed");
    },
    async delete() {
      throw new Error("runtime cache delete failed");
    },
    async increment() {
      throw new Error("runtime cache increment failed");
    },
    async setIfAbsent() {
      throw new Error("runtime cache setIfAbsent failed");
    }
  };
}

async function authHeaders(activeUserId = userId): Promise<Record<string, string>> {
  return {
    authorization: `Bearer ${await createAccessToken(activeUserId)}`
  };
}

class DeploymentRouteFakeAuthDb {
  client: DatabaseClient;

  constructor(private readonly userRows: UserRecord[]) {
    this.client = {
      db: this.createDb() as DatabaseClient["db"],
      pool: {
        end: async () => undefined
      } as DatabaseClient["pool"]
    };
  }

  private createDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => new SelectQuery(() => (table === users ? this.userRows : []))
      })
    };
  }
}

class SelectQuery {
  constructor(private readonly resolveRows: () => unknown[]) {}

  where(): this {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolveRows()).then(onfulfilled, onrejected);
  }
}

test("POST /api/projects/:projectId/deployments returns a created deployment", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments`,
    headers: await authHeaders(),
    payload: createDeploymentBody()
  });

  assert.equal(response.statusCode, 201);

  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.projectId, projectId);
  assert.equal(body.deployment.architectureId, architectureId);
  assert.equal(body.deployment.terraformArtifactId, terraformArtifactId);
  assert.equal(body.deployment.awsConnectionId, awsConnectionId);
  assert.equal(body.deployment.status, "PENDING");
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "findArchitectureInProject",
      architectureId,
      projectId
    },
    {
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId,
      projectId,
      architectureId
    },
    {
      name: "findVerifiedAwsConnectionById",
      awsConnectionId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "createDeployment",
      input: {
        id: body.deployment.id,
        projectId,
        architectureId,
        terraformArtifactId,
        awsConnectionId,
        liveProfile: "practice",
        scope: "infrastructure",
        targetKind: null,
        source: "direct",
        preparedDraftRevision: null,
        preparedSnapshotHash: null,
        status: "PENDING"
      }
    }
  ]);

  await app.close();
});

test("POST /api/projects/:projectId/deployments/prepare locks the saved draft revision", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments/prepare`,
    headers: await authHeaders(),
    payload: {
      architectureId,
      terraformArtifactId,
      awsConnectionId,
      draftRevision: 7,
      scope: "auto"
    }
  });

  assert.equal(response.statusCode, 201);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.consolePhase, "validation");
  assert.equal(body.deployment.preparedDraftRevision, 7);
  assert.match(body.deployment.preparedSnapshotHash ?? "", /^[0-9a-f]{64}$/);
  const createCall = repository.calls.find((call) => call.name === "createDeployment");
  assert.equal(createCall?.name, "createDeployment");
  if (createCall?.name === "createDeployment") {
    assert.equal(createCall.input.preparedDraftRevision, 7);
    assert.equal(createCall.input.preparedSnapshotHash, body.deployment.preparedSnapshotHash);
  }

  await app.close();
});

test("POST /api/projects/:projectId/deployments/prepare rejects a stale draft", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments/prepare`,
    headers: await authHeaders(),
    payload: {
      architectureId,
      terraformArtifactId,
      awsConnectionId,
      draftRevision: 6,
      scope: "auto"
    }
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.json().message, /stale/i);
  assert.equal(repository.calls.some((call) => call.name === "createDeployment"), false);

  await app.close();
});

test("POST /api/projects/:projectId/deployments prunes stale deployment storage after creation", async () => {
  const repository = new FakeDeploymentRepository();
  const pruneCalls: Array<{ projectId: string }> = [];
  const app = await buildDeploymentTestApp(repository, {
    pruneProjectDeploymentStorage: async ({ projectId: candidateProjectId }) => {
      pruneCalls.push({ projectId: candidateProjectId });

      return {
        architectureIdsToDelete: [],
        deploymentIdsToDelete: [],
        failedObjectKeys: [],
        objectKeysToDelete: [],
        terraformArtifactIdsToDelete: []
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments`,
    headers: await authHeaders(),
    payload: createDeploymentBody()
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(pruneCalls, [{ projectId }]);

  await app.close();
});

test("POST /api/projects/:projectId/deployments maps ownership validation failures to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.terraformArtifact = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/deployments`,
    headers: await authHeaders(),
    payload: createDeploymentBody()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Terraform artifact not found for project architecture"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "findArchitectureInProject",
      architectureId,
      projectId
    },
    {
      name: "findTerraformArtifactForArchitecture",
      terraformArtifactId,
      projectId,
      architectureId
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId returns a deployment", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    approvedByUserId: userId
  });
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.approvedByUserId, userId);
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    },
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId maps missing deployments to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Deployment not found"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId/failure-explanation returns a masked fallback explanation", async () => {
  const repository = new FakeDeploymentRepository();
  const leakedSecret = "temporary-secret-access-key";
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "FAILED",
    failureStage: "apply",
    errorSummary: `apply failed AWS_SECRET_ACCESS_KEY=${leakedSecret}`,
    stateObjectKey,
    failedAt: fixedNow
  });
  repository.logs = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      deploymentId,
      sequence: 1,
      stage: "apply",
      level: "ERROR",
      message: `AccessDenied: not authorized AWS_SECRET_ACCESS_KEY=${leakedSecret}`,
      relatedResourceId: null,
      createdAt: fixedNow
    }
  ];
  const app = await buildDeploymentTestApp(repository, {
    createLlmExplanation: async (input) => ({
      target: input.target,
      summary: "fallback summary",
      highlights: ["fallback highlight"],
      nextActions: ["fallback next action"],
      fallbackUsed: true,
      fallbackReason: "missing_api_key"
    })
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/failure-explanation`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<DeploymentFailureExplanationResponse>();

  assert.equal(body.explanation.deploymentId, deploymentId);
  assert.equal(body.explanation.stage, "apply");
  assert.equal(body.explanation.cleanupRequired, true);
  assert.equal(body.explanation.firstErrorLog?.includes(leakedSecret), false);
  assert.match(body.explanation.summary, /apply/);
  assert.match(body.explanation.summary, /첫 오류 로그/);
  assert.match(body.explanation.summary, /Cleanup 필요 여부: 필요/);
  assert.equal(body.explanation.llmExplanation?.fallbackUsed, true);
  assert.equal(body.explanation.llmExplanation?.fallbackReason, "missing_api_key");

  await app.close();
});

test("GET /api/deployments/:deploymentId/failure-explanation uses the earliest error without overlong excerpts", async () => {
  const repository = new FakeDeploymentRepository();
  const longFirstError = "x".repeat(700);
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "FAILED",
    failureStage: "plan",
    failedAt: fixedNow
  });
  repository.logs = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      deploymentId,
      sequence: 20,
      stage: "plan",
      level: "ERROR",
      message: "later error should not be selected",
      relatedResourceId: null,
      createdAt: fixedNow
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      deploymentId,
      sequence: 10,
      stage: "plan",
      level: "ERROR",
      message: longFirstError,
      relatedResourceId: null,
      createdAt: fixedNow
    }
  ];
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/failure-explanation`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<DeploymentFailureExplanationResponse>();

  assert.equal(body.explanation.firstErrorLog?.length, 600);
  assert.match(body.explanation.firstErrorLog ?? "", /^x+\.\.\.$/);
  assert.equal(body.explanation.firstErrorLog?.includes("later error"), false);

  await app.close();
});

test("GET /api/deployments/:deploymentId/failure-explanation rejects non-failed deployments", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/failure-explanation`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 409);

  await app.close();
});

test("POST /api/deployments/:deploymentId/init starts Terraform init in the background", async () => {
  const repository = new FakeDeploymentRepository();
  const initCalls: RunDeploymentInitInput[] = [];
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      initCalls.push(input);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "PENDING",
          failureStage: null,
          errorSummary: null
        }),
        terraform: {
          command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
          exitCode: 0,
          stdout: "Terraform has been successfully initialized!",
          stderr: "",
          timedOut: false
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(initCalls.length, 1);
  const { abortSignal: initAbortSignal, ...initCall } = initCalls[0]!;
  assert.equal(initAbortSignal instanceof AbortSignal, true);
  assert.deepEqual(initCall, {
    deploymentId,
    startedFromStatus: "PENDING",
    accessContext: {
      kind: "user",
      userId
    }
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/init maps missing deployments to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = undefined;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async () => {
      throw new Error("background init should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Deployment not found"
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/init returns accepted when background Terraform init fails", async () => {
  const repository = new FakeDeploymentRepository();
  const initCalls: string[] = [];
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async (input) => {
      initCalls.push(input.deploymentId);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "FAILED",
          failureStage: "init",
          errorSummary: "Error: provider install failed"
        }),
        terraform: {
          command: ["terraform", "init", "-backend=false", "-input=false", "-no-color"],
          exitCode: 1,
          stdout: "Initializing the backend...",
          stderr: "Error: provider install failed",
          timedOut: false
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.deepEqual(initCalls, [deploymentId]);

  await app.close();
});

test("POST /api/deployments/:deploymentId/init rejects a deployment that is already running", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING"
  });
  let initStarted = false;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async () => {
      initStarted = true;
      throw new Error("background init should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Deployment init is already running"
  });
  assert.equal(initStarted, false);
  assert.equal(repository.deployment.status, "RUNNING");

  await app.close();
});

test("POST /api/deployments/:deploymentId/init maps missing Terraform artifacts to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.terraformArtifactById = undefined;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentInit: async () => {
      throw new Error("background init should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/init`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Terraform artifact not found for deployment"
  });

  await app.close();
});

test("GET /api/deployments/:deploymentId includes the current plan operation", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    currentPlanArtifactId: planArtifactId
  });
  repository.planArtifact = createDeploymentPlanArtifactRecord({
    id: planArtifactId,
    operation: "destroy"
  });
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.currentPlanArtifactId, planArtifactId);
  assert.equal(body.deployment.currentPlanOperation, "destroy");

  await app.close();
});

test("POST /api/deployments/:deploymentId/plan starts Terraform plan in the background", async () => {
  const repository = new FakeDeploymentRepository();
  const planCalls: RunDeploymentPlanInput[] = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: "c".repeat(64),
    approvedTfplanHash: "a".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2"
  });
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentPlan: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      planCalls.push(input);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "PENDING",
          currentPlanArtifactId: "99999999-9999-4999-8999-999999999999",
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
        }),
        optimization: {
          outcome: "execute",
          reason: "initial_plan"
        },
        terraform: {
          init: null,
          validate: null,
          plan: null,
          showJson: null
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/plan`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(body.deployment.approvedAt, null);
  assert.equal(body.deployment.approvedByUserId, null);
  assert.equal(body.deployment.approvedTerraformArtifactId, null);
  assert.equal(body.deployment.approvedPlanArtifactId, null);
  assert.equal(body.deployment.approvedTerraformArtifactHash, null);
  assert.equal(body.deployment.approvedTfplanHash, null);
  assert.equal(body.deployment.approvedAwsAccountId, null);
  assert.equal(body.deployment.approvedAwsRegion, null);
  assert.equal(planCalls.length, 1);
  const { abortSignal: planAbortSignal, ...planCall } = planCalls[0]!;
  assert.equal(planAbortSignal instanceof AbortSignal, true);
  assert.deepEqual(planCall, {
    deploymentId,
    startedFromStatus: "PENDING",
    accessContext: {
      kind: "user",
      userId
    }
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/plan writes a runtime cache status snapshot", async () => {
  const repository = new FakeDeploymentRepository();
  const runtimeCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  const app = await buildDeploymentTestApp(repository, {
    runtimeCache,
    runDeploymentPlan: async (input) => ({
      deployment: createDeploymentRecord(input.deploymentId, {
        status: "PENDING"
      }),
      optimization: {
        outcome: "execute",
        reason: "initial_plan"
      },
      terraform: {
        init: null,
        validate: null,
        plan: null,
        showJson: null
      }
    })
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/plan`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const snapshot = await runtimeCache.get<DeploymentRuntimeStatusSnapshot>({
    namespace: deploymentStatusCacheNamespace,
    key: createDeploymentRuntimeCacheKey(deploymentId)
  });

  assert.equal(snapshot?.kind, "deployment_status");
  assert.equal(snapshot?.deploymentId, deploymentId);
  assert.equal(snapshot?.projectId, projectId);
  assert.equal(snapshot?.status, "RUNNING");
  assert.equal(snapshot?.activeStage, "plan");
  assert.equal(typeof snapshot?.cachedAt, "string");

  await app.close();
});

test("POST /api/deployments/:deploymentId/plan rejects a deployment that is already running", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING"
  });
  let planStarted = false;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentPlan: async () => {
      planStarted = true;
      throw new Error("background plan should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/plan`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Deployment plan is already running"
  });
  assert.equal(planStarted, false);
  assert.equal(repository.deployment.status, "RUNNING");

  await app.close();
});

test("POST /api/deployments/:deploymentId/plan joins an identical Plan already in flight", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING",
    activeStage: "plan"
  });
  let duplicatePlanStarted = false;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentPlan: async () => {
      duplicatePlanStarted = true;
      throw new Error("a duplicate Plan must not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/plan`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(body.deployment.activeStage, "plan");
  assert.equal(duplicatePlanStarted, false);

  await app.close();
});

test("POST /api/deployments/:deploymentId/approve approves the current plan", async () => {
  const repository = new FakeDeploymentRepository();
  const approveCalls: Array<{ deploymentId: string; accessContext: ProjectAccessContext }> = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
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
  const app = await buildDeploymentTestApp(repository, {
    approveDeploymentPlan: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      approveCalls.push(input);

      return createDeploymentRecord(input.deploymentId, {
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
        blockedReason: null,
        approvedAt: fixedNow,
        approvedByUserId: userId,
        approvedTerraformArtifactId: terraformArtifactId,
        approvedPlanArtifactId: planArtifactId,
        approvedTerraformArtifactHash: "a".repeat(64),
        approvedTfplanHash: "b".repeat(64),
        approvedAwsAccountId: "123456789012",
        approvedAwsRegion: "ap-northeast-2"
      });
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/approve`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.isBlocked, false);
  assert.equal(body.deployment.approvedByUserId, userId);
  assert.equal(body.deployment.approvedTerraformArtifactId, terraformArtifactId);
  assert.equal(body.deployment.approvedPlanArtifactId, planArtifactId);
  assert.equal(body.deployment.approvedTerraformArtifactHash, "a".repeat(64));
  assert.equal(body.deployment.approvedTfplanHash, "b".repeat(64));
  assert.equal(body.deployment.approvedAwsAccountId, "123456789012");
  assert.equal(body.deployment.approvedAwsRegion, "ap-northeast-2");
  assert.deepEqual(approveCalls, [
    {
      deploymentId,
      acknowledgedWarningIds: [],
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});
test("POST /api/deployments/:deploymentId/revoke-approval clears the apply approval", async () => {
  const repository = new FakeDeploymentRepository();
  const revokeCalls: string[] = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
    currentPlanArtifactId: planArtifactId,
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: "a".repeat(64),
    approvedTfplanHash: "b".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    isBlocked: false,
    blockedBy: null,
    blockedReason: null
  });
  const app = await buildDeploymentTestApp(repository, {
    revokeDeploymentApproval: async (input) => {
      revokeCalls.push(input.deploymentId);
      return createDeploymentRecord(input.deploymentId, {
        currentPlanArtifactId: planArtifactId,
        approvedAt: null,
        approvedByUserId: null,
        approvedTerraformArtifactId: null,
        approvedPlanArtifactId: null,
        approvedTerraformArtifactHash: null,
        approvedTfplanHash: null,
        approvedAwsAccountId: null,
        approvedAwsRegion: null,
        isBlocked: true,
        blockedBy: "missing_approval",
        blockedReason: "Terraform Plan requires user approval before apply"
      });
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/revoke-approval`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.approvedAt, null);
  assert.equal(body.deployment.approvedPlanArtifactId, null);
  assert.equal(body.deployment.isBlocked, true);
  assert.equal(body.deployment.blockedBy, "missing_approval");
  assert.deepEqual(revokeCalls, [deploymentId]);
  await app.close();
});




test("POST /api/deployments/:deploymentId/execute starts Terraform apply through the same safety path", async () => {
  const repository = new FakeDeploymentRepository();
  const applyCalls: RunDeploymentApplyInput[] = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
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
    blockedReason: null,
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: "c".repeat(64),
    approvedTfplanHash: "a".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2"
  });
  repository.deployments = [repository.deployment];
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentApply: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      applyCalls.push(input);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "SUCCESS",
          stateObjectKey: `deployments/${input.deploymentId}/state/terraform.tfstate`
        }),
        terraform: {
          init: null,
          apply: null,
          outputJson: null,
          showStateJson: null
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/execute`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(body.deployment.approvedPlanArtifactId, planArtifactId);
  assert.equal(applyCalls.length, 1);
  const { abortSignal: applyAbortSignal, ...applyCall } = applyCalls[0]!;
  assert.equal(applyAbortSignal instanceof AbortSignal, true);
  assert.deepEqual(applyCall, {
    deploymentId,
    startedFromStatus: "PENDING",
    accessContext: {
      kind: "user",
      userId
    }
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/apply dispatches an ECS worker task when worker mode is enabled", async () => {
  const repository = new FakeDeploymentRepository();
  const jobRepository = new FakeDeploymentJobRepository();
  const dispatcher = new FakeDeploymentWorkerDispatcher();
  let applyStarted = false;
  repository.deployment = createDeploymentRecord(deploymentId, {
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
    blockedReason: null,
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: "c".repeat(64),
    approvedTfplanHash: "a".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2"
  });
  repository.deployments = [repository.deployment];
  const app = await buildDeploymentTestApp(repository, {
    createDeploymentJobRepository: () => jobRepository,
    workerDispatcher: dispatcher,
    workerDispatchMode: "ecs",
    runDeploymentApply: async () => {
      applyStarted = true;
      throw new Error("in-process apply should not start in ECS worker mode");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/apply`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(applyStarted, false);
  assert.equal(dispatcher.dispatchCalls.length, 1);
  const activeJob = await jobRepository.findActiveDeploymentJob(deploymentId);
  assert.equal(activeJob?.operation, "apply");
  assert.equal(activeJob?.status, "RUNNING");
  assert.equal(activeJob?.requestedByUserId, userId);
  assert.equal(activeJob?.ecsTaskArn, dispatcher.taskArn);

  await app.close();
});

test("POST /api/deployments/:deploymentId/apply rejects deployments without approval", async () => {
  const repository = new FakeDeploymentRepository();
  let applyStarted = false;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentApply: async () => {
      applyStarted = true;
      throw new Error("background apply should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/apply`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Deployment approval is required before apply"
  });
  assert.equal(applyStarted, false);

  await app.close();
});

test("POST /api/deployments/:deploymentId/apply rejects failed deployments until replanned", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "FAILED",
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
    blockedReason: null,
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: "c".repeat(64),
    approvedTfplanHash: "a".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2",
    failureStage: "apply",
    errorSummary: "previous apply failed"
  });
  let applyStarted = false;
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentApply: async () => {
      applyStarted = true;
      throw new Error("background apply should not start");
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/apply`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error: "conflict",
    message: "Deployment must be replanned and approved before apply"
  });
  assert.equal(applyStarted, false);

  await app.close();
});

test("POST /api/deployments/:deploymentId/destroy/plan starts cleanup destroy planning", async () => {
  const repository = new FakeDeploymentRepository();
  const destroyPlanCalls: RunDeploymentDestroyPlanInput[] = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "FAILED",
    currentPlanArtifactId: planArtifactId,
    stateObjectKey,
    failureStage: "apply",
    errorSummary: "previous apply failed after creating resources"
  });
  repository.deployments = [repository.deployment];
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentDestroyPlan: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      destroyPlanCalls.push(input);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "FAILED",
          currentPlanArtifactId: planArtifactId,
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
        }),
        terraform: {
          init: null,
          plan: null,
          showJson: null
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/destroy/plan`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(body.deployment.activeStage, "plan");
  assert.equal(body.deployment.failureStage, null);
  assert.equal(destroyPlanCalls.length, 1);
  const { abortSignal: destroyPlanAbortSignal, ...destroyPlanCall } = destroyPlanCalls[0]!;
  assert.equal(destroyPlanAbortSignal instanceof AbortSignal, true);
  assert.deepEqual(destroyPlanCall, {
    deploymentId,
    startedFromStatus: "FAILED",
    startedFromFailureStage: "apply",
    startedFromErrorSummary: "previous apply failed after creating resources",
    accessContext: {
      kind: "user",
      userId
    }
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/destroy starts approved destroy in the background", async () => {
  const repository = new FakeDeploymentRepository();
  const destroyCalls: RunDeploymentDestroyInput[] = [];
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "SUCCESS",
    currentPlanArtifactId: planArtifactId,
    stateObjectKey,
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
    approvedAt: fixedNow,
    approvedByUserId: userId,
    approvedTerraformArtifactId: terraformArtifactId,
    approvedPlanArtifactId: planArtifactId,
    approvedTerraformArtifactHash: "c".repeat(64),
    approvedTfplanHash: "a".repeat(64),
    approvedAwsAccountId: "123456789012",
    approvedAwsRegion: "ap-northeast-2"
  });
  repository.planArtifact = createDeploymentPlanArtifactRecord({
    operation: "destroy"
  });
  repository.deployments = [repository.deployment];
  const app = await buildDeploymentTestApp(repository, {
    runDeploymentDestroy: async (input, candidateRepository) => {
      assert.equal(candidateRepository, repository);
      destroyCalls.push(input);

      return {
        deployment: createDeploymentRecord(input.deploymentId, {
          status: "DESTROYED",
          currentPlanArtifactId: null,
          stateObjectKey: null
        }),
        terraform: {
          init: null,
          destroy: null
        }
      };
    }
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/destroy`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.id, deploymentId);
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(body.deployment.activeStage, "destroy");
  assert.equal(destroyCalls.length, 1);
  const { abortSignal: destroyAbortSignal, ...destroyCall } = destroyCalls[0]!;
  assert.equal(destroyAbortSignal instanceof AbortSignal, true);
  assert.deepEqual(destroyCall, {
    deploymentId,
    startedFromStatus: "SUCCESS",
    startedFromFailureStage: null,
    accessContext: {
      kind: "user",
      userId
    }
  });

  await app.close();
});

test("POST /api/deployments/:deploymentId/cancel marks stale running deployments failed", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING",
    activeStage: "apply"
  });
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/cancel`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.status, "FAILED");
  assert.equal(body.deployment.failureStage, "apply");
  assert.equal(body.deployment.cancelRequestedAt, fixedNow.toISOString());
  assert.match(body.deployment.errorSummary ?? "", /no active Terraform process/);

  await app.close();
});

test("POST /api/deployments/:deploymentId/cancel stops an active ECS worker task", async () => {
  const repository = new FakeDeploymentRepository();
  const jobRepository = new FakeDeploymentJobRepository();
  const dispatcher = new FakeDeploymentWorkerDispatcher();
  repository.deployment = createDeploymentRecord(deploymentId, {
    status: "RUNNING",
    activeStage: "apply"
  });
  const activeJob: DeploymentJobRecord = {
    id: jobRepository.nextId,
    deploymentId,
    operation: "apply",
    status: "RUNNING",
    requestedByUserId: userId,
    accessContext: {
      kind: "user",
      userId
    },
    startedFromStatus: "PENDING",
    startedFromFailureStage: null,
    ecsTaskArn: dispatcher.taskArn,
    errorSummary: null,
    startedAt: fixedNow,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow
  };
  jobRepository.jobs.set(activeJob.id, activeJob);
  const app = await buildDeploymentTestApp(repository, {
    createDeploymentJobRepository: () => jobRepository,
    workerDispatcher: dispatcher,
    workerDispatchMode: "ecs"
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/deployments/${deploymentId}/cancel`,
    headers: await authHeaders(),
    payload: {}
  });

  assert.equal(response.statusCode, 202);
  const body = response.json() as DeploymentResponse;
  assert.equal(body.deployment.status, "RUNNING");
  assert.equal(body.deployment.cancelRequestedAt, fixedNow.toISOString());
  assert.equal(dispatcher.stopCalls.length, 1);
  assert.equal(dispatcher.stopCalls[0]?.job.ecsTaskArn, dispatcher.taskArn);
  const cancelledJob = await jobRepository.findDeploymentJobById(activeJob.id);
  assert.equal(cancelledJob?.status, "CANCELLED");
  assert.match(cancelledJob?.errorSummary ?? "", /StopTask/);

  await app.close();
});

test("GET /api/projects/:projectId/deployments returns project deployments", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/deployments`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);

  const body = response.json() as DeploymentListResponse;
  assert.equal(body.deployments.length, 1);
  assert.equal(body.deployments[0]?.id, deploymentId);
  assert.equal(body.deployments[0]?.createdAt, fixedNow.toISOString());
  assert.equal(body.deployments[0]?.updatedAt, fixedNow.toISOString());
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "listDeploymentsByProject",
      projectId
    }
  ]);

  await app.close();
});

test("GET /api/projects/:projectId/deployments maps missing project ownership to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.project = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/projects/${projectId}/deployments`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Project not found"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});

test("GET /api/deployments/recent-successful-projects returns latest successful deployments by project", async () => {
  const otherProjectId = "66666666-6666-4666-8666-666666666666";
  const latestSuccessAt = new Date("2026-01-04T00:00:00.000Z");
  const otherSuccessAt = new Date("2026-01-03T00:00:00.000Z");
  const repository = new FakeDeploymentRepository();
  repository.deploymentProjectRows = [
    {
      project: createProjectRecord({
        name: "Primary Project"
      }),
      deployment: createDeploymentRecord("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        status: "SUCCESS",
        completedAt: new Date("2026-01-02T00:00:00.000Z")
      })
    },
    {
      project: createProjectRecord({
        id: otherProjectId,
        name: "Other Project"
      }),
      deployment: createDeploymentRecord("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", {
        projectId: otherProjectId,
        status: "DESTROYED",
        completedAt: new Date("2026-01-05T00:00:00.000Z")
      })
    },
    {
      project: createProjectRecord({
        id: otherProjectId,
        name: "Other Project"
      }),
      deployment: createDeploymentRecord("cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
        projectId: otherProjectId,
        status: "FAILED",
        failedAt: new Date("2026-01-06T00:00:00.000Z")
      })
    },
    {
      project: createProjectRecord({
        id: otherProjectId,
        name: "Other Project"
      }),
      deployment: createDeploymentRecord("dddddddd-dddd-4ddd-8ddd-dddddddddddd", {
        projectId: otherProjectId,
        status: "SUCCESS",
        completedAt: otherSuccessAt
      })
    },
    {
      project: createProjectRecord({
        name: "Primary Project"
      }),
      deployment: createDeploymentRecord(deploymentId, {
        status: "SUCCESS",
        completedAt: latestSuccessAt
      })
    }
  ];
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: "/api/deployments/recent-successful-projects",
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as RecentSuccessfulDeploymentProjectListResponse;
  assert.deepEqual(
    body.items.map((item) => item.deployment.id),
    [deploymentId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"]
  );
  assert.deepEqual(
    body.items.map((item) => item.deployment.status),
    ["SUCCESS", "SUCCESS"]
  );
  assert.equal(body.items[0]?.project.name, "Primary Project");
  assert.equal(body.items[0]?.deployedAt, latestSuccessAt.toISOString());
  assert.deepEqual(repository.calls, [
    {
      name: "listDeploymentProjectRows",
      accessContext: {
        kind: "user",
        userId
      }
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId/logs returns an empty log list", async () => {
  const repository = new FakeDeploymentRepository();
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/logs`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json() as DeploymentLogsResponse, {
    logs: []
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    },
    {
      name: "findAccessibleProject",
      projectId,
      accessContext: {
        kind: "user",
        userId
      }
    },
    {
      name: "listDeploymentLogs",
      deploymentId
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId/logs/stream returns uncached SSE log events", async () => {
  const repository = new FakeDeploymentRepository();
  repository.logs = [
    {
      id: "log-1",
      deploymentId,
      sequence: 1,
      stage: "plan",
      level: "INFO",
      message: "old log",
      relatedResourceId: null,
      createdAt: fixedNow
    },
    {
      id: "log-2",
      deploymentId,
      sequence: 2,
      stage: "apply",
      level: "WARN",
      message: "new log",
      relatedResourceId: null,
      createdAt: fixedNow
    }
  ];
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/logs/stream?sinceSequence=1&once=true`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/event-stream/);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.equal(response.headers["x-accel-buffering"], "no");
  assert.match(response.body, /event: log/);
  assert.match(response.body, /"sequence":2/);
  assert.doesNotMatch(response.body, /"sequence":1/);

  await app.close();
});

test("GET /api/deployments/:deploymentId/logs/stream writes a runtime cache cursor", async () => {
  const repository = new FakeDeploymentRepository();
  const runtimeCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  repository.logs = [
    {
      id: "log-1",
      deploymentId,
      sequence: 1,
      stage: "plan",
      level: "INFO",
      message: "old log",
      relatedResourceId: null,
      createdAt: fixedNow
    },
    {
      id: "log-2",
      deploymentId,
      sequence: 2,
      stage: "apply",
      level: "WARN",
      message: "new log",
      relatedResourceId: null,
      createdAt: fixedNow
    }
  ];
  const app = await buildDeploymentTestApp(repository, { runtimeCache });

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/logs/stream?sinceSequence=1&once=true`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"sequence":2/);
  const cursor = await runtimeCache.get<DeploymentLogStreamCursorSnapshot>({
    namespace: deploymentLogCursorCacheNamespace,
    key: createDeploymentRuntimeCacheKey(deploymentId)
  });

  assert.equal(cursor?.kind, "deployment_log_cursor");
  assert.equal(cursor?.deploymentId, deploymentId);
  assert.equal(cursor?.lastSequence, 2);

  await app.close();
});

test("GET /api/deployments/:deploymentId/logs/stream falls back to RDS when cursor cache fails", async () => {
  const repository = new FakeDeploymentRepository();
  repository.logs = [
    {
      id: "log-1",
      deploymentId,
      sequence: 1,
      stage: "plan",
      level: "INFO",
      message: "old log",
      relatedResourceId: null,
      createdAt: fixedNow
    }
  ];
  const app = await buildDeploymentTestApp(repository, {
    runtimeCache: createThrowingRuntimeCache()
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/logs/stream?sinceSequence=0&once=true`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"sequence":1/);
  assert(repository.calls.some((call) => call.name === "listDeploymentLogs"));

  await app.close();
});

test("writeDeploymentLogStreamChunk skips closed streams and reports write failures", () => {
  const chunks: string[] = [];
  const writableStream = {
    writableEnded: false,
    destroyed: false,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    }
  };

  assert.deepEqual(
    writeDeploymentLogStreamChunk({
      raw: writableStream,
      chunk: ": keep-alive\n\n"
    }),
    { ok: true }
  );
  assert.deepEqual(chunks, [": keep-alive\n\n"]);

  assert.deepEqual(
    writeDeploymentLogStreamChunk({
      raw: {
        writableEnded: true,
        destroyed: false,
        write() {
          throw new Error("should not write");
        }
      },
      chunk: ": keep-alive\n\n"
    }),
    { ok: false }
  );

  const writeError = new Error("EPIPE");

  assert.deepEqual(
    writeDeploymentLogStreamChunk({
      raw: {
        writableEnded: false,
        destroyed: false,
        write() {
          throw writeError;
        }
      },
      chunk: ": keep-alive\n\n"
    }),
    { ok: false, error: writeError }
  );
});

test("GET /api/deployments/:deploymentId/logs maps missing deployments to not_found", async () => {
  const repository = new FakeDeploymentRepository();
  repository.deployment = undefined;
  const app = await buildDeploymentTestApp(repository);

  const response = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/logs`,
    headers: await authHeaders()
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    error: "not_found",
    message: "Deployment not found"
  });
  assert.deepEqual(repository.calls, [
    {
      name: "findDeploymentById",
      deploymentId
    }
  ]);

  await app.close();
});

test("GET /api/deployments/:deploymentId/resources and outputs return apply results", async () => {
  const repository = new FakeDeploymentRepository();
  repository.resources = [
    createDeployedResourceRecord({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      terraformAddress: "aws_instance.web",
      terraformType: "aws_instance",
      resourceId: "i-0123456789abcdef0"
    })
  ];
  repository.outputs = [
    createTerraformOutputRecord({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "instance_id",
      value: "i-0123456789abcdef0",
      sensitive: false
    }),
    createTerraformOutputRecord({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "private_value",
      value: "do-not-return",
      sensitive: true
    })
  ];
  const app = await buildDeploymentTestApp(repository);

  const resourcesResponse = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/resources`,
    headers: await authHeaders()
  });
  const outputsResponse = await app.inject({
    method: "GET",
    url: `/api/deployments/${deploymentId}/outputs`,
    headers: await authHeaders()
  });

  assert.equal(resourcesResponse.statusCode, 200);
  assert.deepEqual((resourcesResponse.json() as DeploymentResourcesResponse).resources, [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      deploymentId,
      terraformAddress: "aws_instance.web",
      terraformType: "aws_instance",
      providerName: "registry.terraform.io/hashicorp/aws",
      resourceId: "i-0123456789abcdef0",
      region: "ap-northeast-2",
      createdAt: fixedNow.toISOString()
    }
  ]);

  assert.equal(outputsResponse.statusCode, 200);
  assert.deepEqual((outputsResponse.json() as TerraformOutputsResponse).outputs, [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      deploymentId,
      name: "instance_id",
      value: "i-0123456789abcdef0",
      sensitive: false,
      createdAt: fixedNow.toISOString()
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      deploymentId,
      name: "private_value",
      value: null,
      sensitive: true,
      createdAt: fixedNow.toISOString()
    }
  ]);

  await app.close();
});
