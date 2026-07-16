import type {
  ApplicationReleaseProviderRevision,
  ApplicationReleaseFailureStage,
  ApplicationReleaseStatus,
  CompositeReleaseDigest,
  ConfirmedBuildConfig,
  DeploymentScope,
  DeploymentSource,
  JsonValue,
  FrontendReleaseEvidence,
  ProjectDeploymentRuntimeConfig,
  RuntimeTargetKind
} from "@sketchcatch/types";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  awsCodeConnections,
  awsConnections,
  deployments,
  projectDeploymentTargets,
  projectBuildEnvironments,
  projectExecutionLeases,
  projects,
  releaseCandidates,
  sourceRepositories
} from "../db/schema.js";
import type { LeaseFence } from "../releases/project-execution-lease-service.js";
import { resolveApplicationReleaseVersion } from "../releases/application-release-identity.js";
import { createPreparedReleaseSnapshotHash } from "./deployment-preparation-service.js";
import {
  assertEcsFargateRuntimeInventory,
  createEcsFargateRuntimeCoordinatesFingerprint,
  reconcileEcsFargateRuntimeConfig,
  resolveEcsFargateRuntimeOutputs,
  type ResolvedEcsFargateRuntimeOutputs,
  type TerraformOutputForEcsReconciliation,
  type TerraformResourceForEcsReconciliation
} from "./ecs-fargate-output-reconciliation.js";

export type DirectApplicationReleaseContext = {
  sourceRepository: {
    provider: "github";
    installationId: string;
    owner: string;
    name: string;
  } | null;
  buildEnvironment?: {
    id: string;
    awsConnectionId: string;
    awsCodeConnectionId: string;
    codeConnectionArn: string;
    codeBuildProjectName: string;
    codeBuildServiceRoleArn: string;
    permissionsBoundaryArn: string;
    sourceRepositoryUrl: string;
    runtimeFingerprint: string;
    status: "ready";
  } | null;
  deployment: {
    id: string;
    projectId: string;
    scope: DeploymentScope;
    source: DeploymentSource;
    targetKind: RuntimeTargetKind | null;
  };
  target: {
    runtimeTargetKind: RuntimeTargetKind;
    confirmedBuildConfig: ConfirmedBuildConfig;
    runtimeConfig: ProjectDeploymentRuntimeConfig;
  };
  connection: {
    accountId: string;
    roleArn: string;
    externalId: string;
    region: string;
  };
};

export type DirectApplicationArtifact = {
  commitSha: string;
  digest: string;
  reference: string;
  buildRevisionId: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type ApplicationReleaseRecord = {
  id: string;
  projectId: string;
  deploymentId: string | null;
  pipelineRunId: string | null;
  source: "direct" | "gitops";
  runtimeTargetKind: RuntimeTargetKind;
  version: string;
  commitSha: string;
  artifactDigestAlgorithm: "sha256";
  artifactDigest: string;
  releaseCandidateId: string | null;
  baselineReleaseId?: string | null;
  compositeDigest: CompositeReleaseDigest | null;
  providerRevision: ApplicationReleaseProviderRevision | null;
  frontendEvidence: FrontendReleaseEvidence | null;
  failureStage: ApplicationReleaseFailureStage | null;
  outputUrl: string | null;
  status: ApplicationReleaseStatus;
  healthEvidence: JsonValue | null;
  rollbackEvidence: JsonValue | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DirectApplicationReleaseRecord = ApplicationReleaseRecord & {
  deploymentId: string;
  pipelineRunId: null;
  source: "direct";
};

export type DirectApplicationReleaseRepository = {
  findContext(
    deploymentId: string,
    userId: string
  ): Promise<DirectApplicationReleaseContext | undefined>;
  findRelease(deploymentId: string): Promise<DirectApplicationReleaseRecord | undefined>;
  savePreparedRelease(
    input: DirectApplicationReleaseRecord
  ): Promise<DirectApplicationReleaseRecord>;
  saveCompletedRelease(input: {
    releaseId: string;
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    rollbackEvidence: JsonValue | null;
    status: "succeeded" | "rolled_back";
    frontendEvidence?: FrontendReleaseEvidence | null;
    failureStage?: ApplicationReleaseFailureStage | null;
    completedAt: Date;
    updatedAt: Date;
    leaseFence?: LeaseFence;
  }): Promise<DirectApplicationReleaseRecord>;
  saveFailedRelease(input: {
    releaseId: string;
    completedAt: Date;
    updatedAt: Date;
    leaseFence?: LeaseFence;
  }): Promise<DirectApplicationReleaseRecord>;
  savePartialRelease(input: {
    releaseId: string;
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    frontendEvidence: FrontendReleaseEvidence | null;
    failureStage: ApplicationReleaseFailureStage;
    completedAt: Date;
    updatedAt: Date;
    leaseFence?: LeaseFence;
  }): Promise<DirectApplicationReleaseRecord>;
  saveCancelledRelease?(input: {
    releaseId: string;
    status: "cancelled" | "partially_cancelled";
    providerRevision?: ApplicationReleaseProviderRevision;
    outputUrl?: string;
    healthEvidence?: JsonValue;
    rollbackEvidence?: JsonValue | null;
    frontendEvidence?: FrontendReleaseEvidence | null;
    failureStage?: ApplicationReleaseFailureStage | null;
    completedAt: Date;
    updatedAt: Date;
    leaseFence?: LeaseFence;
  }): Promise<DirectApplicationReleaseRecord>;
  resetReleaseForRetry(input: {
    releaseId: string;
    providerRevision: ApplicationReleaseProviderRevision;
    updatedAt: Date;
  }): Promise<DirectApplicationReleaseRecord>;
};

export type DirectApplicationOutputReconciliationRepository = Pick<
  DirectApplicationReleaseRepository,
  "findContext" | "findRelease"
> & {
  reconcileEcsFargateOutput(input: {
    projectId: string;
    expectedCoordinatesFingerprint: string;
    outputs: ResolvedEcsFargateRuntimeOutputs;
    updatedAt: Date;
  }): Promise<"updated" | "unchanged">;
};

export type DirectApplicationReleaseGateway = {
  prepareArtifact(
    context: DirectApplicationReleaseContext,
    abortSignal?: AbortSignal,
    options?: { retainProjectLease?: boolean }
  ): Promise<DirectApplicationArtifact>;
  deployArtifact(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    abortSignal?: AbortSignal;
  }): Promise<{
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    rollbackEvidence: JsonValue | null;
    status:
      | "succeeded"
      | "rolled_back"
      | "partially_failed"
      | "cancelled"
      | "partially_cancelled";
    frontendEvidence?: FrontendReleaseEvidence | null;
    failureStage?: ApplicationReleaseFailureStage | null;
  }>;
  rollbackArtifact(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    release: DirectApplicationReleaseRecord;
    abortSignal?: AbortSignal;
    retainProjectLease?: boolean;
  }): Promise<{
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    rollbackEvidence: JsonValue | null;
    status: "rolled_back";
  }>;
  retryFrontend?(input: {
    context: DirectApplicationReleaseContext;
    release: ApplicationReleaseRecord;
  }): Promise<{
    status: "succeeded" | "partially_failed";
    failureStage?: ApplicationReleaseFailureStage | null;
  }>;
  cleanupArtifact?(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    mode: "success" | "terminal_failure";
  }): Promise<void>;
};

