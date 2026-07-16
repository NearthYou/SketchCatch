import { randomUUID } from "node:crypto";
import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient
} from "@aws-sdk/client-ecs";
import { and, eq, sql } from "drizzle-orm";
import type {
  ApplicationReleaseStatus,
  EcsFargateRuntimeConfig,
  EcsGitOpsReleaseEvidence,
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

export type EcsGitOpsReleaseRecord = typeof applicationReleases.$inferSelect;

export type EcsGitOpsVerificationTarget = {
  projectId: string;
  connection: {
    roleArn: string;
    externalId: string;
    region: string;
  };
  runtimeConfig: EcsFargateRuntimeConfig;
  deploymentTargetFingerprint?: string | null | undefined;
};

export type EcsGitOpsObservedState = {
  taskDefinitionArn: string;
  serviceStatus: string;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  deploymentCount: number;
  fargateCapacity: boolean;
  minimumHealthyPercent: number;
  maximumPercent: number;
  circuitBreakerEnabled: boolean;
  circuitBreakerRollback: boolean;
  containerName: string;
  imageUri: string;
  runtimeConvergenceMarker?: string | null | undefined;
};

export type EcsGitOpsReleaseRepository = {
  findVerificationTarget(projectId: string): Promise<EcsGitOpsVerificationTarget | undefined>;
  upsertRelease(input: EcsGitOpsReleaseRecord): Promise<EcsGitOpsReleaseRecord>;
};

export type EcsGitOpsCloudGateway = {
  inspect(input: {
    roleArn: string;
    externalId: string;
    region: string;
    clusterName: string;
    serviceName: string;
    containerName: string;
    attemptedTaskDefinitionArn: string;
  }): Promise<EcsGitOpsObservedState>;
};

export type EcsGitOpsReleaseReconciler = {
  reconcile(input: {
    projectId: string;
    artifactId?: string | null;
    pipelineRunId: string;
    commitSha: string;
    pipelineStatus: GitCicdPipelineRunStatus;
    startedAt: Date | null;
    finishedAt: Date | null;
    evidence: EcsGitOpsReleaseEvidence;
  }): Promise<EcsGitOpsReleaseRecord | null>;
};

export class EcsGitOpsReleaseVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcsGitOpsReleaseVerificationError";
  }
}

