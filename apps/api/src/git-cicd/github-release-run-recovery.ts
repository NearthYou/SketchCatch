import {
  BatchGetBuildsCommand,
  CodeBuildClient,
  StopBuildCommand,
  type CodeBuildClientConfig
} from "@aws-sdk/client-codebuild";
import { and, eq } from "drizzle-orm";
import type {
  ApplicationReleaseProviderRevision,
  FrontendReleaseEvidence,
  JsonValue
} from "@sketchcatch/types";
import type { Database } from "../db/client.js";
import {
  applicationReleases,
  applicationReleaseSteps,
  awsConnections,
  gitCicdPipelineRuns,
  projectBuildEnvironments,
  projectDeploymentTargets,
  releaseCandidates
} from "../db/schema.js";
import {
  createAwsSdkStsGateway,
  type AwsTemporaryCredentials
} from "../aws-connections/aws-connection-test-service.js";
import { createAwsEcsFargateReleaseGateway } from "../releases/aws-ecs-fargate-release-gateway.js";
import {
  acquireProjectExecutionLease,
  assertCurrentProjectExecutionLease,
  heartbeatProjectExecutionLease,
  recordProjectExecutionCoordinates,
  recoverVerifiedTerminalProjectExecutionLease,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import { createPostgresTrustedReleaseRepository } from "../releases/trusted-release-step-repository.js";
import type { TrustedReleaseContext } from "../releases/trusted-release-worker-service.js";
import type {
  GitHubInterruptedCodeBuildController,
  GitHubReleaseRecoveryController,
  GitHubReleaseRecoveryResult
} from "./github-release-run-executor.js";

type CodeBuildCommandClient = {
  send(command: unknown): Promise<Record<string, unknown>>;
  destroy(): void;
};

type AssumeRecoveryRole = (input: {
  roleArn: string;
  externalId: string;
  region: string;
  roleSessionName: string;
}) => Promise<AwsTemporaryCredentials>;

type CreateRecoveryCodeBuildClient = (
  configuration: CodeBuildClientConfig
) => CodeBuildCommandClient;

type RecoveryWait = (milliseconds: number) => Promise<void>;

type RecoveryConnection = {
  accountId: string;
  roleArn: string;
  externalId: string;
  region: string;
};

export type GitHubReleaseRunRecoveryOptions = {
  readonly db: Database;
  readonly leaseRepository: ProjectExecutionLeaseRepository;
  readonly createCodeBuildClient?: ((configuration: CodeBuildClientConfig) => CodeBuildCommandClient) | undefined;
  readonly assumeRole?: AssumeRecoveryRole | undefined;
  readonly wait?: RecoveryWait | undefined;
  readonly now?: (() => Date) | undefined;
  readonly acceptPreparedRecoveryLease?: boolean | undefined;
};

export function createGitHubReleaseRunRecoveryController(
  options: GitHubReleaseRunRecoveryOptions
): GitHubReleaseRecoveryController {
  const now = options.now ?? (() => new Date());
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const assumeRole =
    options.assumeRole ??
    ((input) => createAwsSdkStsGateway().assumeRole(input));
  const createCodeBuildClient =
    options.createCodeBuildClient ??
    ((configuration) => new CodeBuildClient(configuration) as unknown as CodeBuildCommandClient);

  return {
    async recover(input): Promise<GitHubReleaseRecoveryResult> {
      const data = await loadRecoveryData(options.db, input.runId);
      if (!data || data.projectId !== input.projectId) {
        throw new Error("Interrupted GitHub release no longer matches its project");
      }
      const interruptedLease = await options.leaseRepository.find(data.projectId);
      const preparedRecoveryLease =
        interruptedLease?.status === "active" &&
        interruptedLease.holderId.startsWith(`recovery:${input.runId}:`)
          ? interruptedLease
          : undefined;
      if (preparedRecoveryLease && !options.acceptPreparedRecoveryLease) {
        throw new Error("Interrupted GitHub release recovery worker is not trusted");
      }
      if (
        interruptedLease &&
        interruptedLease.status === "active" &&
        interruptedLease.holderId !== input.runId &&
        !preparedRecoveryLease
      ) {
        throw new Error("Interrupted GitHub release lease is still active");
      }
      if (
        interruptedLease &&
        interruptedLease.status === "active" &&
        !preparedRecoveryLease &&
        interruptedLease.expiresAt > now() &&
        !input.cancellationRequested
      ) {
        throw new Error("Interrupted GitHub release lease is still active");
      }

      if (interruptedLease?.activeCodeBuildId) {
        await stopCodeBuildAndConfirm({
          buildId: interruptedLease.activeCodeBuildId,
          connection: data.connection,
          assumeRole,
          createCodeBuildClient,
          wait
        });
      }

      const recoveryHolderId =
        preparedRecoveryLease?.holderId ?? `recovery:${input.runId}:${crypto.randomUUID()}`;
      if (!preparedRecoveryLease && interruptedLease?.activeWorkerTaskArn) {
        throw new Error("Interrupted release worker has not been confirmed terminal");
      }
      const recoveredActiveLease = preparedRecoveryLease
        ? await heartbeatProjectExecutionLease(
            {
              projectId: preparedRecoveryLease.projectId,
              holderId: preparedRecoveryLease.holderId,
              fencingVersion: preparedRecoveryLease.fencingVersion
            },
            options.leaseRepository,
            { now }
          )
        : interruptedLease?.status === "active" &&
            interruptedLease.expiresAt > now() &&
            input.cancellationRequested
          ? await recoverVerifiedTerminalProjectExecutionLease({
              projectId: data.projectId,
              expectedHolderId: interruptedLease.holderId,
              expectedFencingVersion: interruptedLease.fencingVersion,
              expectedActiveCodeBuildId: interruptedLease.activeCodeBuildId,
              expectedActiveWorkerTaskArn: interruptedLease.activeWorkerTaskArn,
              holderId: recoveryHolderId,
              source: "gitops"
            }, options.leaseRepository, { now })
          : undefined;
      const lease = recoveredActiveLease ?? await acquireProjectExecutionLease(
        { projectId: data.projectId, holderId: recoveryHolderId, source: "gitops" },
        options.leaseRepository,
        {
          now,
          inspectExpiredExecution: async (candidate) =>
            candidate.activeWorkerTaskArn ? "unknown" : "terminal"
        }
      );
      const fence = {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      };

      await recordProjectExecutionCoordinates(
        { ...fence, activeCodeBuildId: null },
        options.leaseRepository,
        now()
      );

      if (!data.release || !data.candidate) {
        return {
          kind: "failure",
          cancelled: input.cancellationRequested,
          errorSummary: input.cancellationRequested
            ? "재시작 복구 중 CodeBuild 종료를 확인하고 GitHub 릴리즈를 취소했습니다."
            : "서버 재시작으로 중단된 사전 검증을 종료했습니다. 새 릴리즈를 실행해 주세요."
        };
      }

      const classification = classifyInterruptedReleaseSteps(data.steps);
      const trustedRepository = createPostgresTrustedReleaseRepository(options.db);
      if (data.release.status === "retrying") {
        const retryFailureStage = resolveInterruptedFrontendRetryStage(
          data.steps,
          data.release.failureStage
        );
        await trustedRepository.markFrontendRetryFailure({
          ...fence,
          releaseId: data.release.id,
          candidateId: data.candidate.id,
          failureStage: retryFailureStage,
          frontendEvidence: readFrontendEvidence(data.release.frontendEvidence),
          errorSummary: "웹 배포 재시도 워커가 중단되어 부분 실패 상태로 안전하게 복구했습니다.",
          now: now()
        });
        return {
          kind: "failure",
          cancelled: false,
          errorSummary:
            "웹 배포 재시도 워커가 중단되었습니다. 기존 API와 URL은 유지되며 다시 재시도할 수 있습니다."
        };
      }
      if (!classification.ecsActivationStarted) {
        await trustedRepository.markCandidateStatus({
          ...fence,
          candidateId: data.candidate.id,
          status: input.cancellationRequested ? "cancelled" : "failed",
          now: now()
        });
        return {
          kind: "failure",
          cancelled: input.cancellationRequested,
          errorSummary: input.cancellationRequested
            ? "ECS 변경 전에 GitHub 릴리즈를 취소했습니다."
            : "서버 재시작으로 중단된 릴리즈를 ECS 변경 전에 종료했습니다."
        };
      }

      const context = createTrustedRecoveryContext(data, recoveryHolderId);
      const gateway = createAwsEcsFargateReleaseGateway();
      if (!gateway.verifyRuntime) {
        throw new Error("Trusted ECS recovery gateway is unavailable");
      }
      try {
        const runtime = await gateway.verifyRuntime(context);
        if (classification.frontendActivationStarted) {
          throw new Error(
            `Interrupted frontend activation requires S3/CloudFront evidence reconciliation before terminal recovery (${classification.failureStage})`
          );
        }

        const baselineTaskDefinitionArn = resolveBaselineTaskDefinitionArn(data);
        if (!baselineTaskDefinitionArn) {
          throw new Error("Interrupted ECS release baseline could not be proven");
        }
        await trustedRepository.recordStep({
          releaseId: data.release.id,
          sequence: 200,
          step: "rollback",
          status: "running",
          fencingVersion: fence.fencingVersion,
          evidence: null,
          errorSummary: null,
          now: now(),
          projectId: fence.projectId,
          holderId: fence.holderId
        });
        const rollbackEvidence = runtime.currentTaskDefinitionArn === baselineTaskDefinitionArn
          ? ({
              state: "already_restored",
              taskDefinitionArn: baselineTaskDefinitionArn
            } as JsonValue)
          : await gateway.rollbackEcs({
              context,
              taskDefinitionArn: baselineTaskDefinitionArn,
              beforeMutation: async () => {
                await assertCurrentProjectExecutionLease(fence, options.leaseRepository, now());
              }
            });
        await trustedRepository.recordStep({
          releaseId: data.release.id,
          sequence: 200,
          step: "rollback",
          status: "succeeded",
          fencingVersion: fence.fencingVersion,
          evidence: rollbackEvidence,
          errorSummary: null,
          now: now(),
          projectId: fence.projectId,
          holderId: fence.holderId
        });
        await trustedRepository.markCandidateStatus({
          ...fence,
          candidateId: data.candidate.id,
          status: input.cancellationRequested ? "cancelled" : "failed",
          now: now()
        });
        return {
          kind: "completion",
          result: {
            providerRevision: createProviderRevision(
              context,
              baselineTaskDefinitionArn,
              data.candidate.apiOciDigest,
              true
            ),
            outputUrl: context.runtime.outputUrl,
            healthEvidence: { state: "restored", taskDefinitionArn: baselineTaskDefinitionArn },
            rollbackEvidence,
            frontendEvidence: null,
            failureStage: "rollback",
            status: input.cancellationRequested ? "cancelled" : "rolled_back"
          }
        };
      } finally {
        await gateway.cleanup?.().catch(() => undefined);
      }
    }
  };
}

export function createGitHubInterruptedCodeBuildController(
  options: Pick<GitHubReleaseRunRecoveryOptions, "db" | "createCodeBuildClient" | "assumeRole" | "wait" | "now">
): GitHubInterruptedCodeBuildController {
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const assumeRole =
    options.assumeRole ??
    ((input) => createAwsSdkStsGateway().assumeRole(input));
  const createCodeBuildClient =
    options.createCodeBuildClient ??
    ((configuration) => new CodeBuildClient(configuration) as unknown as CodeBuildCommandClient);
  return {
    async stopAndConfirm(input) {
      const data = await loadRecoveryData(options.db, input.runId);
      if (!data || data.projectId !== input.projectId) {
        throw new Error("Interrupted GitHub release no longer matches its project");
      }
      await stopCodeBuildAndConfirm({
        buildId: input.buildId,
        connection: data.connection,
        assumeRole,
        createCodeBuildClient,
        wait
      });
    }
  };
}

function resolveInterruptedFrontendRetryStage(
  steps: ReadonlyArray<{ sequence: number; step: string; status: string }>,
  previousFailureStage: string | null
):
  | "runtime_verification"
  | "ecs_health"
  | "frontend_upload"
  | "frontend_activation"
  | "cloudfront_invalidation"
  | "public_health" {
  const retrySteps = steps
    .filter((step) => step.sequence >= 101 && step.status !== "pending")
    .sort((left, right) => right.sequence - left.sequence);
  const latest = retrySteps[0]?.step;
  if (
    latest === "runtime_verification" ||
    latest === "ecs_health" ||
    latest === "frontend_upload" ||
    latest === "frontend_activation" ||
    latest === "cloudfront_invalidation" ||
    latest === "public_health"
  ) {
    return latest;
  }
  if (
    previousFailureStage === "frontend_upload" ||
    previousFailureStage === "frontend_activation" ||
    previousFailureStage === "cloudfront_invalidation" ||
    previousFailureStage === "public_health"
  ) {
    return previousFailureStage;
  }
  return "runtime_verification";
}

export function classifyInterruptedReleaseSteps(
  steps: ReadonlyArray<{ step: string; status: string }>
): {
  ecsActivationStarted: boolean;
  frontendActivationStarted: boolean;
  failureStage: "frontend_activation" | "cloudfront_invalidation" | "public_health";
} {
  const started = (step: string) =>
    steps.some(
      (candidate) =>
        candidate.step === step &&
        (candidate.status === "running" || candidate.status === "succeeded")
    );
  const publicHealthStarted = started("public_health");
  const invalidationStarted = started("cloudfront_invalidation") || publicHealthStarted;
  const frontendActivationStarted =
    started("frontend_activation") || invalidationStarted;
  return {
    ecsActivationStarted: started("ecs_activation") || frontendActivationStarted,
    frontendActivationStarted,
    failureStage: publicHealthStarted
      ? "public_health"
      : invalidationStarted
        ? "cloudfront_invalidation"
        : "frontend_activation"
  };
}

async function loadRecoveryData(db: Database, runId: string) {
  const [run] = await db
    .select({
      runId: gitCicdPipelineRuns.id,
      projectId: gitCicdPipelineRuns.projectId,
      confirmedBuildConfig: projectDeploymentTargets.confirmedBuildConfig,
      runtimeConfig: projectDeploymentTargets.runtimeConfig,
      buildEnvironmentFingerprint: projectBuildEnvironments.runtimeFingerprint,
      accountId: awsConnections.accountId,
      roleArn: awsConnections.roleArn,
      externalId: awsConnections.externalId,
      region: awsConnections.region
    })
    .from(gitCicdPipelineRuns)
    .innerJoin(
      projectDeploymentTargets,
      eq(projectDeploymentTargets.projectId, gitCicdPipelineRuns.projectId)
    )
    .innerJoin(
      projectBuildEnvironments,
      eq(projectBuildEnvironments.projectId, gitCicdPipelineRuns.projectId)
    )
    .innerJoin(awsConnections, eq(awsConnections.id, projectDeploymentTargets.connectionId))
    .where(
      and(
        eq(gitCicdPipelineRuns.id, runId),
        eq(gitCicdPipelineRuns.status, "running")
      )
    );
  if (
    !run ||
    !run.accountId ||
    !run.roleArn ||
    !run.confirmedBuildConfig ||
    !run.runtimeConfig ||
    !run.buildEnvironmentFingerprint
  ) return null;
  const [release] = await db
    .select()
    .from(applicationReleases)
    .where(eq(applicationReleases.pipelineRunId, runId));
  const [candidate] = release?.releaseCandidateId
    ? await db
        .select()
        .from(releaseCandidates)
        .where(eq(releaseCandidates.id, release.releaseCandidateId))
    : [];
  const steps = release
    ? await db
        .select()
        .from(applicationReleaseSteps)
        .where(eq(applicationReleaseSteps.releaseId, release.id))
    : [];
  const [baselineRelease] = release?.baselineReleaseId
    ? await db
        .select()
        .from(applicationReleases)
        .where(eq(applicationReleases.id, release.baselineReleaseId))
    : [];
  return {
    runId: run.runId,
    projectId: run.projectId,
    confirmedBuildConfig: run.confirmedBuildConfig,
    runtimeConfig: run.runtimeConfig,
    buildEnvironmentFingerprint: run.buildEnvironmentFingerprint,
    connection: {
      accountId: run.accountId,
      roleArn: run.roleArn,
      externalId: run.externalId,
      region: run.region
    } satisfies RecoveryConnection,
    release,
    candidate,
    steps,
    baselineRelease
  };
}

type RecoveryData = NonNullable<Awaited<ReturnType<typeof loadRecoveryData>>>;

function createTrustedRecoveryContext(
  data: RecoveryData,
  recoveryHolderId: string
): TrustedReleaseContext {
  const release = data.release;
  const candidate = data.candidate;
  const runtime = data.runtimeConfig;
  const build = data.confirmedBuildConfig;
  if (
    !release ||
    !candidate ||
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
    !build.ecsWeb
  ) {
    throw new Error("Interrupted GitHub ECS release coordinates are incomplete");
  }
  const baselineTaskDefinitionArn = resolveBaselineTaskDefinitionArn(data);
  const baselineImageDigest = readProviderMetadata(data.baselineRelease?.providerRevision, "imageDigest");
  return {
    projectId: data.projectId,
    deploymentId: null,
    releaseId: release.id,
    source: "gitops",
    fencingHolderId: recoveryHolderId,
    connection: data.connection,
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
    baseline:
      data.baselineRelease && baselineTaskDefinitionArn && baselineImageDigest
        ? {
            releaseId: data.baselineRelease.id,
            taskDefinitionArn: baselineTaskDefinitionArn,
            imageDigest: baselineImageDigest
          }
        : null,
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
      healthCheckPath: build.ecsWeb.api.healthCheckPath,
      apiProbePath: "/api/check-ins",
      runtimeEntrypoint: build.runtimeEntrypoint
    }
  };
}

