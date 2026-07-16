import {
  APPLICATION_ARTIFACT_CONTRACT_VERSION,
  type ApplicationArtifact,
  type ApplicationReleaseProviderRevision,
  type ApplicationReleaseStatus,
  type ConfirmedBuildConfig,
  type DeploymentScope,
  type DeploymentSource,
  type JsonValue,
  type ProjectDeploymentRuntimeConfig,
  type RuntimeAdapterKind,
  type RuntimeConvergenceOutcome,
  type RuntimeDeploymentTarget,
  type RuntimeTargetKind
} from "@sketchcatch/types";
import { and, eq } from "drizzle-orm";
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
  awsConnections,
  deployments,
  projectDeploymentTargets,
  projects,
  sourceRepositories
} from "../db/schema.js";
import { resolveApplicationReleaseVersion } from "../releases/application-release-identity.js";
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

export type DirectApplicationReleaseRecord = {
  id: string;
  projectId: string;
  artifactId: string | null;
  deploymentId: string;
  pipelineRunId: null;
  source: "direct";
  runtimeTargetKind: RuntimeTargetKind;
  runtimeAdapterKind: RuntimeAdapterKind | null;
  deploymentTargetFingerprint: string | null;
  convergenceOutcome: RuntimeConvergenceOutcome | null;
  version: string;
  commitSha: string;
  artifactDigestAlgorithm: "sha256";
  artifactDigest: string;
  providerRevision: ApplicationReleaseProviderRevision | null;
  outputUrl: string | null;
  status: ApplicationReleaseStatus;
  healthEvidence: JsonValue | null;
  rollbackEvidence: JsonValue | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DirectApplicationReleaseRepository = {
  readonly artifactRegistry: ApplicationArtifactRegistryRepository;
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
    runtimeAdapterKind: RuntimeAdapterKind;
    deploymentTargetFingerprint: string;
    convergenceOutcome: RuntimeConvergenceOutcome | null;
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    rollbackEvidence: JsonValue | null;
    status: "succeeded" | "rolled_back";
    completedAt: Date;
    updatedAt: Date;
  }): Promise<DirectApplicationReleaseRecord>;
  saveFailedRelease(input: {
    releaseId: string;
    completedAt: Date;
    updatedAt: Date;
  }): Promise<DirectApplicationReleaseRecord>;
  resetReleaseForRetry(input: {
    releaseId: string;
    providerRevision: ApplicationReleaseProviderRevision;
    updatedAt: Date;
  }): Promise<DirectApplicationReleaseRecord>;
};

export type DirectApplicationReleaseGateway = {
  prepareArtifact(
    context: DirectApplicationReleaseContext,
    abortSignal?: AbortSignal
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
    status: "succeeded" | "rolled_back";
  }>;
  rollbackArtifact(input: {
    context: DirectApplicationReleaseContext;
    artifact: DirectApplicationArtifact;
    release: DirectApplicationReleaseRecord;
    abortSignal?: AbortSignal;
  }): Promise<{
    providerRevision: ApplicationReleaseProviderRevision;
    outputUrl: string;
    healthEvidence: JsonValue;
    rollbackEvidence: JsonValue | null;
    status: "rolled_back";
  }>;
};

export class DirectApplicationReleaseError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = "DirectApplicationReleaseError";
  }
}

