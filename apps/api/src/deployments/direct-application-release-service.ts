import type {
  ApplicationReleaseProviderRevision,
  ApplicationReleaseStatus,
  ConfirmedBuildConfig,
  DeploymentScope,
  DeploymentSource,
  JsonValue,
  ProjectDeploymentRuntimeConfig,
  RuntimeTargetKind
} from "@sketchcatch/types";
import { and, eq } from "drizzle-orm";
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

export type DirectApplicationReleaseContext = {
  sourceRepository: {
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
  };
  connection: {
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

export type DirectApplicationReleaseRecord = {
  id: string;
  projectId: string;
  deploymentId: string;
  pipelineRunId: null;
  source: "direct";
  runtimeTargetKind: RuntimeTargetKind;
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
  constructor(message: string) {
    super(message);
    this.name = "DirectApplicationReleaseError";
  }
}

export function createPostgresDirectApplicationReleaseRepository(
  db: Database
): DirectApplicationReleaseRepository {
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
          externalId: awsConnections.externalId,
          region: awsConnections.region,
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
          metadata: { preparedBuildRevisionId: buildRevisionId }
        },
        updatedAt: now()
      });
    }
    throw new DirectApplicationReleaseError(
      `Application artifact cannot be prepared from release status ${existing.status}`
    );
  }

  const artifact = await gateway.prepareArtifact(context, input.abortSignal);
  validateArtifact(artifact, context.target.confirmedBuildConfig.confirmedCommitSha);
  const timestamp = now();
  const buildConfig = context.target.confirmedBuildConfig;

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
    providerRevision: {
      provider: "aws",
      resourceType: "codebuild_artifact",
      revisionId: artifact.buildRevisionId,
      artifactReference: artifact.reference,
      metadata: artifact.metadata
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
    await repository.saveFailedRelease({
      releaseId: release.id,
      completedAt: timestamp,
      updatedAt: timestamp
    });
    throw error;
  }
  validateRuntimeResult(result, context, artifact);
  const timestamp = now();
  return repository.saveCompletedRelease({
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
    status: result.status,
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
  repository: DirectApplicationReleaseRepository
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
    context.target.runtimeConfig.runtimeTargetKind !== context.target.runtimeTargetKind
  ) {
    throw new DirectApplicationReleaseError(
      "Direct deployment runtime does not match the confirmed project target"
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
