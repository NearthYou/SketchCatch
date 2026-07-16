import { randomUUID } from "node:crypto";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand
} from "@aws-sdk/client-auto-scaling";
import {
  BatchGetDeploymentInstancesCommand,
  CodeDeployClient,
  GetDeploymentCommand,
  GetDeploymentGroupCommand,
  ListDeploymentInstancesCommand
} from "@aws-sdk/client-codedeploy";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { and, eq, sql } from "drizzle-orm";
import type {
  ApplicationReleaseStatus,
  Ec2AsgGitOpsReleaseEvidence,
  Ec2AsgRuntimeConfig,
  GitCicdPipelineRunStatus
} from "@sketchcatch/types";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  awsConnections,
  projectDeploymentTargets
} from "../db/schema.js";
import { resolveApplicationReleaseVersion } from "../releases/application-release-identity.js";
import {
  resolveGitOpsDeploymentTargetFingerprint,
  verifyGitOpsRuntimeConvergence
} from "./gitops-runtime-convergence.js";

export type Ec2AsgGitOpsReleaseRecord = typeof applicationReleases.$inferSelect;

export type Ec2AsgGitOpsVerificationTarget = {
  projectId: string;
  connection: {
    roleArn: string;
    externalId: string;
    region: string;
  };
  runtimeConfig: Ec2AsgRuntimeConfig;
  deploymentTargetFingerprint?: string | null | undefined;
};

export type Ec2AsgS3Revision = {
  bucket: string;
  key: string;
  version: string;
  eTag: string;
  bundleType: string;
};

export type Ec2AsgGitOpsObservedState = {
  originalDeploymentStatus: string;
  activeDeploymentStatus: string;
  runtimeConvergenceMarker?: string | null | undefined;
  originalRollbackDeploymentId: string | null;
  originalRevision: Ec2AsgS3Revision;
  activeRevision: Ec2AsgS3Revision;
  currentArtifactDigest: string;
  deploymentConfigName: string;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  computePlatform: string;
  deploymentGroupAutoScalingGroupNames: string[];
  rollbackEnabled: boolean;
  rollbackEvents: string[];
  originalTargetInstanceIds: string[];
  originalSucceededInstanceIds: string[];
  targetInstanceIds: string[];
  succeededInstanceIds: string[];
  healthyInServiceInstanceIds: string[];
};

export type Ec2AsgGitOpsReleaseRepository = {
  findVerificationTarget(projectId: string): Promise<Ec2AsgGitOpsVerificationTarget | undefined>;
  upsertRelease(input: Ec2AsgGitOpsReleaseRecord): Promise<Ec2AsgGitOpsReleaseRecord>;
};

export type Ec2AsgGitOpsCloudGateway = {
  inspect(input: {
    roleArn: string;
    externalId: string;
    region: string;
    codeDeployApplicationName: string;
    codeDeployDeploymentGroupName: string;
    autoScalingGroupName: string;
    deploymentId: string;
    activeDeploymentId: string;
    artifactUri: string;
    artifactVersionId: string;
  }): Promise<Ec2AsgGitOpsObservedState>;
};

export type Ec2AsgGitOpsReleaseReconcileInput = {
  projectId: string;
  artifactId?: string | null;
  pipelineRunId: string;
  commitSha: string;
  pipelineStatus: GitCicdPipelineRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  evidence: Ec2AsgGitOpsReleaseEvidence;
};

export type Ec2AsgGitOpsReleaseReconciler = {
  reconcile(input: Ec2AsgGitOpsReleaseReconcileInput): Promise<Ec2AsgGitOpsReleaseRecord | null>;
};

export class Ec2AsgGitOpsReleaseVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Ec2AsgGitOpsReleaseVerificationError";
  }
}

