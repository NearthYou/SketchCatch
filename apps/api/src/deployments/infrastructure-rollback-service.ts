import { randomUUID } from "node:crypto";
import {
  createDeployment,
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";

export type PrepareInfrastructureRollbackInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
};

export async function prepareInfrastructureRollback(
  input: PrepareInfrastructureRollbackInput,
  repository: DeploymentRepository,
  generateId: () => string = randomUUID
): Promise<DeploymentRecord> {
  const source = await getDeployment(input, repository);
  assertRollbackSource(source);

  const runningDeployment = await repository.findRunningDeploymentInProject(source.projectId);
  if (runningDeployment) {
    throw new DeploymentConflictError(
      "Infrastructure rollback cannot be prepared while another deployment is running"
    );
  }

  const projectDeployments = await repository.listDeploymentsByProject(source.projectId);
  assertRollbackSourceIsCurrent(source, projectDeployments);
  const target = selectInfrastructureRollbackTarget(source, projectDeployments);
  if (!target) {
    throw new DeploymentNotFoundError(
      "No previous successful infrastructure deployment is available for rollback"
    );
  }

  return createDeployment(
    {
      projectId: source.projectId,
      accessContext: input.accessContext,
      architectureId: target.architectureId,
      terraformArtifactId: target.terraformArtifactId,
      awsConnectionId: source.awsConnectionId!,
      liveProfile: target.liveProfile,
      scope: "infrastructure",
      targetKind: target.targetKind,
      source: "direct",
      rollbackOfDeploymentId: source.id,
      rollbackTargetDeploymentId: target.id
    },
    repository,
    generateId
  );
}

export function selectInfrastructureRollbackTarget(
  source: DeploymentRecord,
  deployments: readonly DeploymentRecord[]
): DeploymentRecord | null {
  const sourceCreatedAt = source.createdAt.getTime();
  return (
    deployments
      .filter(
        (candidate) =>
          candidate.id !== source.id &&
          candidate.projectId === source.projectId &&
          candidate.status === "SUCCESS" &&
          candidate.scope !== "application" &&
          candidate.stateObjectKey !== null &&
          candidate.awsAccountIdSnapshot === source.awsAccountIdSnapshot &&
          candidate.awsRegionSnapshot === source.awsRegionSnapshot &&
          candidate.createdAt.getTime() < sourceCreatedAt
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
  );
}

function assertRollbackSource(source: DeploymentRecord): void {
  if (source.scope === "application") {
    throw new DeploymentConflictError(
      "Application-only deployments cannot be used as an infrastructure rollback source"
    );
  }
  const isRollbackEligibleStatus =
    source.status === "SUCCESS" ||
    (source.status === "FAILED" &&
      (source.failureStage === "apply" || source.failureStage === "destroy"));
  if (!isRollbackEligibleStatus) {
    throw new DeploymentConflictError(
      `Infrastructure rollback cannot be prepared from deployment status ${source.status}`
    );
  }
  if (!source.stateObjectKey) {
    throw new DeploymentConflictError(
      "Infrastructure rollback requires the current Terraform state from an applied deployment"
    );
  }
  if (
    !source.awsConnectionId ||
    !source.awsAccountIdSnapshot ||
    !source.awsRegionSnapshot
  ) {
    throw new DeploymentConflictError(
      "Infrastructure rollback requires the original verified AWS connection and account snapshot"
    );
  }
}

function assertRollbackSourceIsCurrent(
  source: DeploymentRecord,
  deployments: readonly DeploymentRecord[]
): void {
  const newerStateBearingDeployment = deployments.find(
    (candidate) =>
      candidate.id !== source.id &&
      candidate.projectId === source.projectId &&
      candidate.status !== "DESTROYED" &&
      candidate.stateObjectKey !== null &&
      candidate.awsAccountIdSnapshot === source.awsAccountIdSnapshot &&
      candidate.awsRegionSnapshot === source.awsRegionSnapshot &&
      candidate.createdAt.getTime() > source.createdAt.getTime()
  );
  if (newerStateBearingDeployment) {
    throw new DeploymentConflictError(
      "The selected infrastructure rollback source is no longer current"
    );
  }
}