export class DirectApplicationReleaseError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = "DirectApplicationReleaseError";
  }
}

export function createPostgresDirectApplicationReleaseRepository(
  db: Database
): DirectApplicationReleaseRepository & DirectApplicationOutputReconciliationRepository {
  return {
    async findContext(deploymentId, userId) {
      const [row] = await db
        .select({
          deploymentId: deployments.id,
          projectId: deployments.projectId,
          scope: deployments.scope,
          source: deployments.source,
          targetKind: deployments.targetKind,
          runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
          confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig,
          runtimeConfig: projectDeploymentTargets.runtimeConfig,
          roleArn: awsConnections.roleArn,
          accountId: awsConnections.accountId,
          externalId: awsConnections.externalId,
          region: awsConnections.region,
          sourceRepositoryProvider: sourceRepositories.provider,
          sourceRepositoryInstallationId: sourceRepositories.githubInstallationId,
          sourceRepositoryOwner: sourceRepositories.owner,
          sourceRepositoryName: sourceRepositories.name,
          buildEnvironmentId: projectBuildEnvironments.id,
          buildEnvironmentAwsConnectionId: projectBuildEnvironments.awsConnectionId,
          buildEnvironmentAwsCodeConnectionId: projectBuildEnvironments.awsCodeConnectionId,
          buildEnvironmentCodeConnectionArn: awsCodeConnections.connectionArn,
          buildEnvironmentProjectName: projectBuildEnvironments.codeBuildProjectName,
          buildEnvironmentServiceRoleArn: projectBuildEnvironments.codeBuildServiceRoleArn,
          buildEnvironmentPermissionsBoundaryArn: projectBuildEnvironments.permissionsBoundaryArn,
          buildEnvironmentSourceUrl: projectBuildEnvironments.sourceRepositoryUrl,
          buildEnvironmentFingerprint: projectBuildEnvironments.runtimeFingerprint,
          buildEnvironmentStatus: projectBuildEnvironments.status
        })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .innerJoin(
          projectDeploymentTargets,
          eq(projectDeploymentTargets.projectId, deployments.projectId)
        )
        .innerJoin(
          awsConnections,
          and(
            eq(awsConnections.id, deployments.awsConnectionId),
            eq(awsConnections.id, projectDeploymentTargets.connectionId)
          )
        )
        .leftJoin(
          sourceRepositories,
          and(
            eq(sourceRepositories.projectId, deployments.projectId),
            eq(sourceRepositories.provider, "github"),
            eq(sourceRepositories.status, "active")
          )
        )
        .leftJoin(
          projectBuildEnvironments,
          eq(projectBuildEnvironments.projectId, deployments.projectId)
        )
        .leftJoin(
          awsCodeConnections,
          eq(awsCodeConnections.id, projectBuildEnvironments.awsCodeConnectionId)
        )
        .where(
          and(
            eq(deployments.id, deploymentId),
            eq(projects.userId, userId),
            eq(deployments.source, "direct"),
            eq(awsConnections.status, "verified")
          )
        );
      if (
        !row?.roleArn ||
        !row.accountId ||
        !row.confirmedBuildConfig ||
        !row.runtimeConfig ||
        row.runtimeConfig.runtimeTargetKind !== row.runtimeTargetKind
      ) return undefined;
      const sourceRepository =
        row.sourceRepositoryProvider === "github" &&
        row.sourceRepositoryInstallationId &&
        row.sourceRepositoryOwner &&
        row.sourceRepositoryName
          ? {
              provider: "github" as const,
              installationId: row.sourceRepositoryInstallationId,
              owner: row.sourceRepositoryOwner,
              name: row.sourceRepositoryName
            }
          : null;
      return {
        sourceRepository,
        buildEnvironment:
          row.buildEnvironmentId &&
          row.buildEnvironmentAwsConnectionId &&
          row.buildEnvironmentAwsCodeConnectionId &&
          row.buildEnvironmentCodeConnectionArn &&
          row.buildEnvironmentProjectName &&
          row.buildEnvironmentServiceRoleArn &&
          row.buildEnvironmentPermissionsBoundaryArn &&
          row.buildEnvironmentSourceUrl &&
          row.buildEnvironmentFingerprint &&
          row.buildEnvironmentStatus === "ready"
            ? {
                id: row.buildEnvironmentId,
                awsConnectionId: row.buildEnvironmentAwsConnectionId,
                awsCodeConnectionId: row.buildEnvironmentAwsCodeConnectionId,
                codeConnectionArn: row.buildEnvironmentCodeConnectionArn,
                codeBuildProjectName: row.buildEnvironmentProjectName,
                codeBuildServiceRoleArn: row.buildEnvironmentServiceRoleArn,
                permissionsBoundaryArn: row.buildEnvironmentPermissionsBoundaryArn,
                sourceRepositoryUrl: row.buildEnvironmentSourceUrl,
                runtimeFingerprint: row.buildEnvironmentFingerprint,
                status: "ready" as const
              }
            : null,
        deployment: {
          id: row.deploymentId,
          projectId: row.projectId,
          scope: row.scope,
          source: row.source,
          targetKind: row.targetKind
        },
        target: {
          runtimeTargetKind: row.runtimeTargetKind,
          confirmedBuildConfig: row.confirmedBuildConfig,
          runtimeConfig: row.runtimeConfig
        },
        connection: {
          accountId: row.accountId,
          roleArn: row.roleArn,
          externalId: row.externalId,
          region: row.region
        }
      };
    },
    async findRelease(deploymentId) {
      const [release] = await db
        .select()
        .from(applicationReleases)
        .where(
          and(
            eq(applicationReleases.deploymentId, deploymentId),
            eq(applicationReleases.source, "direct")
          )
        );
      return release?.deploymentId ? toDirectReleaseRecord(release) : undefined;
    },
    async reconcileEcsFargateOutput(input) {
      return db.transaction(async (transaction) => {
        const [target] = await transaction
          .select({
            runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
            runtimeConfig: projectDeploymentTargets.runtimeConfig
          })
          .from(projectDeploymentTargets)
          .where(eq(projectDeploymentTargets.projectId, input.projectId))
          .for("update");
        if (
          target?.runtimeTargetKind !== "ecs_fargate" ||
          target.runtimeConfig?.runtimeTargetKind !== "ecs_fargate"
        ) {
          throw new DirectApplicationReleaseError(
            "Direct deployment runtime does not match the confirmed project target"
          );
        }

        const reconciliation = reconcileEcsFargateRuntimeConfig(target.runtimeConfig, input);
        if (!reconciliation.changed) return "unchanged";

        const [updated] = await transaction
          .update(projectDeploymentTargets)
          .set({
            runtimeConfig: reconciliation.runtimeConfig,
            updatedAt: input.updatedAt
          })
          .where(
            and(
              eq(projectDeploymentTargets.projectId, input.projectId),
              eq(projectDeploymentTargets.runtimeTargetKind, "ecs_fargate")
            )
          )
          .returning({ projectId: projectDeploymentTargets.projectId });
        if (!updated) {
          throw new DirectApplicationReleaseError(
            "ECS runtime output URL target was not updated"
          );
        }
        return "updated";
      });
    },
    async savePreparedRelease(input) {
      return db.transaction(async (transaction) => {
        let preparedSnapshotHash: string | undefined;
        if (input.releaseCandidateId) {
          const [candidate] = await transaction
            .select()
            .from(releaseCandidates)
            .where(
              and(
                eq(releaseCandidates.id, input.releaseCandidateId),
                eq(releaseCandidates.projectId, input.projectId),
                eq(releaseCandidates.deploymentId, input.deploymentId),
                eq(releaseCandidates.status, "pending")
              )
            );
          const [deployment] = await transaction
            .select({ preparedSnapshotHash: deployments.preparedSnapshotHash })
            .from(deployments)
            .where(eq(deployments.id, input.deploymentId))
            .for("update");
          if (
            !candidate ||
            !deployment ||
            candidate.expiresAt <= input.updatedAt ||
            candidate.compositeDigest !== input.compositeDigest?.value
          ) {
            throw new DirectApplicationReleaseError(
              "Release candidate changed or expired before it was linked to the deployment"
            );
          }
          preparedSnapshotHash = createPreparedReleaseSnapshotHash({
            candidateId: candidate.id,
            commitSha: candidate.commitSha,
            compositeDigest: candidate.compositeDigest,
            configFingerprint: candidate.configFingerprint
          });
        }
        const [baseline] = await transaction
          .select({ id: applicationReleases.id })
          .from(applicationReleases)
          .where(
            and(
              eq(applicationReleases.projectId, input.projectId),
              eq(applicationReleases.runtimeTargetKind, input.runtimeTargetKind),
              eq(applicationReleases.status, "succeeded")
            )
          )
          .orderBy(desc(applicationReleases.completedAt), desc(applicationReleases.createdAt))
          .limit(1);
        const [release] = await transaction
          .insert(applicationReleases)
          .values({
            ...input,
            baselineReleaseId: baseline?.id ?? null
          })
          .returning();
        if (!release?.deploymentId) {
          throw new DirectApplicationReleaseError("Prepared application release was not saved");
        }
        const [linked] = await transaction
          .update(deployments)
          .set({
            releaseId: release.id,
            releaseCandidateId: input.releaseCandidateId,
            ...(preparedSnapshotHash ? { preparedSnapshotHash } : {}),
            updatedAt: input.updatedAt
          })
          .where(
            and(
              eq(deployments.id, input.deploymentId),
              eq(deployments.projectId, input.projectId),
              eq(deployments.source, "direct")
            )
          )
          .returning({ id: deployments.id });
        if (!linked) {
          throw new DirectApplicationReleaseError("Prepared artifact was not linked to deployment");
        }
        return toDirectReleaseRecord(release);
      });
    },
    async saveCompletedRelease(input) {
      return runWithOptionalReleaseFence(db, input.leaseFence, input.updatedAt, async (executor) => {
        const [release] = await executor
          .update(applicationReleases)
          .set({
            providerRevision: input.providerRevision,
            outputUrl: input.outputUrl,
            healthEvidence: input.healthEvidence,
            rollbackEvidence: input.rollbackEvidence,
            frontendEvidence: input.frontendEvidence ?? null,
            failureStage: input.failureStage ?? null,
            status: input.status,
            completedAt: input.completedAt,
            updatedAt: input.updatedAt
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.source, "direct"),
              input.status === "rolled_back"
                ? inArray(applicationReleases.status, ["pending", "succeeded"])
                : eq(applicationReleases.status, "pending")
            )
          )
          .returning();
        if (!release?.deploymentId) {
          throw new DirectApplicationReleaseError(
            "Application release was not pending or no longer exists"
          );
        }
        return toDirectReleaseRecord(release);
      });
    },
    async saveFailedRelease(input) {
      return runWithOptionalReleaseFence(db, input.leaseFence, input.updatedAt, async (executor) => {
        const [release] = await executor
          .update(applicationReleases)
          .set({
            status: "failed",
            healthEvidence: { state: "failed" },
            completedAt: input.completedAt,
            updatedAt: input.updatedAt
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.source, "direct"),
              eq(applicationReleases.status, "pending")
            )
          )
          .returning();
        if (!release?.deploymentId) {
          throw new DirectApplicationReleaseError("Failed application release was not saved");
        }
        return toDirectReleaseRecord(release);
      });
    },
    async savePartialRelease(input) {
      return runWithOptionalReleaseFence(db, input.leaseFence, input.updatedAt, async (executor) => {
        const [release] = await executor
          .update(applicationReleases)
          .set({
            providerRevision: input.providerRevision,
            outputUrl: input.outputUrl,
            healthEvidence: input.healthEvidence,
            frontendEvidence: input.frontendEvidence,
            failureStage: input.failureStage,
            completedAt: input.completedAt,
            updatedAt: input.updatedAt
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.source, "direct"),
              eq(applicationReleases.status, "partially_failed")
            )
          )
          .returning();
        if (!release?.deploymentId) {
          throw new DirectApplicationReleaseError("Partial application release was not saved");
        }
        return toDirectReleaseRecord(release);
      });
    },
    async saveCancelledRelease(input) {
      return runWithOptionalReleaseFence(db, input.leaseFence, input.updatedAt, async (executor) => {
        const [release] = await executor
          .update(applicationReleases)
          .set({
            status: input.status,
            ...(input.providerRevision ? { providerRevision: input.providerRevision } : {}),
            ...(input.outputUrl ? { outputUrl: input.outputUrl } : {}),
            ...(input.healthEvidence ? { healthEvidence: input.healthEvidence } : {}),
            ...(input.rollbackEvidence !== undefined
              ? { rollbackEvidence: input.rollbackEvidence }
              : {}),
            ...(input.frontendEvidence !== undefined
              ? { frontendEvidence: input.frontendEvidence }
              : {}),
            ...(input.failureStage !== undefined ? { failureStage: input.failureStage } : {}),
            completedAt: input.completedAt,
            updatedAt: input.updatedAt
          })
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.source, "direct"),
              inArray(applicationReleases.status, ["pending", "partially_cancelled"])
            )
          )
          .returning();
        if (!release?.deploymentId) {
          throw new DirectApplicationReleaseError("Cancelled application release was not saved");
        }
        return toDirectReleaseRecord(release);
      });
    },
    async resetReleaseForRetry(input) {
      const [release] = await db
        .update(applicationReleases)
        .set({
          providerRevision: input.providerRevision,
          status: "pending",
          healthEvidence: null,
          rollbackEvidence: null,
          completedAt: null,
          updatedAt: input.updatedAt
        })
        .where(
          and(
            eq(applicationReleases.id, input.releaseId),
            eq(applicationReleases.source, "direct")
          )
        )
        .returning();
      if (!release?.deploymentId) {
        throw new DirectApplicationReleaseError("Application release retry was not saved");
      }
      return toDirectReleaseRecord(release);
    }
  };
}

