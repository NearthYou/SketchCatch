import { join } from "node:path";
import type { DeploymentApplyArtifactStorage } from "./deployment-apply-artifact-storage.js";
import {
  DeploymentConflictError,
  DeploymentNotFoundError,
  type DeploymentRecord,
  type DeploymentRepository
} from "./deployment-service.js";
import type { PreparedTerraformWorkspace } from "./terraform-workspace.js";

type RollbackStateStorage = Pick<DeploymentApplyArtifactStorage, "downloadDeploymentState">;

export async function restoreInfrastructureRollbackState(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  storage: RollbackStateStorage;
  workspace: PreparedTerraformWorkspace;
  writeStateFile(path: string, content: Buffer): Promise<void>;
}): Promise<void> {
  const { deployment } = input;
  if (!deployment.rollbackOfDeploymentId && !deployment.rollbackTargetDeploymentId) return;
  if (!deployment.rollbackOfDeploymentId || !deployment.rollbackTargetDeploymentId) {
    throw new DeploymentConflictError("Infrastructure rollback provenance is incomplete");
  }
  if (deployment.scope !== "infrastructure") {
    throw new DeploymentConflictError("Infrastructure rollback must use infrastructure scope");
  }

  const [source, target, projectDeployments] = await Promise.all([
    input.repository.findDeploymentById(deployment.rollbackOfDeploymentId),
    input.repository.findDeploymentById(deployment.rollbackTargetDeploymentId),
    input.repository.listDeploymentsByProject(deployment.projectId)
  ]);
  if (!source || !target) {
    throw new DeploymentNotFoundError("Infrastructure rollback source or target was not found");
  }
  assertRollbackLineage(deployment, source, target, projectDeployments);

  const state = await input.storage.downloadDeploymentState({
    deploymentId: source.id,
    objectKey: source.stateObjectKey!
  });
  await input.writeStateFile(join(input.workspace.workdir, "terraform.tfstate"), state);
}

function assertRollbackLineage(
  deployment: DeploymentRecord,
  source: DeploymentRecord,
  target: DeploymentRecord,
  projectDeployments: readonly DeploymentRecord[]
): void {
  if (
    source.projectId !== deployment.projectId ||
    target.projectId !== deployment.projectId ||
    source.awsAccountIdSnapshot !== deployment.awsAccountIdSnapshot ||
    target.awsAccountIdSnapshot !== deployment.awsAccountIdSnapshot ||
    source.awsRegionSnapshot !== deployment.awsRegionSnapshot ||
    target.awsRegionSnapshot !== deployment.awsRegionSnapshot
  ) {
    throw new DeploymentConflictError(
      "Infrastructure rollback source, target, account, or region no longer matches"
    );
  }
  if (!source.stateObjectKey) {
    throw new DeploymentConflictError("Infrastructure rollback current state is unavailable");
  }
  if (
    target.status !== "SUCCESS" ||
    target.scope === "application" ||
    !target.stateObjectKey ||
    target.architectureId !== deployment.architectureId ||
    target.terraformArtifactId !== deployment.terraformArtifactId
  ) {
    throw new DeploymentConflictError(
      "Infrastructure rollback target is no longer an intact successful Terraform version"
    );
  }
  const newerStateBearingDeployment = projectDeployments.find(
    (candidate) =>
      candidate.id !== deployment.id &&
      candidate.id !== source.id &&
      candidate.status !== "DESTROYED" &&
      candidate.stateObjectKey !== null &&
      candidate.awsAccountIdSnapshot === source.awsAccountIdSnapshot &&
      candidate.awsRegionSnapshot === source.awsRegionSnapshot &&
      candidate.createdAt.getTime() > source.createdAt.getTime()
  );
  if (newerStateBearingDeployment) {
    throw new DeploymentConflictError(
      "Infrastructure rollback source is stale because a newer applied state exists"
    );
  }
}
