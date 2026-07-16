import {
  BatchGetBuildsCommand,
  BatchGetProjectsCommand,
  CodeBuildClient,
  StartBuildCommand,
  StopBuildCommand,
  type CodeBuildClientConfig,
  type EnvironmentVariable
} from "@aws-sdk/client-codebuild";
import { and, desc, eq, or } from "drizzle-orm";
import type {
  ApplicationReleaseStatus,
  ApplicationReleaseProviderRevision,
  GitOpsReleaseEvidence,
  JsonValue,
  RuntimeTargetKind
} from "@sketchcatch/types";
import { createAwsSdkStsGateway } from "../aws-connections/aws-connection-test-service.js";
import { createAwsProjectBuildEnvironmentGateway } from "../build-environments/aws-project-build-environment-gateway.js";
import {
  createDesiredProjectBuildEnvironment,
  type ProjectBuildEnvironmentGateway
} from "../build-environments/project-build-environment-service.js";
import { getDatabaseClient } from "../db/client.js";
import { applicationReleases, releaseCandidates } from "../db/schema.js";
import { createAwsEcsFargateReleaseGateway } from "../releases/aws-ecs-fargate-release-gateway.js";
import {
  beginReleaseCandidateUpload,
  createPostgresReleaseCandidateRepository,
  finalizeReleaseCandidate,
  type ReleaseCandidateRepository,
  type ReleaseCandidateStorage
} from "../releases/release-candidate-service.js";
import { createS3ReleaseCandidateStorage } from "../releases/s3-release-candidate-storage.js";
import { createPostgresTrustedReleaseRepository } from "../releases/trusted-release-step-repository.js";
import {
  executeTrustedEcsRollback,
  executeTrustedFrontendRetry,
  executeTrustedRelease,
  type TrustedReleaseContext,
  type TrustedReleaseResult
} from "../releases/trusted-release-worker-service.js";
import { renderPreflightBuildspec } from "../releases/preflight-buildspec.js";
import {
  acquireProjectExecutionLease,
  assertCurrentProjectExecutionLease,
  createPostgresProjectExecutionLeaseRepository,
  heartbeatProjectExecutionLease,
  recordProjectExecutionCoordinates,
  releaseProjectExecutionLease,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import {
  DirectApplicationReleaseError,
  type ApplicationReleaseRecord,
  type DirectApplicationArtifact,
  type DirectApplicationReleaseContext,
  type DirectApplicationReleaseGateway,
  type DirectApplicationReleaseRecord
} from "./direct-application-release-service.js";
import { createDirectApplicationReleaseEvidenceVerifier } from "./direct-application-release-evidence-verifier.js";

export type CodeBuildCommandClient = {
  send(
    command: { input: Record<string, unknown> },
    options?: { abortSignal?: AbortSignal }
  ): Promise<CodeBuildCommandResponse>;
  destroy(): void;
};

type CodeBuildCommandResponse = {
  build?: { id?: string };
  builds?: Array<{
    buildStatus?: string;
    exportedEnvironmentVariables?: Array<{ name?: string; value?: string }>;
  }>;
  projects?: Array<{
    name?: string;
    source?: {
      type?: string;
      location?: string;
      auth?: { type?: string };
    };
  }>;
};

export type VerifiedDirectRuntimeRelease = {
  providerRevision: ApplicationReleaseProviderRevision;
  outputUrl: string;
  healthEvidence: JsonValue;
  rollbackEvidence: JsonValue | null;
  status: Extract<ApplicationReleaseStatus, "succeeded" | "rolled_back">;
};

export type VerifyDirectReleaseEvidence = (input: {
  context: DirectApplicationReleaseContext;
  artifact: DirectApplicationArtifact;
  evidence: GitOpsReleaseEvidence;
}) => Promise<VerifiedDirectRuntimeRelease>;

type AssumeDirectReleaseRole = (input: {
  roleArn: string;
  externalId: string;
  region: string;
  roleSessionName: string;
  durationSeconds?: number;
  policy?: string;
  abortSignal?: AbortSignal;
}) => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }>;

type CreateCodeBuildClient = (configuration: CodeBuildClientConfig) => CodeBuildCommandClient;
type WaitForCodeBuildPoll = (milliseconds: number, abortSignal?: AbortSignal) => Promise<void>;

export function createAwsCodeBuildDirectApplicationReleaseGateway(options: {
  assumeRole?: AssumeDirectReleaseRole;
  createClient?: CreateCodeBuildClient;
  wait?: WaitForCodeBuildPoll;
  verifyEvidence?: VerifyDirectReleaseEvidence;
  releaseCandidateRepository?: ReleaseCandidateRepository;
  releaseCandidateStorage?: ReleaseCandidateStorage;
  executionLeaseRepository?: ProjectExecutionLeaseRepository;
  generateCandidateId?: () => string;
  now?: () => Date;
  verifyBuildEnvironment?: (context: DirectApplicationReleaseContext) => Promise<void>;
} = {}): DirectApplicationReleaseGateway {
  const assumeRole = options.assumeRole ?? (async (input) => {
    const credentials = await createAwsSdkStsGateway().assumeRole(input);
    return credentials;
  });
  const createClient = options.createClient ?? ((configuration) =>
    new CodeBuildClient(configuration) as unknown as CodeBuildCommandClient);
  const wait = options.wait ?? waitForPoll;
  const verifyEvidence =
    options.verifyEvidence ?? createDirectApplicationReleaseEvidenceVerifier();
  const getCandidateStorage = () =>
    options.releaseCandidateStorage ?? createS3ReleaseCandidateStorage();
  const verifyBuildEnvironment =
    options.verifyBuildEnvironment ?? verifyCurrentProjectBuildEnvironment;

  const getPreflightDependencies = () => {
    const db = getDatabaseClient().db;
    return {
      candidateRepository:
        options.releaseCandidateRepository ?? createPostgresReleaseCandidateRepository(db),
      candidateStorage: getCandidateStorage(),
      leaseRepository:
        options.executionLeaseRepository ?? createPostgresProjectExecutionLeaseRepository(db)
    };
  };

  return {
    async prepareArtifact(context, abortSignal, prepareOptions) {
      if (context.target.runtimeTargetKind === "ecs_fargate" && context.target.confirmedBuildConfig.ecsWeb) {
        return prepareEcsWebReleaseCandidate({
          context,
          assumeRole,
          createClient,
          wait,
          dependencies: getPreflightDependencies(),
          verifyBuildEnvironment,
          ...(prepareOptions?.retainProjectLease ? { retainProjectLease: true } : {}),
          ...(options.generateCandidateId ? { generateCandidateId: options.generateCandidateId } : {}),
          ...(options.now ? { now: options.now } : {}),
          ...(abortSignal ? { abortSignal } : {})
        });
      }
      const result = await runCodeBuildPhase({
        context,
        phase: "prepare",
        assumeRole,
        createClient,
        wait,
        ...(abortSignal ? { abortSignal } : {})
      });
      const commitSha = requireExport(result.exports, "SKETCHCATCH_COMMIT_SHA").toLowerCase();
      const digest = normalizeDigest(
        requireExport(result.exports, "SKETCHCATCH_ARTIFACT_DIGEST")
      );
      const reference = requireExport(result.exports, "SKETCHCATCH_ARTIFACT_REFERENCE");
      return {
        commitSha,
        digest,
        reference,
        buildRevisionId: result.buildId,
        metadata: {
          buildProjectName: requireCodeBuildProjectName(context),
          region: context.connection.region,
          runtimeTargetKind: context.target.runtimeTargetKind
        }
      };
    },
    async deployArtifact({ context, artifact, abortSignal }) {
      if (
        context.target.runtimeTargetKind === "ecs_fargate" &&
        context.target.confirmedBuildConfig.ecsWeb &&
        readMetadataString(artifact.metadata, "releaseCandidateId")
      ) {
        return deployEcsWebTrustedRelease({
          context,
          artifact,
          ...(abortSignal ? { abortSignal } : {})
        });
      }
      const result = await runCodeBuildPhase({
        context,
        artifact,
        phase: "deploy",
        assumeRole,
        createClient,
        wait,
        ...(abortSignal ? { abortSignal } : {})
      });
      const evidenceName = releaseEvidenceExportName(context.target.runtimeTargetKind);
      const evidence = parseReleaseEvidence(
        requireExport(result.exports, evidenceName),
        context.target.runtimeTargetKind
      );
      return verifyEvidence({ context, artifact, evidence });
    },
    async rollbackArtifact({ context, artifact, release, abortSignal, retainProjectLease }) {
      if (
        context.target.runtimeTargetKind === "ecs_fargate" &&
        context.target.confirmedBuildConfig.ecsWeb &&
        readMetadataString(artifact.metadata, "releaseCandidateId")
      ) {
        return rollbackEcsWebTrustedRelease({
          context,
          artifact,
          release,
          ...(retainProjectLease ? { retainProjectLease: true } : {}),
          ...(abortSignal ? { abortSignal } : {})
        });
      }
      const result = await runCodeBuildPhase({
        context,
        artifact,
        release,
        phase: "cleanup",
        assumeRole,
        createClient,
        wait,
        ...(abortSignal ? { abortSignal } : {})
      });
      const evidenceName = releaseEvidenceExportName(context.target.runtimeTargetKind);
      const evidence = parseReleaseEvidence(
        requireExport(result.exports, evidenceName),
        context.target.runtimeTargetKind
      );
      const verified = await verifyEvidence({ context, artifact, evidence });
      if (verified.status !== "rolled_back") {
        throw new DirectApplicationReleaseError(
          "Application cleanup did not restore the previous runtime revision"
        );
      }
      return { ...verified, status: "rolled_back" };
    },
    async retryFrontend({ context, release }) {
      return retryEcsWebTrustedFrontend({ context, release });
    },
    async cleanupArtifact({ artifact }) {
      const storage = getCandidateStorage();
      if (!storage.deleteObjectVersion) return;
      const apiObjectKey = readMetadataString(artifact.metadata, "apiArchiveObjectKey");
      const apiVersionId = readMetadataString(artifact.metadata, "apiArchiveObjectVersionId");
      const frontendObjectKey = readMetadataString(
        artifact.metadata,
        "frontendArchiveObjectKey"
      );
      const frontendVersionId = readMetadataString(
        artifact.metadata,
        "frontendArchiveObjectVersionId"
      );
      if (!apiObjectKey || !apiVersionId || !frontendObjectKey || !frontendVersionId) return;
      await Promise.all([
        storage.deleteObjectVersion({ objectKey: apiObjectKey, versionId: apiVersionId }),
        storage.deleteObjectVersion({
          objectKey: frontendObjectKey,
          versionId: frontendVersionId
        })
      ]);
    }
  };
}