export async function reconcileDirectApplicationReleaseOutput(
  input: {
    deploymentId: string;
    userId: string;
    outputs: readonly TerraformOutputForEcsReconciliation[];
    resources: readonly TerraformResourceForEcsReconciliation[];
    accountId: string;
    region: string;
  },
  repository: DirectApplicationOutputReconciliationRepository,
  now: () => Date = () => new Date()
): Promise<string | null> {
  const context = await requireContext(input, repository);
  if (
    context.deployment.scope !== "full_stack" ||
    context.target.runtimeTargetKind !== "ecs_fargate"
  ) {
    return null;
  }
  assertContextMatchesTarget(context);

  const release = await repository.findRelease(input.deploymentId);
  const expectedCoordinatesFingerprint = readMetadataString(
    release?.providerRevision?.metadata,
    "ecsRuntimeCoordinatesFingerprint"
  );
  if (
    !release ||
    release.status !== "pending" ||
    release.providerRevision?.resourceType !== "codebuild_artifact" ||
    !expectedCoordinatesFingerprint
  ) {
    throw new DirectApplicationReleaseError(
      "Prepared ECS artifact coordinates are unavailable for output reconciliation",
      "DEPLOYMENT_OUTPUT_URL_CONFLICT"
    );
  }

  const resolvedOutputs = resolveEcsFargateRuntimeOutputs(input.outputs);
  if (context.connection.region !== input.region) {
    throw new DirectApplicationReleaseError(
      "Approved AWS region does not match the deployment runtime",
      "DEPLOYMENT_OUTPUT_URL_CONFLICT"
    );
  }
  assertEcsFargateRuntimeInventory(resolvedOutputs, input.resources, {
    accountId: input.accountId,
    region: input.region
  });
  await repository.reconcileEcsFargateOutput({
    projectId: context.deployment.projectId,
    expectedCoordinatesFingerprint,
    outputs: resolvedOutputs,
    updatedAt: now()
  });
  return resolvedOutputs.outputUrl;
}