export function createEc2AsgGitOpsReleaseReconciler(options: {
  repository: Ec2AsgGitOpsReleaseRepository;
  gateway: Ec2AsgGitOpsCloudGateway;
  createId?: () => string;
  now?: () => Date;
}): Ec2AsgGitOpsReleaseReconciler {
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date());

  return {
    async reconcile(input) {
      const target = await options.repository.findVerificationTarget(input.projectId);
      if (!target) {
        throw new Ec2AsgGitOpsReleaseVerificationError(
          "Verified EC2 Auto Scaling deployment target not found"
        );
      }
      validateEvidenceAgainstTarget(input, target);
      let observed: Ec2AsgGitOpsObservedState;
      try {
        observed = await options.gateway.inspect({
          ...target.connection,
          codeDeployApplicationName: target.runtimeConfig.codeDeployApplicationName,
          codeDeployDeploymentGroupName:
            target.runtimeConfig.codeDeployDeploymentGroupName,
          autoScalingGroupName: target.runtimeConfig.autoScalingGroupName,
          deploymentId: input.evidence.deploymentId,
          activeDeploymentId: input.evidence.activeDeploymentId,
          artifactUri: input.evidence.artifactUri,
          artifactVersionId: input.evidence.artifactVersionId
        });
      } catch (error) {
        throw new Ec2AsgGitOpsReleaseVerificationError(
          `Failed to inspect EC2/CodeDeploy release state: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      validateObservedState(input.evidence, observed, target.runtimeConfig);
      const convergence = verifyGitOpsRuntimeConvergence({
        evidence: input.evidence,
        expectedAdapterKind: "ec2_auto_scaling_group",
        expectedDeploymentTargetFingerprint: target.deploymentTargetFingerprint
      });

      const timestamp = now();
      const status = mapReleaseStatus(input.evidence.outcome);
      const restored = input.evidence.outcome !== "succeeded";
      return options.repository.upsertRelease({
        id: createId(),
        projectId: input.projectId,
        artifactId: input.artifactId ?? null,
        deploymentId: null,
        pipelineRunId: input.pipelineRunId,
        source: "gitops",
        runtimeTargetKind: "ec2_asg",
        ...convergence,
        version: resolveApplicationReleaseVersion({ commitSha: input.commitSha }),
        commitSha: input.commitSha.toLowerCase(),
        artifactDigestAlgorithm: "sha256",
        artifactDigest: input.evidence.artifactDigest.slice("sha256:".length),
        releaseCandidateId: null,
        compositeDigest: null,
        providerRevision: {
          provider: "aws",
          resourceType: "codedeploy_deployment",
          revisionId: input.evidence.activeDeploymentId,
          artifactReference: restored
            ? input.evidence.previousArtifactUri
            : input.evidence.artifactUri,
          metadata: {
            applicationName: input.evidence.codeDeployApplicationName,
            deploymentGroupName: input.evidence.codeDeployDeploymentGroupName,
            autoScalingGroupName: input.evidence.autoScalingGroupName,
            attemptedDeploymentId: input.evidence.deploymentId,
            activeDeploymentId: input.evidence.activeDeploymentId,
            deploymentConfigName: observed.deploymentConfigName,
            artifactVersionId: restored
              ? input.evidence.previousArtifactVersionId
              : input.evidence.artifactVersionId,
            targetInstanceCount: observed.targetInstanceIds.length,
            succeededInstanceCount: observed.succeededInstanceIds.length,
            attemptedTargetInstanceCount: observed.originalTargetInstanceIds.length,
            attemptedSucceededInstanceCount: observed.originalSucceededInstanceIds.length
          }
        },
        frontendEvidence: null,
        failureStage: null,
        baselineReleaseId: null,
        outputUrl: input.evidence.outputUrl,
        status,
        healthEvidence: {
          state: restored ? "restored" : "healthy",
          activeDeploymentId: input.evidence.activeDeploymentId,
          activeDeploymentStatus: observed.activeDeploymentStatus,
          targetInstanceCount: observed.targetInstanceIds.length,
          succeededInstanceCount: observed.succeededInstanceIds.length,
          verifiedAt: timestamp.toISOString(),
          ...(input.evidence.schemaVersion === 3
            ? { convergence: input.evidence.convergence }
            : {})
        },
        rollbackEvidence: restored
          ? {
              attemptedDeploymentId: input.evidence.deploymentId,
              restoredDeploymentId: input.evidence.activeDeploymentId,
              restoredArtifactUri: input.evidence.previousArtifactUri,
              restoredArtifactVersionId: input.evidence.previousArtifactVersionId,
              reason: input.evidence.failureReason
            }
          : null,
        startedAt: input.startedAt,
        completedAt: input.finishedAt,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  };
}

function validateEvidenceAgainstTarget(
  input: Ec2AsgGitOpsReleaseReconcileInput,
  target: Ec2AsgGitOpsVerificationTarget
): void {
  const evidence = input.evidence;
  const runtime = target.runtimeConfig;
  if (
    evidence.commitSha.toLowerCase() !== input.commitSha.toLowerCase() ||
    evidence.codeDeployApplicationName !== runtime.codeDeployApplicationName ||
    evidence.codeDeployDeploymentGroupName !== runtime.codeDeployDeploymentGroupName ||
    evidence.autoScalingGroupName !== runtime.autoScalingGroupName ||
    evidence.outputUrl !== runtime.outputUrl ||
    evidence.deploymentConfigName !== "CodeDeployDefault.AllAtOnce" ||
    !/^sha256:[a-f\d]{64}$/.test(evidence.artifactDigest) ||
    !isSafeS3ArtifactUri(evidence.artifactUri, evidence.artifactDigest) ||
    !isSafeS3Uri(evidence.previousArtifactUri) ||
    (evidence.outcome === "succeeded" && evidence.failureReason !== null) ||
    (evidence.outcome === "rolled_back" &&
      evidence.failureReason !== "codedeploy_failure") ||
    (evidence.outcome === "failed" &&
      !["instance_failure", "health_check_failure"].includes(
        evidence.failureReason ?? ""
      )) ||
    (evidence.outcome === "succeeded" && input.pipelineStatus !== "succeeded") ||
    (evidence.outcome !== "succeeded" && input.pipelineStatus !== "failed")
  ) {
    throw new Ec2AsgGitOpsReleaseVerificationError(
      "Pipeline evidence does not match the confirmed EC2 Auto Scaling deployment target"
    );
  }
}

function validateObservedState(
  evidence: Ec2AsgGitOpsReleaseEvidence,
  observed: Ec2AsgGitOpsObservedState,
  runtime: Ec2AsgRuntimeConfig
): void {
  const succeeded = evidence.outcome === "succeeded";
  const rolledBack = evidence.outcome === "rolled_back";
  const explicitlyRestored = evidence.outcome === "failed";
  const expectedMarker = evidence.schemaVersion === 3
    ? `sketchcatch:artifact=${evidence.artifact.artifactFingerprint};target=${evidence.convergence.deploymentTargetFingerprint}`
    : null;
  const expectedCurrent = parseS3Uri(evidence.artifactUri);
  const expectedPrevious = parseS3Uri(evidence.previousArtifactUri);
  const expectedActive = succeeded ? expectedCurrent : expectedPrevious;
  const validOriginalStatus = succeeded || explicitlyRestored
    ? observed.originalDeploymentStatus === "Succeeded"
    : rolledBack && ["Failed", "Stopped"].includes(observed.originalDeploymentStatus);
  const targetInstances = sortedDistinct(observed.targetInstanceIds);
  const succeededInstances = sortedDistinct(observed.succeededInstanceIds);
  const healthyInstances = sortedDistinct(observed.healthyInServiceInstanceIds);
  const originalTargetInstances = sortedDistinct(observed.originalTargetInstanceIds);
  const originalSucceededInstances = sortedDistinct(observed.originalSucceededInstanceIds);
  const originalAllSucceeded =
    originalTargetInstances.length > 0 &&
    sameStrings(originalTargetInstances, originalSucceededInstances);
  if (
    !validOriginalStatus ||
    observed.activeDeploymentStatus !== "Succeeded" ||
    (expectedMarker !== null && observed.runtimeConvergenceMarker !== expectedMarker) ||
    observed.deploymentConfigName !== "CodeDeployDefault.AllAtOnce" ||
    observed.codeDeployApplicationName !== runtime.codeDeployApplicationName ||
    observed.codeDeployDeploymentGroupName !== runtime.codeDeployDeploymentGroupName ||
    observed.computePlatform !== "Server" ||
    observed.deploymentGroupAutoScalingGroupNames.length !== 1 ||
    observed.deploymentGroupAutoScalingGroupNames[0] !== runtime.autoScalingGroupName ||
    !observed.rollbackEnabled ||
    !observed.rollbackEvents.includes("DEPLOYMENT_FAILURE") ||
    observed.currentArtifactDigest !== evidence.artifactDigest.slice("sha256:".length) ||
    !matchesRevision(observed.originalRevision, expectedCurrent, evidence.artifactVersionId) ||
    !matchesRevision(
      observed.activeRevision,
      expectedActive,
      succeeded ? evidence.artifactVersionId : evidence.previousArtifactVersionId
    ) ||
    targetInstances.length === 0 ||
    !sameStrings(targetInstances, succeededInstances) ||
    !sameStrings(targetInstances, healthyInstances) ||
    targetInstances.length !== evidence.targetInstanceCount ||
    succeededInstances.length !== evidence.succeededInstanceCount ||
    (succeeded && evidence.activeDeploymentId !== evidence.deploymentId) ||
    (!succeeded && evidence.activeDeploymentId === evidence.deploymentId) ||
    (rolledBack && observed.originalRollbackDeploymentId !== evidence.activeDeploymentId) ||
    (succeeded && !originalAllSucceeded) ||
    (evidence.failureReason === "health_check_failure" && !originalAllSucceeded) ||
    (evidence.failureReason === "instance_failure" && originalAllSucceeded)
  ) {
    throw new Ec2AsgGitOpsReleaseVerificationError(
      "Observed EC2 Auto Scaling state does not match immutable AllAtOnce release evidence"
    );
  }
}

function mapReleaseStatus(
  outcome: Ec2AsgGitOpsReleaseEvidence["outcome"]
): ApplicationReleaseStatus {
  if (outcome === "succeeded") return "succeeded";
  if (outcome === "rolled_back") return "rolled_back";
  return "failed";
}

function matchesRevision(
  revision: Ec2AsgS3Revision,
  expected: { bucket: string; key: string },
  expectedVersion: string
): boolean {
  return (
    revision.bucket === expected.bucket &&
    revision.key === expected.key &&
    revision.version === expectedVersion &&
    revision.bundleType === "zip" &&
    revision.eTag.length > 0
  );
}

function sortedDistinct(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseS3Uri(value: string): { bucket: string; key: string } {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Ec2AsgGitOpsReleaseVerificationError("Release artifact URI is invalid");
  }
  return { bucket: match[1], key: match[2] };
}

function isSafeS3ArtifactUri(value: string, digest: string): boolean {
  return isSafeS3Uri(value) && value.endsWith(`/${digest.slice("sha256:".length)}.zip`);
}

function isSafeS3Uri(value: string): boolean {
  return (
    value.length <= 2_048 &&
    !/[\s\0?#]/.test(value) &&
    /^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/.+/.test(value)
  );
}

export function createPostgresEc2AsgGitOpsReleaseRepository(
  db: Database
): Ec2AsgGitOpsReleaseRepository {
  return {
    async findVerificationTarget(projectId) {
      const [row] = await db
        .select({
          projectId: projectDeploymentTargets.projectId,
          runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
          confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig,
          runtimeConfig: projectDeploymentTargets.runtimeConfig,
          runtimeTarget: projectDeploymentTargets.runtimeTarget,
          deploymentTargetFingerprint: projectDeploymentTargets.deploymentTargetFingerprint,
          accountId: awsConnections.accountId,
          roleArn: awsConnections.roleArn,
          externalId: awsConnections.externalId,
          region: awsConnections.region
        })
        .from(projectDeploymentTargets)
        .innerJoin(
          awsConnections,
          eq(awsConnections.id, projectDeploymentTargets.connectionId)
        )
        .where(
          and(
            eq(projectDeploymentTargets.projectId, projectId),
            eq(projectDeploymentTargets.runtimeTargetKind, "ec2_asg"),
            eq(awsConnections.status, "verified")
          )
        );
      if (
        !row?.roleArn ||
        !row.accountId ||
        !row.confirmedBuildConfig ||
        row.runtimeTargetKind !== "ec2_asg" ||
        row.runtimeConfig?.runtimeTargetKind !== "ec2_asg"
      ) return undefined;
      return {
        projectId: row.projectId,
        connection: {
          roleArn: row.roleArn,
          externalId: row.externalId,
          region: row.region
        },
        runtimeConfig: row.runtimeConfig,
        deploymentTargetFingerprint: resolveGitOpsDeploymentTargetFingerprint({
          projectId: row.projectId,
          accountId: row.accountId,
          region: row.region,
          runtimeTarget: row.runtimeTarget,
          runtimeConfig: row.runtimeConfig,
          healthCheckPath: row.confirmedBuildConfig.healthCheckPath,
          persistedDeploymentTargetFingerprint: row.deploymentTargetFingerprint
        })
      };
    },
    async upsertRelease(input) {
      const [release] = await db
        .insert(applicationReleases)
        .values(input)
        .onConflictDoUpdate({
          target: applicationReleases.pipelineRunId,
          targetWhere: sql`${applicationReleases.pipelineRunId} is not null`,
          set: {
            version: input.version,
            commitSha: input.commitSha,
            artifactDigest: input.artifactDigest,
            runtimeAdapterKind: input.runtimeAdapterKind,
            deploymentTargetFingerprint: input.deploymentTargetFingerprint,
            convergenceOutcome: input.convergenceOutcome,
            providerRevision: input.providerRevision,
            outputUrl: input.outputUrl,
            status: input.status,
            healthEvidence: input.healthEvidence,
            rollbackEvidence: input.rollbackEvidence,
            startedAt: input.startedAt,
            completedAt: input.completedAt,
            updatedAt: input.updatedAt
          }
        })
        .returning();
      if (!release) throw new Error("EC2 ASG GitOps release was not persisted");
      return release;
    }
  };
}

export function createAwsEc2AsgGitOpsCloudGateway(options: {
  stsGateway?: Pick<AwsConnectionStsGateway, "assumeRole">;
  createCodeDeployClient?: (
    configuration: ConstructorParameters<typeof CodeDeployClient>[0]
  ) => CodeDeployClient;
  createAutoScalingClient?: (
    configuration: ConstructorParameters<typeof AutoScalingClient>[0]
  ) => AutoScalingClient;
  createS3Client?: (
    configuration: ConstructorParameters<typeof S3Client>[0]
  ) => S3Client;
} = {}): Ec2AsgGitOpsCloudGateway {
  return {
    async inspect(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let codeDeployClient: CodeDeployClient | undefined;
      let autoScalingClient: AutoScalingClient | undefined;
      let s3Client: S3Client | undefined;
      try {
        const credentials = await (options.stsGateway ?? createAwsSdkStsGateway()).assumeRole({
          roleArn: input.roleArn,
          externalId: input.externalId,
          region: input.region,
          roleSessionName: `sketchcatch-ec2-release-${randomUUID()}`,
          abortSignal: controller.signal
        });
        const configuration = { region: input.region, credentials };
        codeDeployClient = options.createCodeDeployClient?.(configuration) ??
          new CodeDeployClient(configuration);
        autoScalingClient = options.createAutoScalingClient?.(configuration) ??
          new AutoScalingClient(configuration);
        s3Client = options.createS3Client?.(configuration) ?? new S3Client(configuration);

        const currentArtifact = parseS3Uri(input.artifactUri);
        const [original, active, deploymentGroup, autoScalingGroup, currentHead] =
          await Promise.all([
            codeDeployClient.send(
              new GetDeploymentCommand({ deploymentId: input.deploymentId }),
              { abortSignal: controller.signal }
            ),
            codeDeployClient.send(
              new GetDeploymentCommand({ deploymentId: input.activeDeploymentId }),
              { abortSignal: controller.signal }
            ),
            codeDeployClient.send(
              new GetDeploymentGroupCommand({
                applicationName: input.codeDeployApplicationName,
                deploymentGroupName: input.codeDeployDeploymentGroupName
              }),
              { abortSignal: controller.signal }
            ),
            autoScalingClient.send(
              new DescribeAutoScalingGroupsCommand({
                AutoScalingGroupNames: [input.autoScalingGroupName]
              }),
              { abortSignal: controller.signal }
            ),
            s3Client.send(
              new HeadObjectCommand({
                Bucket: currentArtifact.bucket,
                Key: currentArtifact.key,
                VersionId: input.artifactVersionId,
                ChecksumMode: "ENABLED"
              }),
              { abortSignal: controller.signal }
            )
          ]);
        const originalInstances = await inspectDeploymentInstances(
          codeDeployClient,
          input.deploymentId,
          controller.signal
        );
        const activeInstances = input.activeDeploymentId === input.deploymentId
          ? originalInstances
          : await inspectDeploymentInstances(
              codeDeployClient,
              input.activeDeploymentId,
              controller.signal
            );
        const groupInfo = deploymentGroup.deploymentGroupInfo;
        const rollback = groupInfo?.autoRollbackConfiguration;
        const asg = autoScalingGroup.AutoScalingGroups?.[0];
        const checksum = currentHead.ChecksumSHA256;
        const observed: Ec2AsgGitOpsObservedState = {
          originalDeploymentStatus: original.deploymentInfo?.status ?? "",
          activeDeploymentStatus: active.deploymentInfo?.status ?? "",
          runtimeConvergenceMarker: active.deploymentInfo?.description ?? null,
          originalRollbackDeploymentId:
            original.deploymentInfo?.rollbackInfo?.rollbackDeploymentId ?? null,
          originalRevision: readS3Revision(original.deploymentInfo?.revision),
          activeRevision: readS3Revision(active.deploymentInfo?.revision),
          currentArtifactDigest: checksum
            ? Buffer.from(checksum, "base64").toString("hex")
            : "",
          deploymentConfigName:
            original.deploymentInfo?.deploymentConfigName ?? groupInfo?.deploymentConfigName ?? "",
          codeDeployApplicationName: original.deploymentInfo?.applicationName ?? "",
          codeDeployDeploymentGroupName: original.deploymentInfo?.deploymentGroupName ?? "",
          computePlatform: original.deploymentInfo?.computePlatform ?? groupInfo?.computePlatform ?? "",
          deploymentGroupAutoScalingGroupNames: (groupInfo?.autoScalingGroups ?? [])
            .map((item) => item.name ?? "")
            .filter(Boolean)
            .sort(),
          rollbackEnabled: rollback?.enabled === true,
          rollbackEvents: (rollback?.events ?? []).map(String),
          originalTargetInstanceIds: originalInstances.targetInstanceIds,
          originalSucceededInstanceIds: originalInstances.succeededInstanceIds,
          targetInstanceIds: activeInstances.targetInstanceIds,
          succeededInstanceIds: activeInstances.succeededInstanceIds,
          healthyInServiceInstanceIds: (asg?.Instances ?? [])
            .filter(
              (instance) =>
                instance.LifecycleState === "InService" && instance.HealthStatus === "Healthy"
            )
            .map((instance) => instance.InstanceId ?? "")
            .filter(Boolean)
            .sort()
        };
        if (
          !observed.originalDeploymentStatus ||
          !observed.activeDeploymentStatus ||
          !observed.currentArtifactDigest ||
          !observed.codeDeployApplicationName ||
          !observed.codeDeployDeploymentGroupName ||
          asg?.AutoScalingGroupName !== input.autoScalingGroupName
        ) {
          throw new Ec2AsgGitOpsReleaseVerificationError(
            "EC2, CodeDeploy, or S3 release state was incomplete"
          );
        }
        return observed;
      } finally {
        codeDeployClient?.destroy();
        autoScalingClient?.destroy();
        s3Client?.destroy();
        clearTimeout(timeout);
      }
    }
  };
}

async function inspectDeploymentInstances(
  client: CodeDeployClient,
  deploymentId: string,
  abortSignal: AbortSignal
): Promise<{ targetInstanceIds: string[]; succeededInstanceIds: string[] }> {
  const targetInstanceIds = await listDeploymentInstanceIds(
    client,
    deploymentId,
    abortSignal
  );
  const succeededInstanceIds = await listSucceededDeploymentInstanceIds(
    client,
    deploymentId,
    targetInstanceIds,
    abortSignal
  );
  return { targetInstanceIds, succeededInstanceIds };
}

async function listDeploymentInstanceIds(
  client: CodeDeployClient,
  deploymentId: string,
  abortSignal: AbortSignal
): Promise<string[]> {
  const results: string[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const response = await client.send(
      new ListDeploymentInstancesCommand({ deploymentId, nextToken }),
      { abortSignal }
    );
    results.push(...(response.instancesList ?? []));
    nextToken = response.nextToken;
    if (!nextToken) return sortedDistinct(results);
  }
  throw new Ec2AsgGitOpsReleaseVerificationError(
    "CodeDeploy instance pagination exceeded the verification bound"
  );
}

async function listSucceededDeploymentInstanceIds(
  client: CodeDeployClient,
  deploymentId: string,
  instanceIds: readonly string[],
  abortSignal: AbortSignal
): Promise<string[]> {
  const succeeded: string[] = [];
  for (let index = 0; index < instanceIds.length; index += 100) {
    const response = await client.send(
      new BatchGetDeploymentInstancesCommand({
        deploymentId,
        instanceIds: instanceIds.slice(index, index + 100)
      }),
      { abortSignal }
    );
    for (const summary of response.instancesSummary ?? []) {
      if (summary.status === "Succeeded" && summary.instanceId) {
        succeeded.push(summary.instanceId);
      }
    }
  }
  return sortedDistinct(succeeded);
}

function readS3Revision(value: unknown): Ec2AsgS3Revision {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Ec2AsgGitOpsReleaseVerificationError("CodeDeploy revision was missing");
  }
  const revision = value as {
    revisionType?: string;
    s3Location?: {
      bucket?: string;
      key?: string;
      version?: string;
      eTag?: string;
      bundleType?: string;
    };
  };
  const location = revision.s3Location;
  if (
    revision.revisionType !== "S3" ||
    !location?.bucket ||
    !location.key ||
    !location.version ||
    !location.eTag ||
    !location.bundleType
  ) {
    throw new Ec2AsgGitOpsReleaseVerificationError(
      "CodeDeploy revision must be a complete versioned S3 bundle"
    );
  }
  return {
    bucket: location.bucket,
    key: location.key,
    version: location.version,
    eTag: location.eTag,
    bundleType: location.bundleType
  };
}
