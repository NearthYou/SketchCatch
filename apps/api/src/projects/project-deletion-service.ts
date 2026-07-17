import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type {
  DeleteProjectRequest,
  DeleteProjectResponse,
  DeploymentFailureStage,
  DeploymentScope,
  DeploymentStatus,
  ProjectDeleteAction,
  ProjectDeleteCleanupStatus,
  ProjectDeletePreview
} from "@sketchcatch/types";
import type {
  AwsConnectionRecord,
  CleanupAwsConnectionManagedResources
} from "../aws-connections/aws-connection-service.js";
import type { Database } from "../db/client.js";
import {
  architectures,
  awsConnections,
  deployedResources,
  deploymentJobs,
  deploymentLogs,
  deploymentPlanArtifacts,
  deployments,
  gitCicdHandoffs,
  projectAssets,
  projectBuildEnvironments,
  projectDrafts,
  projectExecutionLeases,
  projects,
  releaseCandidates,
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
  scope: DeploymentScope;
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
  candidateObjectVersions: Array<{ objectKey: string; versionId: string }>;
  hasActiveDeploymentJob: boolean;
  hasActiveExecutionLease: boolean;
  managedBuildEnvironment: {
    connection: AwsConnectionRecord;
    codeBuildProjectName: string;
    codeBuildServiceRoleArn: string;
  } | null;
};

export type ProjectDeletionStorage = {
  deleteObject(objectKey: string): Promise<void>;
  deleteObjectVersion?(objectKey: string, versionId: string): Promise<void>;
  deletePrefix?(input: { prefix: string }): Promise<void>;
};

export type DeleteProjectRecordsInput = {
  db: Database;
  projectId: string;
  userId: string;
  action: DeleteProjectRequest["action"];
  storage: ProjectDeletionStorage;
  cleanupManagedResources?: CleanupAwsConnectionManagedResources;
  deletionGuard?: ProjectDeletionGuard;
};

export type ProjectDeletionClaim = {
  startedAt: Date;
};

