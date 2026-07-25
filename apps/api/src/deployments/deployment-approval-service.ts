import { createHash } from "node:crypto";
import type {
  ApproveDeploymentPlanRequest,
  AwsConnection,
  DeploymentFailureStage,
  DeploymentStatus
} from "@sketchcatch/types";
import {
  createTerraformArtifactCanonicalContent,
  createTerraformArtifactSafetyContent
} from "./terraform-workspace.js";
import { createProjectAssetStorage } from "../projects/project-asset-storage-factory.js";
import type { ProjectAssetStorage } from "../projects/project-asset-storage.js";
import { assertTerraformArtifactIsSafe } from "./terraform-artifact-safety.js";
import {
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  type DeploymentPlanArtifactRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext,
  type ReleaseCandidateRecord
} from "./deployment-service.js";
import { isDeploymentDestroySourceStatus } from "./deployment-destroy-eligibility.js";
import { createPreparedReleaseSnapshotHash } from "./deployment-preparation-service.js";
import { requiresTerraformImportSafetyReplan } from "./deployment-safety-gate.js";

export type ApproveDeploymentPlanInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  acknowledgedWarningIds?: ApproveDeploymentPlanRequest["acknowledgedWarningIds"];
};

export type ApproveDeploymentPlanOptions = {
  downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
  projectAssetStorage?: ProjectAssetStorage;
  now?: () => Date;
};

export type AssertDeploymentApplyPreconditionsInput = {
  deployment: DeploymentRecord;
  currentPlanArtifact: DeploymentPlanArtifactRecord;
  currentTerraformArtifactHash: string;
  currentTfplanHash: string;
  currentAwsConnection: AwsConnection;
  currentReleaseCandidate?: ReleaseCandidateRecord | undefined;
  now?: Date | undefined;
};

export type AssertDeploymentDestroyPreconditionsInput = AssertDeploymentApplyPreconditionsInput & {
  sourceStatus: DeploymentStatus;
  sourceFailureStage: DeploymentFailureStage | null;
};

export type DeploymentApplyPreconditionReason =
  | "approval_snapshot"
  | "plan_operation"
  | "terraform_artifact"
  | "terraform_plan"
  | "release_candidate"
  | "aws_account"
  | "aws_region";

export class DeploymentApplyPreconditionError extends DeploymentConflictError {
  readonly reason: DeploymentApplyPreconditionReason;

  constructor(reason: DeploymentApplyPreconditionReason, message: string) {
    super(message);
    this.name = "DeploymentApplyPreconditionError";
    this.reason = reason;
  }
}