export async function prepareDirectApplicationRelease(
  input: {
    deploymentId: string;
    userId: string;
    abortSignal?: AbortSignal;
    retainProjectLease?: boolean;
  },
  repository: DirectApplicationReleaseRepository,
  gateway: DirectApplicationReleaseGateway,
  createId: () => string,
  now: () => Date = () => new Date()
): Promise<DirectApplicationReleaseRecord | null> {
  const context = await requireContext(input, repository);
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);
  if (
    context.deployment.scope !== "full_stack" ||
    context.target.runtimeTargetKind !== "ecs_fargate"
  ) {
    assertRuntimeOutputUrl(context);
  }

  const existing = await repository.findRelease(input.deploymentId);
  if (existing) {
    if (existing.status === "pending") return existing;
    if (["failed", "rolled_back", "cancelled"].includes(existing.status)) {
      const preparedBuildRevisionId = readMetadataString(
        existing.providerRevision?.metadata,
        "preparedBuildRevisionId"
      );
      const buildRevisionId =
        existing.providerRevision?.resourceType === "codebuild_artifact"
          ? existing.providerRevision.revisionId
          : preparedBuildRevisionId;
      if (!buildRevisionId || !existing.providerRevision?.artifactReference) {
        throw new DirectApplicationReleaseError(
          "Failed application release does not retain immutable build evidence"
        );
      }
      return repository.resetReleaseForRetry({
        releaseId: existing.id,
        providerRevision: {
          provider: "aws",
          resourceType: "codebuild_artifact",
          revisionId: buildRevisionId,
          artifactReference: existing.providerRevision.artifactReference,
          metadata: {
            ...existing.providerRevision.metadata,
            ...(context.target.runtimeConfig.runtimeTargetKind === "ecs_fargate"
              ? {
                  ecsRuntimeCoordinatesFingerprint:
                    createEcsFargateRuntimeCoordinatesFingerprint(context.target.runtimeConfig)
                }
              : {}),
            preparedBuildRevisionId: buildRevisionId
          }
        },
        updatedAt: now()
      });
    }
    throw new DirectApplicationReleaseError(
      `Application artifact cannot be prepared from release status ${existing.status}`
    );
  }

  const artifact = await gateway.prepareArtifact(
    context,
    input.abortSignal,
    input.retainProjectLease ? { retainProjectLease: true } : undefined
  );
  validateArtifact(artifact, context.target.confirmedBuildConfig.confirmedCommitSha);
  const timestamp = now();
  const buildConfig = context.target.confirmedBuildConfig;
  const releaseCandidateId = readMetadataString(artifact.metadata, "releaseCandidateId");
  const candidateApiDigest = readMetadataString(artifact.metadata, "apiOciDigest");
  const candidateFrontendManifestDigest = readMetadataString(
    artifact.metadata,
    "frontendManifestDigest"
  );
  const compositeDigest =
    releaseCandidateId && candidateApiDigest && candidateFrontendManifestDigest
      ? {
          algorithm: "sha256" as const,
          value: artifact.digest,
          apiOciDigest: candidateApiDigest,
          frontendManifestDigest: candidateFrontendManifestDigest
        }
      : null;

  return repository.savePreparedRelease({
    id: createId(),
    projectId: context.deployment.projectId,
    deploymentId: context.deployment.id,
    pipelineRunId: null,
    source: "direct",
    runtimeTargetKind: context.target.runtimeTargetKind,
    version: resolveApplicationReleaseVersion({
      exactSemVerTag: buildConfig.exactSemVerTag,
      manifestVersion: buildConfig.manifestVersion,
      commitSha: artifact.commitSha
    }),
    commitSha: artifact.commitSha.toLowerCase(),
    artifactDigestAlgorithm: "sha256",
    artifactDigest: artifact.digest,
    releaseCandidateId,
    compositeDigest,
    providerRevision: {
      provider: "aws",
      resourceType: "codebuild_artifact",
      revisionId: artifact.buildRevisionId,
      artifactReference: artifact.reference,
      metadata:
        context.target.runtimeConfig.runtimeTargetKind === "ecs_fargate"
          ? {
              ...artifact.metadata,
              ecsRuntimeCoordinatesFingerprint:
                createEcsFargateRuntimeCoordinatesFingerprint(context.target.runtimeConfig)
            }
          : artifact.metadata
    },
    frontendEvidence: null,
    failureStage: null,
    outputUrl: null,
    status: "pending",
    healthEvidence: null,
    rollbackEvidence: null,
    startedAt: timestamp,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function executeDirectApplicationRelease(
  input: {
    deploymentId: string;
    userId: string;
    abortSignal?: AbortSignal;
    leaseFence?: LeaseFence;
  },
  repository: DirectApplicationReleaseRepository,
  gateway: DirectApplicationReleaseGateway,
  now: () => Date = () => new Date()
): Promise<DirectApplicationReleaseRecord | null> {
  const context = await requireContext(input, repository);
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);
  assertRuntimeOutputUrl(context);

  const release = await repository.findRelease(input.deploymentId);
  if (!release || release.providerRevision?.resourceType !== "codebuild_artifact") {
    throw new DirectApplicationReleaseError(
      "A prepared application artifact is required before runtime release"
    );
  }
  if (release.status === "succeeded") return release;
  if (release.status !== "pending") {
    throw new DirectApplicationReleaseError(
      `Application release cannot start from status ${release.status}`
    );
  }
  const reference = release.providerRevision.artifactReference;
  if (!reference) {
    throw new DirectApplicationReleaseError("Prepared application artifact reference is missing");
  }
  const artifact: DirectApplicationArtifact = {
    commitSha: release.commitSha,
    digest: release.artifactDigest,
    reference,
    buildRevisionId: release.providerRevision.revisionId,
    metadata: release.providerRevision.metadata
  };
  validateArtifact(artifact, context.target.confirmedBuildConfig.confirmedCommitSha);

  let result: Awaited<ReturnType<DirectApplicationReleaseGateway["deployArtifact"]>>;
  try {
    result = await gateway.deployArtifact({
      context,
      artifact,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    });
  } catch (error) {
    const timestamp = now();
    if (input.abortSignal?.aborted && repository.saveCancelledRelease) {
      const cancelledRelease = await repository.saveCancelledRelease({
        releaseId: release.id,
        status: "cancelled",
        completedAt: timestamp,
        updatedAt: timestamp,
        ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
      });
      await gateway
        .cleanupArtifact?.({ context, artifact, mode: "terminal_failure" })
        .catch(() => undefined);
      return cancelledRelease;
    }
    await repository.saveFailedRelease({
      releaseId: release.id,
      completedAt: timestamp,
      updatedAt: timestamp,
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    });
    await gateway
      .cleanupArtifact?.({ context, artifact, mode: "terminal_failure" })
      .catch(() => undefined);
    throw error;
  }
  if (result.status === "partially_failed") {
    const timestamp = now();
    if (!result.failureStage) {
      throw new DirectApplicationReleaseError("Partial release failure stage is missing");
    }
    return repository.savePartialRelease({
      releaseId: release.id,
      providerRevision: {
        ...result.providerRevision,
        metadata: {
          ...result.providerRevision.metadata,
          preparedBuildRevisionId: artifact.buildRevisionId
        }
      },
      outputUrl: result.outputUrl,
      healthEvidence: result.healthEvidence,
      frontendEvidence: result.frontendEvidence ?? null,
      failureStage: result.failureStage,
      completedAt: timestamp,
      updatedAt: timestamp,
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    });
  }
  if (result.status === "cancelled" || result.status === "partially_cancelled") {
    const timestamp = now();
    if (!repository.saveCancelledRelease) {
      throw new DirectApplicationReleaseError("Cancelled release repository is unavailable");
    }
    const cancelledRelease = await repository.saveCancelledRelease({
      releaseId: release.id,
      status: result.status,
      providerRevision: {
        ...result.providerRevision,
        metadata: {
          ...result.providerRevision.metadata,
          preparedBuildRevisionId: artifact.buildRevisionId
        }
      },
      outputUrl: result.outputUrl,
      healthEvidence: result.healthEvidence,
      rollbackEvidence: result.rollbackEvidence,
      frontendEvidence: result.frontendEvidence ?? null,
      failureStage: result.failureStage ?? null,
      completedAt: timestamp,
      updatedAt: timestamp,
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    });
    await gateway
      .cleanupArtifact?.({ context, artifact, mode: "terminal_failure" })
      .catch(() => undefined);
    return cancelledRelease;
  }
  validateRuntimeResult(result, context, artifact);
  const timestamp = now();
  const completedRelease = await repository.saveCompletedRelease({
    releaseId: release.id,
    providerRevision: {
      ...result.providerRevision,
      metadata: {
        ...result.providerRevision.metadata,
        preparedBuildRevisionId: artifact.buildRevisionId
      }
    },
    outputUrl: result.outputUrl,
    healthEvidence: result.healthEvidence,
    rollbackEvidence: result.rollbackEvidence,
    frontendEvidence: result.frontendEvidence ?? null,
    failureStage: result.failureStage ?? null,
    status: result.status,
    completedAt: timestamp,
    updatedAt: timestamp,
    ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
  });
  await gateway
    .cleanupArtifact?.({
      context,
      artifact,
      mode: result.status === "succeeded" ? "success" : "terminal_failure"
    })
    .catch(() => undefined);
  return completedRelease;
}

export async function retryDirectApplicationFrontendRelease(
  input: { deploymentId: string; userId: string },
  repository: DirectApplicationReleaseRepository,
  gateway: DirectApplicationReleaseGateway
): Promise<DirectApplicationReleaseRecord> {
  const context = await requireContext(input, repository);
  assertContextMatchesTarget(context);
  assertRuntimeOutputUrl(context);
  if (
    context.deployment.source !== "direct" ||
    context.target.runtimeTargetKind !== "ecs_fargate"
  ) {
    throw new DirectApplicationReleaseError(
      "Frontend retry is available only for Direct ECS/Fargate releases",
      "APPLICATION_RELEASE_FRONTEND_RETRY_UNSUPPORTED"
    );
  }
  const release = await repository.findRelease(input.deploymentId);
  if (
    !release ||
    release.status !== "partially_failed" ||
    !release.releaseCandidateId ||
    !isFrontendReleaseFailureStage(release.failureStage)
  ) {
    throw new DirectApplicationReleaseError(
      "Frontend retry requires an ECS-healthy partial frontend failure",
      "APPLICATION_RELEASE_FRONTEND_RETRY_NOT_ALLOWED"
    );
  }
  if (!gateway.retryFrontend) {
    throw new DirectApplicationReleaseError(
      "Frontend retry gateway is unavailable",
      "APPLICATION_RELEASE_FRONTEND_RETRY_UNAVAILABLE"
    );
  }
  const result = await gateway.retryFrontend({ context, release });
  const updated = await repository.findRelease(input.deploymentId);
  if (
    !updated ||
    (result.status === "succeeded"
      ? updated.status !== "succeeded"
      : updated.status !== "partially_failed")
  ) {
    throw new DirectApplicationReleaseError(
      "Frontend retry result was not saved",
      "APPLICATION_RELEASE_FRONTEND_RETRY_PERSISTENCE_FAILED"
    );
  }
  return updated;
}

function isFrontendReleaseFailureStage(
  stage: ApplicationReleaseFailureStage | null
): stage is
  | "frontend_upload"
  | "frontend_activation"
  | "cloudfront_invalidation"
  | "public_health" {
  return (
    stage === "frontend_upload" ||
    stage === "frontend_activation" ||
    stage === "cloudfront_invalidation" ||
    stage === "public_health"
  );
}

export async function rollbackDirectApplicationRelease(
  input: {
    deploymentId: string;
    userId: string;
    abortSignal?: AbortSignal;
    retainProjectLease?: boolean;
  },
  repository: DirectApplicationReleaseRepository,
  gateway: DirectApplicationReleaseGateway,
  now: () => Date = () => new Date()
): Promise<DirectApplicationReleaseRecord | null> {
  const context = await requireContext(input, repository);
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);
  assertRuntimeOutputUrl(context);

  const release = await repository.findRelease(input.deploymentId);
  if (!release) {
    throw new DirectApplicationReleaseError(
      "A successful application release is required before application cleanup"
    );
  }
  if (release.status === "rolled_back") return release;
  if (release.status !== "succeeded" || !release.providerRevision?.artifactReference) {
    throw new DirectApplicationReleaseError(
      `Application cleanup cannot start from release status ${release.status}`
    );
  }
  const preparedBuildRevisionId = readMetadataString(
    release.providerRevision.metadata,
    "preparedBuildRevisionId"
  );
  if (!preparedBuildRevisionId) {
    throw new DirectApplicationReleaseError(
      "Application release does not retain its prepared build revision"
    );
  }
  const artifact: DirectApplicationArtifact = {
    commitSha: release.commitSha,
    digest: release.artifactDigest,
    reference: release.providerRevision.artifactReference,
    buildRevisionId: preparedBuildRevisionId,
    metadata: release.providerRevision.metadata
  };
  validateArtifact(artifact, context.target.confirmedBuildConfig.confirmedCommitSha);
  const result = await gateway.rollbackArtifact({
    context,
    artifact,
    release,
    ...(input.retainProjectLease ? { retainProjectLease: true } : {}),
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
  });
  validateRuntimeResult(result, context, artifact);
  const timestamp = now();
  return repository.saveCompletedRelease({
    releaseId: release.id,
    providerRevision: {
      ...result.providerRevision,
      metadata: {
        ...result.providerRevision.metadata,
        preparedBuildRevisionId
      }
    },
    outputUrl: result.outputUrl,
    healthEvidence: result.healthEvidence,
    rollbackEvidence: result.rollbackEvidence,
    status: "rolled_back",
    completedAt: timestamp,
    updatedAt: timestamp
  });
}