export type ProjectDeletionGuard = {
  claim(input: {
    projectId: string;
    userId: string;
    now: Date;
  }): Promise<ProjectDeletionClaim | undefined>;
  release(input: {
    projectId: string;
    userId: string;
    claim: ProjectDeletionClaim;
  }): Promise<void>;
  markCleanupFailed?(input: {
    projectId: string;
    userId: string;
    claim: ProjectDeletionClaim;
    errorSummary: string;
  }): Promise<void>;
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

export class ProjectDeletionManagedCleanupError extends Error {
  readonly statusCode = 502;
  readonly errorCode = "managed_cleanup_failed";
  readonly exposeMessage = true;

  constructor(message: string) {
    super(message);
    this.name = "ProjectDeletionManagedCleanupError";
  }
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
  const deletionGuard = input.deletionGuard ?? createPostgresProjectDeletionGuard(input.db);
  const claim = await deletionGuard.claim({
    projectId: input.projectId,
    userId: input.userId,
    now: new Date()
  });
  if (!claim) throw new ProjectDeletionNotFoundError();

  try {
    await cleanupProjectManagedBuildEnvironment(snapshot, input.cleanupManagedResources);
    const objectKeys = collectProjectDeletionObjectKeys(snapshot);

    if (input.storage.deletePrefix) {
      await cleanupProjectArtifactPrefixes(input.storage, snapshot);
    } else {
      await cleanupCandidateObjectVersions(input.storage, snapshot.candidateObjectVersions);
      await deleteObjectsOrThrow(input.storage, objectKeys);
    }

    await deleteProjectDatabaseRows({
      db: input.db,
      deletionStartedAt: claim.startedAt,
      deploymentIds: snapshot.deployments.map((deployment) => deployment.id),
      projectId: input.projectId,
      userId: input.userId
    });

    return {
      deleted: true,
      cleanup: createCleanupResult(objectKeys.length, 0)
    };
  } catch (error) {
    await deletionGuard.markCleanupFailed?.({
      projectId: input.projectId,
      userId: input.userId,
      claim,
      errorSummary: error instanceof Error ? error.message : "Project cleanup failed"
    });
    throw error;
  }
}

export function createPostgresProjectDeletionGuard(db: Database): ProjectDeletionGuard {
  return {
    async claim(input) {
      return db.transaction(async (transaction) => {
        const [project] = await transaction
          .select({
            id: projects.id,
            deletionStartedAt: projects.deletionStartedAt,
            deletionErrorSummary: projects.deletionErrorSummary
          })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)))
          .for("update");
        if (!project) return undefined;
        if (project.deletionStartedAt && project.deletionErrorSummary) {
          const [reclaimed] = await transaction
            .update(projects)
            .set({ deletionErrorSummary: null, updatedAt: input.now })
            .where(
              and(
                eq(projects.id, input.projectId),
                eq(projects.userId, input.userId),
                eq(projects.deletionStartedAt, project.deletionStartedAt)
              )
            )
            .returning({ startedAt: projects.deletionStartedAt });
          return reclaimed?.startedAt ? { startedAt: reclaimed.startedAt } : undefined;
        }
        if (project.deletionStartedAt) {
          throw new ProjectDeletionConflictError("프로젝트 삭제가 이미 진행 중입니다.");
        }

        const [activeLease, runningDeployment, activeDeploymentJob, preparingBuildEnvironment] =
          await Promise.all([
          transaction
            .select({ projectId: projectExecutionLeases.projectId })
            .from(projectExecutionLeases)
            .where(
              and(
                eq(projectExecutionLeases.projectId, input.projectId),
                eq(projectExecutionLeases.status, "active")
              )
            )
            .limit(1),
          transaction
            .select({ id: deployments.id })
            .from(deployments)
            .where(
              and(
                eq(deployments.projectId, input.projectId),
                or(eq(deployments.status, "RUNNING"), isNotNull(deployments.activeStage))
              )
            )
            .limit(1),
          transaction
            .select({ id: deploymentJobs.id })
            .from(deploymentJobs)
            .innerJoin(deployments, eq(deployments.id, deploymentJobs.deploymentId))
            .where(
              and(
                eq(deployments.projectId, input.projectId),
                inArray(deploymentJobs.status, ["QUEUED", "DISPATCHING", "RUNNING"])
              )
            )
            .limit(1),
          transaction
            .select({ id: projectBuildEnvironments.id })
            .from(projectBuildEnvironments)
            .where(
              and(
                eq(projectBuildEnvironments.projectId, input.projectId),
                eq(projectBuildEnvironments.status, "preparing")
              )
            )
            .limit(1)
        ]);
        if (
          activeLease.length > 0 ||
          runningDeployment.length > 0 ||
          activeDeploymentJob.length > 0 ||
          preparingBuildEnvironment.length > 0
        ) {
          throw new ProjectDeletionConflictError(
            "현재 배포 또는 앱 릴리즈가 진행 중입니다. 완료되거나 취소된 뒤 프로젝트를 삭제해 주세요."
          );
        }

        const [claimed] = await transaction
          .update(projects)
          .set({ deletionStartedAt: input.now, updatedAt: input.now })
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.userId, input.userId),
              isNull(projects.deletionStartedAt)
            )
          )
          .returning({ startedAt: projects.deletionStartedAt });
        return claimed?.startedAt ? { startedAt: claimed.startedAt } : undefined;
      });
    },

    async release(input) {
      await db
        .update(projects)
        .set({ deletionStartedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, input.userId),
            eq(projects.deletionStartedAt, input.claim.startedAt)
          )
        );
    },
    async markCleanupFailed(input) {
      await db
        .update(projects)
        .set({
          deletionErrorSummary: input.errorSummary.slice(0, 500),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, input.userId),
            eq(projects.deletionStartedAt, input.claim.startedAt)
          )
        );
    }
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

  if (snapshot.hasActiveExecutionLease || snapshot.hasActiveDeploymentJob) {
    return buildPreview({
      activeDeploymentCount: activeResourceDeployments.length,
      activeDeploymentId: null,
      activeResourceCount,
      availableActions: [],
      hasDeploymentHistory,
      hasPlanHistory,
      latestDeploymentStatus: latestDeployment?.status ?? null,
      message: "현재 앱 릴리즈 또는 CI/CD 배포가 진행 중입니다. 완료되거나 취소된 뒤 프로젝트를 삭제할 수 있습니다.",
      mode: "blocked_running_deployment",
      projectId: snapshot.projectId
    });
  }

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

    if (activeDeployment.scope !== "application" && !activeDeployment.stateObjectKey) {
      return buildPreview({
        activeDeploymentCount: 1,
        activeDeploymentId: null,
        activeResourceCount,
        availableActions: ["delete_project_only"],
        hasDeploymentHistory,
        hasPlanHistory,
        latestDeploymentStatus: latestDeployment?.status ?? null,
        message:
          "Terraform state 저장이 완료되지 않아 리소스 포함 삭제를 시작할 수 없습니다. 배포 정리가 끝난 뒤 다시 시도하거나 AWS 리소스를 남긴 채 프로젝트 기록만 삭제할 수 있습니다.",
        mode: "active_resources",
        projectId: snapshot.projectId
      });
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
  const [
    resourceRows,
    planArtifacts,
    assetRows,
    buildEnvironmentRows,
    candidateRows,
    executionLeaseRows,
    activeDeploymentJobRows
  ] = await Promise.all([
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
    input.db.select().from(projectAssets).where(eq(projectAssets.projectId, input.projectId)),
    input.db
      .select({
        awsConnectionId: projectBuildEnvironments.awsConnectionId,
        codeBuildProjectName: projectBuildEnvironments.codeBuildProjectName,
        codeBuildServiceRoleArn: projectBuildEnvironments.codeBuildServiceRoleArn
      })
      .from(projectBuildEnvironments)
      .where(eq(projectBuildEnvironments.projectId, input.projectId)),
    input.db
      .select({
        apiArchiveObjectKey: releaseCandidates.apiArchiveObjectKey,
        apiArchiveObjectVersionId: releaseCandidates.apiArchiveObjectVersionId,
        frontendArchiveObjectKey: releaseCandidates.frontendArchiveObjectKey,
        frontendArchiveObjectVersionId: releaseCandidates.frontendArchiveObjectVersionId,
        frontendManifestObjectKey: releaseCandidates.frontendManifestObjectKey,
        frontendManifestObjectVersionId: releaseCandidates.frontendManifestObjectVersionId,
        manifestObjectKey: releaseCandidates.manifestObjectKey,
        manifestObjectVersionId: releaseCandidates.manifestObjectVersionId
      })
      .from(releaseCandidates)
      .where(eq(releaseCandidates.projectId, input.projectId)),
    input.db
      .select({ projectId: projectExecutionLeases.projectId })
      .from(projectExecutionLeases)
      .where(
        and(
          eq(projectExecutionLeases.projectId, input.projectId),
          eq(projectExecutionLeases.status, "active")
        )
      ),
    deploymentIds.length > 0
      ? input.db
          .select({ id: deploymentJobs.id })
          .from(deploymentJobs)
          .where(
            and(
              inArray(deploymentJobs.deploymentId, deploymentIds),
              inArray(deploymentJobs.status, ["QUEUED", "DISPATCHING", "RUNNING"])
            )
          )
      : []
  ]);
  const buildEnvironment = buildEnvironmentRows[0];
  const buildEnvironmentConnectionId = buildEnvironment?.awsConnectionId;
  const [managedConnection] = buildEnvironmentConnectionId
    ? await input.db
        .select()
        .from(awsConnections)
        .where(
          and(
            eq(awsConnections.id, buildEnvironmentConnectionId),
            eq(awsConnections.userId, input.userId)
          )
        )
    : [];
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
    projectAssets: assetRows,
    candidateObjectVersions: candidateRows.flatMap((candidate) => [
      {
        objectKey: candidate.apiArchiveObjectKey,
        versionId: candidate.apiArchiveObjectVersionId
      },
      {
        objectKey: candidate.frontendArchiveObjectKey,
        versionId: candidate.frontendArchiveObjectVersionId
      },
      {
        objectKey: candidate.frontendManifestObjectKey,
        versionId: candidate.frontendManifestObjectVersionId
      },
      {
        objectKey: candidate.manifestObjectKey,
        versionId: candidate.manifestObjectVersionId
      }
    ]),
    hasActiveDeploymentJob: activeDeploymentJobRows.length > 0,
    hasActiveExecutionLease: executionLeaseRows.length > 0,
    managedBuildEnvironment:
      buildEnvironment && managedConnection
        ? {
            connection: managedConnection,
            codeBuildProjectName: buildEnvironment.codeBuildProjectName,
            codeBuildServiceRoleArn: buildEnvironment.codeBuildServiceRoleArn
          }
        : null
  };
}

