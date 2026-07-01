import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  DeleteProjectRequest,
  DeleteProjectResponse,
  DeploymentFailureStage,
  DeploymentStatus,
  ProjectDeleteAction,
  ProjectDeleteCleanupStatus,
  ProjectDeletePreview
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  architectures,
  deployedResources,
  deploymentLogs,
  deploymentPlanArtifacts,
  deployments,
  projectAssets,
  projectDrafts,
  projects,
  terraformOutputs
} from "../db/schema.js";
import { buildDeploymentStateObjectKey } from "../deployments/deployment-apply-artifact-storage.js";
import { buildDeploymentTerraformLockFileObjectKey } from "../deployments/terraform-lock-file-storage.js";
import type {
  DeploymentPlanArtifactRecord,
  DeploymentRecord,
  ProjectAssetRecord
} from "../deployments/deployment-service.js";

type ProjectDeleteDeploymentSummary = {
  id: string;
  status: DeploymentStatus;
  activeStage: string | null;
  currentPlanArtifactId: string | null;
  stateObjectKey: string | null;
  failureStage: DeploymentFailureStage | null;
  resourceCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type ProjectDeleteSnapshot = {
  projectId: string;
  deployments: ProjectDeleteDeploymentSummary[];
  planArtifacts: DeploymentPlanArtifactRecord[];
  projectAssets: ProjectAssetRecord[];
};

export type ProjectDeletionStorage = {
  deleteObject(objectKey: string): Promise<void>;
};

export type CreateS3ProjectDeletionStorageOptions = {
  bucketName: string;
  s3Client: S3Client;
};

export type DeleteProjectRecordsInput = {
  db: Database;
  projectId: string;
  userId: string;
  action: DeleteProjectRequest["action"];
  storage: ProjectDeletionStorage;
};

export class ProjectDeletionNotFoundError extends Error {
  readonly statusCode = 404;
  readonly errorCode = "not_found";

  constructor(message = "프로젝트를 찾을 수 없습니다.") {
    super(message);
  }
}

export class ProjectDeletionConflictError extends Error {
  readonly statusCode = 409;
  readonly errorCode = "conflict";

  constructor(message: string) {
    super(message);
  }
}

export function createS3ProjectDeletionStorage(
  options: CreateS3ProjectDeletionStorageOptions
): ProjectDeletionStorage {
  return {
    async deleteObject(objectKey) {
      await options.s3Client.send(
        new DeleteObjectCommand({
          Bucket: options.bucketName,
          Key: objectKey
        })
      );
    }
  };
}

export async function getProjectDeletePreview(input: {
  db: Database;
  projectId: string;
  userId: string;
}): Promise<ProjectDeletePreview> {
  const snapshot = await loadProjectDeleteSnapshot(input);

  if (!snapshot) {
    throw new ProjectDeletionNotFoundError();
  }

  return createProjectDeletePreview(snapshot);
}

export async function deleteProjectRecords(
  input: DeleteProjectRecordsInput
): Promise<DeleteProjectResponse> {
  const snapshot = await loadProjectDeleteSnapshot(input);

  if (!snapshot) {
    throw new ProjectDeletionNotFoundError();
  }

  const preview = createProjectDeletePreview(snapshot);
  requireAllowedDeleteAction(preview, input.action);

  const objectKeys = collectProjectDeletionObjectKeys(snapshot);
  const failedObjectKeys = await deleteObjectsBestEffort(input.storage, objectKeys);

  await deleteProjectDatabaseRows({
    db: input.db,
    deploymentIds: snapshot.deployments.map((deployment) => deployment.id),
    projectId: input.projectId,
    userId: input.userId
  });

  return {
    deleted: true,
    cleanup: createCleanupResult(objectKeys.length, failedObjectKeys.length)
  };
}

export function createProjectDeletePreview(snapshot: ProjectDeleteSnapshot): ProjectDeletePreview {
  const deployments = sortDeploymentsDesc(snapshot.deployments);
  const runningDeployments = deployments.filter(
    (deployment) => deployment.status === "RUNNING" || deployment.activeStage !== null
  );
  const activeResourceDeployments = deployments.filter(
    (deployment) =>
      isActiveResourceDeployment(deployment) &&
      !isDeploymentCleanedUpByLaterDestroy(deployment, deployments)
  );
  const latestDeployment = deployments[0];
  const hasDeploymentHistory = deployments.length > 0;
  const hasPlanHistory =
    deployments.some((deployment) => deployment.currentPlanArtifactId !== null) ||
    snapshot.planArtifacts.length > 0;
  const activeResourceCount = activeResourceDeployments.reduce(
    (sum, deployment) => sum + deployment.resourceCount,
    0
  );

  if (runningDeployments.length > 0) {
    return buildPreview({
      activeDeploymentCount: activeResourceDeployments.length,
      activeDeploymentId: null,
      activeResourceCount,
      availableActions: [],
      hasDeploymentHistory,
      hasPlanHistory,
      latestDeploymentStatus: latestDeployment?.status ?? null,
      message: "현재 배포 작업이 진행 중입니다. 작업이 완료되거나 취소된 뒤 프로젝트를 삭제할 수 있습니다.",
      mode: "blocked_running_deployment",
      projectId: snapshot.projectId
    });
  }

  if (activeResourceDeployments.length > 1) {
    return buildPreview({
      activeDeploymentCount: activeResourceDeployments.length,
      activeDeploymentId: null,
      activeResourceCount,
      availableActions: ["delete_project_only"],
      hasDeploymentHistory,
      hasPlanHistory,
      latestDeploymentStatus: latestDeployment?.status ?? null,
      message:
        "정리해야 할 배포 기록이 여러 개입니다. 자동 리소스 포함 삭제는 사용할 수 없으며, 프로젝트만 삭제할 수 있습니다.",
      mode: "blocked_multiple_active_deployments",
      projectId: snapshot.projectId
    });
  }

  if (activeResourceDeployments.length === 1) {
    const activeDeployment = activeResourceDeployments[0];

    if (!activeDeployment) {
      throw new Error("Active deployment classification failed");
    }

    return buildPreview({
      activeDeploymentCount: 1,
      activeDeploymentId: activeDeployment.id,
      activeResourceCount,
      availableActions: ["destroy_then_delete", "delete_project_only"],
      hasDeploymentHistory,
      hasPlanHistory,
      latestDeploymentStatus: latestDeployment?.status ?? null,
      message:
        "현재 AWS에 배포된 리소스가 있습니다. 리소스 포함 삭제를 진행하거나, AWS 리소스를 남긴 채 프로젝트만 삭제할 수 있습니다.",
      mode: "active_resources",
      projectId: snapshot.projectId
    });
  }

  if (deployments.some((deployment) => deployment.status === "DESTROYED")) {
    return buildPreview({
      activeDeploymentCount: 0,
      activeDeploymentId: null,
      activeResourceCount: 0,
      availableActions: ["delete_project"],
      hasDeploymentHistory,
      hasPlanHistory,
      latestDeploymentStatus: latestDeployment?.status ?? null,
      message: "배포된 기록이 있는 프로젝트입니다. 현재 추적 중인 AWS 리소스는 없습니다. 정말 삭제하시겠습니까?",
      mode: "deployment_history",
      projectId: snapshot.projectId
    });
  }

  if (deployments.some((deployment) => deployment.currentPlanArtifactId !== null)) {
    return buildPreview({
      activeDeploymentCount: 0,
      activeDeploymentId: null,
      activeResourceCount: 0,
      availableActions: ["delete_project"],
      hasDeploymentHistory,
      hasPlanHistory,
      latestDeploymentStatus: latestDeployment?.status ?? null,
      message: "현재 PLAN이 완료된 상태입니다. 프로젝트를 삭제하면 PLAN 기록도 함께 삭제됩니다.",
      mode: "planned",
      projectId: snapshot.projectId
    });
  }

  if (hasDeploymentHistory) {
    return buildPreview({
      activeDeploymentCount: 0,
      activeDeploymentId: null,
      activeResourceCount: 0,
      availableActions: ["delete_project"],
      hasDeploymentHistory,
      hasPlanHistory,
      latestDeploymentStatus: latestDeployment?.status ?? null,
      message: "배포 준비 또는 실패 기록이 있는 프로젝트입니다. 프로젝트를 삭제하면 관련 기록도 함께 삭제됩니다.",
      mode: "deployment_history",
      projectId: snapshot.projectId
    });
  }

  return buildPreview({
    activeDeploymentCount: 0,
    activeDeploymentId: null,
    activeResourceCount: 0,
    availableActions: ["delete_project"],
    hasDeploymentHistory,
    hasPlanHistory,
    latestDeploymentStatus: null,
    message: "프로젝트를 삭제하시겠습니까?",
    mode: "plain",
    projectId: snapshot.projectId
  });
}

function buildPreview(input: ProjectDeletePreview): ProjectDeletePreview {
  return input;
}

async function loadProjectDeleteSnapshot(input: {
  db: Database;
  projectId: string;
  userId: string;
}): Promise<ProjectDeleteSnapshot | undefined> {
  const [project] = await input.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)));

  if (!project) {
    return undefined;
  }

  const deploymentRows = await input.db
    .select()
    .from(deployments)
    .where(eq(deployments.projectId, input.projectId))
    .orderBy(desc(deployments.createdAt));
  const deploymentIds = deploymentRows.map((deployment) => deployment.id);
  const [resourceRows, planArtifacts, assetRows] = await Promise.all([
    deploymentIds.length > 0
      ? input.db
          .select({ deploymentId: deployedResources.deploymentId })
          .from(deployedResources)
          .where(inArray(deployedResources.deploymentId, deploymentIds))
      : [],
    deploymentIds.length > 0
      ? input.db
          .select()
          .from(deploymentPlanArtifacts)
          .where(inArray(deploymentPlanArtifacts.deploymentId, deploymentIds))
      : [],
    input.db.select().from(projectAssets).where(eq(projectAssets.projectId, input.projectId))
  ]);
  const resourceCounts = new Map<string, number>();

  for (const resource of resourceRows) {
    resourceCounts.set(resource.deploymentId, (resourceCounts.get(resource.deploymentId) ?? 0) + 1);
  }

  return {
    projectId: input.projectId,
    deployments: deploymentRows.map((deployment) =>
      toProjectDeleteDeploymentSummary(deployment, resourceCounts.get(deployment.id) ?? 0)
    ),
    planArtifacts,
    projectAssets: assetRows
  };
}

