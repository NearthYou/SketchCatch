import { randomUUID } from "node:crypto";
import {
  GetAliasCommand,
  GetFunctionCommand,
  LambdaClient
} from "@aws-sdk/client-lambda";
import {
  CodeDeployClient,
  GetDeploymentCommand,
  GetDeploymentGroupCommand
} from "@aws-sdk/client-codedeploy";
import { and, eq, sql } from "drizzle-orm";
import type {
  ApplicationReleaseStatus,
  GitCicdPipelineRunStatus,
  LambdaGitOpsReleaseEvidence,
  LambdaRuntimeConfig
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

export type LambdaGitOpsReleaseRecord = typeof applicationReleases.$inferSelect;

export type LambdaGitOpsVerificationTarget = {
  projectId: string;
  connection: {
    roleArn: string;
    externalId: string;
    region: string;
  };
  runtimeConfig: LambdaRuntimeConfig;
};

export type LambdaGitOpsObservedState = {
  aliasVersion: string;
  additionalVersionWeightCount: number;
  publishedVersion: string;
  artifactDigest: string;
  deploymentStatus: string;
  deploymentConfigName: string;
  codeDeployApplicationName: string;
  codeDeployDeploymentGroupName: string;
  computePlatform: string;
  rollbackEnabled: boolean;
  rollbackEvents: string[];
};

export type LambdaGitOpsReleaseRepository = {
  findVerificationTarget(projectId: string): Promise<LambdaGitOpsVerificationTarget | undefined>;
  upsertRelease(input: LambdaGitOpsReleaseRecord): Promise<LambdaGitOpsReleaseRecord>;
};

export type LambdaGitOpsCloudGateway = {
  inspect(input: {
    roleArn: string;
    externalId: string;
    region: string;
    functionName: string;
    aliasName: string;
    publishedVersion: string;
    codeDeployApplicationName: string;
    codeDeployDeploymentGroupName: string;
    deploymentId: string;
  }): Promise<LambdaGitOpsObservedState>;
};

export type LambdaGitOpsReleaseReconcileInput = {
  projectId: string;
  artifactId?: string | null;
  pipelineRunId: string;
  commitSha: string;
  pipelineStatus: GitCicdPipelineRunStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  evidence: LambdaGitOpsReleaseEvidence;
};

export type LambdaGitOpsReleaseReconciler = {
  reconcile(input: LambdaGitOpsReleaseReconcileInput): Promise<LambdaGitOpsReleaseRecord | null>;
};

export class LambdaGitOpsReleaseVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LambdaGitOpsReleaseVerificationError";
  }
}

