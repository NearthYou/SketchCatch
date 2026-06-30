import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  architectures,
  deploymentPlanArtifacts,
  deployments,
  projectAssets
} from "../db/schema.js";
import { buildDeploymentStateObjectKey } from "./deployment-apply-artifact-storage.js";
import { buildDeploymentTerraformLockFileObjectKey } from "./terraform-lock-file-storage.js";
import type {
  ArchitectureRecord,
  DeploymentPlanArtifactRecord,
  DeploymentRecord,
  ProjectAssetRecord
} from "./deployment-service.js";

export type DeploymentRetentionPolicy = {
  maxDeploymentRecordsPerProject: number;
  maxUnusedArchitectureSnapshotsPerProject: number;
  maxUnusedTerraformArtifactsPerProject: number;
};

export const defaultDeploymentRetentionPolicy: DeploymentRetentionPolicy = {
  maxDeploymentRecordsPerProject: 20,
  maxUnusedArchitectureSnapshotsPerProject: 5,
  maxUnusedTerraformArtifactsPerProject: 5
};

export type DeploymentRetentionStorage = {
  deleteObject(objectKey: string): Promise<void>;
};

export type CreateS3DeploymentRetentionStorageOptions = {
  bucketName: string;
  s3Client: S3Client;
};

export type ProjectDeploymentStorageSnapshot = {
  deployments: DeploymentRecord[];
  planArtifacts: DeploymentPlanArtifactRecord[];
  projectAssets: ProjectAssetRecord[];
  architectures: ArchitectureRecord[];
};

export type ProjectDeploymentStoragePrunePlan = {
  architectureIdsToDelete: string[];
  deploymentIdsToDelete: string[];
  objectKeysToDelete: string[];
  terraformArtifactIdsToDelete: string[];
};

export type PruneProjectDeploymentStorageInput = {
  db: Database;
  projectId: string;
  storage: DeploymentRetentionStorage;
  policy?: DeploymentRetentionPolicy;
};

export type PruneProjectDeploymentStorageResult = ProjectDeploymentStoragePrunePlan & {
  failedObjectKeys: string[];
};

export function createS3DeploymentRetentionStorage(
  options: CreateS3DeploymentRetentionStorageOptions
): DeploymentRetentionStorage {
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

export async function pruneProjectDeploymentStorage({
  db,
  projectId,
  storage,
  policy = defaultDeploymentRetentionPolicy
}: PruneProjectDeploymentStorageInput): Promise<PruneProjectDeploymentStorageResult> {
  const prunePlan = await db.transaction(async (tx) => {
    const projectDeployments = await tx
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, projectId))
      .orderBy(desc(deployments.createdAt));
    const deploymentIds = projectDeployments.map((deployment) => deployment.id);
    const projectPlanArtifacts =
      deploymentIds.length > 0
        ? await tx
            .select()
            .from(deploymentPlanArtifacts)
            .where(inArray(deploymentPlanArtifacts.deploymentId, deploymentIds))
        : [];
    const projectAssetRows = await tx
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.projectId, projectId));
    const architectureRows = await tx
      .select()
      .from(architectures)
      .where(eq(architectures.projectId, projectId))
      .orderBy(desc(architectures.createdAt));
    const plan = createProjectDeploymentStoragePrunePlan(
      {
        architectures: architectureRows,
        deployments: projectDeployments,
        planArtifacts: projectPlanArtifacts,
        projectAssets: projectAssetRows
      },
      policy
    );

    if (plan.deploymentIdsToDelete.length > 0) {
      await tx.delete(deployments).where(inArray(deployments.id, plan.deploymentIdsToDelete));
    }

    if (plan.terraformArtifactIdsToDelete.length > 0) {
      await tx
        .delete(projectAssets)
        .where(inArray(projectAssets.id, plan.terraformArtifactIdsToDelete));
    }

    if (plan.architectureIdsToDelete.length > 0) {
      await tx.delete(architectures).where(inArray(architectures.id, plan.architectureIdsToDelete));
    }

    return plan;
  });
  const failedObjectKeys = await deleteObjectsBestEffort(storage, prunePlan.objectKeysToDelete);

  return {
    ...prunePlan,
    failedObjectKeys
  };
}