async function deployEcsWebTrustedRelease(input: {
  context: DirectApplicationReleaseContext;
  artifact: DirectApplicationArtifact;
  abortSignal?: AbortSignal;
}) {
  await verifyCurrentProjectBuildEnvironment(input.context);
  const { db } = getDatabaseClient();
  const candidateId = readMetadataString(input.artifact.metadata, "releaseCandidateId");
  if (!candidateId) {
    throw new DirectApplicationReleaseError(
      "Approved ReleaseCandidate ID is missing",
      "APPLICATION_RELEASE_CANDIDATE_REQUIRED"
    );
  }
  const [release] = await db
    .select()
    .from(applicationReleases)
    .where(
      and(
        input.context.deployment.source === "gitops"
          ? eq(applicationReleases.pipelineRunId, input.context.deployment.id)
          : eq(applicationReleases.deploymentId, input.context.deployment.id),
        eq(applicationReleases.projectId, input.context.deployment.projectId),
        eq(applicationReleases.source, input.context.deployment.source),
        eq(applicationReleases.status, "pending")
      )
    );
  const [candidate] = await db
    .select()
    .from(releaseCandidates)
    .where(
      and(
        eq(releaseCandidates.id, candidateId),
        eq(releaseCandidates.projectId, input.context.deployment.projectId),
        input.context.deployment.source === "gitops"
          ? eq(releaseCandidates.pipelineRunId, input.context.deployment.id)
          : eq(releaseCandidates.deploymentId, input.context.deployment.id),
        eq(releaseCandidates.status, "pending")
      )
    );
  if (
    !release ||
    !candidate ||
    !release.providerRevision ||
    release.releaseCandidateId !== candidate.id ||
    candidate.compositeDigest !== input.artifact.digest ||
    candidate.commitSha !== input.artifact.commitSha ||
    !input.context.buildEnvironment ||
    candidate.configFingerprint !== input.context.buildEnvironment.runtimeFingerprint ||
    candidate.expiresAt <= new Date()
  ) {
    throw new DirectApplicationReleaseError(
      "Approved ReleaseCandidate changed or expired before activation",
      "APPLICATION_RELEASE_CANDIDATE_MISMATCH"
    );
  }
  const [baseline] = await db
    .select()
    .from(applicationReleases)
    .where(
      and(
        eq(applicationReleases.projectId, release.projectId),
        eq(applicationReleases.runtimeTargetKind, release.runtimeTargetKind),
        eq(applicationReleases.status, "succeeded")
      )
    )
    .orderBy(desc(applicationReleases.completedAt), desc(applicationReleases.createdAt))
    .limit(1);
  const activationBaselineReleaseId = baseline?.id ?? null;
  if (release.baselineReleaseId !== activationBaselineReleaseId) {
    await db
      .update(applicationReleases)
      .set({ baselineReleaseId: activationBaselineReleaseId, updatedAt: new Date() })
      .where(
        and(
          eq(applicationReleases.id, release.id),
          eq(applicationReleases.status, "pending")
        )
      );
  }
  const runtime = input.context.target.runtimeConfig;
  const build = input.context.target.confirmedBuildConfig.ecsWeb;
  if (
    runtime.runtimeTargetKind !== "ecs_fargate" ||
    !runtime.ecrRepositoryArn ||
    !runtime.taskDefinitionFamily ||
    !runtime.taskDefinitionArn ||
    !runtime.taskRoleArn ||
    !runtime.executionRoleArn ||
    !runtime.targetGroupArn ||
    !runtime.loadBalancerArn ||
    !runtime.loadBalancerDnsName ||
    !runtime.frontendBucketName ||
    !runtime.cloudFrontDistributionId ||
    !runtime.cloudFrontDomainName ||
    !runtime.outputUrl ||
    typeof runtime.containerPort !== "number" ||
    !build
  ) {
    throw new DirectApplicationReleaseError(
      "Terraform Apply output is incomplete for trusted ECS release",
      "APPLICATION_RELEASE_RUNTIME_INCOMPLETE"
    );
  }
  const persistedBaseline = resolvePersistedEcsReleaseBaseline({
    baselineReleaseId: activationBaselineReleaseId,
    baseline,
    projectId: input.context.deployment.projectId
  });
  const trustedContext = {
    projectId: input.context.deployment.projectId,
    deploymentId:
      input.context.deployment.source === "direct" ? input.context.deployment.id : null,
    releaseId: release.id,
    source: input.context.deployment.source,
    fencingHolderId:
      input.context.deployment.source === "gitops"
        ? input.context.deployment.id
        : input.context.deployment.id,
    connection: input.context.connection,
    candidate: {
      id: candidate.id,
      commitSha: candidate.commitSha,
      compositeDigest: candidate.compositeDigest,
      configFingerprint: candidate.configFingerprint,
      apiOciDigest: candidate.apiOciDigest,
      apiArchiveDigest: candidate.apiArchiveDigest,
      apiArchiveByteSize: candidate.apiArchiveByteSize,
      frontendArchiveDigest: candidate.frontendArchiveDigest,
      frontendArchiveByteSize: candidate.frontendArchiveByteSize,
      frontendManifestDigest: candidate.frontendManifestDigest,
      frontendIndexDigest: candidate.frontendIndexDigest,
      apiArchiveObjectKey: candidate.apiArchiveObjectKey,
      apiArchiveObjectVersionId: candidate.apiArchiveObjectVersionId,
      frontendArchiveObjectKey: candidate.frontendArchiveObjectKey,
      frontendArchiveObjectVersionId: candidate.frontendArchiveObjectVersionId,
      frontendManifestObjectKey: candidate.frontendManifestObjectKey,
      frontendManifestObjectVersionId: candidate.frontendManifestObjectVersionId,
      manifestObjectKey: candidate.manifestObjectKey,
      manifestObjectVersionId: candidate.manifestObjectVersionId,
      expiresAt: candidate.expiresAt.toISOString()
    },
    baseline: persistedBaseline,
    runtime: {
      clusterName: runtime.clusterName,
      serviceName: runtime.serviceName,
      containerName: runtime.containerName,
      containerPort: runtime.containerPort,
      taskDefinitionFamily: runtime.taskDefinitionFamily,
      taskDefinitionArn: runtime.taskDefinitionArn,
      taskRoleArn: runtime.taskRoleArn,
      executionRoleArn: runtime.executionRoleArn,
      targetGroupArn: runtime.targetGroupArn,
      loadBalancerArn: runtime.loadBalancerArn,
      loadBalancerDnsName: runtime.loadBalancerDnsName,
      ecrRepositoryName: runtime.ecrRepositoryName,
      ecrRepositoryArn: runtime.ecrRepositoryArn,
      frontendBucketName: runtime.frontendBucketName,
      cloudFrontDistributionId: runtime.cloudFrontDistributionId,
      cloudFrontDomainName: runtime.cloudFrontDomainName,
      outputUrl: runtime.outputUrl,
      healthCheckPath: build.api.healthCheckPath,
      apiProbePath: "/api/check-ins"
    }
  };
  const result = await executeTrustedRelease(
    trustedContext,
    createPostgresTrustedReleaseRepository(db),
    createAwsEcsFargateReleaseGateway(),
    createPostgresProjectExecutionLeaseRepository(db),
    {
      releaseLeaseOnCompletion: false,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    }
  );
  assertTrustedRollbackCanBeRecorded(result.status, trustedContext.baseline);
  if (result.status === "succeeded") {
    return {
      providerRevision: {
        provider: "aws" as const,
        resourceType: "ecs_task_definition" as const,
        revisionId: result.taskDefinitionArn,
        artifactReference: candidate.manifestObjectKey,
        metadata: {
          taskDefinitionArn: result.taskDefinitionArn,
          previousTaskDefinitionArn: result.previousTaskDefinitionArn,
          imageDigest: result.imageDigest,
          imageUri: result.imageUri,
          releaseCandidateId: candidate.id,
          frontendManifestVersionId: result.frontendEvidence.manifestVersionId,
          frontendIndexVersionId: result.frontendEvidence.indexVersionId,
          cloudFrontInvalidationId: result.frontendEvidence.invalidationId
        }
      },
      outputUrl: runtime.outputUrl,
      healthEvidence: {
        state: "healthy",
        ecs: result.healthEvidence,
        public: result.publicEvidence
      } as JsonValue,
      rollbackEvidence: null,
      frontendEvidence: result.frontendEvidence,
      failureStage: null,
      status: "succeeded" as const
    };
  }
  if (result.status === "partially_failed") {
    return {
      providerRevision: {
        provider: "aws" as const,
        resourceType: "ecs_task_definition" as const,
        revisionId: result.taskDefinitionArn,
        artifactReference: candidate.manifestObjectKey,
        metadata: {
          taskDefinitionArn: result.taskDefinitionArn,
          previousTaskDefinitionArn: result.previousTaskDefinitionArn,
          imageDigest: result.imageDigest,
          imageUri: result.imageUri,
          releaseCandidateId: candidate.id
        }
      },
      outputUrl: runtime.outputUrl,
      healthEvidence: { state: "healthy", ecs: result.healthEvidence } as JsonValue,
      rollbackEvidence: null,
      frontendEvidence: result.frontendEvidence ?? null,
      failureStage: result.failureStage,
      status: "partially_failed" as const
    };
  }
  if (result.status === "partially_cancelled") {
    return {
      providerRevision: {
        provider: "aws" as const,
        resourceType: "ecs_task_definition" as const,
        revisionId: result.taskDefinitionArn,
        artifactReference: candidate.manifestObjectKey,
        metadata: {
          taskDefinitionArn: result.taskDefinitionArn,
          previousTaskDefinitionArn: result.previousTaskDefinitionArn,
          imageDigest: result.imageDigest,
          imageUri: result.imageUri,
          releaseCandidateId: candidate.id
        }
      },
      outputUrl: runtime.outputUrl,
      healthEvidence: { state: "healthy", ecs: result.healthEvidence } as JsonValue,
      rollbackEvidence: null,
      frontendEvidence: result.frontendEvidence ?? null,
      failureStage: result.failureStage,
      status: "partially_cancelled" as const
    };
  }
  return {
    providerRevision: {
      provider: "aws" as const,
      resourceType: "ecs_task_definition" as const,
      revisionId: result.rollbackTaskDefinitionArn,
      artifactReference: candidate.manifestObjectKey,
      metadata: {
        taskDefinitionArn: result.rollbackTaskDefinitionArn,
        imageDigest: result.imageDigest,
        releaseCandidateId: candidate.id
      }
    },
    outputUrl: runtime.outputUrl,
    healthEvidence: { state: "restored" } as JsonValue,
    rollbackEvidence: result.rollbackEvidence,
    frontendEvidence: null,
    failureStage: "ecs_health" as const,
    status: result.status === "cancelled" ? "cancelled" as const : "rolled_back" as const
  };
}

