import { isDeepStrictEqual } from "node:util";
import {
  APPLICATION_ARTIFACT_CONTRACT_VERSION,
  type ApplicationArtifact,
  type ApplicationReleaseProviderRevision,
  type ApplicationReleaseFailureStage,
  type ApplicationReleaseStatus,
  type CompositeReleaseDigest,
  type ConfirmedBuildConfig,
  type DeploymentScope,
  type DeploymentSource,
  type JsonValue,
  type FrontendReleaseEvidence,
  type ProjectDeploymentRuntimeConfig,
  type RuntimeAdapterKind,
  type RuntimeConvergenceOutcome,
  type RuntimeDeploymentTarget,
  type RuntimeTargetKind
} from "@sketchcatch/types";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { createApplicationArtifactIdentity } from "../artifacts/application-artifact-identity.js";
import {
  applicationArtifactKindForRuntime,
  applicationArtifactPlatformForRuntime
} from "../artifacts/application-artifact-runtime.js";
import {
  resolveApplicationArtifact,
  type ApplicationArtifactProviderVerification,
  type ApplicationArtifactRegistryRepository
} from "../artifacts/application-artifact-registry.js";
import { createPostgresApplicationArtifactRegistryRepository } from "../artifacts/postgres-application-artifact-registry.js";
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
  EcsFargateOutputReconciliationError,
  assertEcsFargateRuntimeInventory,
  createEcsFargateRuntimeCoordinatesFingerprint,
  reconcileEcsFargateRuntimeConfig,
  resolveEcsFargateRuntimeOutputs,
  type ResolvedEcsFargateRuntimeOutputs,
  type TerraformOutputForEcsReconciliation,
  type TerraformResourceForEcsReconciliation
} from "./ecs-fargate-output-reconciliation.js";
import {
  DeploymentTargetFingerprintMismatchError,
  resolveAwsDeploymentTargetIdentity
} from "../runtime-convergence/deployment-target-identity.js";
import {
  RuntimeRolloutRolledBackError,
  createRuntimeConvergenceAdapterRegistry,
  createRuntimeConvergenceService,
  type RuntimeConvergenceResult,
  type RuntimeProviderCurrentState,
  type RuntimeProviderGateway
} from "../runtime-convergence/runtime-convergence-service.js";

export type DirectApplicationReleaseContext = {
  sourceRepository: {
    id: string;
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
    runtimeTarget?: RuntimeDeploymentTarget | null | undefined;
    deploymentTargetFingerprint?: string | null | undefined;
  };
  connection: {
    accountId: string;
    roleArn: string;
    externalId: string;
    region: string;
  };
};

export type DirectApplicationArtifact = {
  artifactFingerprint?: string | undefined;
  commitSha: string;
  digest: string;
  reference: string;
  buildRevisionId: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type ApplicationReleaseRecord = {
  id: string;
  projectId: string;
  artifactId: string | null;
  deploymentId: string | null;
  pipelineRunId: string | null;
  source: "direct" | "gitops";
  runtimeTargetKind: RuntimeTargetKind;
  runtimeAdapterKind: RuntimeAdapterKind | null;
  deploymentTargetFingerprint: string | null;
  convergenceOutcome: RuntimeConvergenceOutcome | null;
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

export type ApplicationReleaseExecutionRepository<
  TRelease extends ApplicationReleaseRecord = ApplicationReleaseRecord
> = {
  readonly artifactRegistry: ApplicationArtifactRegistryRepository;
  findContext(
    deploymentId: string,
    userId: string
  ): Promise<DirectApplicationReleaseContext | undefined>;
  findRelease(executionId: string): Promise<TRelease | undefined>;
  savePreparedRelease(input: ApplicationReleaseRecord): Promise<TRelease>;
  saveCompletedRelease(input: {
    releaseId: string;
    runtimeAdapterKind: RuntimeAdapterKind;
    deploymentTargetFingerprint: string;
    convergenceOutcome: RuntimeConvergenceOutcome | null;
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
  }): Promise<TRelease>;
  saveFailedRelease(input: {
    releaseId: string;
    completedAt: Date;
    updatedAt: Date;
    leaseFence?: LeaseFence;
  }): Promise<TRelease>;
  savePartialRelease(input: {
    releaseId: string;
    runtimeAdapterKind: RuntimeAdapterKind;
    deploymentTargetFingerprint: string;
    convergenceOutcome: RuntimeConvergenceOutcome;
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    frontendEvidence: FrontendReleaseEvidence | null;
    failureStage: ApplicationReleaseFailureStage;
    completedAt: Date;
    updatedAt: Date;
    leaseFence?: LeaseFence;
  }): Promise<TRelease>;
  saveCancelledRelease?(input: {
    releaseId: string;
    status: "cancelled" | "partially_cancelled";
    runtimeAdapterKind?: RuntimeAdapterKind;
    deploymentTargetFingerprint?: string;
    convergenceOutcome?: RuntimeConvergenceOutcome | null;
    providerRevision?: ApplicationReleaseProviderRevision;
    outputUrl?: string;
    healthEvidence?: JsonValue;
    rollbackEvidence?: JsonValue | null;
    frontendEvidence?: FrontendReleaseEvidence | null;
    failureStage?: ApplicationReleaseFailureStage | null;
    completedAt: Date;
    updatedAt: Date;
    leaseFence?: LeaseFence;
  }): Promise<TRelease>;
  resetReleaseForRetry(input: {
    releaseId: string;
    providerRevision: ApplicationReleaseProviderRevision;
    deploymentTargetFingerprint?: string;
    updatedAt: Date;
  }): Promise<TRelease>;
};

export type DirectApplicationReleaseRepository =
  ApplicationReleaseExecutionRepository<DirectApplicationReleaseRecord>;

export type DirectApplicationOutputReconciliationRepository = Pick<
  DirectApplicationReleaseRepository,
  "findContext" | "findRelease"
> & {
  reconcileEcsFargateOutput(input: {
    releaseId: string;
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
  verifyArtifact(
    context: DirectApplicationReleaseContext,
    artifact: ApplicationArtifact,
    abortSignal?: AbortSignal
  ): Promise<ApplicationArtifactProviderVerification>;
  inspectCurrentRuntime?(input: {
    context: DirectApplicationReleaseContext;
    target: RuntimeDeploymentTarget;
    artifact: DirectApplicationArtifact;
    abortSignal?: AbortSignal;
  }): Promise<RuntimeProviderCurrentState>;
  deployArtifact(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    abortSignal?: AbortSignal;
  }): Promise<{
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    rollbackEvidence: JsonValue | null;
    status: "succeeded" | "rolled_back" | "partially_failed" | "cancelled" | "partially_cancelled";
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
  finalizeAlreadyActiveArtifact?(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    leaseFence: LeaseFence;
  }): Promise<void>;
  cleanupArtifact?(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    mode: "success" | "terminal_failure";
  }): Promise<void>;
};

export class DirectApplicationReleaseError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null
  ) {
    super(message);
    this.name = "DirectApplicationReleaseError";
  }
}

