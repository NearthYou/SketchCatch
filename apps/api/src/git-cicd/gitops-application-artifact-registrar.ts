import {
  APPLICATION_ARTIFACT_CONTRACT_VERSION,
  type ApplicationArtifact,
  type ConfirmedBuildConfig,
  type GitOpsReleaseEvidence,
  type ProjectDeploymentRuntimeConfig,
  type RuntimeTargetKind,
  type SourceRepositoryProvider
} from "@sketchcatch/types";
import { and, eq } from "drizzle-orm";
import { createApplicationArtifactIdentity } from "../artifacts/application-artifact-identity.js";
import {
  applicationArtifactKindForRuntime,
  applicationArtifactPlatformForRuntime
} from "../artifacts/application-artifact-runtime.js";
import {
  resolveApplicationArtifact,
  type ApplicationArtifactProviderVerifier,
  type ApplicationArtifactRegistryRepository
} from "../artifacts/application-artifact-registry.js";
import { createAwsApplicationArtifactProviderVerifier } from "../artifacts/aws-application-artifact-verifier.js";
import { createPostgresApplicationArtifactRegistryRepository } from "../artifacts/postgres-application-artifact-registry.js";
import type { Database } from "../db/client.js";
import {
  awsConnections,
  gitCicdPipelineRuns,
  projectDeploymentTargets,
  sourceRepositories
} from "../db/schema.js";

export type GitOpsApplicationArtifactContext = {
  readonly projectId: string;
  readonly sourceRepository: {
    readonly id: string;
    readonly provider: SourceRepositoryProvider;
    readonly owner: string;
    readonly name: string;
  };
  readonly target: {
    readonly runtimeTargetKind: RuntimeTargetKind;
    readonly confirmedBuildConfig: ConfirmedBuildConfig;
    readonly runtimeConfig: ProjectDeploymentRuntimeConfig;
  };
  readonly connection: {
    readonly accountId: string;
    readonly roleArn: string;
    readonly externalId: string;
    readonly region: string;
  };
};

export type GitOpsApplicationArtifactContextRepository = {
  findContext(input: {
    readonly projectId: string;
    readonly pipelineRunId: string;
  }): Promise<GitOpsApplicationArtifactContext | undefined>;
};

export type GitOpsApplicationArtifactRegistrar = {
  register(input: {
    readonly projectId: string;
    readonly pipelineRunId: string;
    readonly commitSha: string;
    readonly evidence: GitOpsReleaseEvidence;
  }): Promise<ApplicationArtifact>;
};

export class GitOpsApplicationArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitOpsApplicationArtifactError";
  }
}