function readMetadataString(metadata: JsonValue | undefined, key: string): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

async function requireContext(
  input: { deploymentId: string; userId: string },
  repository: Pick<DirectApplicationReleaseRepository, "findContext">
): Promise<DirectApplicationReleaseContext> {
  const context = await repository.findContext(input.deploymentId, input.userId);
  if (!context) throw new DirectApplicationReleaseError("Direct deployment target was not found");
  return context;
}

function assertContextMatchesTarget(context: DirectApplicationReleaseContext): void {
  if (
    context.deployment.source !== "direct" ||
    !context.sourceRepository ||
    context.deployment.targetKind !== context.target.runtimeTargetKind ||
    context.target.runtimeConfig?.runtimeTargetKind !== context.target.runtimeTargetKind
  ) {
    throw new DirectApplicationReleaseError(
      "Direct deployment runtime does not match the confirmed project target"
    );
  }

}

function assertRuntimeOutputUrl(context: DirectApplicationReleaseContext): void {
  if (
    context.target.runtimeConfig.runtimeTargetKind === "ecs_fargate" &&
    !context.target.runtimeConfig.outputUrl
  ) {
    throw new DirectApplicationReleaseError(
      "DEPLOYMENT_OUTPUT_URL_REQUIRED",
      "DEPLOYMENT_OUTPUT_URL_REQUIRED"
    );
  }
}