async function cleanupCandidateObjectVersions(
  storage: ProjectDeletionStorage,
  objects: ReadonlyArray<{ objectKey: string; versionId: string }>
): Promise<void> {
  const uniqueObjects = [
    ...new Map(objects.map((object) => [`${object.objectKey}\0${object.versionId}`, object])).values()
  ];
  const results = await Promise.allSettled(
    uniqueObjects.map((object) =>
      storage.deleteObjectVersion
        ? storage.deleteObjectVersion(object.objectKey, object.versionId)
        : storage.deleteObject(object.objectKey)
    )
  );
  if (results.some((result) => result.status === "rejected")) {
    throw new ProjectDeletionManagedCleanupError(
      "검증된 앱 산출물 정리에 실패했습니다. 내부 S3 상태를 확인한 뒤 다시 삭제해 주세요."
    );
  }
}

async function cleanupProjectManagedBuildEnvironment(
  snapshot: ProjectDeleteSnapshot,
  cleanupManagedResources: CleanupAwsConnectionManagedResources | undefined
): Promise<void> {
  const environment = snapshot.managedBuildEnvironment;
  if (!environment) return;
  if (!cleanupManagedResources) {
    throw new ProjectDeletionManagedCleanupError(
      "프로젝트 CodeBuild 정리 기능을 사용할 수 없어 프로젝트 삭제를 중단했습니다."
    );
  }
  try {
    await cleanupManagedResources({
      connection: environment.connection,
      resources: {
        codeBuildProjects: [
          {
            projectId: snapshot.projectId,
            projectName: environment.codeBuildProjectName,
            serviceRoleArn: environment.codeBuildServiceRoleArn
          }
        ],
        codeConnectionArn: null
      }
    });
  } catch {
    throw new ProjectDeletionManagedCleanupError(
      "프로젝트 CodeBuild와 전용 IAM Role 정리에 실패했습니다. AWS 권한을 확인한 뒤 다시 삭제해 주세요."
    );
  }
}