function resolveBaselineTaskDefinitionArn(data: RecoveryData): string | null {
  for (const stepName of ["runtime_verification", "ecs_activation"] as const) {
    const step = data.steps
      .filter((candidate) => candidate.step === stepName && candidate.status === "succeeded")
      .sort((left, right) => right.attempt - left.attempt)[0];
    const key = stepName === "runtime_verification"
      ? "currentTaskDefinitionArn"
      : "previousTaskDefinitionArn";
    const value = readJsonString(step?.evidence, key);
    if (value) return value;
  }
  return readProviderMetadata(data.baselineRelease?.providerRevision, "taskDefinitionArn") ??
    data.baselineRelease?.providerRevision?.revisionId ??
    null;
}

function createProviderRevision(
  context: TrustedReleaseContext,
  taskDefinitionArn: string,
  imageDigest: string,
  recovered: boolean
): ApplicationReleaseProviderRevision {
  return {
    provider: "aws",
    resourceType: "ecs_task_definition",
    revisionId: taskDefinitionArn,
    artifactReference: context.candidate.manifestObjectKey,
    metadata: {
      taskDefinitionArn,
      imageDigest,
      releaseCandidateId: context.candidate.id,
      recoveredAfterRestart: recovered
    }
  };
}

function readFrontendEvidence(value: FrontendReleaseEvidence | null): FrontendReleaseEvidence | null {
  return value ?? null;
}

