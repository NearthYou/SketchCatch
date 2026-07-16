import type {
  ApplicationReleaseFailureStage,
  FrontendReleaseEvidence,
  JsonValue,
  ProjectExecutionLeaseSource
} from "@sketchcatch/types";
import {
  acquireProjectExecutionLease,
  assertCurrentProjectExecutionLease,
  heartbeatProjectExecutionLease,
  releaseProjectExecutionLease,
  type ProjectExecutionLeaseRepository
} from "./project-execution-lease-service.js";
import type {
  FrontendActivationEvidence,
  FrontendUploadEvidence
} from "./aws-frontend-release-gateway.js";

export type TrustedReleaseContext = {
  projectId: string;
  deploymentId: string | null;
  releaseId: string;
  source: ProjectExecutionLeaseSource;
  fencingHolderId: string;
  connection: {
    accountId: string;
    roleArn: string;
    externalId: string;
    region: string;
  };
  candidate: {
    id: string;
    commitSha: string;
    compositeDigest: string;
    configFingerprint: string;
    apiOciDigest: string;
    apiArchiveDigest: string;
    apiArchiveByteSize: number;
    frontendArchiveDigest: string;
    frontendArchiveByteSize: number;
    frontendManifestDigest: string;
    frontendIndexDigest: string;
    apiArchiveObjectKey: string;
    apiArchiveObjectVersionId: string;
    frontendArchiveObjectKey: string;
    frontendArchiveObjectVersionId: string;
    frontendManifestObjectKey: string;
    frontendManifestObjectVersionId: string;
    manifestObjectKey: string;
    manifestObjectVersionId: string;
    expiresAt: string;
  };
  baseline: {
    releaseId: string;
    taskDefinitionArn: string;
    imageDigest: string;
  } | null;
  runtime: {
    clusterName: string;
    serviceName: string;
    containerName: string;
    containerPort: number;
    taskDefinitionFamily: string;
    taskDefinitionArn: string;
    taskRoleArn: string;
    executionRoleArn: string;
    targetGroupArn: string;
    loadBalancerArn: string;
    loadBalancerDnsName: string;
    ecrRepositoryName: string;
    ecrRepositoryArn: string;
    frontendBucketName: string;
    cloudFrontDistributionId: string;
    cloudFrontDomainName: string;
    outputUrl: string;
    healthCheckPath: string;
    apiProbePath: string;
  };
};

export type TrustedReleaseMutationControl = {
  beforeMutation(): Promise<void>;
};

export type TrustedReleaseGateway = {
  verifyCandidate(context: TrustedReleaseContext): Promise<JsonValue | void>;
  verifyRuntime?(context: TrustedReleaseContext): Promise<{
    currentTaskDefinitionArn: string;
  }>;
  verifyFrontendCandidate?(context: TrustedReleaseContext): Promise<void>;
  publishApi(
    context: TrustedReleaseContext,
    control: TrustedReleaseMutationControl
  ): Promise<{
    imageDigest: string;
    imageUri: string;
  }>;
  activateEcs(input: {
    context: TrustedReleaseContext;
    imageDigest: string;
    imageUri: string;
    beforeMutation(): Promise<void>;
  }): Promise<{
    taskDefinitionArn: string;
    previousTaskDefinitionArn: string;
  }>;
  verifyEcsHealth(input: {
    context: TrustedReleaseContext;
    taskDefinitionArn: string;
  }): Promise<JsonValue>;
  rollbackEcs(input: {
    context: TrustedReleaseContext;
    taskDefinitionArn: string;
    beforeMutation(): Promise<void>;
  }): Promise<JsonValue>;
  uploadFrontend(input: {
    context: TrustedReleaseContext;
    beforeMutation(): Promise<void>;
  }): Promise<FrontendUploadEvidence>;
  activateFrontend(input: {
    context: TrustedReleaseContext;
    upload: FrontendUploadEvidence;
    beforeMutation(): Promise<void>;
  }): Promise<FrontendActivationEvidence>;
  invalidateFrontend(input: {
    context: TrustedReleaseContext;
    activation: FrontendActivationEvidence;
    beforeMutation(): Promise<void>;
  }): Promise<FrontendReleaseEvidence>;
  verifyPublic(input: {
    context: TrustedReleaseContext;
    frontendEvidence: FrontendReleaseEvidence;
  }): Promise<JsonValue>;
  cleanupCandidateArtifacts?(
    context: TrustedReleaseContext,
    mode: "success" | "retain_frontend" | "terminal_failure"
  ): Promise<void>;
  cleanup?(): Promise<void>;
};

