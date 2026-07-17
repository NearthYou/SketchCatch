import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AwsConnection, DeploymentFailureStage, DeploymentStatus } from "@sketchcatch/types";
import {
  prepareTerraformAwsCredentialEnv as defaultPrepareTerraformAwsCredentialEnv,
  type PreparedTerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";
import { assertDeploymentDestroyPreconditions } from "./deployment-approval-service.js";
import { createAwsCodeBuildDirectApplicationReleaseGateway } from "./aws-codebuild-direct-application-release-gateway.js";
import {
  rollbackDirectApplicationRelease,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";
import type { ApplicationCleanupPlanSummary } from "./deployment-destroy-plan-service.js";
import {
  createS3DeploymentApplyArtifactStorage,
  type DeploymentApplyArtifactStorage
} from "./deployment-apply-artifact-storage.js";
import {
  appendTerraformDurationLog,
  runLoggedDeploymentOperation
} from "./deployment-duration-logs.js";
import { maskDeploymentMessage } from "./log-masking.js";
import {
  appendDeploymentLogs,
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";
import { assertTerraformArtifactIsSafe } from "./terraform-artifact-safety.js";
import {
  cleanupPreparedTerraformWorkspace,
  createTerraformFilesSafetyContent,
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import {
  runTerraformApply as defaultRunTerraformApply,
  runTerraformInit as defaultRunTerraformInit,
  terraformMutationTimeoutMs,
  type TerraformRunResult
} from "./terraform-runner.js";
import {
  restoreTerraformLockFile,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";
import {
  acquireProjectExecutionLease,
  heartbeatProjectExecutionLease,
  recordProjectExecutionCoordinates,
  releaseProjectExecutionLease
} from "../releases/project-execution-lease-service.js";

const defaultPlanFileName = "tfplan";

export type RunDeploymentDestroyInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  startedFromFailureStage?: DeploymentFailureStage | null;
  abortSignal?: AbortSignal;
  workerTaskArn?: string;
};

export type RunDeploymentDestroyOptions = {
  prepareTerraformWorkspace?: typeof defaultPrepareTerraformWorkspace;
  runTerraformInit?: typeof defaultRunTerraformInit;
  runTerraformApply?: typeof defaultRunTerraformApply;
  prepareTerraformAwsCredentialEnv?: (
    awsConnection: AwsConnection
  ) => Promise<PreparedTerraformAwsCredentialEnv>;
  awsStsGateway?: AwsConnectionStsGateway;
  applyArtifactStorage?: DeploymentApplyArtifactStorage;
  readTerraformArtifactFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  writeTerraformStateFile?: (filePath: string, content: Buffer) => Promise<void>;
  writePlanFile?: (filePath: string, content: Buffer) => Promise<void>;
  executeApplicationCleanup?: (input: {
    deployment: DeploymentRecord;
    accessContext: ProjectAccessContext;
    cleanupPlan: ApplicationCleanupPlanSummary;
    abortSignal?: AbortSignal;
    repository: DeploymentRepository;
    retainProjectLease?: boolean;
  }) => Promise<void>;
};

export type RunDeploymentDestroyResult = {
  deployment: DeploymentRecord;
  terraform: {
    init: TerraformRunResult | null;
    destroy: TerraformRunResult | null;
  };
};

export async function runDeploymentDestroy(
  input: RunDeploymentDestroyInput,
  repository: DeploymentRepository,
  options: RunDeploymentDestroyOptions = {}
): Promise<RunDeploymentDestroyResult> {
  const prepareTerraformWorkspace =
    options.prepareTerraformWorkspace ?? defaultPrepareTerraformWorkspace;
  const runTerraformInit = options.runTerraformInit ?? defaultRunTerraformInit;
  const runTerraformApply = options.runTerraformApply ?? defaultRunTerraformApply;
  const prepareTerraformAwsCredentialEnv =
    options.prepareTerraformAwsCredentialEnv ??
    ((awsConnection: AwsConnection) =>
      defaultPrepareTerraformAwsCredentialEnv(
        awsConnection,
        options.awsStsGateway ?? createAwsSdkStsGateway()
      ));
  const applyArtifactStorage =
    options.applyArtifactStorage ?? createS3DeploymentApplyArtifactStorage();
  const readTerraformArtifactFile = options.readTerraformArtifactFile ?? readFile;
  const writeTerraformStateFile = options.writeTerraformStateFile ?? writeFile;
  const writePlanFile = options.writePlanFile ?? writeFile;
  const executeApplicationCleanup =
    options.executeApplicationCleanup ?? defaultExecuteApplicationCleanup;

  let workspace: PreparedTerraformWorkspace | undefined;
  let workspacePromise: Promise<PreparedTerraformWorkspace> | undefined;
  let deploymentId: string | undefined;
  let destroySucceeded = false;
  let failureRecorded = false;
  let destroyLeaseFence:
    | { projectId: string; holderId: string; fencingVersion: number }
    | undefined;
  const terraform: RunDeploymentDestroyResult["terraform"] = {
    init: null,
    destroy: null
  };

  try {
    const deployment = await getDeployment(
      {
        deploymentId: input.deploymentId,
        accessContext: input.accessContext
      },
      repository
    );
    deploymentId = deployment.id;
    const sourceStatus = input.startedFromStatus ?? deployment.status;
    const sourceFailureStage = input.startedFromFailureStage ?? deployment.failureStage;

    if (!isDestroyRunnableStatus(sourceStatus, sourceFailureStage)) {
      throw new DeploymentConflictError("Deployment cannot be destroyed in this state");
    }

    if (deployment.scope === "application") {
      return await runApplicationOnlyDestroy({
        deployment,
        sourceStatus,
        sourceFailureStage,
        input,
        repository,
        prepareTerraformWorkspace,
        applyArtifactStorage,
        readTerraformArtifactFile,
        executeApplicationCleanup,
        terraform
      });
    }

    if (repository.projectExecutionLeaseRepository) {
      const lease = await acquireProjectExecutionLease(
        {
          projectId: deployment.projectId,
          holderId: `destroy:${deployment.id}`,
          source: "direct"
        },
        repository.projectExecutionLeaseRepository
      );
      destroyLeaseFence = {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      };
      if (input.workerTaskArn) {
        await recordProjectExecutionCoordinates(
          { ...destroyLeaseFence, activeWorkerTaskArn: input.workerTaskArn },
          repository.projectExecutionLeaseRepository
        );
      }
    }

    const [terraformArtifact, currentPlanArtifact, awsConnection] = await Promise.all([
      requireDeploymentTerraformArtifact(deployment, repository),
      requireCurrentDestroyPlanArtifact(deployment, repository),
      requireDeploymentAwsConnection(deployment, input.accessContext, repository)
    ]);
    workspacePromise = prepareTerraformWorkspace({
      objectKey: terraformArtifact.objectKey,
      fileName: terraformArtifact.fileName,
      contentType: terraformArtifact.contentType
    }).then((preparedWorkspace) => {
      workspace = preparedWorkspace;
      return preparedWorkspace;
    });
    const [planBuffer, preparedWorkspace, stateBuffer] = await Promise.all([
      applyArtifactStorage.downloadDeploymentArtifact({
        deploymentId: deployment.id,
        planArtifactId: currentPlanArtifact.id,
        objectKey: currentPlanArtifact.objectKey
      }),
      workspacePromise,
      applyArtifactStorage.downloadDeploymentState({
        deploymentId: deployment.id,
        objectKey: deployment.stateObjectKey ?? ""
      })
    ]);
    workspace = preparedWorkspace;

    const terraformArtifactContent = await readTerraformArtifactFile(workspace.mainFilePath);
    assertTerraformArtifactIsSafe(
      createTerraformFilesSafetyContent(workspace.terraformFiles, terraformArtifactContent),
      { liveProfile: deployment.liveProfile }
    );
    const currentTerraformArtifactHash = createSha256(terraformArtifactContent);
    const currentTfplanHash = createSha256(planBuffer);

    assertDeploymentDestroyPreconditions({
      deployment,
      currentPlanArtifact,
      currentTerraformArtifactHash,
      currentTfplanHash,
      currentAwsConnection: awsConnection,
      sourceStatus,
      sourceFailureStage
    });

    const [awsCredentials] = await Promise.all([
      prepareAwsCredentialsForDestroy({
        deploymentId: deployment.id,
        awsConnection,
        prepareTerraformAwsCredentialEnv,
        repository,
        markFailureRecorded: () => {
          failureRecorded = true;
        }
      }),
      writeTerraformStateFile(join(preparedWorkspace.workdir, "terraform.tfstate"), stateBuffer),
      writePlanFile(join(preparedWorkspace.workdir, defaultPlanFileName), planBuffer),
      restoreTerraformLockFile({
        deploymentId: deployment.id,
        workspace: preparedWorkspace,
        storage: applyArtifactStorage
      })
    ]);
    const wasPreMarkedRunning =
      deployment.status === "RUNNING" && input.startedFromStatus !== undefined;

    if (!wasPreMarkedRunning) {
      const runningDeployment = await repository.markDeploymentDestroyRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment destroy could not be started");
      }
    }

    let sequence = await repository.getNextDeploymentLogSequence(deployment.id);

    terraform.init = await runTerraformInit(workspace.workdir, {
      env: awsCredentials.env,
      signal: input.abortSignal
    });
    sequence = await appendTerraformDestroyOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      label: "terraform init",
      result: terraform.init,
      repository
    });

    if (terraform.init.cancelled) {
      return failDeploymentDestroyRun({
        deployment,
        repository,
        terraform,
        errorSummary:
          "Terraform destroy was cancelled. AWS resources may have been partially changed; verify resources before retry."
      });
    }

    if (terraform.init.exitCode !== 0) {
      return failDeploymentDestroyRun({
        deployment,
        repository,
        terraform,
        errorSummary: summarizeTerraformFailure("Terraform init before destroy", terraform.init)
      });
    }

    const lockUpload = await runLoggedDeploymentOperation({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "destroy",
      label: "terraform lock file upload",
      repository,
      operation: () =>
        uploadTerraformLockFile({
          deploymentId: deployment.id,
          workspace: workspace!,
          storage: applyArtifactStorage
        })
    });
    sequence = lockUpload.sequence;

    terraform.destroy = await runWithDestroyLeaseHeartbeat(
      destroyLeaseFence,
      repository,
      () =>
        runTerraformApply(workspace!.workdir, {
          env: awsCredentials.env,
          planFileName: defaultPlanFileName,
          timeoutMs: terraformMutationTimeoutMs,
          signal: input.abortSignal
        })
    );
    sequence = await appendTerraformDestroyOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      label: "terraform apply tfplan",
      result: terraform.destroy,
      repository
    });

    if (terraform.destroy.cancelled) {
      return failDeploymentDestroyRun({
        deployment,
        repository,
        terraform,
        errorSummary:
          "Terraform destroy was cancelled. AWS resources may have been partially deleted; verify resources before retry."
      });
    }

    if (terraform.destroy.exitCode !== 0) {
      return failDeploymentDestroyRun({
        deployment,
        repository,
        terraform,
        errorSummary: summarizeTerraformFailure("Terraform destroy", terraform.destroy)
      });
    }

    destroySucceeded = true;

    const destroyResultSave = await runLoggedDeploymentOperation({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "destroy",
      label: "deployment destroy result save",
      repository,
      operation: () =>
        repository.completeDeploymentDestroy(deployment.id, {
          resultWarningSummary:
            sourceStatus === "FAILED"
              ? "Deployment was destroyed after a failed deployment cleanup."
              : null
        })
    });
    const completedDeployment = destroyResultSave.result;

    if (!completedDeployment) {
      throw new DeploymentNotFoundError("Deployment not found");
    }

    return {
      deployment: completedDeployment,
      terraform
    };
  } catch (error) {
    if (deploymentId && !destroySucceeded && !failureRecorded) {
      await repository
        .failDeployment(deploymentId, {
          failureStage: "destroy",
          errorSummary: summarizeUnexpectedDestroyFailure(error)
        })
        .catch(() => undefined);
    }

    throw error;
  } finally {
    try {
      await cleanupPreparedTerraformWorkspace({ workspace, workspacePromise });
    } finally {
      if (destroyLeaseFence && repository.projectExecutionLeaseRepository) {
        await releaseProjectExecutionLease(
          destroyLeaseFence,
          repository.projectExecutionLeaseRepository
        ).catch(() => false);
      }
    }
  }
}