export async function approveDeploymentPlan(
  input: ApproveDeploymentPlanInput,
  repository: DeploymentRepository,
  options: ApproveDeploymentPlanOptions = {}
): Promise<DeploymentRecord> {
  const downloadTerraformArtifact =
    options.downloadTerraformArtifact ??
    ((objectKey: string) =>
      (options.projectAssetStorage ?? createProjectAssetStorage()).getObject({ objectKey }));
  const now = options.now ?? (() => new Date());
  const deployment = await getDeployment(input, repository);

  assertDeploymentCanBeApproved(deployment);
  void input.acknowledgedWarningIds;

  const currentPlanArtifact = await repository.findDeploymentPlanArtifactById(
    deployment.currentPlanArtifactId
  );

  if (!currentPlanArtifact || currentPlanArtifact.deploymentId !== deployment.id) {
    throw new DeploymentConflictError("Current deployment plan artifact not found");
  }

  if (currentPlanArtifact.terraformArtifactId !== deployment.terraformArtifactId) {
    throw new DeploymentConflictError("Terraform artifact changed after plan");
  }

  if (currentPlanArtifact.operation !== "apply" && currentPlanArtifact.operation !== "destroy") {
    throw new DeploymentConflictError("Unsupported Terraform plan operation");
  }

  const terraformArtifact = await repository.findTerraformArtifactById(
    deployment.terraformArtifactId
  );

  if (
    !terraformArtifact ||
    terraformArtifact.projectId !== deployment.projectId ||
    terraformArtifact.architectureId !== deployment.architectureId
  ) {
    throw new DeploymentNotFoundError("Terraform artifact not found for deployment");
  }

  const awsConnection = await requireDeploymentAwsConnection(
    deployment,
    input.accessContext,
    repository
  );

  if (
    awsConnection.accountId !== currentPlanArtifact.accountId ||
    awsConnection.region !== currentPlanArtifact.region
  ) {
    throw new DeploymentConflictError("AWS connection changed after plan");
  }

  const downloadedTerraformArtifact = await downloadTerraformArtifact(terraformArtifact.objectKey);
  const terraformArtifactContent = createTerraformArtifactCanonicalContent(
    {
      objectKey: terraformArtifact.objectKey,
      fileName: terraformArtifact.fileName,
      contentType: terraformArtifact.contentType
    },
    downloadedTerraformArtifact
  );

  assertTerraformArtifactIsSafe(
    createTerraformArtifactSafetyContent(
      {
        objectKey: terraformArtifact.objectKey,
        fileName: terraformArtifact.fileName,
        contentType: terraformArtifact.contentType
      },
      downloadedTerraformArtifact
    ),
    {
      liveProfile: deployment.liveProfile
    }
  );

  const terraformArtifactHash = createSha256(terraformArtifactContent);
  const plannedTerraformArtifactSha256 = currentPlanArtifact.terraformArtifactSha256;

  if (!plannedTerraformArtifactSha256) {
    throw new DeploymentConflictError("Terraform Plan must be regenerated before approval");
  }

  if (terraformArtifactHash !== plannedTerraformArtifactSha256) {
    throw new DeploymentConflictError("Terraform artifact changed after plan");
  }

  if (currentPlanArtifact.operation === "apply") {
    const releaseCandidate = await findCurrentReleaseCandidate(deployment, repository);
    assertReleaseCandidateSnapshot(deployment, releaseCandidate, now());
  }

  const approvedDeployment = await repository.approveDeployment(deployment.id, {
    approvedByUserId: input.accessContext.userId,
    approvedAt: now(),
    approvedTerraformArtifactId: deployment.terraformArtifactId,
    approvedPlanArtifactId: currentPlanArtifact.id,
    approvedTerraformArtifactHash: plannedTerraformArtifactSha256,
    approvedTfplanHash: currentPlanArtifact.sha256,
    approvedAwsAccountId: currentPlanArtifact.accountId,
    approvedAwsRegion: currentPlanArtifact.region,
    approvedPreparedSnapshotHash: deployment.preparedSnapshotHash ?? null,
    planSummary: {
      ...deployment.planSummary,
      blocked: false
    },
    status: getApprovedDeploymentStatus(deployment, currentPlanArtifact.operation),
    preserveFailureDetails:
      currentPlanArtifact.operation === "destroy" && deployment.status === "FAILED"
  });

  if (!approvedDeployment) {
    throw new DeploymentConflictError("Deployment approval state changed");
  }

  return approvedDeployment;
}

export type RevokeDeploymentApprovalRequest = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
};

export async function revokeDeploymentApproval(
  input: RevokeDeploymentApprovalRequest,
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const deployment = await getDeployment(input, repository);

  if (!deployment.approvedAt || !deployment.approvedPlanArtifactId) {
    throw new DeploymentConflictError("Deployment approval is not active");
  }

  if (deployment.status !== "PENDING") {
    throw new DeploymentConflictError("Only a pending deployment approval can be cancelled");
  }

  if (!repository.revokeDeploymentApproval) {
    throw new Error("Deployment repository does not support approval cancellation");
  }

  const currentPlanArtifact = deployment.currentPlanArtifactId
    ? await repository.findDeploymentPlanArtifactById(deployment.currentPlanArtifactId)
    : undefined;
  const blockedReason =
    currentPlanArtifact?.operation === "destroy"
      ? "Terraform Destroy Plan requires user approval before destroy"
      : "Terraform Plan requires user approval before apply";
  const revokedDeployment = await repository.revokeDeploymentApproval(deployment.id, {
    blockedBy: "missing_approval",
    blockedReason
  });

  if (!revokedDeployment) {
    throw new DeploymentConflictError("Deployment approval state changed");
  }

  return revokedDeployment;
}