export type TrustedReleaseRepository = {
  recordStep(input: {
    releaseId: string;
    sequence: number;
    step: ApplicationReleaseFailureStage;
    status: "running" | "succeeded" | "failed";
    fencingVersion: number;
    evidence: JsonValue | null;
    errorSummary: string | null;
    now: Date;
    projectId: string;
    holderId: string;
  }): Promise<void>;
  markCandidateStatus(input: {
    projectId: string;
    holderId: string;
    fencingVersion: number;
    candidateId: string;
    status: "activating" | "succeeded" | "failed" | "cancelled";
    now: Date;
  }): Promise<void>;
  markPartialFailure(input: {
    projectId: string;
    holderId: string;
    fencingVersion: number;
    releaseId: string;
    failureStage: ApplicationReleaseFailureStage;
    now: Date;
  }): Promise<void>;
  markPartialCancellation(input: {
    projectId: string;
    holderId: string;
    fencingVersion: number;
    releaseId: string;
    failureStage: ApplicationReleaseFailureStage;
    now: Date;
  }): Promise<void>;
  beginFrontendRetry(input: {
    projectId: string;
    holderId: string;
    fencingVersion: number;
    releaseId: string;
    candidateId: string;
    now: Date;
  }): Promise<void>;
  completeFrontendRetry(input: {
    projectId: string;
    holderId: string;
    fencingVersion: number;
    releaseId: string;
    candidateId: string;
    frontendEvidence: FrontendReleaseEvidence;
    healthEvidence: JsonValue;
    publicEvidence: JsonValue;
    now: Date;
  }): Promise<void>;
  markFrontendRetryFailure(input: {
    projectId: string;
    holderId: string;
    fencingVersion: number;
    releaseId: string;
    candidateId: string;
    failureStage: ApplicationReleaseFailureStage;
    frontendEvidence: FrontendReleaseEvidence | null;
    errorSummary: string;
    now: Date;
  }): Promise<void>;
  nextStepSequence?(releaseId: string): Promise<number>;
};

export type TrustedReleaseResult =
  | {
      status: "succeeded";
      imageDigest: string;
      imageUri: string;
      taskDefinitionArn: string;
      previousTaskDefinitionArn: string;
      healthEvidence: JsonValue;
      frontendEvidence: FrontendReleaseEvidence;
      publicEvidence: JsonValue;
    }
  | {
      status: "rolled_back";
      imageDigest: string;
      imageUri: string;
      taskDefinitionArn: string;
      rollbackTaskDefinitionArn: string;
      rollbackEvidence: JsonValue;
      errorSummary: string;
    }
  | {
      status: "partially_failed";
      imageDigest: string;
      imageUri: string;
      taskDefinitionArn: string;
      previousTaskDefinitionArn: string;
      healthEvidence: JsonValue;
      frontendEvidence?: FrontendReleaseEvidence | undefined;
      failureStage:
        | "frontend_upload"
        | "frontend_activation"
        | "cloudfront_invalidation"
        | "public_health";
      errorSummary: string;
    }
  | {
      status: "cancelled";
      imageDigest: string;
      imageUri: string;
      taskDefinitionArn: string;
      rollbackTaskDefinitionArn: string;
      rollbackEvidence: JsonValue;
      errorSummary: string;
    }
  | {
      status: "partially_cancelled";
      imageDigest: string;
      imageUri: string;
      taskDefinitionArn: string;
      previousTaskDefinitionArn: string;
      healthEvidence: JsonValue;
      frontendEvidence?: FrontendReleaseEvidence | undefined;
      failureStage: "frontend_activation" | "cloudfront_invalidation" | "public_health";
      errorSummary: string;
    };