async function retryEcsWebTrustedFrontend(input: {
  context: DirectApplicationReleaseContext;
  release: ApplicationReleaseRecord;
}) {
  const { db } = getDatabaseClient();
  const [release] = await db
    .select()
    .from(applicationReleases)
    .where(
      and(
        eq(applicationReleases.id, input.release.id),
        eq(applicationReleases.projectId, input.context.deployment.projectId),
        eq(applicationReleases.source, input.context.deployment.source),
        or(
          and(
            eq(applicationReleases.source, "direct"),
            eq(applicationReleases.deploymentId, input.context.deployment.id)
          ),
          and(
            eq(applicationReleases.source, "gitops"),
            eq(applicationReleases.pipelineRunId, input.context.deployment.id)
          )
        ),
        eq(applicationReleases.status, "partially_failed")
      )
    );
  const candidateId = release?.releaseCandidateId;
  const [candidate] = candidateId
    ? await db
        .select()
        .from(releaseCandidates)
        .where(
          and(
            eq(releaseCandidates.id, candidateId),
            eq(releaseCandidates.projectId, input.context.deployment.projectId),
            input.context.deployment.source === "direct"
              ? eq(releaseCandidates.deploymentId, input.context.deployment.id)
              : eq(releaseCandidates.pipelineRunId, input.context.deployment.id),
            eq(releaseCandidates.status, "partially_failed")
          )
        )
    : [];
  const retryExpiresAt = candidate?.frontendRetryExpiresAt;
  const taskDefinitionArn = readProviderMetadataString(
    release?.providerRevision?.metadata,
    "taskDefinitionArn"
  ) ?? release?.providerRevision?.revisionId ?? null;
  if (
    !release ||
    !candidate ||
    !retryExpiresAt ||
    retryExpiresAt <= new Date() ||
    !taskDefinitionArn ||
    !input.context.buildEnvironment ||
    candidate.configFingerprint !== input.context.buildEnvironment.runtimeFingerprint ||
    candidate.commitSha !== release.commitSha ||
    candidate.compositeDigest !== release.compositeDigest?.value
  ) {
    throw new DirectApplicationReleaseError(
      "Frontend retry Artifact expired or no longer matches the approved runtime",
      "APPLICATION_RELEASE_FRONTEND_RETRY_MISMATCH"
    );
  }
  const trustedContext = createTrustedReleaseContext({
    context: input.context,
    release,
    candidate,
    expiresAt: retryExpiresAt
  });
  return executeTrustedFrontendRetry(
    trustedContext,
    taskDefinitionArn,
    createPostgresTrustedReleaseRepository(db),
    createAwsEcsFargateReleaseGateway(),
    createPostgresProjectExecutionLeaseRepository(db)
  );
}

async function rollbackEcsWebTrustedRelease(input: {
  context: DirectApplicationReleaseContext;
  artifact: DirectApplicationArtifact;
  release: DirectApplicationReleaseRecord;
  abortSignal?: AbortSignal;
  retainProjectLease?: boolean;
}) {
  const { db } = getDatabaseClient();
  const candidateId = readMetadataString(input.artifact.metadata, "releaseCandidateId");
  const [release] = await db
    .select()
    .from(applicationReleases)
    .where(
      and(
        eq(applicationReleases.id, input.release.id),
        eq(applicationReleases.deploymentId, input.context.deployment.id),
        eq(applicationReleases.projectId, input.context.deployment.projectId),
        eq(applicationReleases.source, "direct"),
        eq(applicationReleases.status, "succeeded")
      )
    );
  const [candidate] = candidateId
    ? await db
        .select()
        .from(releaseCandidates)
        .where(
          and(
            eq(releaseCandidates.id, candidateId),
            eq(releaseCandidates.projectId, input.context.deployment.projectId),
            eq(releaseCandidates.deploymentId, input.context.deployment.id),
            eq(releaseCandidates.status, "succeeded")
          )
        )
    : [];
  const [baseline] = release?.baselineReleaseId
    ? await db
        .select()
        .from(applicationReleases)
        .where(eq(applicationReleases.id, release.baselineReleaseId))
        .limit(1)
    : [];
  if (
    !release ||
    !candidate ||
    !release.providerRevision ||
    release.releaseCandidateId !== candidate.id ||
    candidate.compositeDigest !== input.release.compositeDigest?.value ||
    release.providerRevision?.revisionId !== input.release.providerRevision?.revisionId
  ) {
    throw new DirectApplicationReleaseError(
      "Application release changed before trusted ECS rollback",
      "APPLICATION_RELEASE_ROLLBACK_MISMATCH"
    );
  }
  const persistedBaseline = resolvePersistedEcsReleaseBaseline({
    baselineReleaseId: release.baselineReleaseId,
    baseline,
    projectId: input.context.deployment.projectId
  });
  if (!persistedBaseline) {
    throw new DirectApplicationReleaseError(
      "No previous successful application release is available for manual rollback",
      "APPLICATION_RELEASE_BASELINE_REQUIRED"
    );
  }
  const rolledBackFromTaskDefinitionArn = release.providerRevision.revisionId;
  const trustedContext = createTrustedReleaseContext({
    context: input.context,
    release,
    candidate,
    expiresAt: candidate.expiresAt,
    baseline: persistedBaseline
  });
  const result = await executeTrustedEcsRollback(
    trustedContext as TrustedReleaseContext & {
      baseline: NonNullable<TrustedReleaseContext["baseline"]>;
    },
    createPostgresTrustedReleaseRepository(db),
    createAwsEcsFargateReleaseGateway(),
    createPostgresProjectExecutionLeaseRepository(db),
    {
      releaseLeaseOnCompletion: !input.retainProjectLease,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    }
  );
  const outputUrl = trustedContext.runtime.outputUrl;
  return {
    providerRevision: {
      provider: "aws" as const,
      resourceType: "ecs_task_definition" as const,
      revisionId: result.taskDefinitionArn,
      artifactReference: candidate.manifestObjectKey,
      metadata: {
        taskDefinitionArn: result.taskDefinitionArn,
        imageDigest: result.imageDigest,
        releaseCandidateId: candidate.id,
        rolledBackFromTaskDefinitionArn
      }
    },
    outputUrl,
    healthEvidence: { state: "restored", rollback: result.rollbackEvidence } as JsonValue,
    rollbackEvidence: result.rollbackEvidence,
    status: "rolled_back" as const
  };
}