export function createEcsGitOpsReleaseReconciler(options: {
  repository: EcsGitOpsReleaseRepository;
  gateway: EcsGitOpsCloudGateway;
  createId?: () => string;
  now?: () => Date;
}): EcsGitOpsReleaseReconciler {
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date());

  return {
    async reconcile(input) {
      const target = await options.repository.findVerificationTarget(input.projectId);
      if (!target) {
        throw new EcsGitOpsReleaseVerificationError(
          "Verified ECS Fargate deployment target not found"
        );
      }
      validateEvidenceAgainstTarget(input, target);
      const observed = await options.gateway.inspect({
        ...target.connection,
        clusterName: target.runtimeConfig.clusterName,
        serviceName: target.runtimeConfig.serviceName,
        containerName: target.runtimeConfig.containerName,
        attemptedTaskDefinitionArn: input.evidence.taskDefinitionArn
      });
      validateObservedState(input.evidence, input.pipelineStatus, observed);
      const convergence = verifyGitOpsRuntimeConvergence({
        evidence: input.evidence,
        expectedAdapterKind: "ecs_service_fargate",
        expectedDeploymentTargetFingerprint: target.deploymentTargetFingerprint
      });

      const timestamp = now();
      const status = mapReleaseStatus(input.evidence.outcome);
      const providerRevisionArn =
        input.evidence.outcome === "succeeded"
          ? input.evidence.taskDefinitionArn
          : observed.taskDefinitionArn;
      const rollbackEvidence = input.evidence.outcome === "rolled_back"
        ? {
            attemptedTaskDefinitionArn: input.evidence.taskDefinitionArn,
            restoredTaskDefinitionArn: observed.taskDefinitionArn
          }
        : null;
      return options.repository.upsertRelease({
        id: createId(),
        projectId: input.projectId,
        artifactId: input.artifactId ?? null,
        deploymentId: null,
        pipelineRunId: input.pipelineRunId,
        source: "gitops",
        runtimeTargetKind: "ecs_fargate",
        ...convergence,
        version: resolveApplicationReleaseVersion({ commitSha: input.commitSha }),
        commitSha: input.commitSha.toLowerCase(),
        artifactDigestAlgorithm: "sha256",
        artifactDigest: input.evidence.imageDigest.slice("sha256:".length),
        releaseCandidateId: null,
        compositeDigest: null,
        providerRevision: {
          provider: "aws",
          resourceType: "ecs_service",
          revisionId: providerRevisionArn,
          artifactReference: input.evidence.imageUri,
          metadata: {
            clusterName: input.evidence.clusterName,
            serviceName: input.evidence.serviceName,
            desiredCount: observed.desiredCount,
            runningCount: observed.runningCount,
            minimumHealthyPercent: observed.minimumHealthyPercent,
            maximumPercent: observed.maximumPercent,
            circuitBreaker: true
          }
        },
        frontendEvidence: null,
        failureStage: null,
        baselineReleaseId: null,
        outputUrl: input.evidence.outputUrl,
        status,
        healthEvidence: {
          state: status === "succeeded" ? "healthy" : status,
          observedTaskDefinitionArn: observed.taskDefinitionArn,
          desiredCount: observed.desiredCount,
          runningCount: observed.runningCount,
          verifiedAt: timestamp.toISOString(),
          ...(input.evidence.schemaVersion === 3
            ? { convergence: input.evidence.convergence }
            : {})
        },
        rollbackEvidence,
        startedAt: input.startedAt,
        completedAt: input.finishedAt,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  };
}

function validateEvidenceAgainstTarget(
  input: Parameters<EcsGitOpsReleaseReconciler["reconcile"]>[0],
  target: EcsGitOpsVerificationTarget
): void {
  const evidence = input.evidence;
  const runtime = target.runtimeConfig;
  if (
    evidence.commitSha.toLowerCase() !== input.commitSha.toLowerCase() ||
    evidence.clusterName !== runtime.clusterName ||
    evidence.serviceName !== runtime.serviceName ||
    evidence.containerName !== runtime.containerName ||
    evidence.outputUrl !== runtime.outputUrl ||
    (evidence.outcome === "succeeded" && input.pipelineStatus !== "succeeded") ||
    (evidence.outcome !== "succeeded" && input.pipelineStatus !== "failed")
  ) {
    throw new EcsGitOpsReleaseVerificationError(
      "Pipeline evidence does not match the confirmed project deployment target"
    );
  }
}

function validateObservedState(
  evidence: EcsGitOpsReleaseEvidence,
  pipelineStatus: GitCicdPipelineRunStatus,
  observed: EcsGitOpsObservedState
): void {
  const expectedRevision = evidence.outcome === "succeeded"
    ? evidence.taskDefinitionArn
    : evidence.outcome === "rolled_back"
      ? evidence.restoredTaskDefinitionArn ?? evidence.previousTaskDefinitionArn
      : null;
  const validRevision = expectedRevision
    ? observed.taskDefinitionArn === expectedRevision
    : [evidence.taskDefinitionArn, evidence.previousTaskDefinitionArn].includes(
        observed.taskDefinitionArn
      );
  const expectedMarker = evidence.schemaVersion === 3
    ? `sketchcatch:artifact=${evidence.artifact.artifactFingerprint};target=${evidence.convergence.deploymentTargetFingerprint}`
    : null;
  if (
    !validRevision ||
    observed.serviceStatus !== "ACTIVE" ||
    observed.desiredCount <= 0 ||
    observed.runningCount < 0 ||
    observed.desiredCount !== observed.runningCount ||
    observed.pendingCount !== 0 ||
    observed.deploymentCount !== 1 ||
    !observed.fargateCapacity ||
    observed.minimumHealthyPercent !== 0 ||
    observed.maximumPercent !== 100 ||
    !observed.circuitBreakerEnabled ||
    !observed.circuitBreakerRollback ||
    observed.containerName !== evidence.containerName ||
    observed.imageUri !== evidence.imageUri ||
    (expectedMarker !== null && observed.runtimeConvergenceMarker !== expectedMarker) ||
    (pipelineStatus === "succeeded" && evidence.outcome !== "succeeded")
  ) {
    throw new EcsGitOpsReleaseVerificationError(
      "Observed ECS service revision does not match immutable release evidence"
    );
  }
}

function mapReleaseStatus(outcome: EcsGitOpsReleaseEvidence["outcome"]): ApplicationReleaseStatus {
  if (outcome === "succeeded") return "succeeded";
  if (outcome === "rolled_back") return "rolled_back";
  return "failed";
}

export function createPostgresEcsGitOpsReleaseRepository(
  db: Database
): EcsGitOpsReleaseRepository {
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
            eq(projectDeploymentTargets.runtimeTargetKind, "ecs_fargate"),
            eq(awsConnections.status, "verified")
          )
        );
      if (
        !row?.roleArn ||
        !row.accountId ||
        !row.confirmedBuildConfig ||
        row.runtimeTargetKind !== "ecs_fargate" ||
        row.runtimeConfig?.runtimeTargetKind !== "ecs_fargate"
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
      if (!release) throw new Error("GitOps application release was not persisted");
      return release;
    }
  };
}