// gg: 승인 뒤에도 현재 Plan과 AWS 연결 및 import 안전성 근거가 그대로인지 apply 직전에 다시 확인합니다.
export function assertDeploymentApplyPreconditions(
  input: AssertDeploymentApplyPreconditionsInput
): void {
  const deployment = input.deployment;

  assertDeploymentApprovalSnapshot(deployment, "apply");
  assertPreparedSnapshotMatchesApproval(deployment, "apply");
  assertReleaseCandidateSnapshot(
    deployment,
    input.currentReleaseCandidate,
    input.now ?? new Date(),
    true
  );

  if (input.currentPlanArtifact.operation !== "apply") {
    throw new DeploymentApplyPreconditionError(
      "plan_operation",
      `Terraform apply plan is required before apply: current plan operation is ${input.currentPlanArtifact.operation}`
    );
  }

  if (
    deployment.planSummary &&
    requiresTerraformImportSafetyReplan(deployment.planSummary)
  ) {
    throw new DeploymentApplyPreconditionError(
      "terraform_plan",
      "Terraform import Plan must be regenerated before apply"
    );
  }

  if (deployment.isBlocked) {
    throw new DeploymentConflictError("Blocked deployment cannot be applied");
  }

  if (deployment.approvedTerraformArtifactId !== deployment.terraformArtifactId) {
    throw new DeploymentApplyPreconditionError(
      "terraform_artifact",
      `Terraform artifact changed after approval: approved artifact ${deployment.approvedTerraformArtifactId}, current artifact ${deployment.terraformArtifactId}`
    );
  }

  if (
    deployment.approvedPlanArtifactId !== deployment.currentPlanArtifactId ||
    deployment.approvedPlanArtifactId !== input.currentPlanArtifact.id ||
    input.currentPlanArtifact.deploymentId !== deployment.id
  ) {
    throw new DeploymentApplyPreconditionError(
      "terraform_plan",
      `Terraform plan changed after approval: approved plan ${deployment.approvedPlanArtifactId}, current plan ${deployment.currentPlanArtifactId ?? "missing"}`
    );
  }

  if (deployment.approvedTerraformArtifactHash !== input.currentTerraformArtifactHash) {
    throw new DeploymentApplyPreconditionError(
      "terraform_artifact",
      `Terraform artifact content changed after approval: approved artifact hash ${formatShortHash(deployment.approvedTerraformArtifactHash)}, current artifact hash ${formatShortHash(input.currentTerraformArtifactHash)}`
    );
  }

  if (!input.currentAwsConnection.accountId) {
    throw new DeploymentApplyPreconditionError(
      "aws_account",
      `AWS connection account is missing before apply: approved AWS account ${deployment.approvedAwsAccountId}, current AWS account missing`
    );
  }

  if (deployment.approvedAwsAccountId !== input.currentAwsConnection.accountId) {
    throw new DeploymentApplyPreconditionError(
      "aws_account",
      `AWS account changed before apply: approved AWS account ${deployment.approvedAwsAccountId}, current AWS account ${input.currentAwsConnection.accountId}`
    );
  }

  if (deployment.approvedAwsRegion !== input.currentAwsConnection.region) {
    throw new DeploymentApplyPreconditionError(
      "aws_region",
      `AWS region changed before apply: approved AWS region ${deployment.approvedAwsRegion}, current AWS region ${input.currentAwsConnection.region}`
    );
  }

  if (deployment.approvedTfplanHash !== input.currentTfplanHash) {
    throw new DeploymentApplyPreconditionError(
      "terraform_plan",
      `Terraform plan changed before apply: approved tfplan hash ${formatShortHash(deployment.approvedTfplanHash)}, current tfplan hash ${formatShortHash(input.currentTfplanHash)}`
    );
  }
}