function createTrustedReleaseContext(input: {
  context: DirectApplicationReleaseContext;
  release: typeof applicationReleases.$inferSelect;
  candidate: typeof releaseCandidates.$inferSelect;
  expiresAt: Date;
  baseline?: TrustedReleaseContext["baseline"];
}): TrustedReleaseContext {
  const runtime = input.context.target.runtimeConfig;
  const build = input.context.target.confirmedBuildConfig.ecsWeb;
  if (
    runtime.runtimeTargetKind !== "ecs_fargate" ||
    !runtime.ecrRepositoryArn ||
    !runtime.taskDefinitionFamily ||
    !runtime.taskDefinitionArn ||
    !runtime.taskRoleArn ||
    !runtime.executionRoleArn ||
    !runtime.targetGroupArn ||
    !runtime.loadBalancerArn ||
    !runtime.loadBalancerDnsName ||
    !runtime.frontendBucketName ||
    !runtime.cloudFrontDistributionId ||
    !runtime.cloudFrontDomainName ||
    !runtime.outputUrl ||
    typeof runtime.containerPort !== "number" ||
    !build
  ) {
    throw new DirectApplicationReleaseError(
      "Terraform Apply output is incomplete for trusted ECS release",
      "APPLICATION_RELEASE_RUNTIME_INCOMPLETE"
    );
  }
  return {
    projectId: input.context.deployment.projectId,
    deploymentId:
      input.context.deployment.source === "direct" ? input.context.deployment.id : null,
    releaseId: input.release.id,
    source: input.context.deployment.source,
    fencingHolderId: input.release.id,
    connection: input.context.connection,
    candidate: {
      id: input.candidate.id,
      commitSha: input.candidate.commitSha,
      compositeDigest: input.candidate.compositeDigest,
      configFingerprint: input.candidate.configFingerprint,
      apiOciDigest: input.candidate.apiOciDigest,
      apiArchiveDigest: input.candidate.apiArchiveDigest,
      apiArchiveByteSize: input.candidate.apiArchiveByteSize,
      frontendArchiveDigest: input.candidate.frontendArchiveDigest,
      frontendArchiveByteSize: input.candidate.frontendArchiveByteSize,
      frontendManifestDigest: input.candidate.frontendManifestDigest,
      frontendIndexDigest: input.candidate.frontendIndexDigest,
      apiArchiveObjectKey: input.candidate.apiArchiveObjectKey,
      apiArchiveObjectVersionId: input.candidate.apiArchiveObjectVersionId,
      frontendArchiveObjectKey: input.candidate.frontendArchiveObjectKey,
      frontendArchiveObjectVersionId: input.candidate.frontendArchiveObjectVersionId,
      frontendManifestObjectKey: input.candidate.frontendManifestObjectKey,
      frontendManifestObjectVersionId: input.candidate.frontendManifestObjectVersionId,
      manifestObjectKey: input.candidate.manifestObjectKey,
      manifestObjectVersionId: input.candidate.manifestObjectVersionId,
      expiresAt: input.expiresAt.toISOString()
    },
    baseline: input.baseline ?? null,
    runtime: {
      clusterName: runtime.clusterName,
      serviceName: runtime.serviceName,
      containerName: runtime.containerName,
      containerPort: runtime.containerPort,
      taskDefinitionFamily: runtime.taskDefinitionFamily,
      taskDefinitionArn: runtime.taskDefinitionArn,
      taskRoleArn: runtime.taskRoleArn,
      executionRoleArn: runtime.executionRoleArn,
      targetGroupArn: runtime.targetGroupArn,
      loadBalancerArn: runtime.loadBalancerArn,
      loadBalancerDnsName: runtime.loadBalancerDnsName,
      ecrRepositoryName: runtime.ecrRepositoryName,
      ecrRepositoryArn: runtime.ecrRepositoryArn,
      frontendBucketName: runtime.frontendBucketName,
      cloudFrontDistributionId: runtime.cloudFrontDistributionId,
      cloudFrontDomainName: runtime.cloudFrontDomainName,
      outputUrl: runtime.outputUrl,
      healthCheckPath: build.api.healthCheckPath,
      apiProbePath: "/api/check-ins"
    }
  };
}

