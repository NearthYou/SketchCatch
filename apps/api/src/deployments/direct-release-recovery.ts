import type {
  ApplicationReleaseProviderRevision,
  JsonValue
} from "@sketchcatch/types";
import type {
  DirectApplicationReleaseContext,
  DirectApplicationReleaseRecord,
  DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";
import type { DeploymentRepository } from "./deployment-service.js";
import {
  acquireProjectExecutionLease,
  assertCurrentProjectExecutionLease,
  heartbeatProjectExecutionLease,
  recordProjectExecutionCoordinates,
  recoverVerifiedTerminalProjectExecutionLease,
  releaseProjectExecutionLease,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import type {
  TrustedReleaseContext,
  TrustedReleaseGateway,
  TrustedReleaseRepository
} from "../releases/trusted-release-worker-service.js";
import { resolveAwsDeploymentTargetIdentity } from "../runtime-convergence/deployment-target-identity.js";

type RecoveryCandidate = Omit<TrustedReleaseContext["candidate"], "expiresAt"> & {
  expiresAt: Date;
};

export type InterruptedDirectApplicationReleaseData = {
  context: DirectApplicationReleaseContext;
  release: DirectApplicationReleaseRecord;
  candidate: RecoveryCandidate;
  steps: Array<{ step: string; status: string; evidence: JsonValue | null }>;
  baselineRelease: {
    id: string;
    taskDefinitionArn: string;
    imageDigest: string;
  } | null;
};

export type DirectReleaseRecoveryDependencies = {
  leaseRepository: ProjectExecutionLeaseRepository;
  trustedRepository: TrustedReleaseRepository;
  gateway: TrustedReleaseGateway;
  releaseRepository: Pick<
    DirectApplicationReleaseRepository,
    "saveCompletedRelease" | "saveFailedRelease" | "saveCancelledRelease"
  >;
  deploymentRepository: Pick<DeploymentRepository, "failDeployment" | "cancelDeployment">;
  codeBuildTerminalConfirmed?: boolean;
  workerTerminalConfirmed?: boolean;
  cancellationRequested?: boolean;
};

export type DirectReleaseRecoveryResult =
  | "failed_before_ecs"
  | "frontend_retry_failed"
  | "rolled_back"
  | "failed_after_bootstrap_restore"
  | "partially_cancelled";

export async function recoverInterruptedDirectApplicationRelease(
  data: InterruptedDirectApplicationReleaseData,
  dependencies: DirectReleaseRecoveryDependencies,
  options: {
    now?: () => Date;
    generateRecoveryHolderId?: () => string;
    recoveryWorkerTaskArn?: string | null;
  } = {}
): Promise<DirectReleaseRecoveryResult> {
  const now = options.now ?? (() => new Date());
  const holderId =
    options.generateRecoveryHolderId?.() ??
    `recovery:direct:${data.context.deployment.id}:${crypto.randomUUID()}`;
  const interruptedLease = await dependencies.leaseRepository.find(
    data.context.deployment.projectId
  );
  if (interruptedLease?.activeCodeBuildId && !dependencies.codeBuildTerminalConfirmed) {
    throw new Error("Interrupted Direct release CodeBuild is not confirmed terminal");
  }
  if (interruptedLease?.activeWorkerTaskArn && !dependencies.workerTerminalConfirmed) {
    throw new Error("Interrupted Direct release worker is not confirmed terminal");
  }

  const lease = interruptedLease
    ? await recoverVerifiedTerminalProjectExecutionLease(
        {
          projectId: interruptedLease.projectId,
          expectedHolderId: interruptedLease.holderId,
          expectedFencingVersion: interruptedLease.fencingVersion,
          expectedActiveCodeBuildId: interruptedLease.activeCodeBuildId,
          expectedActiveWorkerTaskArn: interruptedLease.activeWorkerTaskArn,
          holderId,
          source: "direct"
        },
        dependencies.leaseRepository,
        { now }
      )
    : await acquireProjectExecutionLease(
        {
          projectId: data.context.deployment.projectId,
          holderId,
          source: "direct"
        },
        dependencies.leaseRepository,
        { now }
      );
  const fence = {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
  if (options.recoveryWorkerTaskArn) {
    await recordProjectExecutionCoordinates(
      { ...fence, activeWorkerTaskArn: options.recoveryWorkerTaskArn },
      dependencies.leaseRepository,
      now()
    );
  }
  let heartbeatInFlight = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight
      .then(() =>
        heartbeatProjectExecutionLease(fence, dependencies.leaseRepository, { now })
      )
      .then(() => undefined)
      .catch(() => undefined);
  }, 30_000);
  heartbeatTimer.unref?.();

  try {
    if (data.release.status === "retrying") {
      const failureStage = resolveInterruptedFrontendRetryStage(
        data.steps,
        data.release.failureStage
      );
      await dependencies.trustedRepository.markFrontendRetryFailure({
        ...fence,
        releaseId: data.release.id,
        candidateId: data.candidate.id,
        failureStage,
        frontendEvidence: data.release.frontendEvidence,
        errorSummary:
          "웹 배포 재시도 워커가 중단되어 기존 API와 URL을 유지한 부분 실패 상태로 복구했습니다.",
        now: now()
      });
      return "frontend_retry_failed";
    }
    const classification = classifySteps(data.steps);
    if (!classification.ecsActivationStarted) {
      await dependencies.trustedRepository.markCandidateStatus({
        ...fence,
        candidateId: data.candidate.id,
        status: "failed",
        now: now()
      });
      const timestamp = now();
      if (dependencies.cancellationRequested && dependencies.releaseRepository.saveCancelledRelease) {
        await dependencies.releaseRepository.saveCancelledRelease({
          releaseId: data.release.id,
          status: "cancelled",
          completedAt: timestamp,
          updatedAt: timestamp,
          leaseFence: fence
        });
      } else {
        await dependencies.releaseRepository.saveFailedRelease({
          releaseId: data.release.id,
          completedAt: timestamp,
          updatedAt: timestamp,
          leaseFence: fence
        });
      }
      await finishDeployment(
        data,
        dependencies,
        fence,
        dependencies.cancellationRequested
          ? "앱 변경 전에 배포 취소를 완료했습니다."
          : "서버 재시작으로 중단된 앱 릴리즈를 ECS 변경 전에 종료했습니다."
      );
      return "failed_before_ecs";
    }

    const context = createTrustedRecoveryContext(data, holderId);
    const targetIdentity = resolveAwsDeploymentTargetIdentity({
      projectId: data.context.deployment.projectId,
      accountId: data.context.connection.accountId,
      region: data.context.connection.region,
      runtimeTarget: data.context.target.runtimeTarget,
      runtimeConfig: data.context.target.runtimeConfig,
      healthCheckPath: data.context.target.confirmedBuildConfig.healthCheckPath,
      persistedDeploymentTargetFingerprint:
        data.context.target.deploymentTargetFingerprint
    });
    if (!dependencies.gateway.verifyRuntime) {
      throw new Error("Trusted Direct recovery gateway is unavailable");
    }
    const runtime = await dependencies.gateway.verifyRuntime(context);

    if (classification.frontendActivationStarted) {
      throw new Error(
        `Interrupted frontend activation requires S3/CloudFront evidence reconciliation before terminal recovery (${classification.failureStage})`
      );
    }

    const rollbackTaskDefinitionArn =
      data.baselineRelease?.taskDefinitionArn ?? resolvePreviousTaskDefinitionArn(data.steps);
    if (!rollbackTaskDefinitionArn) {
      throw new Error("Interrupted Direct ECS release baseline could not be proven");
    }
    await dependencies.trustedRepository.recordStep({
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
    const rollbackWasAlreadyActive =
      runtime.currentTaskDefinitionArn === rollbackTaskDefinitionArn;
    const rollbackEvidence =
      rollbackWasAlreadyActive
        ? ({
            state: "already_restored",
            taskDefinitionArn: rollbackTaskDefinitionArn
          } as JsonValue)
        : await dependencies.gateway.rollbackEcs({
            context,
            taskDefinitionArn: rollbackTaskDefinitionArn,
            beforeMutation: async () => {
              await assertCurrentProjectExecutionLease(
                fence,
                dependencies.leaseRepository,
                now()
              );
            }
          });
    await dependencies.trustedRepository.recordStep({
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
    await dependencies.trustedRepository.markCandidateStatus({
      ...fence,
      candidateId: data.candidate.id,
      status: "failed",
      now: now()
    });

    if (!data.baselineRelease) {
      const timestamp = now();
      await dependencies.releaseRepository.saveFailedRelease({
        releaseId: data.release.id,
        completedAt: timestamp,
        updatedAt: timestamp,
        leaseFence: fence
      });
      await finishDeployment(
        data,
        dependencies,
        fence,
        "첫 앱 릴리즈가 중단되어 bootstrap Task Definition은 복구했지만 정상 릴리즈 rollback으로 기록하지 않았습니다."
      );
      return "failed_after_bootstrap_restore";
    }

    const timestamp = now();
    const restoredProviderRevision = createProviderRevision(
      context,
      data.baselineRelease.taskDefinitionArn,
      data.baselineRelease.imageDigest
    );
    const restoredHealthEvidence = {
      state: "restored",
      taskDefinitionArn: data.baselineRelease.taskDefinitionArn
    } as JsonValue;
    if (dependencies.cancellationRequested && dependencies.releaseRepository.saveCancelledRelease) {
      await dependencies.releaseRepository.saveCancelledRelease({
        releaseId: data.release.id,
        status: "cancelled",
        runtimeAdapterKind: targetIdentity.adapterKind,
        deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
        convergenceOutcome: rollbackWasAlreadyActive ? "already_active" : "rolled_out",
        providerRevision: restoredProviderRevision,
        outputUrl: context.runtime.outputUrl,
        healthEvidence: restoredHealthEvidence,
        rollbackEvidence,
        failureStage: "rollback",
        completedAt: timestamp,
        updatedAt: timestamp,
        leaseFence: fence
      });
    } else {
      await dependencies.releaseRepository.saveCompletedRelease({
        releaseId: data.release.id,
        runtimeAdapterKind: targetIdentity.adapterKind,
        deploymentTargetFingerprint: targetIdentity.deploymentTargetFingerprint,
        convergenceOutcome: rollbackWasAlreadyActive ? "already_active" : "rolled_out",
        providerRevision: restoredProviderRevision,
        outputUrl: context.runtime.outputUrl,
        healthEvidence: restoredHealthEvidence,
        rollbackEvidence,
        frontendEvidence: null,
        failureStage: "rollback",
        status: "rolled_back",
        completedAt: timestamp,
        updatedAt: timestamp,
        leaseFence: fence
      });
    }
    await finishDeployment(
      data,
      dependencies,
      fence,
      dependencies.cancellationRequested
        ? "앱 배포를 취소하고 직전 정상 ECS 버전으로 자동 복구했습니다."
        : "서버 재시작으로 중단된 앱 릴리즈를 직전 정상 ECS 버전으로 복구했습니다."
    );
    return "rolled_back";
  } finally {
    clearInterval(heartbeatTimer);
    await heartbeatInFlight;
    await dependencies.gateway.cleanup?.().catch(() => undefined);
    await releaseProjectExecutionLease(fence, dependencies.leaseRepository).catch(() => false);
  }
}

function resolveInterruptedFrontendRetryStage(
  steps: ReadonlyArray<{ step: string; status: string }>,
  previousFailureStage: string | null
): "runtime_verification" | "ecs_health" | "frontend_upload" | "frontend_activation" | "cloudfront_invalidation" | "public_health" {
  const latest = [...steps]
    .filter((step) => step.status !== "pending")
    .reverse()
    .find((step) =>
      [
        "runtime_verification",
        "ecs_health",
        "frontend_upload",
        "frontend_activation",
        "cloudfront_invalidation",
        "public_health"
      ].includes(step.step)
    )?.step;
  if (
    latest === "runtime_verification" ||
    latest === "ecs_health" ||
    latest === "frontend_upload" ||
    latest === "frontend_activation" ||
    latest === "cloudfront_invalidation" ||
    latest === "public_health"
  ) return latest;
  if (
    previousFailureStage === "frontend_upload" ||
    previousFailureStage === "frontend_activation" ||
    previousFailureStage === "cloudfront_invalidation" ||
    previousFailureStage === "public_health"
  ) return previousFailureStage;
  return "runtime_verification";
}

function createTrustedRecoveryContext(
  data: InterruptedDirectApplicationReleaseData,
  holderId: string
): TrustedReleaseContext {
  const runtime = data.context.target.runtimeConfig;
  const build = data.context.target.confirmedBuildConfig.ecsWeb;
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
    throw new Error("Interrupted Direct ECS release coordinates are incomplete");
  }
  return {
    projectId: data.context.deployment.projectId,
    deploymentId: data.context.deployment.id,
    releaseId: data.release.id,
    source: "direct",
    fencingHolderId: holderId,
    connection: data.context.connection,
    candidate: {
      ...data.candidate,
      expiresAt: data.candidate.expiresAt.toISOString()
    },
    baseline: data.baselineRelease
      ? {
          releaseId: data.baselineRelease.id,
          taskDefinitionArn: data.baselineRelease.taskDefinitionArn,
          imageDigest: data.baselineRelease.imageDigest
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
      healthCheckPath: build.api.healthCheckPath,
      apiProbePath: "/api/check-ins",
      runtimeEntrypoint: data.context.target.confirmedBuildConfig.runtimeEntrypoint
    }
  };
}

function classifySteps(steps: ReadonlyArray<{ step: string; status: string }>) {
  const started = (step: string) =>
    steps.some(
      (candidate) =>
        candidate.step === step &&
        (candidate.status === "running" || candidate.status === "succeeded")
    );
  const publicHealthStarted = started("public_health");
  const invalidationStarted = started("cloudfront_invalidation") || publicHealthStarted;
  const frontendActivationStarted = started("frontend_activation") || invalidationStarted;
  return {
    ecsActivationStarted: started("ecs_activation") || frontendActivationStarted,
    frontendActivationStarted,
    failureStage: publicHealthStarted
      ? ("public_health" as const)
      : invalidationStarted
        ? ("cloudfront_invalidation" as const)
        : ("frontend_activation" as const)
  };
}

function resolvePreviousTaskDefinitionArn(
  steps: ReadonlyArray<{ step: string; status: string; evidence: JsonValue | null }>
): string | null {
  for (const stepName of ["ecs_activation", "runtime_verification"] as const) {
    const step = steps.find(
      (candidate) => candidate.step === stepName && candidate.status === "succeeded"
    );
    const key =
      stepName === "ecs_activation" ? "previousTaskDefinitionArn" : "currentTaskDefinitionArn";
    const value = readJsonString(step?.evidence, key);
    if (value) return value;
  }
  return null;
}

function readJsonString(value: JsonValue | null | undefined, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function createProviderRevision(
  context: TrustedReleaseContext,
  taskDefinitionArn: string,
  imageDigest: string
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
      recoveredAfterRestart: true
    }
  };
}

async function finishDeployment(
  data: InterruptedDirectApplicationReleaseData,
  dependencies: DirectReleaseRecoveryDependencies,
  fence: { projectId: string; holderId: string; fencingVersion: number },
  errorSummary: string
): Promise<void> {
  if (dependencies.cancellationRequested) {
    await dependencies.deploymentRepository.cancelDeployment(
      data.context.deployment.id,
      { errorSummary, leaseFence: fence, fenceCheckedAt: new Date() }
    );
    return;
  }
  await dependencies.deploymentRepository.failDeployment(data.context.deployment.id, {
    failureStage: "application_release",
    errorSummary,
    leaseFence: fence,
    fenceCheckedAt: new Date()
  });
}