export function createPostgresDirectApplicationReleaseRepository(
  db: Database
): DirectApplicationReleaseRepository & DirectApplicationOutputReconciliationRepository {
  return {
    artifactRegistry: createPostgresApplicationArtifactRegistryRepository(db),
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
          runtimeTarget: projectDeploymentTargets.runtimeTarget,
          deploymentTargetFingerprint: projectDeploymentTargets.deploymentTargetFingerprint,
          roleArn: awsConnections.roleArn,
          accountId: awsConnections.accountId,
          externalId: awsConnections.externalId,
          region: awsConnections.region,
          sourceRepositoryId: sourceRepositories.id,
          sourceRepositoryProvider: sourceRepositories.provider,
          sourceRepositoryInstallationId: sourceRepositories.githubInstallationId,
          sourceRepositoryOwner: sourceRepositories.owner,
          sourceRepositoryName: sourceRepositories.name,
          buildEnvironmentId: projectBuildEnvironments.id,
          buildEnvironmentAwsConnectionId: projectBuildEnvironments.awsConnectionId,
          buildEnvironmentAwsCodeConnectionId: projectBuildEnvironments.awsCodeConnectionId,
          buildEnvironmentCodeConnectionArn: awsCodeConnections.connectionArn,
          buildEnvironmentCodeConnectionStatus: awsCodeConnections.status,
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
            eq(awsConnections.id, projectDeploymentTargets.connectionId),
            eq(awsConnections.region, projectDeploymentTargets.region)
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
      )
        return undefined;
      const sourceRepository =
        row.sourceRepositoryProvider === "github" &&
        row.sourceRepositoryId &&
        row.sourceRepositoryInstallationId &&
        row.sourceRepositoryOwner &&
        row.sourceRepositoryName
          ? {
              id: row.sourceRepositoryId,
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
          row.buildEnvironmentCodeConnectionStatus === "AVAILABLE" &&
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
          runtimeConfig: row.runtimeConfig,
          runtimeTarget: row.runtimeTarget,
          deploymentTargetFingerprint: row.deploymentTargetFingerprint
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
            accountId: awsConnections.accountId,
            confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig,
            deploymentTargetFingerprint: projectDeploymentTargets.deploymentTargetFingerprint,
            region: projectDeploymentTargets.region,
            runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
            runtimeConfig: projectDeploymentTargets.runtimeConfig,
            runtimeTarget: projectDeploymentTargets.runtimeTarget
          })
          .from(projectDeploymentTargets)
          .innerJoin(awsConnections, eq(awsConnections.id, projectDeploymentTargets.connectionId))
          .where(eq(projectDeploymentTargets.projectId, input.projectId))
          .for("update");
        if (
          target?.runtimeTargetKind !== "ecs_fargate" ||
          target.runtimeConfig?.runtimeTargetKind !== "ecs_fargate" ||
          !target.confirmedBuildConfig ||
          !target.accountId
        ) {
          throw new DirectApplicationReleaseError(
            "managed deployment runtime does not match the confirmed project target"
          );
        }

        const [preparedRelease] = await transaction
          .select({
            id: applicationReleases.id,
            deploymentTargetFingerprint: applicationReleases.deploymentTargetFingerprint,
            providerRevision: applicationReleases.providerRevision
          })
          .from(applicationReleases)
          .where(
            and(
              eq(applicationReleases.id, input.releaseId),
              eq(applicationReleases.projectId, input.projectId),
              eq(applicationReleases.source, "direct"),
              eq(applicationReleases.status, "pending")
            )
          )
          .for("update");
        const preparedCoordinatesFingerprint = readMetadataString(
          preparedRelease?.providerRevision?.metadata,
          "ecsRuntimeCoordinatesFingerprint"
        );
        const preparedOutputUrl = readMetadataString(
          preparedRelease?.providerRevision?.metadata,
          "ecsPreparedOutputUrl"
        );
        if (
          !preparedRelease?.providerRevision ||
          preparedCoordinatesFingerprint !== input.expectedCoordinatesFingerprint
        ) {
          throw new DirectApplicationReleaseError(
            "Prepared ECS release changed before output synchronization",
            "DEPLOYMENT_OUTPUT_URL_CONFLICT"
          );
        }

        const reconciliation = reconcileEcsFargateOutputAfterPartialSynchronization(
          target.runtimeConfig,
          input
        );
        const preparedRuntimeConfig = reconciliation.recoveredPartialSynchronization
          ? toPreparedEcsFargateRuntimeConfig(reconciliation.runtimeConfig, preparedOutputUrl)
          : target.runtimeConfig;
        const preparedTargetIdentity = resolveAwsDeploymentTargetIdentity({
          projectId: input.projectId,
          accountId: target.accountId,
          region: target.region,
          runtimeConfig: preparedRuntimeConfig,
          healthCheckPath: target.confirmedBuildConfig.healthCheckPath
        });
        if (
          preparedRelease.deploymentTargetFingerprint !==
          preparedTargetIdentity.deploymentTargetFingerprint
        ) {
          throw new DirectApplicationReleaseError(
            "Prepared release deployment target no longer matches the Terraform output transition",
            "DEPLOYMENT_OUTPUT_URL_CONFLICT"
          );
        }
        const identity = resolveAwsDeploymentTargetIdentity({
          projectId: input.projectId,
          accountId: target.accountId,
          region: target.region,
          runtimeConfig: reconciliation.runtimeConfig,
          healthCheckPath: target.confirmedBuildConfig.healthCheckPath
        });
        const reconciledCoordinatesFingerprint = createEcsFargateRuntimeCoordinatesFingerprint(
          reconciliation.runtimeConfig
        );
        const targetChanged =
          reconciliation.changed ||
          !isDeepStrictEqual(identity.target, target.runtimeTarget) ||
          identity.deploymentTargetFingerprint !== target.deploymentTargetFingerprint;
        const preparedReleaseChanged =
          preparedRelease.deploymentTargetFingerprint !== identity.deploymentTargetFingerprint ||
          preparedCoordinatesFingerprint !== reconciledCoordinatesFingerprint;
        if (!targetChanged && !preparedReleaseChanged) {
          return "unchanged";
        }

        if (targetChanged) {
          const [updated] = await transaction
            .update(projectDeploymentTargets)
            .set({
              runtimeConfig: reconciliation.runtimeConfig,
              runtimeTarget: identity.target,
              deploymentTargetFingerprint: identity.deploymentTargetFingerprint,
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
        }
        if (preparedReleaseChanged) {
          const [updatedRelease] = await transaction
            .update(applicationReleases)
            .set({
              deploymentTargetFingerprint: identity.deploymentTargetFingerprint,
              providerRevision: {
                ...preparedRelease.providerRevision,
                metadata: {
                  ...preparedRelease.providerRevision.metadata,
                  ecsRuntimeCoordinatesFingerprint: reconciledCoordinatesFingerprint
                }
              },
              updatedAt: input.updatedAt
            })
            .where(
              and(
                eq(applicationReleases.id, preparedRelease.id),
                eq(applicationReleases.projectId, input.projectId),
                eq(applicationReleases.source, "direct"),
                eq(applicationReleases.status, "pending")
              )
            )
            .returning({ id: applicationReleases.id });
          if (!updatedRelease) {
            throw new DirectApplicationReleaseError(
              "Prepared application release target fingerprint was not updated"
            );
          }
        }
        return "updated";
      });
    },
    async savePreparedRelease(input) {
      assertDirectApplicationReleaseRecord(input);
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
        const [baseline] = input.deploymentTargetFingerprint
          ? await transaction
              .select({ id: applicationReleases.id })
              .from(applicationReleases)
              .where(
                and(
                  eq(applicationReleases.projectId, input.projectId),
                  eq(applicationReleases.runtimeTargetKind, input.runtimeTargetKind),
                  eq(
                    applicationReleases.deploymentTargetFingerprint,
                    input.deploymentTargetFingerprint
                  ),
                  eq(applicationReleases.status, "succeeded")
                )
              )
              .orderBy(desc(applicationReleases.completedAt), desc(applicationReleases.createdAt))
              .limit(1)
          : [];
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
      return runWithOptionalReleaseFence(
        db,
        input.leaseFence,
        input.updatedAt,
        async (executor) => {
          const [release] = await executor
            .update(applicationReleases)
            .set({
              runtimeAdapterKind: input.runtimeAdapterKind,
              deploymentTargetFingerprint: input.deploymentTargetFingerprint,
              convergenceOutcome: input.convergenceOutcome,
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
        }
      );
    },
    async saveFailedRelease(input) {
      return runWithOptionalReleaseFence(
        db,
        input.leaseFence,
        input.updatedAt,
        async (executor) => {
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
        }
      );
    },
    async savePartialRelease(input) {
      return runWithOptionalReleaseFence(
        db,
        input.leaseFence,
        input.updatedAt,
        async (executor) => {
          const [release] = await executor
            .update(applicationReleases)
            .set({
              runtimeAdapterKind: input.runtimeAdapterKind,
              deploymentTargetFingerprint: input.deploymentTargetFingerprint,
              convergenceOutcome: input.convergenceOutcome,
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
        }
      );
    },
    async saveCancelledRelease(input) {
      return runWithOptionalReleaseFence(
        db,
        input.leaseFence,
        input.updatedAt,
        async (executor) => {
          const [release] = await executor
            .update(applicationReleases)
            .set({
              status: input.status,
              ...(input.runtimeAdapterKind ? { runtimeAdapterKind: input.runtimeAdapterKind } : {}),
              ...(input.deploymentTargetFingerprint
                ? { deploymentTargetFingerprint: input.deploymentTargetFingerprint }
                : {}),
              ...(input.convergenceOutcome !== undefined
                ? { convergenceOutcome: input.convergenceOutcome }
                : {}),
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
        }
      );
    },
    async resetReleaseForRetry(input) {
      const [release] = await db
        .update(applicationReleases)
        .set({
          providerRevision: input.providerRevision,
          ...(input.deploymentTargetFingerprint
            ? { deploymentTargetFingerprint: input.deploymentTargetFingerprint }
            : {}),
          status: "pending",
          convergenceOutcome: null,
          healthEvidence: null,
          rollbackEvidence: null,
          completedAt: null,
          updatedAt: input.updatedAt
        })
        .where(
          and(eq(applicationReleases.id, input.releaseId), eq(applicationReleases.source, "direct"))
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
    releaseId: release.id,
    projectId: context.deployment.projectId,
    expectedCoordinatesFingerprint,
    outputs: resolvedOutputs,
    updatedAt: now()
  });
  return resolvedOutputs.outputUrl;
}

export async function prepareApplicationRelease<
  TRelease extends ApplicationReleaseRecord = ApplicationReleaseRecord
>(
  input: {
    executionId: string;
    userId: string;
    abortSignal?: AbortSignal;
    retainProjectLease?: boolean;
  },
  repository: ApplicationReleaseExecutionRepository<TRelease>,
  gateway: DirectApplicationReleaseGateway,
  createId: () => string,
  now: () => Date = () => new Date()
): Promise<TRelease | null> {
  const context = await requireContext(
    { deploymentId: input.executionId, userId: input.userId },
    repository
  );
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);
  if (
    context.deployment.scope !== "full_stack" ||
    context.target.runtimeTargetKind !== "ecs_fargate"
  ) {
    assertRuntimeOutputUrl(context);
  }

  const existing = await repository.findRelease(input.executionId);
  if (existing) {
    if (existing.status === "pending") {
      if (context.target.runtimeConfig.runtimeTargetKind !== "ecs_fargate") return existing;
      const retryDeploymentTargetFingerprint = resolveFullStackRetryDeploymentTargetFingerprint(
        context,
        existing
      );
      const expectedFingerprint = createEcsFargateRuntimeCoordinatesFingerprint(
        context.target.runtimeConfig
      );
      const preparedFingerprint = readMetadataString(
        existing.providerRevision?.metadata,
        "ecsRuntimeCoordinatesFingerprint"
      );
      if (
        preparedFingerprint === expectedFingerprint &&
        hasPreparedEcsOutputUrlMetadata(existing.providerRevision?.metadata) &&
        (!retryDeploymentTargetFingerprint ||
          existing.deploymentTargetFingerprint === retryDeploymentTargetFingerprint)
      ) {
        return existing;
      }
      if (
        existing.providerRevision?.resourceType !== "codebuild_artifact" ||
        !existing.providerRevision.artifactReference
      ) {
        throw new DirectApplicationReleaseError(
          "Pending ECS application release does not retain immutable build evidence"
        );
      }
      return repository.resetReleaseForRetry({
        releaseId: existing.id,
        ...(retryDeploymentTargetFingerprint
          ? { deploymentTargetFingerprint: retryDeploymentTargetFingerprint }
          : {}),
        providerRevision: {
          ...existing.providerRevision,
          metadata: {
            ...existing.providerRevision.metadata,
            ecsRuntimeCoordinatesFingerprint: expectedFingerprint,
            ...createEcsPreparedOutputUrlMetadata(context.target.runtimeConfig)
          }
        },
        updatedAt: now()
      });
    }
    if (["failed", "rolled_back", "cancelled"].includes(existing.status)) {
      const retryDeploymentTargetFingerprint = resolveFullStackRetryDeploymentTargetFingerprint(
        context,
        existing
      );
      const preparedBuildRevisionId = readMetadataString(
        existing.providerRevision?.metadata,
        "preparedBuildRevisionId"
      );
      const artifactExecutionRevisionId =
        preparedBuildRevisionId ??
        existing.artifactId ??
        (existing.providerRevision?.resourceType === "codebuild_artifact"
          ? existing.providerRevision.revisionId
          : null);
      if (!artifactExecutionRevisionId || !existing.providerRevision?.artifactReference) {
        throw new DirectApplicationReleaseError(
          "Failed application release does not retain immutable build evidence"
        );
      }
      return repository.resetReleaseForRetry({
        releaseId: existing.id,
        ...(retryDeploymentTargetFingerprint
          ? { deploymentTargetFingerprint: retryDeploymentTargetFingerprint }
          : {}),
        providerRevision: {
          provider: "aws",
          resourceType: existing.artifactId ? "application_artifact" : "codebuild_artifact",
          revisionId: existing.artifactId ?? artifactExecutionRevisionId,
          artifactReference: existing.providerRevision.artifactReference,
          metadata: {
            ...existing.providerRevision.metadata,
            ...(context.target.runtimeConfig.runtimeTargetKind === "ecs_fargate"
              ? {
                  ecsRuntimeCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(
                    context.target.runtimeConfig
                  ),
                  ...createEcsPreparedOutputUrlMetadata(context.target.runtimeConfig)
                }
              : {}),
            ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
          }
        },
        updatedAt: now()
      });
    }
    throw new DirectApplicationReleaseError(
      `Application artifact cannot be prepared from release status ${existing.status}`
    );
  }

  const timestamp = now();
  const buildConfig = context.target.confirmedBuildConfig;
  const targetIdentity = resolveDirectTargetIdentity(context);
  const identity = createApplicationArtifactIdentity({
    repository: {
      provider: context.sourceRepository.provider,
      owner: context.sourceRepository.owner,
      name: context.sourceRepository.name
    },
    commitSha: buildConfig.confirmedCommitSha,
    kind: applicationArtifactKindForRuntime(context.target.runtimeTargetKind),
    confirmedBuildConfig: buildConfig,
    buildContractVersion: APPLICATION_ARTIFACT_CONTRACT_VERSION,
    ...applicationArtifactPlatformForRuntime(context.target.runtimeTargetKind),
    buildInputs: {}
  });
  let preparedArtifact: DirectApplicationArtifact | undefined;
  let registeredArtifact: ApplicationArtifact | undefined;
  let reuseOutcome: "built" | "reused" | "preflight" = "preflight";
  const usesPreApplyArtifact =
    context.target.runtimeTargetKind === "ecs_fargate" &&
    (context.deployment.scope === "full_stack" || Boolean(buildConfig.ecsWeb));

  if (usesPreApplyArtifact) {
    preparedArtifact = await gateway.prepareArtifact(
      context,
      input.abortSignal,
      input.retainProjectLease ? { retainProjectLease: true } : undefined
    );
    validateArtifact(preparedArtifact, buildConfig.confirmedCommitSha);
  } else {
    const resolved = await resolveApplicationArtifact({
      projectId: context.deployment.projectId,
      sourceRepositoryId: context.sourceRepository.id,
      identity,
      expectedLocation: {
        provider: "aws",
        accountId: context.connection.accountId,
        region: context.connection.region,
        storageNamespace: resolveExpectedStorageNamespace(context),
        ownershipScope: `project:${context.deployment.projectId}`
      },
      now: timestamp,
      repository: repository.artifactRegistry,
      verifier: {
        verify: (artifact) => gateway.verifyArtifact(context, artifact, input.abortSignal)
      },
      build: async () => {
        preparedArtifact = await gateway.prepareArtifact(
          context,
          input.abortSignal,
          input.retainProjectLease ? { retainProjectLease: true } : undefined
        );
        validateArtifact(preparedArtifact, buildConfig.confirmedCommitSha);
        return {
          digest: preparedArtifact.digest,
          location: createProviderLocation(context, preparedArtifact.reference)
        };
      }
    });
    registeredArtifact = resolved.artifact;
    reuseOutcome = resolved.outcome;
  }

  const commitSha = registeredArtifact?.commitSha ?? preparedArtifact?.commitSha;
  const artifactDigest = registeredArtifact?.digest ?? preparedArtifact?.digest;
  const artifactReference =
    registeredArtifact?.location.artifactReference ?? preparedArtifact?.reference;
  const executionRevisionId = registeredArtifact?.id ?? preparedArtifact?.buildRevisionId;
  if (!commitSha || !artifactDigest || !artifactReference || !executionRevisionId) {
    throw new DirectApplicationReleaseError("Prepared application artifact evidence is incomplete");
  }
  const preparedBuildRevisionId = preparedArtifact?.buildRevisionId;
  const releaseCandidateId = readMetadataString(preparedArtifact?.metadata, "releaseCandidateId");
  const candidateApiDigest = readMetadataString(preparedArtifact?.metadata, "apiOciDigest");
  const candidateFrontendManifestDigest = readMetadataString(
    preparedArtifact?.metadata,
    "frontendManifestDigest"
  );
  const compositeDigest =
    releaseCandidateId && candidateApiDigest && candidateFrontendManifestDigest
      ? {
          algorithm: "sha256" as const,
          value: artifactDigest,
          apiOciDigest: candidateApiDigest,
          frontendManifestDigest: candidateFrontendManifestDigest
        }
      : null;

  return repository.savePreparedRelease({
    id: createId(),
    projectId: context.deployment.projectId,
    artifactId: registeredArtifact?.id ?? null,
    ...createReleaseExecutionCoordinates(context),
    runtimeTargetKind: context.target.runtimeTargetKind,
    runtimeAdapterKind: targetIdentity.adapterKind,
    deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
    convergenceOutcome: null,
    version: resolveApplicationReleaseVersion({
      exactSemVerTag: buildConfig.exactSemVerTag,
      manifestVersion: buildConfig.manifestVersion,
      commitSha
    }),
    commitSha: commitSha.toLowerCase(),
    artifactDigestAlgorithm: "sha256",
    artifactDigest,
    releaseCandidateId,
    compositeDigest,
    providerRevision: {
      provider: "aws",
      resourceType: registeredArtifact ? "application_artifact" : "codebuild_artifact",
      revisionId: executionRevisionId,
      artifactReference,
      metadata: {
        ...(preparedArtifact?.metadata ?? {}),
        ...(registeredArtifact ? { applicationArtifactId: registeredArtifact.id } : {}),
        artifactFingerprint:
          registeredArtifact?.artifactFingerprint ?? identity.artifactFingerprint,
        preparedArtifactReference: artifactReference,
        ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {}),
        reuseOutcome,
        ...(context.target.runtimeConfig.runtimeTargetKind === "ecs_fargate"
          ? {
              ecsRuntimeCoordinatesFingerprint: createEcsFargateRuntimeCoordinatesFingerprint(
                context.target.runtimeConfig
              ),
              ...createEcsPreparedOutputUrlMetadata(context.target.runtimeConfig)
            }
          : {})
      }
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
  return prepareApplicationRelease(
    {
      executionId: input.deploymentId,
      userId: input.userId,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      ...(input.retainProjectLease ? { retainProjectLease: true } : {})
    },
    repository,
    gateway,
    createId,
    now
  );
}

export async function executeApplicationRelease<
  TRelease extends ApplicationReleaseRecord = ApplicationReleaseRecord
>(
  input: {
    executionId: string;
    userId: string;
    abortSignal?: AbortSignal;
    leaseFence?: LeaseFence;
  },
  repository: ApplicationReleaseExecutionRepository<TRelease>,
  gateway: DirectApplicationReleaseGateway,
  now: () => Date = () => new Date()
): Promise<TRelease | null> {
  const context = await requireContext(
    { deploymentId: input.executionId, userId: input.userId },
    repository
  );
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);
  assertRuntimeOutputUrl(context);

  const release = await repository.findRelease(input.executionId);
  const providerRevision = release?.providerRevision ?? null;
  if (
    !release ||
    !["codebuild_artifact", "application_artifact"].includes(providerRevision?.resourceType ?? "")
  ) {
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
  if (!providerRevision) {
    throw new DirectApplicationReleaseError("Prepared application artifact revision is missing");
  }
  const reference = providerRevision.artifactReference;
  if (!reference) {
    throw new DirectApplicationReleaseError("Prepared application artifact reference is missing");
  }
  const preparedBuildRevisionId = readMetadataString(
    providerRevision.metadata,
    "preparedBuildRevisionId"
  );
  const artifactFingerprint = readMetadataString(providerRevision.metadata, "artifactFingerprint");
  if (!artifactFingerprint || !/^[a-f0-9]{64}$/u.test(artifactFingerprint)) {
    throw new DirectApplicationReleaseError(
      "Prepared application artifact fingerprint is missing or invalid"
    );
  }
  const artifact: DirectApplicationArtifact = {
    artifactFingerprint,
    commitSha: release.commitSha,
    digest: release.artifactDigest,
    reference,
    buildRevisionId: preparedBuildRevisionId ?? providerRevision.revisionId,
    metadata: providerRevision.metadata
  };
  validateArtifact(artifact, context.target.confirmedBuildConfig.confirmedCommitSha);
  const desiredRuntimeArtifact = resolveDirectRuntimeArtifact(context, artifact);

  const targetIdentity = resolveDirectTargetIdentity(context);
  if (
    release.deploymentTargetFingerprint &&
    release.deploymentTargetFingerprint !== targetIdentity.deploymentTargetFingerprint
  ) {
    throw new DirectApplicationReleaseError(
      "Prepared release deployment target fingerprint no longer matches the confirmed target"
    );
  }
  let rolloutResult:
    | Awaited<ReturnType<DirectApplicationReleaseGateway["deployArtifact"]>>
    | undefined;
  const runtimeGateway = createDirectRuntimeProviderGateway({
    gateway,
    context,
    target: targetIdentity.target,
    artifact,
    now,
    recordRolloutResult(result) {
      rolloutResult = result;
    },
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
  });
  let convergence: RuntimeConvergenceResult;
  try {
    convergence = await createRuntimeConvergenceService({
      adapters: createRuntimeConvergenceAdapterRegistry(createRuntimeGatewayRecord(runtimeGateway)),
      now
    }).converge({
      scope: targetIdentity.scope,
      target: targetIdentity.target,
      artifact: {
        ...desiredRuntimeArtifact,
        artifactFingerprint
      }
    });
  } catch (error) {
    const timestamp = now();
    if (rolloutResult?.status === "cancelled" && repository.saveCancelledRelease) {
      const cancelledRelease = await repository.saveCancelledRelease({
        releaseId: release.id,
        status: "cancelled",
        runtimeAdapterKind: targetIdentity.adapterKind,
        deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
        convergenceOutcome: null,
        providerRevision: {
          ...rolloutResult.providerRevision,
          metadata: {
            ...rolloutResult.providerRevision.metadata,
            artifactFingerprint,
            ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
          }
        },
        outputUrl: rolloutResult.outputUrl,
        healthEvidence: rolloutResult.healthEvidence,
        rollbackEvidence: rolloutResult.rollbackEvidence,
        frontendEvidence: rolloutResult.frontendEvidence ?? null,
        failureStage: rolloutResult.failureStage ?? null,
        completedAt: timestamp,
        updatedAt: timestamp,
        ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
      });
      await gateway
        .cleanupArtifact?.({ context, artifact, mode: "terminal_failure" })
        .catch(() => undefined);
      return cancelledRelease;
    }
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
    if (error instanceof RuntimeRolloutRolledBackError) {
      const rolledBackRelease = await repository.saveCompletedRelease({
        releaseId: release.id,
        runtimeAdapterKind: targetIdentity.adapterKind,
        deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
        convergenceOutcome: null,
        providerRevision: {
          ...toDirectProviderRevision(error.currentState.providerRevision),
          metadata: {
            ...error.currentState.providerRevision.metadata,
            artifactFingerprint,
            ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
          }
        },
        outputUrl: resolveDirectOutputUrl(context),
        healthEvidence: error.currentState.healthEvidence,
        rollbackEvidence: error.currentState.rollbackEvidence,
        frontendEvidence: rolloutResult?.frontendEvidence ?? null,
        failureStage: rolloutResult?.failureStage ?? "ecs_health",
        status: "rolled_back",
        completedAt: timestamp,
        updatedAt: timestamp,
        ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
      });
      await gateway
        .cleanupArtifact?.({ context, artifact, mode: "terminal_failure" })
        .catch(() => undefined);
      return rolledBackRelease;
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

  if (rolloutResult?.status === "partially_failed") {
    const timestamp = now();
    if (!rolloutResult.failureStage) {
      throw new DirectApplicationReleaseError("Partial release failure stage is missing");
    }
    return repository.savePartialRelease({
      releaseId: release.id,
      runtimeAdapterKind: convergence.adapterKind,
      deploymentTargetFingerprint: convergence.deploymentTargetFingerprint,
      convergenceOutcome: convergence.outcome,
      providerRevision: {
        ...rolloutResult.providerRevision,
        metadata: {
          ...rolloutResult.providerRevision.metadata,
          artifactFingerprint,
          ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
        }
      },
      outputUrl: rolloutResult.outputUrl,
      healthEvidence: appendConvergenceEvidence(rolloutResult.healthEvidence, convergence),
      frontendEvidence: rolloutResult.frontendEvidence ?? null,
      failureStage: rolloutResult.failureStage,
      completedAt: timestamp,
      updatedAt: timestamp,
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    });
  }
  if (rolloutResult?.status === "cancelled" || rolloutResult?.status === "partially_cancelled") {
    const timestamp = now();
    if (!repository.saveCancelledRelease) {
      throw new DirectApplicationReleaseError("Cancelled release repository is unavailable");
    }
    const cancelledRelease = await repository.saveCancelledRelease({
      releaseId: release.id,
      status: rolloutResult.status,
      runtimeAdapterKind: convergence.adapterKind,
      deploymentTargetFingerprint: convergence.deploymentTargetFingerprint,
      convergenceOutcome: convergence.outcome,
      providerRevision: {
        ...rolloutResult.providerRevision,
        metadata: {
          ...rolloutResult.providerRevision.metadata,
          artifactFingerprint,
          ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
        }
      },
      outputUrl: rolloutResult.outputUrl,
      healthEvidence: appendConvergenceEvidence(rolloutResult.healthEvidence, convergence),
      rollbackEvidence: rolloutResult.rollbackEvidence,
      frontendEvidence: rolloutResult.frontendEvidence ?? null,
      failureStage: rolloutResult.failureStage ?? null,
      completedAt: timestamp,
      updatedAt: timestamp,
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    });
    await gateway
      .cleanupArtifact?.({ context, artifact, mode: "terminal_failure" })
      .catch(() => undefined);
    return cancelledRelease;
  }

  const timestamp = now();
  if (convergence.outcome === "already_active" && release.releaseCandidateId) {
    if (!input.leaseFence || !gateway.finalizeAlreadyActiveArtifact) {
      throw new DirectApplicationReleaseError(
        "An active execution fence is required to finalize an already-active ReleaseCandidate",
        "APPLICATION_RELEASE_CANDIDATE_FENCE_REQUIRED"
      );
    }
    await gateway.finalizeAlreadyActiveArtifact({
      context,
      artifact,
      leaseFence: input.leaseFence
    });
  }
  const completedRelease = await repository.saveCompletedRelease({
    releaseId: release.id,
    runtimeAdapterKind: convergence.adapterKind,
    deploymentTargetFingerprint: convergence.deploymentTargetFingerprint,
    convergenceOutcome: convergence.outcome,
    providerRevision: {
      ...toDirectProviderRevision(convergence.providerRevision),
      metadata: {
        ...providerRevision.metadata,
        ...convergence.providerRevision.metadata,
        artifactFingerprint,
        ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
      }
    },
    outputUrl: rolloutResult?.outputUrl ?? resolveDirectOutputUrl(context),
    healthEvidence: appendConvergenceEvidence(convergence.healthEvidence, convergence),
    rollbackEvidence: convergence.rollbackEvidence,
    frontendEvidence: rolloutResult?.frontendEvidence ?? null,
    failureStage: rolloutResult?.failureStage ?? null,
    status: "succeeded",
    completedAt: timestamp,
    updatedAt: timestamp,
    ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
  });
  await gateway
    .cleanupArtifact?.({
      context,
      artifact,
      mode: "success"
    })
    .catch(() => undefined);
  return completedRelease;
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
  return executeApplicationRelease(
    {
      executionId: input.deploymentId,
      userId: input.userId,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    },
    repository,
    gateway,
    now
  );
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
  const artifactExecutionRevisionId = preparedBuildRevisionId ?? release.artifactId;
  if (!artifactExecutionRevisionId) {
    throw new DirectApplicationReleaseError(
      "Application release does not retain its prepared build revision"
    );
  }
  const artifact: DirectApplicationArtifact = {
    commitSha: release.commitSha,
    digest: release.artifactDigest,
    reference:
      readMetadataString(release.providerRevision.metadata, "preparedArtifactReference") ??
      release.providerRevision.artifactReference,
    buildRevisionId: artifactExecutionRevisionId,
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
  const targetIdentity = resolveDirectTargetIdentity(context);
  return repository.saveCompletedRelease({
    releaseId: release.id,
    runtimeAdapterKind: targetIdentity.adapterKind,
    deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
    convergenceOutcome: null,
    providerRevision: {
      ...result.providerRevision,
      metadata: {
        ...result.providerRevision.metadata,
        ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
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

function hasPreparedEcsOutputUrlMetadata(metadata: JsonValue | undefined): boolean {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return false;
  const value = metadata["ecsPreparedOutputUrl"];
  return value === null || (typeof value === "string" && value.trim().length > 0);
}

function reconcileEcsFargateOutputAfterPartialSynchronization(
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "ecs_fargate" }>,
  input: {
    expectedCoordinatesFingerprint: string;
    outputs: ResolvedEcsFargateRuntimeOutputs;
  }
) {
  try {
    return {
      ...reconcileEcsFargateRuntimeConfig(runtimeConfig, input),
      recoveredPartialSynchronization: false
    };
  } catch (error) {
    if (!(error instanceof EcsFargateOutputReconciliationError)) throw error;
    const currentCoordinatesFingerprint =
      createEcsFargateRuntimeCoordinatesFingerprint(runtimeConfig);
    if (currentCoordinatesFingerprint === input.expectedCoordinatesFingerprint) throw error;
    try {
      const recovered = reconcileEcsFargateRuntimeConfig(runtimeConfig, {
        ...input,
        expectedCoordinatesFingerprint: currentCoordinatesFingerprint
      });
      if (!recovered.changed) {
        return { ...recovered, recoveredPartialSynchronization: true };
      }
    } catch {
      // The original mismatch remains the most accurate failure.
    }
    throw error;
  }
}

function toPreparedEcsFargateRuntimeConfig(
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "ecs_fargate" }>,
  preparedOutputUrl: string | null
): Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "ecs_fargate" }> {
  return {
    ...runtimeConfig,
    outputUrl: preparedOutputUrl
  };
}

function createEcsPreparedOutputUrlMetadata(
  runtimeConfig: Extract<ProjectDeploymentRuntimeConfig, { runtimeTargetKind: "ecs_fargate" }>
): { ecsPreparedOutputUrl: string | null } {
  return { ecsPreparedOutputUrl: runtimeConfig.outputUrl };
}

function resolveFullStackRetryDeploymentTargetFingerprint(
  context: DirectApplicationReleaseContext,
  release: ApplicationReleaseRecord
): string | undefined {
  if (
    context.deployment.scope !== "full_stack" ||
    context.target.runtimeConfig.runtimeTargetKind !== "ecs_fargate"
  ) {
    return undefined;
  }

  const currentIdentity = resolveDirectTargetIdentity(context);
  if (
    !release.deploymentTargetFingerprint ||
    release.deploymentTargetFingerprint === currentIdentity.deploymentTargetFingerprint
  ) {
    return currentIdentity.deploymentTargetFingerprint;
  }

  const preparedIdentity = resolveAwsDeploymentTargetIdentity({
    projectId: context.deployment.projectId,
    accountId: context.connection.accountId,
    region: context.connection.region,
    runtimeConfig: toPreparedEcsFargateRuntimeConfig(
      context.target.runtimeConfig,
      readMetadataString(release.providerRevision?.metadata, "ecsPreparedOutputUrl")
    ),
    healthCheckPath: context.target.confirmedBuildConfig.healthCheckPath
  });
  if (release.deploymentTargetFingerprint !== preparedIdentity.deploymentTargetFingerprint) {
    throw new DirectApplicationReleaseError(
      "Prepared release deployment target fingerprint no longer matches the confirmed target"
    );
  }
  return currentIdentity.deploymentTargetFingerprint;
}

async function requireContext(
  input: { deploymentId: string; userId: string },
  repository: Pick<DirectApplicationReleaseRepository, "findContext">
): Promise<DirectApplicationReleaseContext> {
  const context = await repository.findContext(input.deploymentId, input.userId);
  if (!context) throw new DirectApplicationReleaseError("managed deployment target was not found");
  return context;
}

function assertContextMatchesTarget(
  context: DirectApplicationReleaseContext
): asserts context is DirectApplicationReleaseContext & {
  sourceRepository: NonNullable<DirectApplicationReleaseContext["sourceRepository"]>;
} {
  if (
    !context.sourceRepository ||
    context.deployment.targetKind !== context.target.runtimeTargetKind ||
    context.target.runtimeConfig?.runtimeTargetKind !== context.target.runtimeTargetKind
  ) {
    throw new DirectApplicationReleaseError(
      "managed deployment runtime does not match the confirmed project target"
    );
  }
}

function createReleaseExecutionCoordinates(
  context: DirectApplicationReleaseContext
): Pick<ApplicationReleaseRecord, "deploymentId" | "pipelineRunId" | "source"> {
  return context.deployment.source === "gitops"
    ? {
        deploymentId: null,
        pipelineRunId: context.deployment.id,
        source: "gitops"
      }
    : {
        deploymentId: context.deployment.id,
        pipelineRunId: null,
        source: "direct"
      };
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

function resolveExpectedStorageNamespace(context: DirectApplicationReleaseContext): string | null {
  const runtime = context.target.runtimeConfig;
  if (runtime.runtimeTargetKind === "ecs_fargate") return runtime.ecrRepositoryName;
  if (runtime.runtimeTargetKind === "static_site") return runtime.hostingBucketName;
  return null;
}

function createProviderLocation(
  context: DirectApplicationReleaseContext,
  artifactReference: string
): ApplicationArtifact["location"] {
  const runtime = context.target.runtimeConfig;
  let storageNamespace: string;

  if (runtime.runtimeTargetKind === "ecs_fargate") {
    const match =
      /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?\/(.+)@sha256:[a-f0-9]{64}$/u.exec(
        artifactReference
      );
    if (
      !match?.[1] ||
      !match[2] ||
      !match[3] ||
      match[1] !== context.connection.accountId ||
      match[2] !== context.connection.region ||
      match[3] !== runtime.ecrRepositoryName
    ) {
      throw new DirectApplicationReleaseError(
        "Prepared container artifact does not belong to the approved ECR target"
      );
    }
    storageNamespace = match[3];
  } else {
    const match = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\/(.+)$/u.exec(artifactReference);
    if (!match?.[1] || !match[2]) {
      throw new DirectApplicationReleaseError(
        "Prepared application artifact must use an approved provider object reference"
      );
    }
    storageNamespace = match[1];
    if (
      runtime.runtimeTargetKind === "static_site" &&
      storageNamespace !== runtime.hostingBucketName
    ) {
      throw new DirectApplicationReleaseError(
        "Prepared static artifact does not belong to the approved hosting bucket"
      );
    }
  }

  return {
    provider: "aws",
    accountId: context.connection.accountId,
    region: context.connection.region,
    storageNamespace,
    artifactReference,
    ownershipScope: `project:${context.deployment.projectId}`
  };
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
    (["succeeded", "partially_failed", "partially_cancelled"].includes(result.status)
      ? state !== "healthy"
      : state !== "restored")
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

function resolveDirectTargetIdentity(context: DirectApplicationReleaseContext) {
  try {
    return resolveAwsDeploymentTargetIdentity({
      projectId: context.deployment.projectId,
      accountId: context.connection.accountId,
      region: context.connection.region,
      runtimeTarget: context.target.runtimeTarget,
      runtimeConfig: context.target.runtimeConfig,
      healthCheckPath: context.target.confirmedBuildConfig.healthCheckPath,
      persistedDeploymentTargetFingerprint: context.target.deploymentTargetFingerprint
    });
  } catch (error) {
    if (error instanceof DeploymentTargetFingerprintMismatchError) {
      throw new DirectApplicationReleaseError(
        "Confirmed deployment target fingerprint does not match its runtime configuration"
      );
    }
    throw error;
  }
}

function createDirectRuntimeProviderGateway(input: {
  readonly gateway: DirectApplicationReleaseGateway;
  readonly context: DirectApplicationReleaseContext;
  readonly target: RuntimeDeploymentTarget;
  readonly artifact: DirectApplicationArtifact;
  readonly now: () => Date;
  readonly recordRolloutResult: (
    result: Awaited<ReturnType<DirectApplicationReleaseGateway["deployArtifact"]>>
  ) => void;
  readonly abortSignal?: AbortSignal | undefined;
}): RuntimeProviderGateway {
  return {
    async readCurrentState() {
      if (!input.gateway.inspectCurrentRuntime) {
        throw new Error("Runtime provider inspection is unavailable");
      }
      return input.gateway.inspectCurrentRuntime({
        context: input.context,
        target: input.target,
        artifact: input.artifact,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
      });
    },
    async rollout(rolloutInput) {
      const result = await input.gateway.deployArtifact({
        context: input.context,
        artifact: input.artifact,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
      });
      input.recordRolloutResult(result);
      validateRuntimeResult(result, input.context, input.artifact);
      const state: RuntimeProviderCurrentState = {
        adapterKind: input.target.adapterKind,
        deploymentTargetFingerprint: rolloutInput.deploymentTargetFingerprint,
        scope: {
          projectId: input.context.deployment.projectId,
          provider: "aws",
          accountId: input.context.connection.accountId,
          region: input.context.connection.region
        },
        target: input.target,
        artifact: {
          ...rolloutInput.artifact,
          artifactFingerprint: requireArtifactFingerprint(input.artifact)
        },
        providerRevision: result.providerRevision,
        health: {
          status: "healthy",
          verifiedAt: readVerifiedAt(result.healthEvidence) ?? input.now().toISOString()
        },
        healthEvidence: result.healthEvidence,
        rollbackEvidence: toRuntimeRollbackEvidence(result.rollbackEvidence)
      };
      if (result.status === "rolled_back") {
        throw new RuntimeRolloutRolledBackError(state);
      }
      if (result.status === "cancelled") {
        throw new DirectApplicationReleaseError("Runtime rollout was cancelled after rollback");
      }
      return state;
    }
  };
}

function createRuntimeGatewayRecord(
  gateway: RuntimeProviderGateway
): Record<RuntimeAdapterKind, RuntimeProviderGateway> {
  return {
    ecs_service_fargate: gateway,
    ecs_service_ec2_capacity_provider: gateway,
    ec2_instance: gateway,
    ec2_auto_scaling_group: gateway,
    eks_managed_node_group: gateway,
    eks_self_managed_node: gateway,
    eks_fargate_profile: gateway,
    kubernetes_deployment: gateway,
    lambda_alias: gateway,
    static_s3_cloudfront: gateway
  };
}

function requireArtifactFingerprint(artifact: DirectApplicationArtifact): string {
  if (!artifact.artifactFingerprint || !/^[a-f0-9]{64}$/u.test(artifact.artifactFingerprint)) {
    throw new DirectApplicationReleaseError("Application artifact fingerprint is required");
  }
  return artifact.artifactFingerprint;
}

function resolveDirectRuntimeArtifact(
  context: DirectApplicationReleaseContext,
  artifact: DirectApplicationArtifact
): RuntimeProviderCurrentState["artifact"] {
  const artifactFingerprint = requireArtifactFingerprint(artifact);
  const apiOciDigest = readMetadataString(artifact.metadata, "apiOciDigest");
  const releaseCandidateId = readMetadataString(artifact.metadata, "releaseCandidateId");
  const runtime = context.target.runtimeConfig;
  if (
    runtime.runtimeTargetKind === "ecs_fargate" &&
    releaseCandidateId &&
    apiOciDigest &&
    /^[a-f0-9]{64}$/u.test(apiOciDigest)
  ) {
    return {
      artifactFingerprint,
      digestAlgorithm: "sha256",
      digest: apiOciDigest,
      reference: `${context.connection.accountId}.dkr.ecr.${context.connection.region}.amazonaws.com/${runtime.ecrRepositoryName}@sha256:${apiOciDigest}`
    };
  }
  return {
    artifactFingerprint,
    digestAlgorithm: "sha256",
    digest: artifact.digest,
    reference: artifact.reference
  };
}

function resolveDirectOutputUrl(context: DirectApplicationReleaseContext): string {
  const outputUrl = context.target.runtimeConfig.outputUrl;
  if (!outputUrl) {
    throw new DirectApplicationReleaseError("DEPLOYMENT_OUTPUT_URL_REQUIRED");
  }
  return outputUrl;
}

function appendConvergenceEvidence(
  healthEvidence: JsonValue,
  convergence: RuntimeConvergenceResult
): JsonValue {
  const commonEvidence = {
    contractVersion: convergence.contractVersion,
    adapterKind: convergence.adapterKind,
    outcome: convergence.outcome,
    deploymentTargetFingerprint: convergence.deploymentTargetFingerprint,
    artifactFingerprint: convergence.artifactFingerprint,
    artifactDigestAlgorithm: convergence.artifactDigestAlgorithm,
    artifactDigest: convergence.artifactDigest,
    providerStateVerifiedAt: convergence.providerStateVerifiedAt,
    fallbackReason: convergence.fallbackReason
  };
  return healthEvidence && typeof healthEvidence === "object" && !Array.isArray(healthEvidence)
    ? { ...healthEvidence, convergence: commonEvidence }
    : { state: "healthy", convergence: commonEvidence };
}

function readVerifiedAt(evidence: JsonValue): string | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const verifiedAt = evidence["verifiedAt"];
  return typeof verifiedAt === "string" && !Number.isNaN(Date.parse(verifiedAt))
    ? verifiedAt
    : null;
}

function toRuntimeRollbackEvidence(
  evidence: JsonValue | null
): RuntimeProviderCurrentState["rollbackEvidence"] {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return null;
    }
    normalized[key] = value;
  }
  return normalized;
}

function toDirectProviderRevision(
  revision: RuntimeProviderCurrentState["providerRevision"]
): ApplicationReleaseProviderRevision {
  if (revision.provider !== "aws") {
    throw new DirectApplicationReleaseError(
      "Direct runtime provider revision must belong to the approved AWS target"
    );
  }
  return { ...revision, provider: "aws" };
}

function toDirectReleaseRecord(
  release: typeof applicationReleases.$inferSelect
): DirectApplicationReleaseRecord {
  assertDirectApplicationReleaseRecord(release);
  const deploymentId = release.deploymentId;
  return {
    ...release,
    deploymentId,
    pipelineRunId: null,
    source: "direct"
  };
}

function assertDirectApplicationReleaseRecord(
  release: ApplicationReleaseRecord
): asserts release is DirectApplicationReleaseRecord {
  if (!release.deploymentId || release.source !== "direct" || release.pipelineRunId !== null) {
    throw new DirectApplicationReleaseError("Application release is not a Direct release");
  }
}