function toProjectDeleteDeploymentSummary(
  deployment: DeploymentRecord,
  resourceCount: number
): ProjectDeleteDeploymentSummary {
  return {
    id: deployment.id,
    status: deployment.status,
    scope: deployment.scope,
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
  deletionStartedAt: Date;
  deploymentIds: string[];
  projectId: string;
  userId: string;
}): Promise<void> {
  await input.db.transaction(async (tx) => {
    await tx.delete(gitCicdHandoffs).where(eq(gitCicdHandoffs.projectId, input.projectId));

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
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.userId, input.userId),
          eq(projects.deletionStartedAt, input.deletionStartedAt)
        )
      );
  });
}

async function cleanupProjectArtifactPrefixes(
  storage: ProjectDeletionStorage,
  snapshot: ProjectDeleteSnapshot
): Promise<void> {
  if (!storage.deletePrefix) {
    throw new Error("Project artifact prefix deletion is unavailable");
  }

  const prefixes = [
    `projects/${snapshot.projectId}/`,
    ...snapshot.deployments.map((deployment) => `deployments/${deployment.id}/`)
  ];

  try {
    for (const prefix of prefixes) {
      await storage.deletePrefix({ prefix });
    }
  } catch {
    throw new ProjectDeletionManagedCleanupError(
      "SketchCatch 내부 S3 산출물을 모두 삭제하지 못했습니다. 프로젝트 기록은 유지되었으므로 S3 권한을 확인한 뒤 다시 삭제해 주세요."
    );
  }
}

async function deleteObjectsOrThrow(
  storage: ProjectDeletionStorage,
  objectKeys: string[]
): Promise<void> {
  const uniqueObjectKeys = [...new Set(objectKeys)];
  const results = await Promise.allSettled(
    uniqueObjectKeys.map(async (objectKey) => {
      await storage.deleteObject(objectKey);
      return objectKey;
    })
  );

  const failedObjectKeys = results.flatMap((result, index) =>
    result.status === "rejected" ? [uniqueObjectKeys[index] as string] : []
  );

  if (failedObjectKeys.length > 0) {
    throw new ProjectDeletionManagedCleanupError(
      "SketchCatch 내부 산출물을 모두 삭제하지 못했습니다. 프로젝트 기록은 유지되었으므로 저장소 권한을 확인한 뒤 다시 삭제해 주세요."
    );
  }
}

function createCleanupResult(
  objectKeyCount: number,
  failedObjectCount: number
): DeleteProjectResponse["cleanup"] {
  return {
    s3Status: getCleanupStatus(objectKeyCount, failedObjectCount),
    failedObjectCount,
    message:
      failedObjectCount > 0
        ? "프로젝트 기록은 삭제됐지만 일부 SketchCatch 내부 S3 산출물 정리에 실패했습니다. 이 경고는 클라우드 리소스가 남았다는 의미가 아닙니다."
        : null
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