function readMetadataString(
  metadata: Record<string, string | number | boolean | null>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readProviderMetadataString(metadata: JsonValue | undefined, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function resolvePersistedEcsReleaseBaseline(input: {
  baselineReleaseId: string | null;
  baseline:
    | {
        id: string;
        projectId: string;
        runtimeTargetKind: RuntimeTargetKind;
        status: ApplicationReleaseStatus;
        providerRevision: ApplicationReleaseProviderRevision | null;
      }
    | undefined;
  projectId: string;
}): TrustedReleaseContext["baseline"] {
  if (!input.baselineReleaseId) return null;
  const baseline = input.baseline;
  if (
    !baseline ||
    baseline.id !== input.baselineReleaseId ||
    baseline.projectId !== input.projectId ||
    baseline.runtimeTargetKind !== "ecs_fargate" ||
    baseline.status !== "succeeded" ||
    baseline.providerRevision?.provider !== "aws" ||
    baseline.providerRevision.resourceType !== "ecs_task_definition"
  ) {
    throw new DirectApplicationReleaseError(
      "The persisted rollback baseline is missing or no longer valid",
      "APPLICATION_RELEASE_BASELINE_INVALID"
    );
  }
  const taskDefinitionArn =
    readProviderMetadataString(baseline.providerRevision.metadata, "taskDefinitionArn") ??
    baseline.providerRevision.revisionId;
  const imageDigest = readProviderMetadataString(
    baseline.providerRevision.metadata,
    "imageDigest"
  );
  if (!taskDefinitionArn || !imageDigest) {
    throw new DirectApplicationReleaseError(
      "The persisted rollback baseline has incomplete ECS evidence",
      "APPLICATION_RELEASE_BASELINE_INVALID"
    );
  }
  return {
    releaseId: baseline.id,
    taskDefinitionArn,
    imageDigest
  };
}

export function assertTrustedRollbackCanBeRecorded(
  status: TrustedReleaseResult["status"],
  baseline: TrustedReleaseContext["baseline"]
): void {
  if (status === "rolled_back" && !baseline) {
    throw new DirectApplicationReleaseError(
      "The first application release restored the bootstrap Task Definition, but no successful application release exists to record as a rollback",
      "APPLICATION_RELEASE_BOOTSTRAP_RESTORED"
    );
  }
}

async function prepareEcsWebReleaseCandidate(input: {
  context: DirectApplicationReleaseContext;
  abortSignal?: AbortSignal;
  assumeRole: AssumeDirectReleaseRole;
  createClient: CreateCodeBuildClient;
  wait: WaitForCodeBuildPoll;
  dependencies: {
    candidateRepository: ReleaseCandidateRepository;
    candidateStorage: ReleaseCandidateStorage;
    leaseRepository: ProjectExecutionLeaseRepository;
  };
  generateCandidateId?: () => string;
  now?: () => Date;
  verifyBuildEnvironment: (context: DirectApplicationReleaseContext) => Promise<void>;
  retainProjectLease?: boolean;
}): Promise<DirectApplicationArtifact> {
  const buildEnvironment = input.context.buildEnvironment;
  const build = input.context.target.confirmedBuildConfig;
  const ecsWeb = build.ecsWeb;
  if (!buildEnvironment || buildEnvironment.status !== "ready" || !ecsWeb) {
    throw new DirectApplicationReleaseError(
      "A verified project build environment is required before preflight",
      "BUILD_ENVIRONMENT_NOT_READY"
    );
  }
  if (input.abortSignal?.aborted) {
    throw new DirectApplicationReleaseError("Preflight was cancelled", "PREFLIGHT_CANCELLED");
  }

  const now = input.now ?? (() => new Date());
  const isGitOps = input.context.deployment.source === "gitops";
  const lease = await acquireProjectExecutionLease(
    {
      projectId: input.context.deployment.projectId,
      holderId: input.context.deployment.id,
      source: isGitOps ? "gitops" : "direct"
    },
    input.dependencies.leaseRepository,
    { now }
  );
  let client: CodeBuildCommandClient | undefined;
  let buildId: string | undefined;
  let releaseLeaseOnExit = !input.retainProjectLease;
  try {
    await input.verifyBuildEnvironment(input.context);
    await assertCurrentProjectExecutionLease(
      {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      },
      input.dependencies.leaseRepository,
      now()
    );
    const upload = await beginReleaseCandidateUpload(
      {
        projectId: input.context.deployment.projectId,
        deploymentId: isGitOps ? null : input.context.deployment.id,
        pipelineRunId: isGitOps ? input.context.deployment.id : null,
        commitSha: build.confirmedCommitSha.toLowerCase(),
        apiPartCount: 1,
        frontendPartCount: 1,
        manifestPartCount: 1
      },
      input.dependencies.candidateRepository,
      input.dependencies.candidateStorage,
      {
        ...(input.generateCandidateId ? { generateId: input.generateCandidateId } : {}),
        now
      }
    );
    const credentials = await input.assumeRole({
      ...input.context.connection,
      roleSessionName: `sketchcatch-preflight-${input.context.deployment.id}`,
      durationSeconds: 3_600,
      policy: createPreflightCodeBuildSessionPolicy({
        accountId: input.context.connection.accountId,
        region: input.context.connection.region,
        projectName: buildEnvironment.codeBuildProjectName
      }),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    });
    client = input.createClient({ region: input.context.connection.region, credentials });
    await assertCodeBuildProjectSource(
      client,
      input.context,
      input.abortSignal,
      buildEnvironment.codeBuildProjectName
    );
    await input.verifyBuildEnvironment(input.context);
    if (input.abortSignal?.aborted) {
      throw new DirectApplicationReleaseError("Preflight was cancelled", "PREFLIGHT_CANCELLED");
    }
    const started = await client.send(
      new StartBuildCommand({
        projectName: buildEnvironment.codeBuildProjectName,
        sourceVersion: build.confirmedCommitSha,
        buildspecOverride: renderPreflightBuildspec(build),
        environmentVariablesOverride: createPreflightEnvironmentOverrides(input.context, {
          candidateId: upload.candidateId,
          apiUploadUrl: requireSinglePartUrl(upload.uploads.api.partUrls),
          frontendUploadUrl: requireSinglePartUrl(upload.uploads.frontend.partUrls),
          manifestUploadUrl: requireSinglePartUrl(upload.uploads.manifest.partUrls)
        })
      }) as unknown as { input: Record<string, unknown> },
      input.abortSignal ? { abortSignal: input.abortSignal } : undefined
    );
    buildId = started.build?.id;
    if (!buildId) {
      throw new DirectApplicationReleaseError(
        "CodeBuild did not return a preflight build ID",
        "PREFLIGHT_START_FAILED"
      );
    }
    await recordProjectExecutionCoordinates(
      {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion,
        activeCodeBuildId: buildId
      },
      input.dependencies.leaseRepository,
      now()
    );

    const exports = await waitForPreflightBuild({
      client,
      buildId,
      lease: {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      },
      leaseRepository: input.dependencies.leaseRepository,
      wait: input.wait,
      now,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    });
    const commitSha = requireExport(exports, "SKETCHCATCH_COMMIT_SHA").toLowerCase();
    if (commitSha !== build.confirmedCommitSha.toLowerCase()) {
      throw new DirectApplicationReleaseError(
        "Preflight commit does not match the approved source revision",
        "PREFLIGHT_CHECKOUT_FAILED"
      );
    }
    await assertCurrentProjectExecutionLease(
      {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      },
      input.dependencies.leaseRepository,
      now()
    );
    const leaseFence = {
      projectId: lease.projectId,
      holderId: lease.holderId,
      fencingVersion: lease.fencingVersion
    };
    const candidate = await runWithProjectLeaseHeartbeat(
      leaseFence,
      input.dependencies.leaseRepository,
      now,
      (heartbeat) => finalizeReleaseCandidate(
        {
        candidateId: upload.candidateId,
        projectId: input.context.deployment.projectId,
        deploymentId: isGitOps ? null : input.context.deployment.id,
        pipelineRunId: isGitOps ? input.context.deployment.id : null,
        commitSha,
        uploads: {
          api: {
            uploadId: upload.uploads.api.uploadId,
            parts: [
              { partNumber: 1, etag: requireExport(exports, "SKETCHCATCH_API_UPLOAD_ETAG") }
            ]
          },
          frontend: {
            uploadId: upload.uploads.frontend.uploadId,
            parts: [
              {
                partNumber: 1,
                etag: requireExport(exports, "SKETCHCATCH_FRONTEND_UPLOAD_ETAG")
              }
            ]
          },
          manifest: {
            uploadId: upload.uploads.manifest.uploadId,
            parts: [
              {
                partNumber: 1,
                etag: requireExport(exports, "SKETCHCATCH_MANIFEST_UPLOAD_ETAG")
              }
            ]
          }
        },
        apiArchiveDigest: normalizeDigest(
          requireExport(exports, "SKETCHCATCH_API_ARCHIVE_DIGEST")
        ),
        apiOciDigest: normalizeDigest(requireExport(exports, "SKETCHCATCH_API_OCI_DIGEST")),
        frontendArchiveDigest: normalizeDigest(
          requireExport(exports, "SKETCHCATCH_FRONTEND_ARCHIVE_DIGEST")
        ),
        frontendManifestDigest: normalizeDigest(
          requireExport(exports, "SKETCHCATCH_FRONTEND_MANIFEST_DIGEST")
        ),
        apiArchiveByteSize: requirePositiveIntegerExport(
          exports,
          "SKETCHCATCH_API_ARCHIVE_SIZE"
        ),
        frontendArchiveByteSize: requirePositiveIntegerExport(
          exports,
          "SKETCHCATCH_FRONTEND_ARCHIVE_SIZE"
        ),
        expectedBuildEnvironmentId: upload.buildEnvironmentId,
        expectedConfigFingerprint: upload.configFingerprint
        },
        input.dependencies.candidateRepository,
        input.dependencies.candidateStorage,
        { now, leaseFence, heartbeat }
      )
    );
    if (isGitOps) releaseLeaseOnExit = false;
    return {
      commitSha,
      digest: candidate.compositeDigest.value,
      reference: candidate.manifestObjectKey,
      buildRevisionId: buildId,
      metadata: {
        releaseCandidateId: candidate.id,
        buildEnvironmentId: buildEnvironment.id,
        configFingerprint: buildEnvironment.runtimeFingerprint,
        apiOciDigest: candidate.compositeDigest.apiOciDigest,
        frontendManifestDigest: candidate.compositeDigest.frontendManifestDigest,
        apiArchiveObjectKey: candidate.apiArchiveObjectKey,
        apiArchiveObjectVersionId: candidate.apiArchiveObjectVersionId,
        frontendArchiveObjectKey: candidate.frontendArchiveObjectKey,
        frontendArchiveObjectVersionId: candidate.frontendArchiveObjectVersionId,
        frontendManifestObjectKey: candidate.frontendManifestObjectKey,
        frontendManifestObjectVersionId: candidate.frontendManifestObjectVersionId,
        manifestObjectVersionId: candidate.manifestObjectVersionId
      }
    };
  } catch (error) {
    if (client && buildId) {
      try {
        await stopCodeBuildAndConfirm(client, buildId, input.wait);
      } catch {
        releaseLeaseOnExit = false;
        throw new DirectApplicationReleaseError(
          "Preflight CodeBuild termination could not be confirmed; recovery is required",
          "PREFLIGHT_STOP_UNCONFIRMED"
        );
      }
    }
    throw error;
  } finally {
    client?.destroy();
    if (releaseLeaseOnExit) {
      await releaseProjectExecutionLease(
        {
          projectId: lease.projectId,
          holderId: lease.holderId,
          fencingVersion: lease.fencingVersion
        },
        input.dependencies.leaseRepository
      ).catch(() => false);
    }
  }
}

export function createPreflightCodeBuildSessionPolicy(input: {
  accountId: string;
  region: string;
  projectName: string;
}): string {
  const projectArn = `arn:aws:codebuild:${input.region}:${input.accountId}:project/${input.projectName}`;
  const buildArn = `arn:aws:codebuild:${input.region}:${input.accountId}:build/${input.projectName}:*`;
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["codebuild:BatchGetProjects", "codebuild:StartBuild"],
        Resource: projectArn
      },
      {
        Effect: "Allow",
        Action: ["codebuild:BatchGetBuilds", "codebuild:StopBuild"],
        Resource: buildArn
      }
    ]
  });
}

async function runWithProjectLeaseHeartbeat<T>(
  fence: { projectId: string; holderId: string; fencingVersion: number },
  repository: ProjectExecutionLeaseRepository,
  now: () => Date,
  operation: (heartbeat: () => Promise<void>) => Promise<T>
): Promise<T> {
  let heartbeatError: unknown;
  let heartbeatInFlight: Promise<void> = Promise.resolve();
  const heartbeat = async () => {
    heartbeatInFlight = heartbeatInFlight.then(async () => {
      if (heartbeatError) return;
      try {
        await heartbeatProjectExecutionLease(fence, repository, { now });
      } catch (error) {
        heartbeatError = error;
      }
    });
    await heartbeatInFlight;
    if (heartbeatError) throw heartbeatError;
  };
  const timer = setInterval(() => {
    void heartbeat().catch(() => undefined);
  }, 30_000);
  timer.unref?.();
  try {
    await heartbeat();
    const result = await operation(heartbeat);
    await heartbeat();
    return result;
  } finally {
    clearInterval(timer);
    await heartbeatInFlight;
  }
}

async function waitForPreflightBuild(input: {
  client: CodeBuildCommandClient;
  buildId: string;
  lease: { projectId: string; holderId: string; fencingVersion: number };
  leaseRepository: ProjectExecutionLeaseRepository;
  wait: WaitForCodeBuildPoll;
  now: () => Date;
  abortSignal?: AbortSignal;
}): Promise<Map<string, string>> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (input.abortSignal?.aborted) {
      throw new DirectApplicationReleaseError("Preflight was cancelled", "PREFLIGHT_CANCELLED");
    }
    await heartbeatProjectExecutionLease(input.lease, input.leaseRepository, { now: input.now });
    const response = await input.client.send(
      new BatchGetBuildsCommand({ ids: [input.buildId] }) as unknown as {
        input: Record<string, unknown>;
      },
      input.abortSignal ? { abortSignal: input.abortSignal } : undefined
    );
    const build = response.builds?.[0];
    const exports = collectCodeBuildExports(build?.exportedEnvironmentVariables);
    if (build?.buildStatus === "SUCCEEDED") return exports;
    if (["FAILED", "FAULT", "STOPPED", "TIMED_OUT"].includes(build?.buildStatus ?? "")) {
      const stage = exports.get("SKETCHCATCH_PREFLIGHT_STAGE") ?? "unknown";
      throw new DirectApplicationReleaseError(
        `Preflight ${stage} stage failed with status ${build?.buildStatus}`,
        `PREFLIGHT_${stage.toUpperCase()}_FAILED`
      );
    }
    await input.wait(5_000, input.abortSignal);
  }
  throw new DirectApplicationReleaseError("Preflight timed out", "PREFLIGHT_TIMED_OUT");
}