export function assertDeploymentDestroyPreconditions(
  input: AssertDeploymentDestroyPreconditionsInput
): void {
  const deployment = input.deployment;

  assertDeploymentApprovalSnapshot(deployment, "destroy");
  assertPreparedSnapshotMatchesApproval(deployment, "destroy");

  if (input.currentPlanArtifact.operation !== "destroy") {
    throw new DeploymentConflictError("Terraform destroy plan is required before destroy");
  }

  if (!isDeploymentDestroySourceStatus(input.sourceStatus)) {
    throw new DeploymentConflictError("Deployment cannot be destroyed in this state");
  }

  if (deployment.isBlocked) {
    throw new DeploymentConflictError("Blocked deployment cannot be destroyed");
  }

  if (deployment.scope !== "application" && !deployment.stateObjectKey) {
    throw new DeploymentConflictError("Terraform state is required before destroy");
  }

  if (deployment.approvedTerraformArtifactId !== deployment.terraformArtifactId) {
    throw new DeploymentConflictError("Terraform artifact changed after approval");
  }

  if (
    deployment.approvedPlanArtifactId !== deployment.currentPlanArtifactId ||
    deployment.approvedPlanArtifactId !== input.currentPlanArtifact.id ||
    input.currentPlanArtifact.deploymentId !== deployment.id
  ) {
    throw new DeploymentConflictError("Terraform plan changed after approval");
  }

  if (deployment.approvedTerraformArtifactHash !== input.currentTerraformArtifactHash) {
    throw new DeploymentConflictError("Terraform artifact content changed after approval");
  }

  if (!input.currentAwsConnection.accountId) {
    throw new DeploymentConflictError("AWS connection account is missing before destroy");
  }

  if (deployment.approvedAwsAccountId !== input.currentAwsConnection.accountId) {
    throw new DeploymentConflictError("AWS account changed before destroy");
  }

  if (deployment.approvedAwsRegion !== input.currentAwsConnection.region) {
    throw new DeploymentConflictError("AWS region changed before destroy");
  }

  if (deployment.approvedTfplanHash !== input.currentTfplanHash) {
    throw new DeploymentConflictError("Terraform plan changed before destroy");
  }
}

function assertDeploymentCanBeApproved(
  deployment: DeploymentRecord
): asserts deployment is DeploymentRecord & {
  currentPlanArtifactId: string;
  planSummary: NonNullable<DeploymentRecord["planSummary"]>;
} {
  if (deployment.status === "RUNNING") {
    throw new DeploymentConflictError("Running deployment cannot be approved");
  }

  if (!deployment.currentPlanArtifactId || !deployment.planSummary) {
    throw new DeploymentConflictError("Terraform Plan must be completed before approval");
  }

  const isActualPlanBlock =
    (deployment.isBlocked || deployment.planSummary.blocked) &&
    deployment.blockedBy !== "missing_approval";

  if (isActualPlanBlock) {
    throw new DeploymentConflictError(
      deployment.blockedReason ?? "Blocked deployment plan cannot be approved"
    );
  }

  if (requiresTerraformImportSafetyReplan(deployment.planSummary)) {
    throw new DeploymentConflictError(
      "Terraform import Plan must be regenerated before approval"
    );
  }
}

function getApprovedDeploymentStatus(
  deployment: DeploymentRecord,
  operation: DeploymentPlanArtifactRecord["operation"]
): "PENDING" | "SUCCESS" | "FAILED" {
  if (operation === "apply") {
    if (deployment.status !== "PENDING") {
      throw new DeploymentConflictError("Terraform apply plan can only be approved while pending");
    }

    return "PENDING";
  }

  if (deployment.status === "SUCCESS" || deployment.status === "FAILED") {
    return deployment.status;
  }

  throw new DeploymentConflictError("Terraform destroy plan cannot be approved in this state");
}

function assertDeploymentApprovalSnapshot(
  deployment: DeploymentRecord,
  operation: "apply" | "destroy"
): asserts deployment is DeploymentRecord & {
  approvedTerraformArtifactId: string;
  approvedPlanArtifactId: string;
  approvedTerraformArtifactHash: string;
  approvedTfplanHash: string;
  approvedAwsAccountId: string;
  approvedAwsRegion: string;
} {
  const missingFields = getMissingApprovalSnapshotFields(deployment);

  if (missingFields.length > 0) {
    const message = `Deployment approval snapshot is incomplete before ${operation}: missing ${missingFields.join(", ")}`;

    if (operation === "apply") {
      throw new DeploymentApplyPreconditionError("approval_snapshot", message);
    }

    throw new DeploymentConflictError(message);
  }
}

