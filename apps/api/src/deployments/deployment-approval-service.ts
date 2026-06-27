import { createHash } from "node:crypto";
import type { AwsConnection } from "@sketchcatch/types";
import {
  assertAwsApplyPreconditions,
  AwsConnectionRuntimeCredentialsError
} from "../aws-connections/aws-connection-runtime-credentials.js";
import { downloadTerraformArtifactFromS3 } from "./terraform-workspace.js";
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
};

export type ApproveDeploymentPlanOptions = {
  downloadTerraformArtifact?: (objectKey: string) => Promise<Buffer | Uint8Array | string>;
  now?: () => Date;
};

export type AssertDeploymentApplyPreconditionsInput = {
  deployment: DeploymentRecord;
  currentPlanArtifact: DeploymentPlanArtifactRecord;
  currentTerraformArtifactHash: string;
  currentAwsConnection: AwsConnection;
};

export async function approveDeploymentPlan(
  input: ApproveDeploymentPlanInput,
  repository: DeploymentRepository,
  options: ApproveDeploymentPlanOptions = {}
): Promise<DeploymentRecord> {
  const downloadTerraformArtifact =
    options.downloadTerraformArtifact ?? downloadTerraformArtifactFromS3;
  const now = options.now ?? (() => new Date());
  const deployment = await getDeployment(input, repository);

  assertDeploymentCanBeApproved(deployment);

  const currentPlanArtifact = await repository.findDeploymentPlanArtifactById(
    deployment.currentPlanArtifactId
  );

  if (!currentPlanArtifact || currentPlanArtifact.deploymentId !== deployment.id) {
    throw new DeploymentConflictError("Current deployment plan artifact not found");
  }

  if (currentPlanArtifact.terraformArtifactId !== deployment.terraformArtifactId) {
    throw new DeploymentConflictError("Terraform artifact changed after plan");
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

  const terraformArtifactHash = createSha256(
    await downloadTerraformArtifact(terraformArtifact.objectKey)
  );
  const approvedDeployment = await repository.approveDeployment(deployment.id, {
    approvedByUserId: input.accessContext.userId,
    approvedAt: now(),
    approvedTerraformArtifactId: deployment.terraformArtifactId,
    approvedPlanArtifactId: currentPlanArtifact.id,
    approvedTerraformArtifactHash: terraformArtifactHash,
    approvedTfplanHash: currentPlanArtifact.sha256,
    approvedAwsAccountId: currentPlanArtifact.accountId,
    approvedAwsRegion: currentPlanArtifact.region,
    planSummary: {
      ...deployment.planSummary,
      blocked: false
    }
  });

  if (!approvedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return approvedDeployment;
}

export function assertDeploymentApplyPreconditions(
  input: AssertDeploymentApplyPreconditionsInput
): void {
  const deployment = input.deployment;

  assertDeploymentApprovalSnapshot(deployment);

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
      currentTfplanHash: input.currentPlanArtifact.sha256
    });
  } catch (error) {
    if (error instanceof AwsConnectionRuntimeCredentialsError) {
      throw new DeploymentConflictError(error.message);
    }

    throw error;
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