export function createProjectDeploymentStoragePrunePlan(
  snapshot: ProjectDeploymentStorageSnapshot,
  policy: DeploymentRetentionPolicy = defaultDeploymentRetentionPolicy
): ProjectDeploymentStoragePrunePlan {
  const sortedDeployments = [...snapshot.deployments].sort(compareCreatedAtDesc);
  const deploymentIdsToKeep = new Set(
    sortedDeployments
      .slice(0, policy.maxDeploymentRecordsPerProject)
      .map((deployment) => deployment.id)
  );

  for (const deployment of sortedDeployments) {
    if (!isDeploymentRecordPrunable(deployment)) {
      deploymentIdsToKeep.add(deployment.id);
    }
  }

  const deploymentIdsToDelete = sortedDeployments
    .filter((deployment) => !deploymentIdsToKeep.has(deployment.id))
    .map((deployment) => deployment.id);
  const deploymentIdsToDeleteSet = new Set(deploymentIdsToDelete);
  const remainingDeployments = sortedDeployments.filter(
    (deployment) => !deploymentIdsToDeleteSet.has(deployment.id)
  );
  const deletedPlanArtifacts = snapshot.planArtifacts.filter((artifact) =>
    deploymentIdsToDeleteSet.has(artifact.deploymentId)
  );
  const remainingPlanArtifacts = snapshot.planArtifacts.filter(
    (artifact) => !deploymentIdsToDeleteSet.has(artifact.deploymentId)
  );
  const protectedTerraformArtifactIds = new Set<string>();

  for (const deployment of remainingDeployments) {
    protectedTerraformArtifactIds.add(deployment.terraformArtifactId);

    if (deployment.approvedTerraformArtifactId) {
      protectedTerraformArtifactIds.add(deployment.approvedTerraformArtifactId);
    }
  }

  for (const artifact of remainingPlanArtifacts) {
    protectedTerraformArtifactIds.add(artifact.terraformArtifactId);
  }

  const terraformArtifactIdsToDelete = selectPrunableProjectAssets({
    assets: snapshot.projectAssets.filter((asset) => asset.assetType === "terraform_file"),
    maxUnusedAssets: policy.maxUnusedTerraformArtifactsPerProject,
    protectedAssetIds: protectedTerraformArtifactIds
  }).map((asset) => asset.id);
  const terraformArtifactIdsToDeleteSet = new Set(terraformArtifactIdsToDelete);
  const remainingProjectAssets = snapshot.projectAssets.filter(
    (asset) => !terraformArtifactIdsToDeleteSet.has(asset.id)
  );
  const protectedArchitectureIds = new Set<string>();

  for (const deployment of remainingDeployments) {
    protectedArchitectureIds.add(deployment.architectureId);
  }

  for (const asset of remainingProjectAssets) {
    if (asset.architectureId) {
      protectedArchitectureIds.add(asset.architectureId);
    }
  }

  const architectureIdsToDelete = selectPrunableArchitectureSnapshots({
    architectures: snapshot.architectures,
    maxUnusedArchitectures: policy.maxUnusedArchitectureSnapshotsPerProject,
    protectedArchitectureIds
  }).map((architecture) => architecture.id);
  const objectKeysToDelete = new Set<string>();

  for (const deployment of sortedDeployments) {
    if (!deploymentIdsToDeleteSet.has(deployment.id)) {
      continue;
    }

    if (deployment.stateObjectKey) {
      objectKeysToDelete.add(deployment.stateObjectKey);
    }

    objectKeysToDelete.add(buildDeploymentStateObjectKey({ deploymentId: deployment.id }));
    objectKeysToDelete.add(buildDeploymentTerraformLockFileObjectKey({ deploymentId: deployment.id }));
  }

  for (const artifact of deletedPlanArtifacts) {
    objectKeysToDelete.add(artifact.objectKey);
  }

  for (const asset of snapshot.projectAssets) {
    if (terraformArtifactIdsToDeleteSet.has(asset.id)) {
      objectKeysToDelete.add(asset.objectKey);
    }
  }

  return {
    architectureIdsToDelete,
    deploymentIdsToDelete,
    objectKeysToDelete: [...objectKeysToDelete].sort(),
    terraformArtifactIdsToDelete
  };
}

export function selectPrunableProjectAssets({
  assets,
  maxUnusedAssets,
  protectedAssetIds
}: {
  assets: ProjectAssetRecord[];
  maxUnusedAssets: number;
  protectedAssetIds: ReadonlySet<string>;
}): ProjectAssetRecord[] {
  const unusedAssets = [...assets]
    .sort(compareCreatedAtDesc)
    .filter((asset) => !protectedAssetIds.has(asset.id));

  return unusedAssets.slice(maxUnusedAssets);
}

export function selectPrunableArchitectureSnapshots({
  architectures,
  maxUnusedArchitectures,
  protectedArchitectureIds
}: {
  architectures: ArchitectureRecord[];
  maxUnusedArchitectures: number;
  protectedArchitectureIds: ReadonlySet<string>;
}): ArchitectureRecord[] {
  const unusedArchitectures = [...architectures]
    .sort(compareCreatedAtDesc)
    .filter((architecture) => !protectedArchitectureIds.has(architecture.id));

  return unusedArchitectures.slice(maxUnusedArchitectures);
}

export function isDeploymentRecordPrunable(deployment: DeploymentRecord): boolean {
  if (deployment.activeStage !== null || deployment.status === "RUNNING") {
    return false;
  }

  if (deployment.status === "SUCCESS") {
    return false;
  }

  if (deployment.stateObjectKey !== null) {
    return false;
  }

  if (deployment.failureStage === "destroy") {
    return false;
  }

  return ["PENDING", "FAILED", "CANCELLED", "DESTROYED"].includes(deployment.status);
}

async function deleteObjectsBestEffort(
  storage: DeploymentRetentionStorage,
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

function compareCreatedAtDesc(
  left: { createdAt: Date },
  right: { createdAt: Date }
): number {
  return right.createdAt.getTime() - left.createdAt.getTime();
}