export async function verifyCurrentProjectBuildEnvironment(
  context: DirectApplicationReleaseContext,
  gateway: ProjectBuildEnvironmentGateway = createAwsProjectBuildEnvironmentGateway()
): Promise<void> {
  const environment = context.buildEnvironment;
  const sourceRepository = context.sourceRepository;
  const ecsWeb = context.target.confirmedBuildConfig.ecsWeb;
  if (!environment || !sourceRepository || !ecsWeb) {
    throw new DirectApplicationReleaseError(
      "A complete project build environment is required before preflight",
      "BUILD_ENVIRONMENT_NOT_READY"
    );
  }
  const desired = createDesiredProjectBuildEnvironment({
    projectId: context.deployment.projectId,
    sourceRepository: {
      id: `${sourceRepository.owner}/${sourceRepository.name}`,
      owner: sourceRepository.owner,
      name: sourceRepository.name
    },
    awsConnection: {
      id: environment.awsConnectionId,
      accountId: context.connection.accountId,
      roleArn: context.connection.roleArn,
      externalId: context.connection.externalId,
      region: context.connection.region
    },
    codeConnection: {
      id: environment.awsCodeConnectionId,
      connectionArn: environment.codeConnectionArn,
      status: "AVAILABLE"
    },
    confirmedBuildConfig: {
      ...context.target.confirmedBuildConfig,
      ecsWeb
    }
  });
  if (
    desired.runtimeFingerprint !== environment.runtimeFingerprint ||
    desired.codeBuildProjectName !== environment.codeBuildProjectName ||
    desired.codeBuildServiceRoleArn !== environment.codeBuildServiceRoleArn ||
    desired.permissionsBoundaryArn !== environment.permissionsBoundaryArn ||
    desired.sourceRepositoryUrl !== environment.sourceRepositoryUrl
  ) {
    throw new DirectApplicationReleaseError(
      "The stored project build environment no longer matches the approved build configuration",
      "BUILD_ENVIRONMENT_CHANGED"
    );
  }
  const verification = await gateway.verify(desired);
  if (!verification.verified) {
    throw new DirectApplicationReleaseError(
      verification.statusReason ?? "The project build environment could not be verified",
      "BUILD_ENVIRONMENT_VERIFICATION_FAILED"
    );
  }
}

async function stopCodeBuildAndConfirm(
  client: CodeBuildCommandClient,
  buildId: string,
  wait: WaitForCodeBuildPoll
): Promise<void> {
  await client.send(
    new StopBuildCommand({ id: buildId }) as unknown as { input: Record<string, unknown> }
  );
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await client.send(
      new BatchGetBuildsCommand({ ids: [buildId] }) as unknown as {
        input: Record<string, unknown>;
      }
    );
    const status = response.builds?.[0]?.buildStatus;
    if (["STOPPED", "SUCCEEDED", "FAILED", "FAULT", "TIMED_OUT"].includes(status ?? "")) return;
    await wait(1_000);
  }
  throw new DirectApplicationReleaseError(
    "CodeBuild did not reach a terminal state after cancellation",
    "PREFLIGHT_STOP_UNCONFIRMED"
  );
}

function createPreflightEnvironmentOverrides(
  context: DirectApplicationReleaseContext,
  uploadUrls: {
    candidateId: string;
    apiUploadUrl: string;
    frontendUploadUrl: string;
    manifestUploadUrl: string;
  }
): EnvironmentVariable[] {
  const build = context.target.confirmedBuildConfig;
  const ecsWeb = build.ecsWeb;
  if (!ecsWeb) return [];
  const values: Array<[string, string]> = [
    ["SKETCHCATCH_CONFIRMED_COMMIT_SHA", build.confirmedCommitSha],
    ["SKETCHCATCH_CANDIDATE_ID", uploadUrls.candidateId],
    ["SKETCHCATCH_API_SOURCE_ROOT", ecsWeb.api.sourceRoot],
    ["SKETCHCATCH_DOCKERFILE_PATH", ecsWeb.api.dockerfilePath],
    ["SKETCHCATCH_CONTAINER_PORT", String(ecsWeb.api.containerPort)],
    ["SKETCHCATCH_HEALTH_CHECK_PATH", ecsWeb.api.healthCheckPath],
    ["SKETCHCATCH_FRONTEND_SOURCE_ROOT", ecsWeb.frontend.sourceRoot],
    ["SKETCHCATCH_FRONTEND_OUTPUT_PATH", ecsWeb.frontend.outputPath],
    [
      "SKETCHCATCH_FRONTEND_PACKAGE_MANIFEST_PATH",
      ecsWeb.frontend.packageManifestPath
    ],
    ["SKETCHCATCH_FRONTEND_LOCKFILE_PATH", ecsWeb.frontend.lockfilePath],
    ["SKETCHCATCH_PACKAGE_MANAGER", ecsWeb.frontend.packageManager],
    ["SKETCHCATCH_PACKAGE_MANAGER_VERSION", ecsWeb.frontend.packageManagerVersion],
    ["SKETCHCATCH_API_UPLOAD_URL", uploadUrls.apiUploadUrl],
    ["SKETCHCATCH_FRONTEND_UPLOAD_URL", uploadUrls.frontendUploadUrl],
    ["SKETCHCATCH_MANIFEST_UPLOAD_URL", uploadUrls.manifestUploadUrl]
  ];
  return values.map(([name, value]) => ({ name, value, type: "PLAINTEXT" }));
}

function collectCodeBuildExports(
  variables: Array<{ name?: string; value?: string }> | undefined
): Map<string, string> {
  const exports = new Map<string, string>();
  for (const variable of variables ?? []) {
    if (typeof variable.name === "string" && typeof variable.value === "string") {
      exports.set(variable.name, variable.value);
    }
  }
  return exports;
}

function requireSinglePartUrl(parts: Array<{ partNumber: number; url: string }>): string {
  const part = parts.length === 1 ? parts[0] : undefined;
  if (!part || part.partNumber !== 1) {
    throw new DirectApplicationReleaseError(
      "Preflight upload did not return exactly one signed part URL"
    );
  }
  return part.url;
}

function requirePositiveIntegerExport(exports: Map<string, string>, name: string): number {
  const value = Number(requireExport(exports, name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DirectApplicationReleaseError(`CodeBuild export ${name} is not a positive size`);
  }
  return value;
}

async function runCodeBuildPhase(input: {
  context: DirectApplicationReleaseContext;
  artifact?: DirectApplicationArtifact;
  release?: DirectApplicationReleaseRecord;
  phase: "prepare" | "deploy" | "cleanup";
  abortSignal?: AbortSignal;
  assumeRole: AssumeDirectReleaseRole;
  createClient: CreateCodeBuildClient;
  wait: WaitForCodeBuildPoll;
}): Promise<{ buildId: string; exports: Map<string, string> }> {
  const credentials = await input.assumeRole({
    ...input.context.connection,
    roleSessionName: `sketchcatch-direct-${input.phase}-${input.context.deployment.id}`,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
  });
  const client = input.createClient({ region: input.context.connection.region, credentials });
  try {
    await assertCodeBuildProjectSource(client, input.context, input.abortSignal);
    const started = await client.send(
      new StartBuildCommand({
        projectName: requireCodeBuildProjectName(input.context),
        sourceVersion: input.context.target.confirmedBuildConfig.confirmedCommitSha,
        ...(renderDirectBuildspec(input.context, input.phase)
          ? { buildspecOverride: renderDirectBuildspec(input.context, input.phase) }
          : {}),
        environmentVariablesOverride: createEnvironmentOverrides(
          input.context,
          input.phase,
          input.artifact,
          input.release
        )
      }) as unknown as { input: Record<string, unknown> },
      input.abortSignal ? { abortSignal: input.abortSignal } : undefined
    );
    const buildId = started.build?.id;
    if (typeof buildId !== "string" || !buildId.trim()) {
      throw new DirectApplicationReleaseError("CodeBuild did not return a build id");
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await client.send(
        new BatchGetBuildsCommand({ ids: [buildId] }) as unknown as {
          input: Record<string, unknown>;
        },
        input.abortSignal ? { abortSignal: input.abortSignal } : undefined
      );
      const build = response.builds?.[0];
      const status = build?.buildStatus;
      if (status === "SUCCEEDED") {
        const exports = new Map<string, string>();
        for (const variable of build?.exportedEnvironmentVariables ?? []) {
          if (typeof variable.name === "string" && typeof variable.value === "string") {
            exports.set(variable.name, variable.value);
          }
        }
        return { buildId, exports };
      }
      if (["FAILED", "FAULT", "STOPPED", "TIMED_OUT"].includes(status ?? "")) {
        throw new DirectApplicationReleaseError(
          `CodeBuild ${input.phase} phase failed with status ${status}`
        );
      }
      await input.wait(5_000, input.abortSignal);
    }
    throw new DirectApplicationReleaseError(`CodeBuild ${input.phase} phase timed out`);
  } finally {
    client.destroy();
  }
}

async function assertCodeBuildProjectSource(
  client: CodeBuildCommandClient,
  context: DirectApplicationReleaseContext,
  abortSignal?: AbortSignal,
  projectNameOverride?: string
): Promise<void> {
  const projectName = projectNameOverride ?? requireCodeBuildProjectName(context);
  const sourceRepository = context.sourceRepository;
  if (!sourceRepository) {
    throw new DirectApplicationReleaseError(
      "An active GitHub source repository is required for an application release"
    );
  }
  const response = await client.send(
    new BatchGetProjectsCommand({ names: [projectName] }) as unknown as {
      input: Record<string, unknown>;
    },
    abortSignal ? { abortSignal } : undefined
  );
  const project = response.projects?.find((candidate) => candidate.name === projectName);
  const expectedLocation = normalizeGitHubRepositoryLocation(
    sourceRepository.owner,
    sourceRepository.name
  );
  const actualLocation = project?.source?.location
    ? normalizeGitHubLocation(project.source.location)
    : null;
  if (
    !project ||
    project.source?.type !== "GITHUB" ||
    project.source.auth?.type !== "CODECONNECTIONS" ||
    actualLocation !== expectedLocation
  ) {
    throw new DirectApplicationReleaseError(
      "CodeBuild project source repository or GitHub App connection does not match the active project repository"
    );
  }
}

function normalizeGitHubRepositoryLocation(owner: string, name: string): string {
  return `github.com/${owner.toLowerCase()}/${name.toLowerCase().replace(/\.git$/u, "")}`;
}

function normalizeGitHubLocation(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const parts = url.pathname.replace(/^\/+|\/+$/gu, "").split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return normalizeGitHubRepositoryLocation(parts[0], parts[1]);
  } catch {
    return null;
  }
}