export function createLambdaGitOpsReleaseReconciler(options: {
  repository: LambdaGitOpsReleaseRepository;
  gateway: LambdaGitOpsCloudGateway;
  createId?: () => string;
  now?: () => Date;
}): LambdaGitOpsReleaseReconciler {
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date());

  return {
    async reconcile(input) {
      const target = await options.repository.findVerificationTarget(input.projectId);
      if (!target) {
        throw new LambdaGitOpsReleaseVerificationError(
          "Verified Lambda deployment target not found"
        );
      }
      validateEvidenceAgainstTarget(input, target);
      let observed: LambdaGitOpsObservedState;
      try {
        observed = await options.gateway.inspect({
          ...target.connection,
          functionName: target.runtimeConfig.functionName,
          aliasName: target.runtimeConfig.aliasName,
          publishedVersion: input.evidence.publishedVersion,
          codeDeployApplicationName: target.runtimeConfig.codeDeployApplicationName,
          codeDeployDeploymentGroupName: target.runtimeConfig.codeDeployDeploymentGroupName,
          deploymentId: input.evidence.deploymentId
        });
      } catch (error) {
        throw new LambdaGitOpsReleaseVerificationError(
          `Failed to inspect Lambda/CodeDeploy release state: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      validateObservedState(input.evidence, observed, target.runtimeConfig);

      const timestamp = now();
      const status = mapReleaseStatus(input.evidence.outcome);
      const rollbackEvidence = input.evidence.outcome !== "succeeded"
        ? {
            attemptedVersion: input.evidence.publishedVersion,
            restoredVersion: input.evidence.previousVersion,
            deploymentId: input.evidence.deploymentId,
            reason:
              input.evidence.outcome === "rolled_back"
                ? "codedeploy_failure"
                : "health_check_failure"
          }
        : null;
      return options.repository.upsertRelease({
        id: createId(),
        projectId: input.projectId,
        artifactId: input.artifactId ?? null,
        deploymentId: null,
        pipelineRunId: input.pipelineRunId,
        source: "gitops",
        runtimeTargetKind: "lambda",
        version: resolveApplicationReleaseVersion({ commitSha: input.commitSha }),
        commitSha: input.commitSha.toLowerCase(),
        artifactDigestAlgorithm: "sha256",
        artifactDigest: input.evidence.artifactDigest.slice("sha256:".length),
        providerRevision: {
          provider: "aws",
          resourceType: "lambda_alias",
          revisionId: `${input.evidence.functionName}:${input.evidence.aliasName}:${observed.aliasVersion}`,
          artifactReference: input.evidence.artifactUri,
          metadata: {
            functionName: input.evidence.functionName,
            aliasName: input.evidence.aliasName,
            publishedVersion: input.evidence.publishedVersion,
            deploymentId: input.evidence.deploymentId,
            deploymentConfigName: observed.deploymentConfigName,
            rollbackEnabled: observed.rollbackEnabled
          }
        },
        outputUrl: input.evidence.outputUrl,
        status,
        healthEvidence: {
          state: status === "succeeded" ? "healthy" : "restored",
          aliasVersion: observed.aliasVersion,
          publishedVersion: observed.publishedVersion,
          deploymentStatus: observed.deploymentStatus,
          verifiedAt: timestamp.toISOString()
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
  input: LambdaGitOpsReleaseReconcileInput,
  target: LambdaGitOpsVerificationTarget
): void {
  const evidence = input.evidence;
  const runtime = target.runtimeConfig;
  if (
    evidence.commitSha.toLowerCase() !== input.commitSha.toLowerCase() ||
    evidence.functionName !== runtime.functionName ||
    evidence.aliasName !== runtime.aliasName ||
    evidence.outputUrl !== runtime.outputUrl ||
    evidence.deploymentConfigName !== "CodeDeployDefault.LambdaAllAtOnce" ||
    !/^sha256:[a-f\d]{64}$/.test(evidence.artifactDigest) ||
    !isSafeS3ArtifactUri(evidence.artifactUri, evidence.artifactDigest) ||
    (evidence.outcome === "succeeded" && input.pipelineStatus !== "succeeded") ||
    (evidence.outcome !== "succeeded" && input.pipelineStatus !== "failed")
  ) {
    throw new LambdaGitOpsReleaseVerificationError(
      "Pipeline evidence does not match the confirmed Lambda deployment target"
    );
  }
}

function validateObservedState(
  evidence: LambdaGitOpsReleaseEvidence,
  observed: LambdaGitOpsObservedState,
  runtime: LambdaRuntimeConfig
): void {
  const succeeded = evidence.outcome === "succeeded";
  const rolledBack = evidence.outcome === "rolled_back";
  const failedAfterHealthCheck = evidence.outcome === "failed";
  const validDeploymentStatus = succeeded || failedAfterHealthCheck
    ? observed.deploymentStatus === "Succeeded"
    : rolledBack && ["Failed", "Stopped"].includes(observed.deploymentStatus);
  const validAlias = succeeded
    ? observed.aliasVersion === evidence.publishedVersion && evidence.activeVersion === evidence.publishedVersion
    : (rolledBack || failedAfterHealthCheck) &&
      observed.aliasVersion === evidence.previousVersion &&
      evidence.activeVersion === evidence.previousVersion;
  if (
    !validDeploymentStatus ||
    !validAlias ||
    observed.publishedVersion !== evidence.publishedVersion ||
    observed.artifactDigest !== evidence.artifactDigest.slice("sha256:".length) ||
    observed.additionalVersionWeightCount !== 0 ||
    observed.deploymentConfigName !== "CodeDeployDefault.LambdaAllAtOnce" ||
    observed.codeDeployApplicationName !== runtime.codeDeployApplicationName ||
    observed.codeDeployDeploymentGroupName !== runtime.codeDeployDeploymentGroupName ||
    observed.computePlatform !== "Lambda" ||
    !observed.rollbackEnabled ||
    !observed.rollbackEvents.includes("DEPLOYMENT_FAILURE")
  ) {
    throw new LambdaGitOpsReleaseVerificationError(
      "Observed Lambda alias does not match immutable AllAtOnce release evidence"
    );
  }
}

function mapReleaseStatus(
  outcome: LambdaGitOpsReleaseEvidence["outcome"]
): ApplicationReleaseStatus {
  if (outcome === "succeeded") return "succeeded";
  if (outcome === "rolled_back") return "rolled_back";
  return "failed";
}

function isSafeS3ArtifactUri(value: string, digest: string): boolean {
  return (
    value.length <= 2_048 &&
    !/[\s\0]/.test(value) &&
    /^s3:\/\/[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]\/.+/.test(value) &&
    value.endsWith(`/${digest.slice("sha256:".length)}.zip`)
  );
}

export function createPostgresLambdaGitOpsReleaseRepository(
  db: Database
): LambdaGitOpsReleaseRepository {
  return {
    async findVerificationTarget(projectId) {
      const [row] = await db
        .select({
          projectId: projectDeploymentTargets.projectId,
          runtimeTargetKind: projectDeploymentTargets.runtimeTargetKind,
          runtimeConfig: projectDeploymentTargets.runtimeConfig,
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
            eq(projectDeploymentTargets.runtimeTargetKind, "lambda"),
            eq(awsConnections.status, "verified")
          )
        );
      if (
        !row?.roleArn ||
        row.runtimeTargetKind !== "lambda" ||
        row.runtimeConfig?.runtimeTargetKind !== "lambda"
      ) return undefined;
      return {
        projectId: row.projectId,
        connection: {
          roleArn: row.roleArn,
          externalId: row.externalId,
          region: row.region
        },
        runtimeConfig: row.runtimeConfig
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
      if (!release) throw new Error("Lambda GitOps release was not persisted");
      return release;
    }
  };
}

export function createAwsLambdaGitOpsCloudGateway(options: {
  stsGateway?: Pick<AwsConnectionStsGateway, "assumeRole">;
  createLambdaClient?: (
    configuration: ConstructorParameters<typeof LambdaClient>[0]
  ) => LambdaClient;
  createCodeDeployClient?: (
    configuration: ConstructorParameters<typeof CodeDeployClient>[0]
  ) => CodeDeployClient;
} = {}): LambdaGitOpsCloudGateway {
  return {
    async inspect(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let lambdaClient: LambdaClient | undefined;
      let codeDeployClient: CodeDeployClient | undefined;
      try {
        const credentials = await (options.stsGateway ?? createAwsSdkStsGateway()).assumeRole({
          roleArn: input.roleArn,
          externalId: input.externalId,
          region: input.region,
          roleSessionName: `sketchcatch-lambda-release-${randomUUID()}`,
          abortSignal: controller.signal
        });
        const configuration = { region: input.region, credentials };
        lambdaClient = options.createLambdaClient?.(configuration) ?? new LambdaClient(configuration);
        codeDeployClient = options.createCodeDeployClient?.(configuration) ??
          new CodeDeployClient(configuration);
        const [alias, published, deployment, deploymentGroup] = await Promise.all([
          lambdaClient.send(
            new GetAliasCommand({
              FunctionName: input.functionName,
              Name: input.aliasName
            }),
            { abortSignal: controller.signal }
          ),
          lambdaClient.send(
            new GetFunctionCommand({
              FunctionName: input.functionName,
              Qualifier: input.publishedVersion
            }),
            { abortSignal: controller.signal }
          ),
          codeDeployClient.send(
            new GetDeploymentCommand({ deploymentId: input.deploymentId }),
            { abortSignal: controller.signal }
          ),
          codeDeployClient.send(
            new GetDeploymentGroupCommand({
              applicationName: input.codeDeployApplicationName,
              deploymentGroupName: input.codeDeployDeploymentGroupName
            }),
            { abortSignal: controller.signal }
          )
        ]);
        const codeSha256 = published.Configuration?.CodeSha256;
        const artifactDigest = codeSha256
          ? Buffer.from(codeSha256, "base64").toString("hex")
          : "";
        const rollback = deploymentGroup.deploymentGroupInfo?.autoRollbackConfiguration;
        const deploymentInfo = deployment.deploymentInfo;
        const additionalVersionWeights = alias.RoutingConfig?.AdditionalVersionWeights;
        const observed: LambdaGitOpsObservedState = {
          aliasVersion: alias.FunctionVersion ?? "",
          additionalVersionWeightCount:
            additionalVersionWeights &&
            typeof additionalVersionWeights === "object" &&
            !Array.isArray(additionalVersionWeights)
              ? Object.keys(additionalVersionWeights).length
              : 0,
          publishedVersion: published.Configuration?.Version ?? "",
          artifactDigest,
          deploymentStatus: deploymentInfo?.status ?? "",
          deploymentConfigName:
            deploymentInfo?.deploymentConfigName ??
            deploymentGroup.deploymentGroupInfo?.deploymentConfigName ??
            "",
          codeDeployApplicationName: deploymentInfo?.applicationName ?? "",
          codeDeployDeploymentGroupName: deploymentInfo?.deploymentGroupName ?? "",
          computePlatform: deploymentInfo?.computePlatform ?? "",
          rollbackEnabled: rollback?.enabled === true,
          rollbackEvents: (rollback?.events ?? []).map(String)
        };
        if (
          !observed.aliasVersion ||
          !observed.publishedVersion ||
          !/^[a-f\d]{64}$/.test(observed.artifactDigest) ||
          !observed.deploymentStatus ||
          observed.codeDeployApplicationName !== input.codeDeployApplicationName ||
          observed.codeDeployDeploymentGroupName !== input.codeDeployDeploymentGroupName
        ) {
          throw new LambdaGitOpsReleaseVerificationError(
            "Lambda or CodeDeploy release state was incomplete"
          );
        }
        return observed;
      } finally {
        lambdaClient?.destroy();
        codeDeployClient?.destroy();
        clearTimeout(timeout);
      }
    }
  };
}