export function createGitOpsApplicationArtifactRegistrar(options: {
  readonly contextRepository: GitOpsApplicationArtifactContextRepository;
  readonly artifactRegistry: ApplicationArtifactRegistryRepository;
  readonly createVerifier: (
    context: GitOpsApplicationArtifactContext
  ) => ApplicationArtifactProviderVerifier;
  readonly now?: () => Date;
}): GitOpsApplicationArtifactRegistrar {
  const now = options.now ?? (() => new Date());

  return {
    async register(input) {
      const context = await options.contextRepository.findContext({
        projectId: input.projectId,
        pipelineRunId: input.pipelineRunId
      });
      if (!context || context.projectId !== input.projectId) {
        throw new GitOpsApplicationArtifactError(
          "GitOps application artifact context was not found"
        );
      }
      if (
        context.target.runtimeTargetKind !== input.evidence.runtimeTargetKind ||
        context.target.runtimeConfig.runtimeTargetKind !== input.evidence.runtimeTargetKind ||
        input.evidence.commitSha.toLowerCase() !== input.commitSha.toLowerCase() ||
        context.target.confirmedBuildConfig.confirmedCommitSha.toLowerCase() !==
          input.commitSha.toLowerCase()
      ) {
        throw new GitOpsApplicationArtifactError(
          "GitOps application artifact does not match the confirmed target"
        );
      }

      const identity = createApplicationArtifactIdentity({
        repository: {
          provider: context.sourceRepository.provider,
          owner: context.sourceRepository.owner,
          name: context.sourceRepository.name
        },
        commitSha: input.commitSha,
        kind: applicationArtifactKindForRuntime(input.evidence.runtimeTargetKind),
        confirmedBuildConfig: context.target.confirmedBuildConfig,
        buildContractVersion: APPLICATION_ARTIFACT_CONTRACT_VERSION,
        ...applicationArtifactPlatformForRuntime(input.evidence.runtimeTargetKind),
        buildInputs: {}
      });
      const built = readEvidenceArtifact(input.evidence, context);
      assertConfirmedRuntimeNamespace(context, built.location);
      validateVersionedEvidence(input.evidence, identity.artifactFingerprint, built);
      const timestamp = now();
      const result = await resolveApplicationArtifact({
        projectId: input.projectId,
        sourceRepositoryId: context.sourceRepository.id,
        identity,
        expectedLocation: {
          provider: built.location.provider,
          accountId: context.connection.accountId,
          region: context.connection.region,
          storageNamespace: built.location.storageNamespace,
          artifactReference: built.location.artifactReference,
          ownershipScope: `project:${input.projectId}`
        },
        now: timestamp,
        repository: options.artifactRegistry,
        verifier: options.createVerifier(context),
        build: async () => built
      });
      return result.artifact;
    }
  };
}

export function createPostgresGitOpsApplicationArtifactRegistrar(
  db: Database
): GitOpsApplicationArtifactRegistrar {
  return createGitOpsApplicationArtifactRegistrar({
    contextRepository: createPostgresGitOpsApplicationArtifactContextRepository(db),
    artifactRegistry: createPostgresApplicationArtifactRegistryRepository(db),
    createVerifier(context) {
      return createAwsApplicationArtifactProviderVerifier({
        projectId: context.projectId,
        ...context.connection
      });
    }
  });
}