function getMissingApprovalSnapshotFields(deployment: DeploymentRecord): string[] {
  const snapshotFields: Array<readonly [string, unknown]> = [
    ["approvedAt", deployment.approvedAt],
    ["approvedByUserId", deployment.approvedByUserId],
    ["approvedTerraformArtifactId", deployment.approvedTerraformArtifactId],
    ["approvedPlanArtifactId", deployment.approvedPlanArtifactId],
    ["approvedTerraformArtifactHash", deployment.approvedTerraformArtifactHash],
    ["approvedTfplanHash", deployment.approvedTfplanHash],
    ["approvedAwsAccountId", deployment.approvedAwsAccountId],
    ["approvedAwsRegion", deployment.approvedAwsRegion]
  ];

  if (deployment.preparedSnapshotHash) {
    snapshotFields.push([
      "approvedPreparedSnapshotHash",
      deployment.approvedPreparedSnapshotHash
    ]);
  }

  return snapshotFields.filter(([, value]) => !value).map(([field]) => field);
}

function assertPreparedSnapshotMatchesApproval(
  deployment: DeploymentRecord,
  operation: "apply" | "destroy"
): void {
  if (
    deployment.preparedSnapshotHash === null ||
    deployment.approvedPreparedSnapshotHash === deployment.preparedSnapshotHash
  ) {
    return;
  }

  const message = `Prepared project draft changed after approval before ${operation}`;
  if (operation === "apply") {
    throw new DeploymentApplyPreconditionError("approval_snapshot", message);
  }

  throw new DeploymentConflictError(message);
}

async function requireDeploymentAwsConnection(
  deployment: DeploymentRecord,
  accessContext: ProjectAccessContext,
  repository: DeploymentRepository
): Promise<AwsConnection & { accountId: string }> {
  if (!deployment.awsConnectionId) {
    throw new DeploymentNotFoundError("Deployment AWS connection is missing");
  }

  const awsConnection = await repository.findVerifiedAwsConnectionById(
    deployment.awsConnectionId,
    accessContext
  );

  if (!awsConnection || !awsConnection.accountId) {
    throw new DeploymentNotFoundError("Verified AWS connection not found for deployment");
  }

  return {
    ...awsConnection,
    accountId: awsConnection.accountId
  };
}

async function findCurrentReleaseCandidate(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
): Promise<ReleaseCandidateRecord | undefined> {
  if (deployment.scope === "infrastructure") return undefined;
  if (!deployment.releaseCandidateId || !repository.findReleaseCandidateById) {
    throw new DeploymentConflictError(
      "A finalized ReleaseCandidate is required before application approval"
    );
  }
  return repository.findReleaseCandidateById(deployment.releaseCandidateId);
}

function assertReleaseCandidateSnapshot(
  deployment: DeploymentRecord,
  candidate: ReleaseCandidateRecord | undefined,
  now: Date,
  requireApprovedSnapshot = false
): void {
  if (deployment.scope === "infrastructure") return;
  if (
    !candidate ||
    candidate.id !== deployment.releaseCandidateId ||
    candidate.projectId !== deployment.projectId ||
    candidate.deploymentId !== deployment.id ||
    candidate.pipelineRunId !== null ||
    candidate.status !== "pending" ||
    candidate.expiresAt <= now
  ) {
    throw new DeploymentApplyPreconditionError(
      "release_candidate",
      "ReleaseCandidate changed or expired; run preflight and approve the new result"
    );
  }
  const expectedSnapshot = createPreparedReleaseSnapshotHash({
    candidateId: candidate.id,
    commitSha: candidate.commitSha,
    compositeDigest: candidate.compositeDigest,
    configFingerprint: candidate.configFingerprint
  });
  if (
    deployment.preparedSnapshotHash !== expectedSnapshot ||
    (requireApprovedSnapshot && deployment.approvedPreparedSnapshotHash !== expectedSnapshot)
  ) {
    throw new DeploymentApplyPreconditionError(
      "release_candidate",
      "Approved ReleaseCandidate digest or build configuration no longer matches"
    );
  }
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function formatShortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}...` : hash;
}