function toProjectDeleteDeploymentSummary(
  deployment: DeploymentRecord,
  resourceCount: number
): ProjectDeleteDeploymentSummary {
  return {
    id: deployment.id,
    status: deployment.status,
    activeStage: deployment.activeStage,
    currentPlanArtifactId: deployment.currentPlanArtifactId,
    stateObjectKey: deployment.stateObjectKey,
    failureStage: deployment.failureStage,
    resourceCount,
    createdAt: deployment.createdAt,
    updatedAt: deployment.updatedAt,
    completedAt: deployment.completedAt
  };
}

function requireAllowedDeleteAction(
  preview: ProjectDeletePreview,
  action: Exclude<ProjectDeleteAction, "destroy_then_delete">
): void {
  if (preview.availableActions.includes(action)) {
    return;
  }

  if (preview.mode === "active_resources") {
    throw new ProjectDeletionConflictError(
      "현재 AWS 리소스가 있는 프로젝트입니다. 리소스 포함 삭제를 진행하거나 프로젝트만 삭제를 선택해 주세요."
    );
  }

  if (preview.mode === "blocked_running_deployment") {
    throw new ProjectDeletionConflictError(preview.message);
  }

  if (preview.mode === "blocked_multiple_active_deployments") {
    throw new ProjectDeletionConflictError(
      "정리해야 할 배포 기록이 여러 개입니다. 자동 리소스 포함 삭제는 사용할 수 없습니다."
    );
  }

  throw new ProjectDeletionConflictError("현재 프로젝트 상태에서는 선택한 삭제 방식을 사용할 수 없습니다.");
}