function createEnvironmentOverrides(
  context: DirectApplicationReleaseContext,
  phase: "prepare" | "deploy" | "cleanup",
  artifact?: DirectApplicationArtifact,
  release?: DirectApplicationReleaseRecord
): EnvironmentVariable[] {
  const build = context.target.confirmedBuildConfig;
  const runtime = context.target.runtimeConfig;
  const values: Array<[string, string | null | undefined]> = [
    ["SKETCHCATCH_RELEASE_PHASE", phase],
    ["SKETCHCATCH_RUNTIME_TARGET_KIND", context.target.runtimeTargetKind],
    ["SKETCHCATCH_CONFIRMED_COMMIT_SHA", build.confirmedCommitSha],
    ["SKETCHCATCH_SOURCE_ROOT", build.sourceRoot],
    ["SKETCHCATCH_DOCKERFILE_PATH", build.dockerfilePath]
  ];
  if (runtime.runtimeTargetKind === "ecs_fargate") {
    values.push(["SKETCHCATCH_ECR_REPOSITORY", runtime.ecrRepositoryName]);
    if (phase !== "prepare") {
      values.push(
        ["SKETCHCATCH_ECS_CLUSTER", runtime.clusterName],
        ["SKETCHCATCH_ECS_SERVICE", runtime.serviceName],
        ["SKETCHCATCH_ECS_CONTAINER", runtime.containerName],
        ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl],
        ["SKETCHCATCH_HEALTH_CHECK_PATH", build.healthCheckPath ?? "/"]
      );
    }
  } else if (runtime.runtimeTargetKind === "lambda") {
    values.push(
      ["SKETCHCATCH_SAM_TEMPLATE", build.samTemplatePath],
      ["SKETCHCATCH_FUNCTION_LOGICAL_ID", runtime.functionLogicalId],
      ["SKETCHCATCH_LAMBDA_FUNCTION", runtime.functionName],
      ["SKETCHCATCH_LAMBDA_ALIAS", runtime.aliasName],
      ["SKETCHCATCH_CODEDEPLOY_APPLICATION", runtime.codeDeployApplicationName],
      ["SKETCHCATCH_CODEDEPLOY_GROUP", runtime.codeDeployDeploymentGroupName],
      ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl],
      ["SKETCHCATCH_HEALTH_CHECK_PATH", build.healthCheckPath ?? "/"]
    );
  } else if (runtime.runtimeTargetKind === "ec2_asg") {
    values.push(
      ["SKETCHCATCH_APPSPEC_PATH", build.appSpecPath],
      ["SKETCHCATCH_CODEDEPLOY_APPLICATION", runtime.codeDeployApplicationName],
      ["SKETCHCATCH_CODEDEPLOY_GROUP", runtime.codeDeployDeploymentGroupName],
      ["SKETCHCATCH_ASG_NAME", runtime.autoScalingGroupName],
      ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl],
      ["SKETCHCATCH_HEALTH_CHECK_PATH", build.healthCheckPath ?? "/"]
    );
  } else {
    values.push(
      ["SKETCHCATCH_INSTALL_PRESET", build.installPreset],
      ["SKETCHCATCH_STATIC_OUTPUT_PATH", build.staticOutputPath],
      ["SKETCHCATCH_STATIC_BUCKET", runtime.hostingBucketName],
      ["SKETCHCATCH_CLOUDFRONT_DISTRIBUTION_ID", runtime.cloudFrontDistributionId],
      ["SKETCHCATCH_CLOUDFRONT_ORIGIN_ID", runtime.cloudFrontOriginId],
      ["SKETCHCATCH_OUTPUT_URL", runtime.outputUrl]
    );
  }
  if (artifact) {
    values.push(
      ["SKETCHCATCH_ARTIFACT_DIGEST", `sha256:${artifact.digest}`],
      ["SKETCHCATCH_ARTIFACT_REFERENCE", artifact.reference]
    );
  }
  if (release?.providerRevision) {
    values.push(
      ["SKETCHCATCH_CURRENT_PROVIDER_REVISION", release.providerRevision.revisionId],
      [
        "SKETCHCATCH_PREVIOUS_TASK_DEFINITION",
        metadataString(release.providerRevision.metadata, "previousTaskDefinitionArn")
      ],
      [
        "SKETCHCATCH_PREVIOUS_LAMBDA_VERSION",
        metadataString(release.providerRevision.metadata, "previousVersion")
      ],
      [
        "SKETCHCATCH_PREVIOUS_ARTIFACT_URI",
        metadataString(release.providerRevision.metadata, "previousArtifactUri")
      ],
      [
        "SKETCHCATCH_PREVIOUS_ARTIFACT_VERSION_ID",
        metadataString(release.providerRevision.metadata, "previousArtifactVersionId")
      ],
      [
        "SKETCHCATCH_PREVIOUS_RELEASE_PREFIX",
        metadataString(release.providerRevision.metadata, "previousReleasePrefix")
      ],
      [
        "SKETCHCATCH_RELEASE_PREFIX",
        metadataString(release.providerRevision.metadata, "releasePrefix")
      ],
      [
        "SKETCHCATCH_MANIFEST_VERSION_ID",
        metadataString(release.providerRevision.metadata, "manifestVersionId")
      ]
    );
  }
  return values
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, value]) => ({ name, value, type: "PLAINTEXT" }));
}

function renderDirectBuildspec(
  context: DirectApplicationReleaseContext,
  phase: "prepare" | "deploy" | "cleanup"
): string | undefined {
  if (context.target.runtimeTargetKind !== "ecs_fargate") return undefined;
  if (phase === "prepare") return renderEcsPrepareBuildspec();
  return phase === "deploy" ? renderEcsDeployBuildspec() : renderEcsCleanupBuildspec();
}

function renderEcsPrepareBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  exported-variables:
    - SKETCHCATCH_COMMIT_SHA
    - SKETCHCATCH_ARTIFACT_DIGEST
    - SKETCHCATCH_ARTIFACT_REFERENCE

phases:
  pre_build:
    commands:
      - set -euo pipefail
      - test "$CODEBUILD_RESOLVED_SOURCE_VERSION" = "$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
      - test -f "$SKETCHCATCH_DOCKERFILE_PATH"
      - AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      - ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$SKETCHCATCH_ECR_REPOSITORY"
      - aws ecr describe-repositories --repository-names "$SKETCHCATCH_ECR_REPOSITORY" >/dev/null
      - aws ecr get-login-password | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com"
  build:
    commands:
      - docker build --file "$SKETCHCATCH_DOCKERFILE_PATH" --tag "$ECR_URI:$SKETCHCATCH_CONFIRMED_COMMIT_SHA" "$SKETCHCATCH_SOURCE_ROOT"
  post_build:
    commands:
      - docker push "$ECR_URI:$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
      - IMAGE_DIGEST=$(aws ecr describe-images --repository-name "$SKETCHCATCH_ECR_REPOSITORY" --image-ids imageTag="$SKETCHCATCH_CONFIRMED_COMMIT_SHA" --query 'imageDetails[0].imageDigest' --output text)
      - test "$(aws ecr describe-images --repository-name "$SKETCHCATCH_ECR_REPOSITORY" --image-ids imageDigest="$IMAGE_DIGEST" --query 'imageDetails[0].imageDigest' --output text)" = "$IMAGE_DIGEST"
      - SKETCHCATCH_COMMIT_SHA="$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
      - SKETCHCATCH_ARTIFACT_DIGEST="$IMAGE_DIGEST"
      - SKETCHCATCH_ARTIFACT_REFERENCE="$ECR_URI@$IMAGE_DIGEST"