function validateArtifact(artifact: DirectApplicationArtifact, expectedCommitSha: string): void {
  if (
    artifact.commitSha.toLowerCase() !== expectedCommitSha.toLowerCase() ||
    !/^[0-9a-f]{64}$/.test(artifact.digest) ||
    !artifact.reference.trim() ||
    !artifact.buildRevisionId.trim()
  ) {
    throw new DirectApplicationReleaseError(
      "Prepared artifact does not match the confirmed immutable source revision"
    );
  }
}

function validateRuntimeResult(
  result: Awaited<ReturnType<DirectApplicationReleaseGateway["deployArtifact"]>>,
  context: DirectApplicationReleaseContext,
  artifact: DirectApplicationArtifact
): void {
  const expectedOutputUrl = context.target.runtimeConfig.outputUrl;
  const state =
    result.healthEvidence &&
    typeof result.healthEvidence === "object" &&
    !Array.isArray(result.healthEvidence)
      ? result.healthEvidence["state"]
      : undefined;
  if (
    result.providerRevision.provider !== "aws" ||
    !result.providerRevision.revisionId.trim() ||
    result.providerRevision.resourceType === "codebuild_artifact" ||
    result.providerRevision.artifactReference !== artifact.reference ||
    result.outputUrl !== expectedOutputUrl ||
    (result.status === "succeeded" ? state !== "healthy" : state !== "restored")
  ) {
    throw new DirectApplicationReleaseError(
      "Observed AWS runtime revision does not match the prepared application artifact"
    );
  }
}