export type TrustedFrontendRetryResult =
  | {
      status: "succeeded";
      healthEvidence: JsonValue;
      frontendEvidence: FrontendReleaseEvidence;
      publicEvidence: JsonValue;
    }
  | {
      status: "partially_failed";
      failureStage: ApplicationReleaseFailureStage;
      frontendEvidence: FrontendReleaseEvidence | null;
      errorSummary: string;
    };

export async function executeTrustedRelease(
  context: TrustedReleaseContext,
  repository: TrustedReleaseRepository,
  gateway: TrustedReleaseGateway,
  leaseRepository: ProjectExecutionLeaseRepository,
  options: {
    now?: () => Date;
    abortSignal?: AbortSignal;
    heartbeatIntervalMs?: number;
    releaseLeaseOnCompletion?: boolean;
  } = {}
): Promise<TrustedReleaseResult> {
  const now = options.now ?? (() => new Date());
  const lease = await acquireProjectExecutionLease(
    {
      projectId: context.projectId,
      holderId: context.fencingHolderId,
      source: context.source
    },
    leaseRepository,
    { now }
  );
  const fence = {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
  const mutationControl: TrustedReleaseMutationControl = {
    beforeMutation: async () => {
      await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
    }
  };
  const cleanupCandidateArtifacts = async (
    mode: "success" | "retain_frontend" | "terminal_failure"
  ): Promise<void> => {
    await gateway.cleanupCandidateArtifacts?.(context, mode).catch(() => undefined);
  };
  let sequence = 0;
  const runStep = async <T>(
    step: ApplicationReleaseFailureStage,
    operation: () => Promise<T>
  ): Promise<T> => {
    if (step !== "rollback") throwIfAborted(options.abortSignal);
    sequence += 1;
    await heartbeatProjectExecutionLease(fence, leaseRepository, { now });
    await repository.recordStep({
      releaseId: context.releaseId,
      sequence,
      step,
      status: "running",
      fencingVersion: lease.fencingVersion,
      evidence: null,
      errorSummary: null,
      now: now(),
      projectId: context.projectId,
      holderId: context.fencingHolderId
    });
    try {
      if (step !== "rollback") {
        await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
      }
      const result = await runWithLeaseHeartbeat(
        fence,
        leaseRepository,
        now,
        operation,
        options.heartbeatIntervalMs
      );
      if (step !== "rollback") {
        await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
      }
      await repository.recordStep({
        releaseId: context.releaseId,
        sequence,
        step,
        status: "succeeded",
        fencingVersion: lease.fencingVersion,
        evidence: toJsonValue(result),
        errorSummary: null,
        now: now(),
        projectId: context.projectId,
        holderId: context.fencingHolderId
      });
      return result;
    } catch (error) {
      await repository.recordStep({
        releaseId: context.releaseId,
        sequence,
        step,
        status: "failed",
        fencingVersion: lease.fencingVersion,
        evidence: null,
        errorSummary: errorMessage(error),
        now: now(),
        projectId: context.projectId,
        holderId: context.fencingHolderId
      });
      throw error;
    }
  };

  try {
    throwIfAborted(options.abortSignal);
    await repository.markCandidateStatus({
      projectId: context.projectId,
      holderId: context.fencingHolderId,
      fencingVersion: lease.fencingVersion,
      candidateId: context.candidate.id,
      status: "activating",
      now: now()
    });
    await runStep("runtime_verification", () => gateway.verifyCandidate(context));
    throwIfAborted(options.abortSignal);
    const published = await runStep("ecr_publish", () =>
      gateway.publishApi(context, mutationControl)
    );
    throwIfAborted(options.abortSignal);
    const activation = await runStep("ecs_activation", () =>
      gateway.activateEcs({ context, ...published, ...mutationControl })
    );
    const cancelAfterEcs = async (): Promise<TrustedReleaseResult> => {
      const rollbackEvidence = await runStep("rollback", () =>
        gateway.rollbackEcs({
          context,
          taskDefinitionArn: activation.previousTaskDefinitionArn,
          ...mutationControl
        })
      );
      await repository.markCandidateStatus({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        candidateId: context.candidate.id,
        status: "cancelled",
        now: now()
      });
      return {
        status: "cancelled",
        ...published,
        taskDefinitionArn: activation.taskDefinitionArn,
        rollbackTaskDefinitionArn: activation.previousTaskDefinitionArn,
        rollbackEvidence,
        errorSummary: "Trusted release was cancelled after ECS activation and rolled back"
      };
    };
    if (options.abortSignal?.aborted) return cancelAfterEcs();
    let healthEvidence: JsonValue;
    try {
      healthEvidence = await runStep("ecs_health", () =>
        gateway.verifyEcsHealth({
          context,
          taskDefinitionArn: activation.taskDefinitionArn
        })
      );
    } catch (error) {
      const rollbackEvidence = await runStep("rollback", () =>
        gateway.rollbackEcs({
          context,
          taskDefinitionArn: activation.previousTaskDefinitionArn,
          ...mutationControl
        })
      );
      await repository.markCandidateStatus({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        candidateId: context.candidate.id,
        status: isAbortError(error) ? "cancelled" : "failed",
        now: now()
      });
      return {
        status: isAbortError(error) ? "cancelled" : "rolled_back",
        ...published,
        taskDefinitionArn: activation.taskDefinitionArn,
        rollbackTaskDefinitionArn: activation.previousTaskDefinitionArn,
        rollbackEvidence,
        errorSummary: errorMessage(error)
      };
    }
    if (options.abortSignal?.aborted) return cancelAfterEcs();

    let frontendUpload: FrontendUploadEvidence;
    try {
      frontendUpload = await runStep("frontend_upload", () =>
        gateway.uploadFrontend({ context, ...mutationControl })
      );
    } catch (error) {
      if (isAbortError(error)) return cancelAfterEcs();
      await repository.markPartialFailure({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        releaseId: context.releaseId,
        failureStage: "frontend_upload",
        now: now()
      });
      await cleanupCandidateArtifacts("retain_frontend");
      return {
        status: "partially_failed",
        ...published,
        ...activation,
        healthEvidence,
        failureStage: "frontend_upload",
        errorSummary: errorMessage(error)
      };
    }
    if (options.abortSignal?.aborted) return cancelAfterEcs();

    let frontendActivation: FrontendActivationEvidence;
    try {
      frontendActivation = await runStep("frontend_activation", () =>
        gateway.activateFrontend({ context, upload: frontendUpload, ...mutationControl })
      );
    } catch (error) {
      if (isAbortError(error)) return cancelAfterEcs();
      await repository.markPartialFailure({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        releaseId: context.releaseId,
        failureStage: "frontend_activation",
        now: now()
      });
      await cleanupCandidateArtifacts("retain_frontend");
      return {
        status: "partially_failed",
        ...published,
        ...activation,
        healthEvidence,
        failureStage: "frontend_activation",
        errorSummary: errorMessage(error)
      };
    }

    const partialCancel = async (
      failureStage: "frontend_activation" | "cloudfront_invalidation" | "public_health",
      frontendEvidence?: FrontendReleaseEvidence
    ): Promise<TrustedReleaseResult> => {
      await repository.markPartialCancellation({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        releaseId: context.releaseId,
        failureStage,
        now: now()
      });
      await cleanupCandidateArtifacts("terminal_failure");
      return {
        status: "partially_cancelled",
        ...published,
        ...activation,
        healthEvidence,
        ...(frontendEvidence ? { frontendEvidence } : {}),
        failureStage,
        errorSummary: `Trusted release was cancelled after ${failureStage}`
      };
    };
    if (options.abortSignal?.aborted) return partialCancel("frontend_activation");

    let frontendEvidence: FrontendReleaseEvidence;
    try {
      frontendEvidence = await runStep("cloudfront_invalidation", () =>
        gateway.invalidateFrontend({ context, activation: frontendActivation, ...mutationControl })
      );
    } catch (error) {
      if (isAbortError(error)) return partialCancel("cloudfront_invalidation");
      await repository.markPartialFailure({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        releaseId: context.releaseId,
        failureStage: "cloudfront_invalidation",
        now: now()
      });
      await cleanupCandidateArtifacts("retain_frontend");
      return {
        status: "partially_failed",
        ...published,
        ...activation,
        healthEvidence,
        failureStage: "cloudfront_invalidation",
        errorSummary: errorMessage(error)
      };
    }
    if (options.abortSignal?.aborted) {
      return partialCancel("cloudfront_invalidation", frontendEvidence);
    }

    try {
      const publicEvidence = await runStep("public_health", () =>
        gateway.verifyPublic({ context, frontendEvidence })
      );
      if (options.abortSignal?.aborted) {
        return partialCancel("public_health", frontendEvidence);
      }
      await repository.markCandidateStatus({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        candidateId: context.candidate.id,
        status: "succeeded",
        now: now()
      });
      await cleanupCandidateArtifacts("success");
      return {
        status: "succeeded",
        ...published,
        ...activation,
        healthEvidence,
        frontendEvidence,
        publicEvidence
      };
    } catch (error) {
      if (isAbortError(error)) return partialCancel("public_health", frontendEvidence);
      await repository.markPartialFailure({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        releaseId: context.releaseId,
        failureStage: "public_health",
        now: now()
      });
      await cleanupCandidateArtifacts("retain_frontend");
      return {
        status: "partially_failed",
        ...published,
        ...activation,
        healthEvidence,
        frontendEvidence,
        failureStage: "public_health",
        errorSummary: errorMessage(error)
      };
    }
  } catch (error) {
    await repository
      .markCandidateStatus({
        projectId: context.projectId,
        holderId: context.fencingHolderId,
        fencingVersion: lease.fencingVersion,
        candidateId: context.candidate.id,
        status: isAbortError(error) ? "cancelled" : "failed",
        now: now()
      })
      .catch(() => undefined);
    throw error;
  } finally {
    await gateway.cleanup?.().catch(() => undefined);
    if (options.releaseLeaseOnCompletion !== false) {
      await releaseProjectExecutionLease(fence, leaseRepository).catch(() => false);
    }
  }
}

export async function executeTrustedFrontendRetry(
  context: TrustedReleaseContext,
  taskDefinitionArn: string,
  repository: TrustedReleaseRepository,
  gateway: TrustedReleaseGateway,
  leaseRepository: ProjectExecutionLeaseRepository,
  options: { now?: () => Date; heartbeatIntervalMs?: number } = {}
): Promise<TrustedFrontendRetryResult> {
  const now = options.now ?? (() => new Date());
  const lease = await acquireProjectExecutionLease(
    {
      projectId: context.projectId,
      holderId: context.fencingHolderId,
      source: context.source
    },
    leaseRepository,
    { now }
  );
  const fence = {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
  const mutationControl: TrustedReleaseMutationControl = {
    beforeMutation: async () => {
      await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
    }
  };
  const cleanupCandidateArtifacts = async (
    mode: "success" | "retain_frontend"
  ): Promise<void> => {
    await gateway.cleanupCandidateArtifacts?.(context, mode).catch(() => undefined);
  };
  const sequenceByStage: Partial<Record<ApplicationReleaseFailureStage, number>> = {
    runtime_verification: 101,
    ecs_health: 102,
    frontend_upload: 103,
    frontend_activation: 104,
    cloudfront_invalidation: 105,
    public_health: 106
  };
  const runStep = async <T>(
    step: ApplicationReleaseFailureStage,
    operation: () => Promise<T>
  ): Promise<T> => {
    const sequence = sequenceByStage[step];
    if (!sequence) throw new Error(`Frontend retry does not support step ${step}`);
    await heartbeatProjectExecutionLease(fence, leaseRepository, { now });
    await repository.recordStep({
      releaseId: context.releaseId,
      sequence,
      step,
      status: "running",
      fencingVersion: lease.fencingVersion,
      evidence: null,
      errorSummary: null,
      now: now(),
      projectId: context.projectId,
      holderId: context.fencingHolderId
    });
    try {
      await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
      const result = await runWithLeaseHeartbeat(
        fence,
        leaseRepository,
        now,
        operation,
        options.heartbeatIntervalMs
      );
      await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
      await repository.recordStep({
        releaseId: context.releaseId,
        sequence,
        step,
        status: "succeeded",
        fencingVersion: lease.fencingVersion,
        evidence: toJsonValue(result),
        errorSummary: null,
        now: now(),
        projectId: context.projectId,
        holderId: context.fencingHolderId
      });
      return result;
    } catch (error) {
      await repository.recordStep({
        releaseId: context.releaseId,
        sequence,
        step,
        status: "failed",
        fencingVersion: lease.fencingVersion,
        evidence: null,
        errorSummary: errorMessage(error),
        now: now(),
        projectId: context.projectId,
        holderId: context.fencingHolderId
      });
      throw error;
    }
  };
  const fail = async (
    failureStage: ApplicationReleaseFailureStage,
    error: unknown,
    frontendEvidence: FrontendReleaseEvidence | null = null
  ): Promise<TrustedFrontendRetryResult> => {
    const summary = errorMessage(error);
    await repository.markFrontendRetryFailure({
      projectId: context.projectId,
      holderId: context.fencingHolderId,
      fencingVersion: lease.fencingVersion,
      releaseId: context.releaseId,
      candidateId: context.candidate.id,
      failureStage,
      frontendEvidence,
      errorSummary: summary,
      now: now()
    });
    await cleanupCandidateArtifacts("retain_frontend");
    return {
      status: "partially_failed",
      failureStage,
      frontendEvidence,
      errorSummary: summary
    };
  };

  try {
    await repository.beginFrontendRetry({
      projectId: context.projectId,
      holderId: context.fencingHolderId,
      fencingVersion: lease.fencingVersion,
      releaseId: context.releaseId,
      candidateId: context.candidate.id,
      now: now()
    });

    try {
      await runStep("runtime_verification", () =>
        gateway.verifyFrontendCandidate
          ? gateway.verifyFrontendCandidate(context)
          : gateway.verifyCandidate(context)
      );
    } catch (error) {
      return await fail("runtime_verification", error);
    }

    let healthEvidence: JsonValue;
    try {
      healthEvidence = await runStep("ecs_health", () =>
        gateway.verifyEcsHealth({ context, taskDefinitionArn })
      );
    } catch (error) {
      return await fail("ecs_health", error);
    }

    let upload: FrontendUploadEvidence;
    try {
      upload = await runStep("frontend_upload", () =>
        gateway.uploadFrontend({ context, ...mutationControl })
      );
    } catch (error) {
      return await fail("frontend_upload", error);
    }

    let activation: FrontendActivationEvidence;
    try {
      activation = await runStep("frontend_activation", () =>
        gateway.activateFrontend({ context, upload, ...mutationControl })
      );
    } catch (error) {
      return await fail("frontend_activation", error);
    }

    let frontendEvidence: FrontendReleaseEvidence;
    try {
      frontendEvidence = await runStep("cloudfront_invalidation", () =>
        gateway.invalidateFrontend({ context, activation, ...mutationControl })
      );
    } catch (error) {
      return await fail("cloudfront_invalidation", error);
    }

    let publicEvidence: JsonValue;
    try {
      publicEvidence = await runStep("public_health", () =>
        gateway.verifyPublic({ context, frontendEvidence })
      );
    } catch (error) {
      return await fail("public_health", error, frontendEvidence);
    }

    await repository.completeFrontendRetry({
      projectId: context.projectId,
      holderId: context.fencingHolderId,
      fencingVersion: lease.fencingVersion,
      releaseId: context.releaseId,
      candidateId: context.candidate.id,
      frontendEvidence,
      healthEvidence,
      publicEvidence,
      now: now()
    });
    await cleanupCandidateArtifacts("success");
    return { status: "succeeded", healthEvidence, frontendEvidence, publicEvidence };
  } finally {
    await gateway.cleanup?.().catch(() => undefined);
    await releaseProjectExecutionLease(fence, leaseRepository).catch(() => false);
  }
}

export async function executeTrustedEcsRollback(
  context: TrustedReleaseContext & {
    baseline: NonNullable<TrustedReleaseContext["baseline"]>;
  },
  repository: TrustedReleaseRepository,
  gateway: TrustedReleaseGateway,
  leaseRepository: ProjectExecutionLeaseRepository,
  options: {
    now?: () => Date;
    abortSignal?: AbortSignal;
    heartbeatIntervalMs?: number;
    releaseLeaseOnCompletion?: boolean;
  } = {}
): Promise<{
  taskDefinitionArn: string;
  imageDigest: string;
  rollbackEvidence: JsonValue;
}> {
  const now = options.now ?? (() => new Date());
  const lease = await acquireProjectExecutionLease(
    {
      projectId: context.projectId,
      holderId: context.fencingHolderId,
      source: context.source
    },
    leaseRepository,
    { now }
  );
  const fence = {
    projectId: lease.projectId,
    holderId: lease.holderId,
    fencingVersion: lease.fencingVersion
  };
  let sequence = 200;
  const runStep = async <T>(
    step: Extract<ApplicationReleaseFailureStage, "runtime_verification" | "rollback">,
    operation: () => Promise<T>
  ): Promise<T> => {
    sequence += 1;
    await heartbeatProjectExecutionLease(fence, leaseRepository, { now });
    await repository.recordStep({
      releaseId: context.releaseId,
      sequence,
      step,
      status: "running",
      fencingVersion: lease.fencingVersion,
      evidence: null,
      errorSummary: null,
      now: now(),
      projectId: context.projectId,
      holderId: context.fencingHolderId
    });
    try {
      await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
      const result = await runWithLeaseHeartbeat(
        fence,
        leaseRepository,
        now,
        operation,
        options.heartbeatIntervalMs
      );
      await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
      await repository.recordStep({
        releaseId: context.releaseId,
        sequence,
        step,
        status: "succeeded",
        fencingVersion: lease.fencingVersion,
        evidence: toJsonValue(result),
        errorSummary: null,
        now: now(),
        projectId: context.projectId,
        holderId: context.fencingHolderId
      });
      return result;
    } catch (error) {
      await repository
        .recordStep({
          releaseId: context.releaseId,
          sequence,
          step,
          status: "failed",
          fencingVersion: lease.fencingVersion,
          evidence: null,
          errorSummary: errorMessage(error),
          now: now(),
          projectId: context.projectId,
          holderId: context.fencingHolderId
        })
        .catch(() => undefined);
      throw error;
    }
  };

  try {
    if (repository.nextStepSequence) {
      sequence = (await repository.nextStepSequence(context.releaseId)) - 1;
    }
    throwIfAborted(options.abortSignal);
    if (!gateway.verifyRuntime) {
      throw new Error("Trusted ECS rollback runtime verification is unavailable");
    }
    await runStep("runtime_verification", () => gateway.verifyRuntime!(context));
    throwIfAborted(options.abortSignal);
    const rollbackEvidence = await runStep("rollback", () =>
      gateway.rollbackEcs({
        context,
        taskDefinitionArn: context.baseline.taskDefinitionArn,
        beforeMutation: async () => {
          await assertCurrentProjectExecutionLease(fence, leaseRepository, now());
        }
      })
    );
    return {
      taskDefinitionArn: context.baseline.taskDefinitionArn,
      imageDigest: context.baseline.imageDigest,
      rollbackEvidence
    };
  } finally {
    await gateway.cleanup?.().catch(() => undefined);
    if (options.releaseLeaseOnCompletion !== false) {
      await releaseProjectExecutionLease(fence, leaseRepository).catch(() => false);
    }
  }
}

async function runWithLeaseHeartbeat<T>(
  fence: { projectId: string; holderId: string; fencingVersion: number },
  leaseRepository: ProjectExecutionLeaseRepository,
  now: () => Date,
  operation: () => Promise<T>,
  heartbeatIntervalMs = 30_000
): Promise<T> {
  let heartbeatError: unknown;
  let heartbeatInFlight: Promise<void> = Promise.resolve();
  const heartbeat = () => {
    heartbeatInFlight = heartbeatInFlight.then(async () => {
      if (heartbeatError) return;
      try {
        await heartbeatProjectExecutionLease(fence, leaseRepository, { now });
      } catch (error) {
        heartbeatError = error;
      }
    });
  };
  const timer = setInterval(heartbeat, Math.max(1, heartbeatIntervalMs));
  timer.unref?.();
  let result: T | undefined;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  } finally {
    clearInterval(timer);
    await heartbeatInFlight;
  }
  if (operationError) throw operationError;
  if (heartbeatError) throw heartbeatError;
  return result as T;
}

class TrustedReleaseAbortError extends Error {
  constructor() {
    super("Trusted release was cancelled");
    this.name = "AbortError";
  }
}

function throwIfAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) throw new TrustedReleaseAbortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown trusted release error";
}