`;
}

function renderEcsDeployBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  exported-variables:
    - SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64

phases:
  build:
    commands:
      - |
        set -euo pipefail
        test "$CODEBUILD_RESOLVED_SOURCE_VERSION" = "$SKETCHCATCH_CONFIRMED_COMMIT_SHA"
        [[ "$SKETCHCATCH_ARTIFACT_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]
        [[ "$SKETCHCATCH_ARTIFACT_REFERENCE" == *@"$SKETCHCATCH_ARTIFACT_DIGEST" ]]
        aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --output json > service-before.json
        PREVIOUS_TASK_DEFINITION=$(jq -r '.services[0].taskDefinition // empty' service-before.json)
        test -n "$PREVIOUS_TASK_DEFINITION"
        aws ecs describe-task-definition --task-definition "$PREVIOUS_TASK_DEFINITION" --query taskDefinition --output json > task-before.json
        python3 - "$SKETCHCATCH_ECS_CONTAINER" "$SKETCHCATCH_ARTIFACT_REFERENCE" <<'PY'
        import json, sys
        container_name, image_uri = sys.argv[1:]
        with open("task-before.json", encoding="utf-8") as handle:
            task = json.load(handle)
        for key in ["taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy", "deregisteredAt"]:
            task.pop(key, None)
        matches = [item for item in task.get("containerDefinitions", []) if item.get("name") == container_name]
        if len(matches) != 1:
            raise SystemExit("confirmed ECS container was not found exactly once")
        matches[0]["image"] = image_uri
        with open("task-next.json", "w", encoding="utf-8") as handle:
            json.dump(task, handle)
        PY
        NEW_TASK_DEFINITION=$(aws ecs register-task-definition --cli-input-json file://task-next.json --query taskDefinition.taskDefinitionArn --output text)
        set +e
        aws ecs update-service --cluster "$SKETCHCATCH_ECS_CLUSTER" --service "$SKETCHCATCH_ECS_SERVICE" --task-definition "$NEW_TASK_DEFINITION" --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' --force-new-deployment >/dev/null
        aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
        RELEASE_STATUS=$?
        HEALTH_URL="\${SKETCHCATCH_OUTPUT_URL%/}\${SKETCHCATCH_HEALTH_CHECK_PATH}"
        if [ "$RELEASE_STATUS" -eq 0 ]; then
          curl --fail --show-error --max-time 10 --max-redirs 0 --proto '=https' "$HEALTH_URL" >/dev/null
          RELEASE_STATUS=$?
        fi
        set -e
        OUTCOME=succeeded
        RESTORED_TASK_DEFINITION=""
        if [ "$RELEASE_STATUS" -ne 0 ]; then
          aws ecs update-service --cluster "$SKETCHCATCH_ECS_CLUSTER" --service "$SKETCHCATCH_ECS_SERVICE" --task-definition "$PREVIOUS_TASK_DEFINITION" --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' --force-new-deployment >/dev/null
          aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
          OUTCOME=rolled_back
          RESTORED_TASK_DEFINITION="$PREVIOUS_TASK_DEFINITION"
        fi
        export PREVIOUS_TASK_DEFINITION NEW_TASK_DEFINITION OUTCOME RESTORED_TASK_DEFINITION
        SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=$(python3 - <<'PY'
        import base64, json, os
        evidence = {
            "schemaVersion": 1,
            "runtimeTargetKind": "ecs_fargate",
            "outcome": os.environ["OUTCOME"],
            "commitSha": os.environ["SKETCHCATCH_CONFIRMED_COMMIT_SHA"],
            "imageDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"],
            "imageUri": os.environ["SKETCHCATCH_ARTIFACT_REFERENCE"],
            "clusterName": os.environ["SKETCHCATCH_ECS_CLUSTER"],
            "serviceName": os.environ["SKETCHCATCH_ECS_SERVICE"],
            "containerName": os.environ["SKETCHCATCH_ECS_CONTAINER"],
            "taskDefinitionArn": os.environ["NEW_TASK_DEFINITION"],
            "previousTaskDefinitionArn": os.environ["PREVIOUS_TASK_DEFINITION"],
            "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
        }
        if os.environ["RESTORED_TASK_DEFINITION"]:
            evidence["restoredTaskDefinitionArn"] = os.environ["RESTORED_TASK_DEFINITION"]
        print(base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode())
        PY
        )
`;
}

function renderEcsCleanupBuildspec(): string {
  return `version: 0.2

env:
  shell: bash
  exported-variables:
    - SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64

phases:
  build:
    commands:
      - |
        set -euo pipefail
        test -n "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION"
        ACTIVE_TASK_DEFINITION=$(aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --query 'services[0].taskDefinition' --output text)
        test "$ACTIVE_TASK_DEFINITION" = "$SKETCHCATCH_CURRENT_PROVIDER_REVISION"
        aws ecs update-service --cluster "$SKETCHCATCH_ECS_CLUSTER" --service "$SKETCHCATCH_ECS_SERVICE" --task-definition "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION" --deployment-configuration 'minimumHealthyPercent=0,maximumPercent=100,deploymentCircuitBreaker={enable=true,rollback=true}' --force-new-deployment >/dev/null
        aws ecs wait services-stable --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE"
        RESTORED_TASK_DEFINITION=$(aws ecs describe-services --cluster "$SKETCHCATCH_ECS_CLUSTER" --services "$SKETCHCATCH_ECS_SERVICE" --query 'services[0].taskDefinition' --output text)
        test "$RESTORED_TASK_DEFINITION" = "$SKETCHCATCH_PREVIOUS_TASK_DEFINITION"
        export ACTIVE_TASK_DEFINITION RESTORED_TASK_DEFINITION
        SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64=$(python3 - <<'PY'
        import base64, json, os
        evidence = {
            "schemaVersion": 1,
            "runtimeTargetKind": "ecs_fargate",
            "outcome": "rolled_back",
            "commitSha": os.environ["SKETCHCATCH_CONFIRMED_COMMIT_SHA"],
            "imageDigest": os.environ["SKETCHCATCH_ARTIFACT_DIGEST"],
            "imageUri": os.environ["SKETCHCATCH_ARTIFACT_REFERENCE"],
            "clusterName": os.environ["SKETCHCATCH_ECS_CLUSTER"],
            "serviceName": os.environ["SKETCHCATCH_ECS_SERVICE"],
            "containerName": os.environ["SKETCHCATCH_ECS_CONTAINER"],
            "taskDefinitionArn": os.environ["ACTIVE_TASK_DEFINITION"],
            "previousTaskDefinitionArn": os.environ["SKETCHCATCH_PREVIOUS_TASK_DEFINITION"],
            "restoredTaskDefinitionArn": os.environ["RESTORED_TASK_DEFINITION"],
            "outputUrl": os.environ["SKETCHCATCH_OUTPUT_URL"]
        }
        print(base64.b64encode(json.dumps(evidence, separators=(",", ":")).encode()).decode())
        PY
        )
`;
}

function metadataString(metadata: Record<string, JsonValue>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requireCodeBuildProjectName(context: DirectApplicationReleaseContext): string {
  const projectName = context.target.runtimeConfig.codeBuildProjectName;
  if (!projectName || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,254}$/.test(projectName)) {
    throw new DirectApplicationReleaseError(
      "A confirmed CodeBuild project is required for Direct application release"
    );
  }
  return projectName;
}

function requireExport(exports: Map<string, string>, name: string): string {
  const value = exports.get(name)?.trim();
  if (!value) {
    throw new DirectApplicationReleaseError(`CodeBuild export ${name} is missing`);
  }
  return value;
}

function normalizeDigest(value: string): string {
  const digest = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    throw new DirectApplicationReleaseError("CodeBuild artifact digest is not a SHA-256 digest");
  }
  return digest;
}

function releaseEvidenceExportName(runtimeTargetKind: RuntimeTargetKind): string {
  if (runtimeTargetKind === "ecs_fargate") return "SKETCHCATCH_ECS_RELEASE_EVIDENCE_B64";
  if (runtimeTargetKind === "lambda") return "SKETCHCATCH_LAMBDA_RELEASE_EVIDENCE_B64";
  if (runtimeTargetKind === "ec2_asg") return "SKETCHCATCH_EC2_RELEASE_EVIDENCE_B64";
  return "SKETCHCATCH_STATIC_RELEASE_EVIDENCE_B64";
}

function parseReleaseEvidence(
  encoded: string,
  expectedRuntimeTargetKind: RuntimeTargetKind
): GitOpsReleaseEvidence {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new DirectApplicationReleaseError("CodeBuild release evidence is not valid base64 JSON");
  }
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    (value as { runtimeTargetKind?: unknown }).runtimeTargetKind !== expectedRuntimeTargetKind
  ) {
    throw new DirectApplicationReleaseError(
      "CodeBuild release evidence does not match the confirmed runtime"
    );
  }
  return value as GitOpsReleaseEvidence;
}

function waitForPoll(milliseconds: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortSignal.reason ?? new Error("Direct application release was cancelled"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortSignal?.reason ?? new Error("Direct application release was cancelled"));
    };
    const timeout = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}