function collectProjectDeletionObjectKeys(snapshot: ProjectDeleteSnapshot): string[] {
  const objectKeys = new Set<string>();

  for (const asset of snapshot.projectAssets) {
    objectKeys.add(asset.objectKey);
  }

  for (const artifact of snapshot.planArtifacts) {
    objectKeys.add(artifact.objectKey);
  }

  for (const deployment of snapshot.deployments) {
    if (deployment.stateObjectKey) {
      objectKeys.add(deployment.stateObjectKey);
    }

    objectKeys.add(buildDeploymentStateObjectKey({ deploymentId: deployment.id }));
    objectKeys.add(buildDeploymentTerraformLockFileObjectKey({ deploymentId: deployment.id }));
  }

  return [...objectKeys].sort();
}

async function deleteProjectDatabaseRows(input: {
  db: Database;
  deploymentIds: string[];
  projectId: string;
  userId: string;
}): Promise<void> {
  await input.db.transaction(async (tx) => {
    if (input.deploymentIds.length > 0) {
      await tx
        .update(deployments)
        .set({
          approvedPlanArtifactId: null,
          currentPlanArtifactId: null
        })
        .where(inArray(deployments.id, input.deploymentIds));
      await tx
        .delete(deploymentLogs)
        .where(inArray(deploymentLogs.deploymentId, input.deploymentIds));
      await tx
        .delete(deployedResources)
        .where(inArray(deployedResources.deploymentId, input.deploymentIds));
      await tx
        .delete(terraformOutputs)
        .where(inArray(terraformOutputs.deploymentId, input.deploymentIds));
      await tx
        .delete(deploymentPlanArtifacts)
        .where(inArray(deploymentPlanArtifacts.deploymentId, input.deploymentIds));
      await tx.delete(deployments).where(inArray(deployments.id, input.deploymentIds));
    }

    await tx.delete(projectAssets).where(eq(projectAssets.projectId, input.projectId));
    await tx.delete(projectDrafts).where(eq(projectDrafts.projectId, input.projectId));
    await tx.delete(architectures).where(eq(architectures.projectId, input.projectId));
    await tx
      .delete(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)));
  });
}