export function createAwsEcsGitOpsCloudGateway(options: {
  stsGateway?: Pick<AwsConnectionStsGateway, "assumeRole">;
  createClient?: (configuration: ConstructorParameters<typeof ECSClient>[0]) => ECSClient;
} = {}): EcsGitOpsCloudGateway {
  return {
    async inspect(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let client: ECSClient | undefined;
      try {
        const credentials = await (options.stsGateway ?? createAwsSdkStsGateway()).assumeRole({
          roleArn: input.roleArn,
          externalId: input.externalId,
          region: input.region,
          roleSessionName: `sketchcatch-gitops-release-${randomUUID()}`,
          abortSignal: controller.signal
        });
        client = options.createClient?.({ region: input.region, credentials }) ??
          new ECSClient({ region: input.region, credentials });
        const serviceResponse = await client.send(
          new DescribeServicesCommand({
            cluster: input.clusterName,
            services: [input.serviceName]
          }),
          { abortSignal: controller.signal }
        );
        const service = serviceResponse.services?.[0];
        if (!service?.taskDefinition) {
          throw new EcsGitOpsReleaseVerificationError("ECS service was not found");
        }
        const taskResponse = await client.send(
          new DescribeTaskDefinitionCommand({
            taskDefinition: input.attemptedTaskDefinitionArn,
            include: ["TAGS"]
          }),
          { abortSignal: controller.signal }
        );
        const containers = taskResponse.taskDefinition?.containerDefinitions?.filter(
          (container) => container.name === input.containerName
        ) ?? [];
        const configuration = service.deploymentConfiguration;
        const capacityProviders = service.capacityProviderStrategy ?? [];
        const fargateCapacity = service.launchType === "FARGATE" ||
          capacityProviders.length > 0 && capacityProviders.every((item) =>
            item.capacityProvider === "FARGATE" || item.capacityProvider === "FARGATE_SPOT"
          );
        return {
          taskDefinitionArn: service.taskDefinition,
          serviceStatus: service.status ?? "",
          desiredCount: service.desiredCount ?? -1,
          runningCount: service.runningCount ?? -1,
          pendingCount: service.pendingCount ?? -1,
          deploymentCount: service.deployments?.length ?? -1,
          fargateCapacity,
          minimumHealthyPercent: configuration?.minimumHealthyPercent ?? -1,
          maximumPercent: configuration?.maximumPercent ?? -1,
          circuitBreakerEnabled: configuration?.deploymentCircuitBreaker?.enable === true,
          circuitBreakerRollback: configuration?.deploymentCircuitBreaker?.rollback === true,
          containerName: containers.length === 1 ? (containers[0]?.name ?? "") : "",
          imageUri: containers.length === 1 ? (containers[0]?.image ?? "") : "",
          runtimeConvergenceMarker: taskResponse.tags?.find(
            (tag) => tag.key === "sketchcatch:runtime-convergence"
          )?.value ?? null
        };
      } finally {
        client?.destroy();
        clearTimeout(timeout);
      }
    }
  };
}