async function runApplicationOnlyDestroy(input: {
  deployment: DeploymentRecord;
  sourceStatus: DeploymentStatus;
  sourceFailureStage: DeploymentFailureStage | null;
  input: RunDeploymentDestroyInput;
  repository: DeploymentRepository;
  prepareTerraformWorkspace: typeof defaultPrepareTerraformWorkspace;
  applyArtifactStorage: DeploymentApplyArtifactStorage;
  readTerraformArtifactFile: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  executeApplicationCleanup: NonNullable<
    RunDeploymentDestroyOptions["executeApplicationCleanup"]
  >;
  terraform: RunDeploymentDestroyResult["terraform"];
}): Promise<RunDeploymentDestroyResult> {
  let applicationLeaseFence:
    | { projectId: string; holderId: string; fencingVersion: number }
    | undefined;
  let workspace: PreparedTerraformWorkspace | undefined;
  let workspacePromise: Promise<PreparedTerraformWorkspace> | undefined;
  try {
    const [terraformArtifact, currentPlanArtifact, awsConnection] = await Promise.all([
      requireDeploymentTerraformArtifact(input.deployment, input.repository),
      requireCurrentDestroyPlanArtifact(input.deployment, input.repository),
      requireDeploymentAwsConnection(
        input.deployment,
        input.input.accessContext,
        input.repository
      )
    ]);
    workspacePromise = input
      .prepareTerraformWorkspace({
        objectKey: terraformArtifact.objectKey,
        fileName: terraformArtifact.fileName,
        contentType: terraformArtifact.contentType
      })
      .then((preparedWorkspace) => {
        workspace = preparedWorkspace;
        return preparedWorkspace;
      });
    const [planBuffer, preparedWorkspace] = await Promise.all([
      input.applyArtifactStorage.downloadDeploymentArtifact({
        deploymentId: input.deployment.id,
        planArtifactId: currentPlanArtifact.id,
        objectKey: currentPlanArtifact.objectKey
      }),
      workspacePromise
    ]);
    const cleanupPlan = parseApplicationCleanupPlan(planBuffer, input.deployment);
    if (input.repository.projectExecutionLeaseRepository) {
      const lease = await acquireProjectExecutionLease(
        {
          projectId: input.deployment.projectId,
          holderId: cleanupPlan.releaseId,
          source: "direct"
        },
        input.repository.projectExecutionLeaseRepository
      );
      applicationLeaseFence = {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      };
      if (input.input.workerTaskArn) {
        await recordProjectExecutionCoordinates(
          { ...applicationLeaseFence, activeWorkerTaskArn: input.input.workerTaskArn },
          input.repository.projectExecutionLeaseRepository
        );
      }
    }
    const terraformArtifactContent = await input.readTerraformArtifactFile(
      preparedWorkspace.mainFilePath
    );
    assertTerraformArtifactIsSafe(
      createTerraformFilesSafetyContent(preparedWorkspace.terraformFiles, terraformArtifactContent),
      { liveProfile: input.deployment.liveProfile }
    );
    assertDeploymentDestroyPreconditions({
      deployment: input.deployment,
      currentPlanArtifact,
      currentTerraformArtifactHash: createSha256(terraformArtifactContent),
      currentTfplanHash: createSha256(planBuffer),
      currentAwsConnection: awsConnection,
      sourceStatus: input.sourceStatus,
      sourceFailureStage: input.sourceFailureStage
    });
    const wasPreMarkedRunning =
      input.deployment.status === "RUNNING" && input.input.startedFromStatus !== undefined;
    if (!wasPreMarkedRunning) {
      const running = await input.repository.markDeploymentDestroyRunning(input.deployment.id);
      if (!running) {
        throw new DeploymentConflictError("Application cleanup could not be started");
      }
    }
    const sequence = await input.repository.getNextDeploymentLogSequence(input.deployment.id);
    try {
      await runLoggedDeploymentOperation({
        deploymentId: input.deployment.id,
        accessContext: input.input.accessContext,
        sequence,
        stage: "destroy",
        label: "application runtime rollback",
        repository: input.repository,
        operation: () =>
          input.executeApplicationCleanup({
            deployment: input.deployment,
            accessContext: input.input.accessContext,
            cleanupPlan,
            repository: input.repository,
            ...(applicationLeaseFence ? { retainProjectLease: true } : {}),
            ...(input.input.abortSignal ? { abortSignal: input.input.abortSignal } : {})
          })
      });
    } catch (error) {
      return failDeploymentDestroyRun({
        deployment: input.deployment,
        repository: input.repository,
        terraform: input.terraform,
        errorSummary: maskDeploymentMessage(
          `Application runtime rollback failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      });
    }
    const completed = await input.repository.completeDeploymentDestroy(input.deployment.id, {
      resultWarningSummary:
        input.sourceStatus === "FAILED"
          ? "Application release was restored after a failed cleanup attempt."
          : null
    });
    if (!completed) throw new DeploymentNotFoundError("Deployment not found");
    return { deployment: completed, terraform: input.terraform };
  } finally {
    try {
      await cleanupPreparedTerraformWorkspace({ workspace, workspacePromise });
    } finally {
      if (applicationLeaseFence && input.repository.projectExecutionLeaseRepository) {
        await releaseProjectExecutionLease(
          applicationLeaseFence,
          input.repository.projectExecutionLeaseRepository
        ).catch(() => false);
      }
    }
  }
}

async function defaultExecuteApplicationCleanup(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  cleanupPlan: ApplicationCleanupPlanSummary;
  abortSignal?: AbortSignal;
  repository: DeploymentRepository;
  retainProjectLease?: boolean;
}): Promise<void> {
  const currentRelease = await input.repository.findRelease?.(input.deployment.id);
  if (
    !currentRelease?.providerRevision ||
    currentRelease.id !== input.cleanupPlan.releaseId ||
    currentRelease.runtimeTargetKind !== input.cleanupPlan.runtimeTargetKind ||
    currentRelease.providerRevision.revisionId !== input.cleanupPlan.currentRevision ||
    resolvePreviousRevision(currentRelease) !== input.cleanupPlan.previousRevision
  ) {
    throw new DeploymentConflictError(
      "Application release changed after cleanup approval"
    );
  }
  const release = await rollbackDirectApplicationRelease(
    {
      deploymentId: input.deployment.id,
      userId: input.accessContext.userId,
      ...(input.retainProjectLease ? { retainProjectLease: true } : {}),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    },
    requireDirectApplicationReleaseRepository(input.repository),
    createAwsCodeBuildDirectApplicationReleaseGateway()
  );
  if (!release || release.status !== "rolled_back") {
    throw new DeploymentConflictError(
      "Application cleanup did not restore the previous runtime revision"
    );
  }
}

async function runWithDestroyLeaseHeartbeat<T>(
  fence: { projectId: string; holderId: string; fencingVersion: number } | undefined,
  repository: DeploymentRepository,
  operation: () => Promise<T>
): Promise<T> {
  const leaseRepository = repository.projectExecutionLeaseRepository;
  if (!fence || !leaseRepository) return operation();
  let heartbeatError: unknown;
  let heartbeatInFlight = Promise.resolve();
  const timer = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight.then(async () => {
      if (heartbeatError) return;
      try {
        await heartbeatProjectExecutionLease(fence, leaseRepository);
      } catch (error) {
        heartbeatError = error;
      }
    });
  }, 30_000);
  timer.unref?.();
  try {
    const result = await operation();
    await heartbeatInFlight;
    if (heartbeatError) throw heartbeatError;
    return result;
  } finally {
    clearInterval(timer);
  }
}

function parseApplicationCleanupPlan(
  content: Buffer,
  deployment: DeploymentRecord
): ApplicationCleanupPlanSummary {
  if (!deployment.targetKind) {
    throw new DeploymentConflictError("Deployment target kind is missing");
  }

  let value: unknown;
  try {
    value = JSON.parse(content.toString("utf8"));
  } catch {
    throw new DeploymentConflictError("Application cleanup plan artifact is invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeploymentConflictError("Application cleanup plan artifact is invalid");
  }
  const record = value as Record<string, unknown>;
  if (
    record["schemaVersion"] !== 1 ||
    record["kind"] !== "application_release_cleanup_plan" ||
    record["deploymentId"] !== deployment.id ||
    record["projectId"] !== deployment.projectId ||
    record["runtimeTargetKind"] !== deployment.targetKind ||
    typeof record["releaseId"] !== "string" ||
    typeof record["currentRevision"] !== "string" ||
    typeof record["previousRevision"] !== "string" ||
    !record["currentRevision"].trim() ||
    !record["previousRevision"].trim()
  ) {
    throw new DeploymentConflictError("Application cleanup plan artifact is invalid");
  }
  return {
    releaseId: record["releaseId"],
    runtimeTargetKind: deployment.targetKind,
    currentRevision: record["currentRevision"],
    previousRevision: record["previousRevision"]
  };
}

function resolvePreviousRevision(
  release: NonNullable<Awaited<ReturnType<DirectApplicationReleaseRepository["findRelease"]>>>
): string | undefined {
  const metadata = release.providerRevision?.metadata;
  if (!metadata) return undefined;
  const value =
    release.runtimeTargetKind === "ecs_fargate"
      ? metadata["previousTaskDefinitionArn"]
      : release.runtimeTargetKind === "lambda"
        ? metadata["previousVersion"]
        : release.runtimeTargetKind === "ec2_asg"
          ? metadata["previousArtifactUri"]
          : metadata["previousReleasePrefix"];
  return typeof value === "string" ? value : undefined;
}

function requireDirectApplicationReleaseRepository(
  repository: DeploymentRepository
): DirectApplicationReleaseRepository {
  if (
    !repository.artifactRegistry ||
    !repository.findContext ||
    !repository.findRelease ||
    !repository.savePreparedRelease ||
    !repository.saveCompletedRelease ||
    !repository.saveFailedRelease ||
    !repository.savePartialRelease ||
    !repository.saveCancelledRelease ||
    !repository.resetReleaseForRetry
  ) {
    throw new DeploymentConflictError("Direct application release repository is unavailable");
  }
  return {
    artifactRegistry: repository.artifactRegistry,
    findContext: repository.findContext.bind(repository),
    findRelease: repository.findRelease.bind(repository),
    savePreparedRelease: repository.savePreparedRelease.bind(repository),
    saveCompletedRelease: repository.saveCompletedRelease.bind(repository),
    saveFailedRelease: repository.saveFailedRelease.bind(repository),
    savePartialRelease: repository.savePartialRelease.bind(repository),
    saveCancelledRelease: repository.saveCancelledRelease.bind(repository),
    resetReleaseForRetry: repository.resetReleaseForRetry.bind(repository)
  };
}

function isDestroyRunnableStatus(
  sourceStatus: DeploymentStatus,
  sourceFailureStage: DeploymentFailureStage | null
): boolean {
  return (
    sourceStatus === "SUCCESS" ||
    (sourceStatus === "FAILED" &&
      (sourceFailureStage === "plan" ||
        sourceFailureStage === "apply" ||
        sourceFailureStage === "destroy"))
  );
}

async function requireDeploymentTerraformArtifact(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
) {
  const artifact = await repository.findTerraformArtifactById(deployment.terraformArtifactId);

  if (!artifact || artifact.id !== deployment.terraformArtifactId) {
    throw new DeploymentNotFoundError("Terraform artifact not found for deployment");
  }

  if (
    artifact.projectId !== deployment.projectId ||
    artifact.architectureId !== deployment.architectureId
  ) {
    throw new DeploymentNotFoundError("Terraform artifact does not match deployment");
  }

  return artifact;
}

async function requireCurrentDestroyPlanArtifact(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
) {
  if (!deployment.currentPlanArtifactId) {
    throw new DeploymentConflictError("Terraform Destroy Plan must be completed before destroy");
  }

  const planArtifact = await repository.findDeploymentPlanArtifactById(
    deployment.currentPlanArtifactId
  );

  if (!planArtifact || planArtifact.deploymentId !== deployment.id) {
    throw new DeploymentConflictError("Current deployment destroy plan artifact not found");
  }

  if (planArtifact.operation !== "destroy") {
    throw new DeploymentConflictError("Terraform destroy plan is required before destroy");
  }

  return planArtifact;
}

async function requireDeploymentAwsConnection(
  deployment: DeploymentRecord,
  accessContext: ProjectAccessContext,
  repository: DeploymentRepository
): Promise<AwsConnection & { accountId: string }> {
  if (!deployment.awsConnectionId) {
    throw new DeploymentNotFoundError("Deployment AWS connection is missing");
  }

  const awsConnection = await repository.findVerifiedAwsConnectionById(
    deployment.awsConnectionId,
    accessContext
  );

  if (!awsConnection || !awsConnection.accountId) {
    throw new DeploymentNotFoundError("Verified AWS connection not found for deployment");
  }

  return {
    ...awsConnection,
    accountId: awsConnection.accountId
  };
}

async function prepareAwsCredentialsForDestroy(input: {
  deploymentId: string;
  awsConnection: AwsConnection;
  prepareTerraformAwsCredentialEnv: (
    awsConnection: AwsConnection
  ) => Promise<PreparedTerraformAwsCredentialEnv>;
  repository: DeploymentRepository;
  markFailureRecorded: () => void;
}): Promise<PreparedTerraformAwsCredentialEnv> {
  try {
    return await input.prepareTerraformAwsCredentialEnv(input.awsConnection);
  } catch (error) {
    await input.repository
      .failDeployment(input.deploymentId, {
        failureStage: "aws_connection",
        errorSummary: summarizeUnexpectedDestroyFailure(error)
      })
      .catch(() => undefined);
    input.markFailureRecorded();

    throw error;
  }
}

async function failDeploymentDestroyRun(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  terraform: RunDeploymentDestroyResult["terraform"];
  errorSummary: string;
}): Promise<RunDeploymentDestroyResult> {
  const failedDeployment = await input.repository.failDeployment(input.deployment.id, {
    failureStage: "destroy",
    errorSummary: input.errorSummary
  });

  if (!failedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return {
    deployment: failedDeployment,
    terraform: input.terraform
  };
}

async function appendTerraformDestroyOutput(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  label: string;
  result: TerraformRunResult;
  repository: DeploymentRepository;
}): Promise<number> {
  let nextSequence = await appendOutputLines({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    output: input.result.stdout,
    level: "INFO",
    repository: input.repository
  });

  nextSequence = await appendOutputLines({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: nextSequence,
    output: input.result.stderr,
    level: input.result.exitCode === 0 ? "WARN" : "ERROR",
    repository: input.repository
  });

  return appendTerraformDurationLog({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: nextSequence,
    stage: "destroy",
    label: input.label,
    result: input.result,
    repository: input.repository
  });
}

async function appendOutputLines(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  output: string;
  level: "INFO" | "WARN" | "ERROR";
  repository: DeploymentRepository;
}): Promise<number> {
  const lines = splitOutputLines(input.output);

  if (lines.length === 0) {
    return input.sequence;
  }

  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: lines.map((line, index) => ({
        sequence: input.sequence + index,
        stage: "destroy",
        level: input.level,
        message: line,
        relatedResourceId: null
      }))
    },
    input.repository
  );

  return input.sequence + lines.length;
}

function splitOutputLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => maskDeploymentMessage(line.trimEnd()))
    .filter((line) => line.length > 0);
}

function summarizeTerraformFailure(stage: string, result: TerraformRunResult): string {
  if (result.timedOut) {
    if (stage === "Terraform destroy") {
      return `${stage} timed out. AWS resources may have been partially deleted; verify resources before retry.`;
    }

    return `${stage} timed out`;
  }

  const summary =
    splitOutputLines(result.stderr)[0] ?? `${stage} failed with exit code ${result.exitCode}`;

  return maskDeploymentMessage(summary);
}

function summarizeUnexpectedDestroyFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return maskDeploymentMessage(message);
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}