export function createPostgresGitOpsApplicationArtifactContextRepository(
  db: Database
): GitOpsApplicationArtifactContextRepository {
  return {
    async findContext(input) {
      const [row] = await db
        .select({
          projectId: gitCicdPipelineRuns.projectId,
          sourceRepositoryId: sourceRepositories.id,
          sourceRepositoryProvider: sourceRepositories.provider,
          sourceRepositoryOwner: sourceRepositories.owner,
          sourceRepositoryName: sourceRepositories.name,
          runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
          confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig,
          runtimeConfig: projectDeploymentTargets.runtimeConfig,
          accountId: awsConnections.accountId,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region
        })
        .from(gitCicdPipelineRuns)
        .innerJoin(
          sourceRepositories,
          eq(sourceRepositories.id, gitCicdPipelineRuns.sourceRepositoryId)
        )
        .innerJoin(
          projectDeploymentTargets,
          eq(projectDeploymentTargets.projectId, gitCicdPipelineRuns.projectId)
        )
        .innerJoin(
          awsConnections,
          and(
            eq(awsConnections.id, projectDeploymentTargets.connectionId),
            eq(awsConnections.region, projectDeploymentTargets.region)
          )
        )
        .where(
          and(
            eq(gitCicdPipelineRuns.id, input.pipelineRunId),
            eq(gitCicdPipelineRuns.projectId, input.projectId),
            eq(sourceRepositories.projectId, input.projectId),
            eq(sourceRepositories.status, "active"),
            eq(awsConnections.status, "verified")
          )
        );
      if (
        !row?.accountId ||
        !row.roleArn ||
        !row.confirmedBuildConfig ||
        !row.runtimeConfig ||
        row.runtimeConfig.runtimeTargetKind !== row.runtimeTargetKind
      ) {
        return undefined;
      }
      return {
        projectId: row.projectId,
        sourceRepository: {
          id: row.sourceRepositoryId,
          provider: row.sourceRepositoryProvider,
          owner: row.sourceRepositoryOwner,
          name: row.sourceRepositoryName
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
    }
  };
}

function readEvidenceArtifact(
  evidence: GitOpsReleaseEvidence,
  context: GitOpsApplicationArtifactContext
): { digest: string; location: ApplicationArtifact["location"] } {
  const digestWithPrefix = evidence.runtimeTargetKind === "ecs_fargate"
    ? evidence.imageDigest
    : evidence.artifactDigest;
  const digest = digestWithPrefix.replace(/^sha256:/u, "");
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new GitOpsApplicationArtifactError("GitOps artifact digest is invalid");
  }
  const reference = evidence.runtimeTargetKind === "ecs_fargate"
    ? evidence.imageUri
    : evidence.runtimeTargetKind === "static_site"
      ? evidence.manifestUri
      : evidence.artifactUri;
  const storageNamespace = resolveStorageNamespace(reference, evidence.runtimeTargetKind);

  return {
    digest,
    location: {
      provider: "aws",
      accountId: context.connection.accountId,
      region: context.connection.region,
      storageNamespace,
      artifactReference: reference,
      ownershipScope: `project:${context.projectId}`
    }
  };
}

function resolveStorageNamespace(reference: string, runtimeTargetKind: RuntimeTargetKind): string {
  if (runtimeTargetKind === "ecs_fargate") {
    const match = /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?\/(.+)@sha256:[a-f0-9]{64}$/u.exec(
      reference
    );
    if (!match?.[3]) {
      throw new GitOpsApplicationArtifactError("GitOps container reference is invalid");
    }
    return match[3];
  }
  const match = /^s3:\/\/([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\/(.+)$/u.exec(reference);
  if (!match?.[1] || !match[2]) {
    throw new GitOpsApplicationArtifactError("GitOps object artifact reference is invalid");
  }
  return match[1];
}

function validateVersionedEvidence(
  evidence: GitOpsReleaseEvidence,
  artifactFingerprint: string,
  built: { digest: string; location: ApplicationArtifact["location"] }
): void {
  if (evidence.schemaVersion === 1) return;
  const artifact = evidence.artifact;
  if (
    artifact.kind !== applicationArtifactKindForRuntime(evidence.runtimeTargetKind) ||
    artifact.artifactFingerprint !== artifactFingerprint ||
    artifact.buildContractVersion !== APPLICATION_ARTIFACT_CONTRACT_VERSION ||
    artifact.digestAlgorithm !== "sha256" ||
    artifact.digest !== built.digest ||
    !sameLocation(artifact.location, built.location)
  ) {
    throw new GitOpsApplicationArtifactError(
      "GitOps release evidence artifact fingerprint or provider metadata is invalid"
    );
  }
}

function assertConfirmedRuntimeNamespace(
  context: GitOpsApplicationArtifactContext,
  location: ApplicationArtifact["location"]
): void {
  const runtime = context.target.runtimeConfig;
  const matchesConfirmedNamespace =
    runtime.runtimeTargetKind === "ecs_fargate"
      ? location.storageNamespace === runtime.ecrRepositoryName
      : runtime.runtimeTargetKind === "static_site"
        ? location.storageNamespace === runtime.hostingBucketName
        : true;
  if (!matchesConfirmedNamespace) {
    throw new GitOpsApplicationArtifactError(
      "GitOps artifact is outside the confirmed runtime namespace"
    );
  }
}

function sameLocation(
  left: ApplicationArtifact["location"],
  right: ApplicationArtifact["location"]
): boolean {
  return (
    left.provider === right.provider &&
    left.accountId === right.accountId &&
    left.region === right.region &&
    left.storageNamespace === right.storageNamespace &&
    left.artifactReference === right.artifactReference &&
    left.ownershipScope === right.ownershipScope
  );
}