async function runWithOptionalReleaseFence<T>(
  db: Database,
  fence: LeaseFence | undefined,
  now: Date,
  operation: (executor: Database) => Promise<T>
): Promise<T> {
  if (!fence) return operation(db);
  return db.transaction(async (transaction) => {
    const executor = transaction as unknown as Database;
    const [lease] = await executor
      .select({ projectId: projectExecutionLeases.projectId })
      .from(projectExecutionLeases)
      .where(
        and(
          eq(projectExecutionLeases.projectId, fence.projectId),
          eq(projectExecutionLeases.holderId, fence.holderId),
          eq(projectExecutionLeases.fencingVersion, fence.fencingVersion),
          eq(projectExecutionLeases.status, "active"),
          gt(projectExecutionLeases.expiresAt, now)
        )
      )
      .for("update");
    if (!lease) {
      throw new DirectApplicationReleaseError(
        "Stale recovery cannot save a terminal application release",
        "LEASE_FENCE_REJECTED"
      );
    }
    return operation(executor);
  });
}

function toDirectReleaseRecord(
  release: typeof applicationReleases.$inferSelect
): DirectApplicationReleaseRecord {
  if (
    !release.deploymentId ||
    release.source !== "direct" ||
    release.pipelineRunId !== null
  ) {
    throw new DirectApplicationReleaseError("Application release is not a Direct release");
  }
  const deploymentId = release.deploymentId;
  return {
    ...release,
    deploymentId,
    pipelineRunId: null,
    source: "direct"
  };
}
