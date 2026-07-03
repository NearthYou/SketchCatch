import { createHash } from "node:crypto";
import type {
  ApproveDeploymentPlanRequest,
  AwsConnection,
  DeploymentFailureStage,
  DeploymentStatus
} from "@sketchcatch/types";
import {
  assertAwsApplyPreconditions,
  AwsConnectionRuntimeCredentialsError
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  defaultTerraformArtifactMaxBytes,
  downloadTerraformArtifactFromS3
} from "./terraform-workspace.js";
import { assertTerraformArtifactIsSafe } from "./terraform-artifact-safety.js";
import {
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  type DeploymentPlanArtifactRecord,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";

export type ApproveDeploymentPlanInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  acknowledgedWarningIds?: ApproveDeploymentPlanRequest["acknowledgedWarningIds"];
};

export type ApproveDeploymentPlanOptions = {
  downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
  now?: () => Date;
};

export type AssertDeploymentApplyPreconditionsInput = {
  deployment: DeploymentRecord;
  currentPlanArtifact: DeploymentPlanArtifactRecord;
  currentTerraformArtifactHash: string;
  currentTfplanHash: string;
  currentAwsConnection: AwsConnection;
};

export type AssertDeploymentDestroyPreconditionsInput = AssertDeploymentApplyPreconditionsInput & {
  sourceStatus: DeploymentStatus;
  sourceFailureStage: DeploymentFailureStage | null;
};

export async function approveDeploymentPlan(
  input: ApproveDeploymentPlanInput,
  repository: DeploymentRepository,
  options: ApproveDeploymentPlanOptions = {}
): Promise<DeploymentRecord> {
  const downloadTerraformArtifact =
    options.downloadTerraformArtifact ??
    ((objectKey: string) =>
      downloadTerraformArtifactFromS3(objectKey, { maxBytes: defaultTerraformArtifactMaxBytes }));
  const now = options.now ?? (() => new Date());
  const deployment = await getDeployment(input, repository);

  assertDeploymentCanBeApproved(deployment);
  assertDeploymentWarningsCanBeApproved(deployment, input.acknowledgedWarningIds ?? []);

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

  const terraformArtifactContent = await downloadTerraformArtifact(terraformArtifact.objectKey);

  assertTerraformArtifactIsSafe(terraformArtifactContent);

  const terraformArtifactHash = createSha256(terraformArtifactContent);
  const plannedTerraformArtifactSha256 = currentPlanArtifact.terraformArtifactSha256;

  if (!plannedTerraformArtifactSha256) {
    throw new DeploymentConflictError("Terraform Plan must be regenerated before approval");
  }

  if (terraformArtifactHash !== plannedTerraformArtifactSha256) {
    throw new DeploymentConflictError("Terraform artifact changed after plan");
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

export function assertDeploymentApplyPreconditions(
  input: AssertDeploymentApplyPreconditionsInput
): void {
  const deployment = input.deployment;

  assertDeploymentApprovalSnapshot(deployment);

  if (input.currentPlanArtifact.operation !== "apply") {
    throw new DeploymentConflictError("Terraform apply plan is required before apply");
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
    throw new DeploymentConflictError("AWS connection account is missing before apply");
  }

  try {
    assertAwsApplyPreconditions({
      approvedAccountId: deployment.approvedAwsAccountId,
      currentAccountId: input.currentAwsConnection.accountId,
      approvedRegion: deployment.approvedAwsRegion,
      currentRegion: input.currentAwsConnection.region,
      approvedTfplanHash: deployment.approvedTfplanHash,
      currentTfplanHash: input.currentTfplanHash
    });
  } catch (error) {
    if (error instanceof AwsConnectionRuntimeCredentialsError) {
      throw new DeploymentConflictError(error.message);
    }

    throw error;
  }
}

export function assertDeploymentDestroyPreconditions(
  input: AssertDeploymentDestroyPreconditionsInput
): void {
  const deployment = input.deployment;

  assertDeploymentApprovalSnapshot(deployment);

  if (input.currentPlanArtifact.operation !== "destroy") {
    throw new DeploymentConflictError("Terraform destroy plan is required before destroy");
  }

  if (
    input.sourceStatus !== "SUCCESS" &&
    !(
      input.sourceStatus === "FAILED" &&
      (input.sourceFailureStage === "apply" || input.sourceFailureStage === "destroy")
    )
  ) {
    throw new DeploymentConflictError("Deployment cannot be destroyed in this state");
  }

  if (deployment.isBlocked) {
    throw new DeploymentConflictError("Blocked deployment cannot be destroyed");
  }

  if (!deployment.stateObjectKey) {
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

  if (!deployment.isBlocked || deployment.blockedBy !== "missing_approval") {
    throw new DeploymentConflictError("Blocked deployment cannot be approved");
  }
}

function assertDeploymentWarningsCanBeApproved(
  deployment: DeploymentRecord & {
    planSummary: NonNullable<DeploymentRecord["planSummary"]>;
  },
  acknowledgedWarningIds: readonly string[]
): void {
  const blockingWarning = deployment.planSummary.warnings.find(
    (warning) => warning.blocksApproval
  );

  if (blockingWarning) {
    throw new DeploymentConflictError("High risk deployment warnings cannot be approved");
  }

  const acknowledged = new Set(acknowledgedWarningIds);
  const missingAcknowledgements = deployment.planSummary.warnings
    .filter((warning) => warning.requiresAcknowledgement)
    .map((warning) => warning.id)
    .filter((warningId) => !acknowledged.has(warningId));

  if (missingAcknowledgements.length > 0) {
    throw new DeploymentConflictError(
      `Deployment warnings must be acknowledged before approval: ${missingAcknowledgements.join(", ")}`
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
  deployment: DeploymentRecord
): asserts deployment is DeploymentRecord & {
  approvedTerraformArtifactId: string;
  approvedPlanArtifactId: string;
  approvedTerraformArtifactHash: string;
  approvedTfplanHash: string;
  approvedAwsAccountId: string;
  approvedAwsRegion: string;
} {
  if (
    !deployment.approvedAt ||
    !deployment.approvedByUserId ||
    !deployment.approvedTerraformArtifactId ||
    !deployment.approvedPlanArtifactId ||
    !deployment.approvedTerraformArtifactHash ||
    !deployment.approvedTfplanHash ||
    !deployment.approvedAwsAccountId ||
    !deployment.approvedAwsRegion
  ) {
    throw new DeploymentConflictError("Deployment approval is required before apply");
  }
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

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}