async function deleteObjectsBestEffort(
  storage: ProjectDeletionStorage,
  objectKeys: string[]
): Promise<string[]> {
  const uniqueObjectKeys = [...new Set(objectKeys)];
  const results = await Promise.allSettled(
    uniqueObjectKeys.map(async (objectKey) => {
      await storage.deleteObject(objectKey);
      return objectKey;
    })
  );

  return results.flatMap((result, index) =>
    result.status === "rejected" ? [uniqueObjectKeys[index] as string] : []
  );
}

function createCleanupResult(
  objectKeyCount: number,
  failedObjectCount: number
): DeleteProjectResponse["cleanup"] {
  return {
    s3Status: getCleanupStatus(objectKeyCount, failedObjectCount),
    failedObjectCount,
    message:
      failedObjectCount > 0 ? "일부 SketchCatch 산출물 정리에 실패했습니다." : null
  };
}

function getCleanupStatus(
  objectKeyCount: number,
  failedObjectCount: number
): ProjectDeleteCleanupStatus {
  if (failedObjectCount === 0) {
    return "success";
  }

  return failedObjectCount === objectKeyCount ? "failed" : "partial_failed";
}

function isActiveResourceDeployment(deployment: ProjectDeleteDeploymentSummary): boolean {
  if (deployment.status === "SUCCESS") {
    return deployment.resourceCount > 0;
  }

  return (
    deployment.status === "FAILED" &&
    (deployment.resourceCount > 0 || deployment.stateObjectKey !== null)
  );
}

function isDeploymentCleanedUpByLaterDestroy(
  deployment: ProjectDeleteDeploymentSummary,
  deployments: readonly ProjectDeleteDeploymentSummary[]
): boolean {
  const activeDeploymentCreatedAt = deployment.createdAt.getTime();

  return deployments.some(
    (candidate) =>
      candidate.status === "DESTROYED" &&
      getDeploymentCleanupTime(candidate) > activeDeploymentCreatedAt
  );
}

function getDeploymentCleanupTime(deployment: ProjectDeleteDeploymentSummary): number {
  return deployment.completedAt?.getTime() ?? deployment.updatedAt.getTime();
}

function sortDeploymentsDesc(
  deploymentsToSort: readonly ProjectDeleteDeploymentSummary[]
): ProjectDeleteDeploymentSummary[] {
  return [...deploymentsToSort].sort(compareDeploymentDesc);
}

function compareDeploymentDesc(
  left: ProjectDeleteDeploymentSummary,
  right: ProjectDeleteDeploymentSummary
): number {
  const rightTime = getDeploymentSortTime(right);
  const leftTime = getDeploymentSortTime(left);

  return rightTime - leftTime;
}

function getDeploymentSortTime(deployment: ProjectDeleteDeploymentSummary): number {
  return deployment.completedAt?.getTime() ?? deployment.updatedAt.getTime();
}