export function createPostgresDirectApplicationReleaseRepository(
  db: Database
): DirectApplicationReleaseRepository {
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
          externalId: awsConnections.externalId,
          accountId: awsConnections.accountId,
          region: awsConnections.region,
          sourceRepositoryId: sourceRepositories.id,
          sourceRepositoryProvider: sourceRepositories.provider,
          sourceRepositoryInstallationId: sourceRepositories.githubInstallationId,
          sourceRepositoryOwner: sourceRepositories.owner,
          sourceRepositoryName: sourceRepositories.name
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
    async savePreparedRelease(input) {
      return db.transaction(async (transaction) => {
        const [release] = await transaction
          .insert(applicationReleases)
          .values(input)
          .returning();
        if (!release?.deploymentId) {
          throw new DirectApplicationReleaseError("Prepared application release was not saved");
        }
        const [linked] = await transaction
          .update(deployments)
          .set({ releaseId: release.id, updatedAt: input.updatedAt })
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
      const [release] = await db
        .update(applicationReleases)
        .set({
          runtimeAdapterKind: input.runtimeAdapterKind,
          deploymentTargetFingerprint: input.deploymentTargetFingerprint,
          convergenceOutcome: input.convergenceOutcome,
          providerRevision: input.providerRevision,
          outputUrl: input.outputUrl,
          healthEvidence: input.healthEvidence,
          rollbackEvidence: input.rollbackEvidence,
          status: input.status,
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
        throw new DirectApplicationReleaseError(
          "Application release was not pending or no longer exists"
        );
      }
      return toDirectReleaseRecord(release);
    },
    async saveFailedRelease(input) {
      const [release] = await db
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
    },
    async resetReleaseForRetry(input) {
      const [release] = await db
        .update(applicationReleases)
        .set({
          providerRevision: input.providerRevision,
          status: "pending",
          convergenceOutcome: null,
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

export async function prepareDirectApplicationRelease(
  input: { deploymentId: string; userId: string; abortSignal?: AbortSignal },
  repository: DirectApplicationReleaseRepository,
  gateway: DirectApplicationReleaseGateway,
  createId: () => string,
  now: () => Date = () => new Date()
): Promise<DirectApplicationReleaseRecord | null> {
  const context = await requireContext(input, repository);
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);

  const existing = await repository.findRelease(input.deploymentId);
  if (existing) {
    if (existing.status === "pending") return existing;
    if (["failed", "rolled_back", "cancelled"].includes(existing.status)) {
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
        providerRevision: {
          provider: "aws",
          resourceType: existing.artifactId ? "application_artifact" : "codebuild_artifact",
          revisionId: existing.artifactId ?? artifactExecutionRevisionId,
          artifactReference: existing.providerRevision.artifactReference,
          metadata: {
            ...existing.providerRevision.metadata,
            ...(preparedBuildRevisionId
              ? { preparedBuildRevisionId }
              : {})
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
      preparedArtifact = await gateway.prepareArtifact(context, input.abortSignal);
      validateArtifact(preparedArtifact, buildConfig.confirmedCommitSha);
      return {
        digest: preparedArtifact.digest,
        location: createProviderLocation(context, preparedArtifact.reference)
      };
    }
  });
  const artifact = resolved.artifact;
  const preparedBuildRevisionId = preparedArtifact?.buildRevisionId;

  return repository.savePreparedRelease({
    id: createId(),
    projectId: context.deployment.projectId,
    artifactId: artifact.id,
    deploymentId: context.deployment.id,
    pipelineRunId: null,
    source: "direct",
    runtimeTargetKind: context.target.runtimeTargetKind,
    runtimeAdapterKind: targetIdentity.adapterKind,
    deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
    convergenceOutcome: null,
    version: resolveApplicationReleaseVersion({
      exactSemVerTag: buildConfig.exactSemVerTag,
      manifestVersion: buildConfig.manifestVersion,
      commitSha: artifact.commitSha
    }),
    commitSha: artifact.commitSha.toLowerCase(),
    artifactDigestAlgorithm: "sha256",
    artifactDigest: artifact.digest,
    providerRevision: {
      provider: "aws",
      resourceType: "application_artifact",
      revisionId: artifact.id,
      artifactReference: artifact.location.artifactReference,
      metadata: {
        ...(preparedArtifact?.metadata ?? {}),
        applicationArtifactId: artifact.id,
        artifactFingerprint: artifact.artifactFingerprint,
        ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {}),
        reuseOutcome: resolved.outcome
      }
    },
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
  input: { deploymentId: string; userId: string; abortSignal?: AbortSignal },
  repository: DirectApplicationReleaseRepository,
  gateway: DirectApplicationReleaseGateway,
  now: () => Date = () => new Date()
): Promise<DirectApplicationReleaseRecord | null> {
  const context = await requireContext(input, repository);
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);

  const release = await repository.findRelease(input.deploymentId);
  const providerRevision = release?.providerRevision ?? null;
  if (
    !release ||
    !["codebuild_artifact", "application_artifact"].includes(
      providerRevision?.resourceType ?? ""
    )
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
  const artifactFingerprint = readMetadataString(
    providerRevision.metadata,
    "artifactFingerprint"
  );
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

  const targetIdentity = resolveDirectTargetIdentity(context);
  if (
    release.deploymentTargetFingerprint &&
    release.deploymentTargetFingerprint !== targetIdentity.deploymentTargetFingerprint
  ) {
    throw new DirectApplicationReleaseError(
      "Prepared release deployment target fingerprint no longer matches the confirmed target"
    );
  }
  const runtimeGateway = createDirectRuntimeProviderGateway({
    gateway,
    context,
    target: targetIdentity.target,
    artifact,
    now,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
  });
  let convergence: RuntimeConvergenceResult;
  try {
    convergence = await createRuntimeConvergenceService({
      adapters: createRuntimeConvergenceAdapterRegistry(
        createRuntimeGatewayRecord(runtimeGateway)
      ),
      now
    }).converge({
      scope: targetIdentity.scope,
      target: targetIdentity.target,
      artifact: {
        artifactFingerprint,
        digestAlgorithm: "sha256",
        digest: artifact.digest,
        reference: artifact.reference
      }
    });
  } catch (error) {
    const timestamp = now();
    if (error instanceof RuntimeRolloutRolledBackError) {
      return repository.saveCompletedRelease({
        releaseId: release.id,
        runtimeAdapterKind: targetIdentity.adapterKind,
        deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
        convergenceOutcome: null,
        providerRevision: toDirectProviderRevision(error.currentState.providerRevision),
        outputUrl: resolveDirectOutputUrl(context),
        healthEvidence: error.currentState.healthEvidence,
        rollbackEvidence: error.currentState.rollbackEvidence,
        status: "rolled_back",
        completedAt: timestamp,
        updatedAt: timestamp
      });
    }
    await repository.saveFailedRelease({
      releaseId: release.id,
      completedAt: timestamp,
      updatedAt: timestamp
    });
    throw error;
  }
  const timestamp = now();
  return repository.saveCompletedRelease({
    releaseId: release.id,
    runtimeAdapterKind: convergence.adapterKind,
    deploymentTargetFingerprint: convergence.deploymentTargetFingerprint,
    convergenceOutcome: convergence.outcome,
    providerRevision: {
      ...toDirectProviderRevision(convergence.providerRevision),
      metadata: {
        ...convergence.providerRevision.metadata,
        ...(preparedBuildRevisionId ? { preparedBuildRevisionId } : {})
      }
    },
    outputUrl: resolveDirectOutputUrl(context),
    healthEvidence: appendConvergenceEvidence(convergence.healthEvidence, convergence),
    rollbackEvidence: convergence.rollbackEvidence,
    status: "succeeded",
    completedAt: timestamp,
    updatedAt: timestamp
  });
}

export async function rollbackDirectApplicationRelease(
  input: { deploymentId: string; userId: string; abortSignal?: AbortSignal },
  repository: DirectApplicationReleaseRepository,
  gateway: DirectApplicationReleaseGateway,
  now: () => Date = () => new Date()
): Promise<DirectApplicationReleaseRecord | null> {
  const context = await requireContext(input, repository);
  if (context.deployment.scope === "infrastructure") return null;
  assertContextMatchesTarget(context);

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
    reference: release.providerRevision.artifactReference,
    buildRevisionId: artifactExecutionRevisionId,
    metadata: release.providerRevision.metadata
  };
  validateArtifact(artifact, context.target.confirmedBuildConfig.confirmedCommitSha);
  const result = await gateway.rollbackArtifact({
    context,
    artifact,
    release,
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

async function requireContext(
  input: { deploymentId: string; userId: string },
  repository: DirectApplicationReleaseRepository
): Promise<DirectApplicationReleaseContext> {
  const context = await repository.findContext(input.deploymentId, input.userId);
  if (!context) throw new DirectApplicationReleaseError("Direct deployment target was not found");
  return context;
}

function assertContextMatchesTarget(
  context: DirectApplicationReleaseContext
): asserts context is DirectApplicationReleaseContext & {
  sourceRepository: NonNullable<DirectApplicationReleaseContext["sourceRepository"]>;
} {
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

  if (
    context.target.runtimeConfig?.runtimeTargetKind === "ecs_fargate" &&
    !context.target.runtimeConfig?.outputUrl
  ) {
    throw new DirectApplicationReleaseError(
      "DEPLOYMENT_OUTPUT_URL_REQUIRED",
      "DEPLOYMENT_OUTPUT_URL_REQUIRED"
    );
  }
}

function resolveExpectedStorageNamespace(
  context: DirectApplicationReleaseContext
): string | null {
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
    const match = /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?\/(.+)@sha256:[a-f0-9]{64}$/u.exec(
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
    const match = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\/(.+)$/u.exec(
      artifactReference
    );
    if (!match?.[1] || !match[2]) {
      throw new DirectApplicationReleaseError(
        "Prepared application artifact must use an approved provider object reference"
      );
    }
    storageNamespace = match[1];
    if (runtime.runtimeTargetKind === "static_site" && storageNamespace !== runtime.hostingBucketName) {
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
    (result.status === "succeeded" ? state !== "healthy" : state !== "restored")
  ) {
    throw new DirectApplicationReleaseError(
      "Observed AWS runtime revision does not match the prepared application artifact"
    );
  }
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
          artifactFingerprint: requireArtifactFingerprint(input.artifact),
          digestAlgorithm: "sha256",
          digest: input.artifact.digest,
          reference: input.artifact.reference
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