function readJsonString(value: JsonValue | null | undefined, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function readProviderMetadata(
  value: ApplicationReleaseProviderRevision | null | undefined,
  key: string
): string | null {
  const candidate = value?.metadata[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

async function stopCodeBuildAndConfirm(input: {
  buildId: string;
  connection: RecoveryConnection;
  assumeRole: AssumeRecoveryRole;
  createCodeBuildClient: CreateRecoveryCodeBuildClient;
  wait: RecoveryWait;
}): Promise<void> {
  const credentials = await input.assumeRole({
    roleArn: input.connection.roleArn,
    externalId: input.connection.externalId,
    region: input.connection.region,
    roleSessionName: `sketchcatch-recover-build-${crypto.randomUUID()}`
  });
  const client = input.createCodeBuildClient({
    region: input.connection.region,
    credentials
  });
  try {
    let status = await readCodeBuildStatus(client, input.buildId);
    if (!isTerminalCodeBuildStatus(status)) {
      await client.send(new StopBuildCommand({ id: input.buildId }));
      for (let attempt = 0; attempt < 60; attempt += 1) {
        status = await readCodeBuildStatus(client, input.buildId);
        if (isTerminalCodeBuildStatus(status)) return;
        await input.wait(1_000);
      }
      throw new Error("Interrupted CodeBuild did not reach a terminal state");
    }
  } finally {
    client.destroy();
  }
}

async function readCodeBuildStatus(
  client: CodeBuildCommandClient,
  buildId: string
): Promise<string> {
  const response = await client.send(new BatchGetBuildsCommand({ ids: [buildId] }));
  const builds = response["builds"];
  const build = Array.isArray(builds) ? builds[0] : null;
  const status = build && typeof build === "object"
    ? (build as Record<string, unknown>)["buildStatus"]
    : null;
  if (typeof status !== "string") {
    throw new Error("Interrupted CodeBuild status could not be verified");
  }
  return status;
}

function isTerminalCodeBuildStatus(status: string): boolean {
  return ["STOPPED", "SUCCEEDED", "FAILED", "FAULT", "TIMED_OUT"].includes(status);
}
