import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AwsConnection,
  DeploymentFailureStage,
  DeploymentStatus
} from "@sketchcatch/types";
import {
  prepareTerraformAwsCredentialEnv as defaultPrepareTerraformAwsCredentialEnv,
  type PreparedTerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";
import {
  createDeploymentPlanSummaryFromTerraformShowJson,
  findUnsupportedLiveApplyResourceTypesFromTerraformShowJson
} from "./deployment-plan-summary.js";
import {
  createS3DeploymentPlanArtifactStorage,
  type DeploymentPlanArtifactStorage
} from "./deployment-plan-artifact-storage.js";
import { evaluateDeploymentSafetyGate } from "./deployment-safety-gate.js";
import { createDestroyNoOpWarning } from "./deployment-warning-factory.js";
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
  createTerraformFilesSafetyContent,
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import {
  runTerraformDestroyPlan as defaultRunTerraformDestroyPlan,
  runTerraformInit as defaultRunTerraformInit,
  runTerraformShowJson as defaultRunTerraformShowJson,
  terraformMutationTimeoutMs,
  type TerraformRunResult
} from "./terraform-runner.js";
import {
  restoreTerraformLockFile,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";

const defaultPlanFileName = "tfplan";

export type RunDeploymentDestroyPlanInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  startedFromFailureStage?: DeploymentFailureStage | null;
  startedFromErrorSummary?: string | null;
  abortSignal?: AbortSignal;
};

export type RunDeploymentDestroyPlanOptions = {
  prepareTerraformWorkspace?: typeof defaultPrepareTerraformWorkspace;
  runTerraformInit?: typeof defaultRunTerraformInit;
  runTerraformDestroyPlan?: typeof defaultRunTerraformDestroyPlan;
  runTerraformShowJson?: typeof defaultRunTerraformShowJson;
  prepareTerraformAwsCredentialEnv?: (
    awsConnection: AwsConnection
  ) => Promise<PreparedTerraformAwsCredentialEnv>;
  awsStsGateway?: AwsConnectionStsGateway;
  planArtifactStorage?: DeploymentPlanArtifactStorage;
  applyArtifactStorage?: DeploymentApplyArtifactStorage;
  generatePlanArtifactId?: () => string;
  readTerraformArtifactFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  writeTerraformStateFile?: (filePath: string, content: Buffer) => Promise<void>;
  prepareApplicationCleanupPlan?: (input: {
    deployment: DeploymentRecord;
    repository: DeploymentRepository;
  }) => Promise<ApplicationCleanupPlanSummary>;
  writeApplicationCleanupPlanFile?: (filePath: string, content: string) => Promise<void>;
};

export type ApplicationCleanupPlanSummary = {
  releaseId: string;
  runtimeTargetKind: NonNullable<DeploymentRecord["targetKind"]>;
  currentRevision: string;
  previousRevision: string;
};

export type RunDeploymentDestroyPlanResult = {
  deployment: DeploymentRecord;
  terraform: {
    init: TerraformRunResult | null;
    plan: TerraformRunResult | null;
    showJson: TerraformRunResult | null;
  };
};

export async function runDeploymentDestroyPlan(
  input: RunDeploymentDestroyPlanInput,
  repository: DeploymentRepository,
  options: RunDeploymentDestroyPlanOptions = {}
): Promise<RunDeploymentDestroyPlanResult> {
  const prepareTerraformWorkspace =
    options.prepareTerraformWorkspace ?? defaultPrepareTerraformWorkspace;
  const runTerraformInit = options.runTerraformInit ?? defaultRunTerraformInit;
  const runTerraformDestroyPlan =
    options.runTerraformDestroyPlan ?? defaultRunTerraformDestroyPlan;
  const runTerraformShowJson = options.runTerraformShowJson ?? defaultRunTerraformShowJson;
  const prepareTerraformAwsCredentialEnv =
    options.prepareTerraformAwsCredentialEnv ??
    ((awsConnection: AwsConnection) =>
      defaultPrepareTerraformAwsCredentialEnv(
        awsConnection,
        options.awsStsGateway ?? createAwsSdkStsGateway()
      ));
  let planArtifactStorage = options.planArtifactStorage;
  const getPlanArtifactStorage = () =>
    (planArtifactStorage ??= createS3DeploymentPlanArtifactStorage());
  let applyArtifactStorage = options.applyArtifactStorage;
  const getApplyArtifactStorage = () =>
    (applyArtifactStorage ??= createS3DeploymentApplyArtifactStorage());
  const generatePlanArtifactId = options.generatePlanArtifactId ?? randomUUID;
  const readTerraformArtifactFile = options.readTerraformArtifactFile ?? readFile;
  const writeTerraformStateFile = options.writeTerraformStateFile ?? writeFile;
  const prepareApplicationCleanupPlan =
    options.prepareApplicationCleanupPlan ?? defaultPrepareApplicationCleanupPlan;
  const writeApplicationCleanupPlanFile =
    options.writeApplicationCleanupPlanFile ?? writeFile;

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;
  let failureRecorded = false;
  let failureStage: DeploymentFailureStage = "plan";
  const terraform: RunDeploymentDestroyPlanResult["terraform"] = {
    init: null,
    plan: null,
    showJson: null
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
    const sourceErrorSummary = input.startedFromErrorSummary ?? deployment.errorSummary;
    failureStage = resolveDestroyPlanFailureStage(sourceStatus, sourceFailureStage);

    assertDeploymentCanStartDestroyPlan(deployment, sourceStatus, sourceFailureStage);

    if (deployment.scope === "application") {
      return await saveApplicationCleanupPlan({
        deployment,
        sourceStatus,
        sourceFailureStage,
        sourceErrorSummary,
        accessContext: input.accessContext,
        repository,
        prepareTerraformWorkspace,
        readTerraformArtifactFile,
        planArtifactStorage: getPlanArtifactStorage(),
        generatePlanArtifactId,
        prepareApplicationCleanupPlan,
        writeApplicationCleanupPlanFile,
        terraform
      });
    }

    const [artifact, currentPlanArtifact, awsConnection] = await Promise.all([
      requireDeploymentTerraformArtifact(deployment, repository),
      deployment.currentPlanArtifactId
        ? repository.findDeploymentPlanArtifactById(deployment.currentPlanArtifactId)
        : Promise.resolve(undefined),
      requireDeploymentAwsConnection(deployment, input.accessContext, repository)
    ]);
    const preparedWorkspace = await prepareTerraformWorkspace({
      objectKey: artifact.objectKey,
      fileName: artifact.fileName,
      contentType: artifact.contentType
    });
    workspace = preparedWorkspace;

    const terraformArtifactContent = await readTerraformArtifactFile(workspace.mainFilePath);
    assertTerraformArtifactIsSafe(
      createTerraformFilesSafetyContent(workspace.terraformFiles, terraformArtifactContent),
      { liveProfile: deployment.liveProfile, resourceValidationMode: "plan" }
    );
    const terraformArtifactSha256 = createSha256(terraformArtifactContent);

    assertDestroyCleanupArtifactHasNotDrifted({
      sourceStatus,
      sourceFailureStage,
      currentPlanArtifact,
      deployment,
      terraformArtifactSha256
    });

    const [awsCredentials, stateBuffer] = await Promise.all([
      prepareAwsCredentialsForDestroyPlan({
        deploymentId: deployment.id,
        awsConnection,
        prepareTerraformAwsCredentialEnv,
        repository,
        markFailureRecorded: () => {
          failureRecorded = true;
        }
      }),
      getApplyArtifactStorage().downloadDeploymentState({
        deploymentId: deployment.id,
        objectKey: deployment.stateObjectKey ?? ""
      })
    ]);
    await Promise.all([
      writeTerraformStateFile(join(preparedWorkspace.workdir, "terraform.tfstate"), stateBuffer),
      restoreTerraformLockFile({
        deploymentId: deployment.id,
        workspace: preparedWorkspace,
        storage: getPlanArtifactStorage()
      })
    ]);
    const wasPreMarkedRunning =
      deployment.status === "RUNNING" && input.startedFromStatus !== undefined;

    if (!wasPreMarkedRunning) {
      const runningDeployment = await repository.markDeploymentPlanRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment destroy plan could not be started");
      }
    }

    let sequence = await repository.getNextDeploymentLogSequence(deployment.id);

    terraform.init = await runTerraformInit(workspace.workdir, {
      env: awsCredentials.env,
      signal: input.abortSignal
    });
    sequence = await appendTerraformOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "init",
      label: "terraform init",
      result: terraform.init,
      repository
    });

    if (terraform.init.cancelled) {
      return cancelDeploymentDestroyPlanRun({
        deployment,
        repository,
        terraform,
        errorSummary: "Terraform destroy plan was cancelled during init before AWS resources were changed"
      });
    }

    if (terraform.init.exitCode !== 0) {
      return failDeploymentDestroyPlanRun({
        deployment,
        repository,
        terraform,
        failureStage,
        errorSummary: summarizeTerraformFailure("Terraform init before destroy plan", terraform.init)
      });
    }

    const lockUpload = await runLoggedDeploymentOperation({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "init",
      label: "terraform lock file upload",
      repository,
      operation: () =>
        uploadTerraformLockFile({
          deploymentId: deployment.id,
          workspace: workspace!,
          storage: getPlanArtifactStorage()
        })
    });
    sequence = lockUpload.sequence;

    terraform.plan = await runTerraformDestroyPlan(workspace.workdir, {
      env: awsCredentials.env,
      planFileName: defaultPlanFileName,
      signal: input.abortSignal,
      timeoutMs: terraformMutationTimeoutMs
    });
    sequence = await appendTerraformOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      label: "terraform plan -destroy",
      result: terraform.plan,
      repository
    });

    if (terraform.plan.cancelled) {
      return cancelDeploymentDestroyPlanRun({
        deployment,
        repository,
        terraform,
        errorSummary: "Terraform destroy plan was cancelled before destroy"
      });
    }

    if (terraform.plan.exitCode !== 0) {
      return failDeploymentDestroyPlanRun({
        deployment,
        repository,
        terraform,
        failureStage,
        errorSummary: summarizeTerraformFailure("Terraform destroy plan", terraform.plan)
      });
    }

    terraform.showJson = await runTerraformShowJson(workspace.workdir, {
      env: awsCredentials.env,
      planFileName: defaultPlanFileName,
      signal: input.abortSignal
    });
    sequence = await appendTerraformErrorOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      result: terraform.showJson,
      repository
    });

    if (terraform.showJson.cancelled) {
      return cancelDeploymentDestroyPlanRun({
        deployment,
        repository,
        terraform,
        errorSummary: "Terraform destroy plan inspection was cancelled before destroy"
      });
    }

    if (terraform.showJson.exitCode !== 0) {
      return failDeploymentDestroyPlanRun({
        deployment,
        repository,
        terraform,
        failureStage,
        errorSummary: summarizeTerraformFailure("Terraform destroy plan inspection", terraform.showJson)
      });
    }

    const unsupportedResourceTypes = findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
      terraform.showJson.stdout,
      deployment.liveProfile
    );
    const basePlanSummary = createDeploymentPlanSummaryFromTerraformShowJson(
      terraform.showJson.stdout
    );
    const planSummary = evaluateDeploymentSafetyGate({
      operation: "destroy",
      planSummary: basePlanSummary,
      liveProfile: deployment.liveProfile,
      unsupportedResourceTypes,
      warnings:
        basePlanSummary.deleteCount === 0 && basePlanSummary.replaceCount === 0
          ? [createDestroyNoOpWarning()]
          : []
    });
    const planArtifactId = generatePlanArtifactId();
    let uploadedPlanArtifact: Awaited<
      ReturnType<DeploymentPlanArtifactStorage["uploadDeploymentPlanArtifact"]>
    > | null = null;

    try {
      const planArtifactUpload = await runLoggedDeploymentOperation({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        stage: "plan",
        label: "terraform destroy plan artifact upload",
        repository,
        operation: () =>
          getPlanArtifactStorage().uploadDeploymentPlanArtifact({
            deploymentId: deployment.id,
            planArtifactId,
            planFilePath: join(workspace!.workdir, defaultPlanFileName)
          })
      });
      const uploadedPlan = planArtifactUpload.result;
      uploadedPlanArtifact = uploadedPlan;
      sequence = planArtifactUpload.sequence;

      const planSave = await runLoggedDeploymentOperation({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        stage: "plan",
        label: "deployment destroy plan save",
        repository,
        operation: () =>
          repository.saveDeploymentPlan({
            deploymentId: deployment.id,
            planArtifact: {
              id: planArtifactId,
              deploymentId: deployment.id,
              terraformArtifactId: artifact.id,
              terraformArtifactSha256,
              operation: "destroy",
              objectKey: uploadedPlan.objectKey,
              sha256: uploadedPlan.sha256,
              accountId: awsCredentials.accountId,
              region: awsCredentials.region
            },
            planSummary,
            isBlocked: false,
            blockedBy: null,
            blockedReason: null,
            terminalStatus: sourceStatus === "FAILED" ? "FAILED" : "SUCCESS",
            failureStage: sourceStatus === "FAILED" ? sourceFailureStage : null,
            errorSummary: sourceStatus === "FAILED" ? sourceErrorSummary : null
          })
      });
      const updatedDeployment = planSave.result;

      if (!updatedDeployment) {
        throw new DeploymentNotFoundError("Deployment not found");
      }

      return {
        deployment: updatedDeployment,
        terraform
      };
    } catch (error) {
      if (uploadedPlanArtifact) {
        await getPlanArtifactStorage().deleteDeploymentPlanArtifact(uploadedPlanArtifact.objectKey).catch(
          () => undefined
        );
      }

      const failedDeployment = await failDeploymentDestroyPlan(
        deployment.id,
        error,
        failureStage,
        repository
      );
      failureRecorded = true;

      return {
        deployment: failedDeployment,
        terraform
      };
    }
  } catch (error) {
    if (deploymentId && !failureRecorded) {
      await repository
        .failDeployment(deploymentId, {
          failureStage,
          errorSummary: summarizeUnexpectedDestroyPlanFailure(error)
        })
        .catch(() => undefined);
    }

    throw error;
  } finally {
    await workspace?.cleanup();
  }
}

async function saveApplicationCleanupPlan(input: {
  deployment: DeploymentRecord;
  sourceStatus: DeploymentStatus;
  sourceFailureStage: DeploymentFailureStage | null;
  sourceErrorSummary: string | null;
  accessContext: ProjectAccessContext;
  repository: DeploymentRepository;
  prepareTerraformWorkspace: typeof defaultPrepareTerraformWorkspace;
  readTerraformArtifactFile: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  planArtifactStorage: DeploymentPlanArtifactStorage;
  generatePlanArtifactId: () => string;
  prepareApplicationCleanupPlan: NonNullable<
    RunDeploymentDestroyPlanOptions["prepareApplicationCleanupPlan"]
  >;
  writeApplicationCleanupPlanFile: NonNullable<
    RunDeploymentDestroyPlanOptions["writeApplicationCleanupPlanFile"]
  >;
  terraform: RunDeploymentDestroyPlanResult["terraform"];
}): Promise<RunDeploymentDestroyPlanResult> {
  const [artifact, awsConnection, cleanupPlan] = await Promise.all([
    requireDeploymentTerraformArtifact(input.deployment, input.repository),
    requireDeploymentAwsConnection(input.deployment, input.accessContext, input.repository),
    input.prepareApplicationCleanupPlan({
      deployment: input.deployment,
      repository: input.repository
    })
  ]);
  if (!awsConnection.accountId) {
    throw new DeploymentNotFoundError("Verified AWS account is missing for application cleanup");
  }
  const workspace = await input.prepareTerraformWorkspace({
    objectKey: artifact.objectKey,
    fileName: artifact.fileName,
    contentType: artifact.contentType
  });
  let uploadedPlan: Awaited<
    ReturnType<DeploymentPlanArtifactStorage["uploadDeploymentPlanArtifact"]>
  > | null = null;
  try {
    const terraformArtifactContent = await input.readTerraformArtifactFile(workspace.mainFilePath);
    assertTerraformArtifactIsSafe(
      createTerraformFilesSafetyContent(workspace.terraformFiles, terraformArtifactContent),
      { liveProfile: input.deployment.liveProfile, resourceValidationMode: "plan" }
    );
    const terraformArtifactSha256 = createSha256(terraformArtifactContent);
    const wasPreMarkedRunning =
      input.deployment.status === "RUNNING" && input.sourceStatus !== input.deployment.status;
    if (!wasPreMarkedRunning) {
      const running = await input.repository.markDeploymentPlanRunning(input.deployment.id);
      if (!running) {
        throw new DeploymentConflictError("Application cleanup plan could not be started");
      }
    }
    const planArtifactId = input.generatePlanArtifactId();
    const planFilePath = join(workspace.workdir, "application-release-cleanup-plan.json");
    await input.writeApplicationCleanupPlanFile(
      planFilePath,
      JSON.stringify({
        schemaVersion: 1,
        kind: "application_release_cleanup_plan",
        deploymentId: input.deployment.id,
        projectId: input.deployment.projectId,
        ...cleanupPlan
      })
    );
    let sequence = await input.repository.getNextDeploymentLogSequence(input.deployment.id);
    const upload = await runLoggedDeploymentOperation({
      deploymentId: input.deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      label: "application cleanup plan artifact upload",
      repository: input.repository,
      operation: () =>
        input.planArtifactStorage.uploadDeploymentPlanArtifact({
          deploymentId: input.deployment.id,
          planArtifactId,
          planFilePath
        })
    });
    uploadedPlan = upload.result;
    sequence = upload.sequence;
    const planSummary = evaluateDeploymentSafetyGate({
      operation: "destroy",
      planSummary: {
        createCount: 0,
        updateCount: 1,
        deleteCount: 0,
        replaceCount: 0,
        blocked: false,
        warnings: []
      },
      liveProfile: input.deployment.liveProfile,
      unsupportedResourceTypes: []
    });
    const saved = await runLoggedDeploymentOperation({
      deploymentId: input.deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      label: "application cleanup plan save",
      repository: input.repository,
      operation: () =>
        input.repository.saveDeploymentPlan({
          deploymentId: input.deployment.id,
          planArtifact: {
            id: planArtifactId,
            deploymentId: input.deployment.id,
            terraformArtifactId: artifact.id,
            terraformArtifactSha256,
            operation: "destroy",
            objectKey: uploadedPlan!.objectKey,
            sha256: uploadedPlan!.sha256,
            accountId: awsConnection.accountId!,
            region: awsConnection.region
          },
          planSummary,
          isBlocked: false,
          blockedBy: null,
          blockedReason: null,
          terminalStatus: input.sourceStatus === "FAILED" ? "FAILED" : "SUCCESS",
          failureStage: input.sourceStatus === "FAILED" ? input.sourceFailureStage : null,
          errorSummary: input.sourceStatus === "FAILED" ? input.sourceErrorSummary : null
        })
    });
    if (!saved.result) throw new DeploymentNotFoundError("Deployment not found");
    return { deployment: saved.result, terraform: input.terraform };
  } catch (error) {
    if (uploadedPlan) {
      await input.planArtifactStorage
        .deleteDeploymentPlanArtifact(uploadedPlan.objectKey)
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await workspace.cleanup();
  }
}

async function defaultPrepareApplicationCleanupPlan(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
}): Promise<ApplicationCleanupPlanSummary> {
  const release = await input.repository.findRelease?.(input.deployment.id);
  if (
    !release ||
    release.status !== "succeeded" ||
    !release.providerRevision ||
    release.runtimeTargetKind !== input.deployment.targetKind
  ) {
    throw new DeploymentConflictError(
      "A successful application release is required before application cleanup"
    );
  }
  const metadata = readMetadataRecord(release.providerRevision.metadata);
  const previousRevision =
    release.runtimeTargetKind === "ecs_fargate"
      ? metadata["previousTaskDefinitionArn"]
      : release.runtimeTargetKind === "lambda"
        ? metadata["previousVersion"]
        : release.runtimeTargetKind === "ec2_asg"
          ? metadata["previousArtifactUri"]
          : metadata["previousReleasePrefix"];
  if (typeof previousRevision !== "string" || !previousRevision.trim()) {
    throw new DeploymentConflictError(
      "Application release does not retain a verified rollback baseline"
    );
  }
  return {
    releaseId: release.id,
    runtimeTargetKind: release.runtimeTargetKind,
    currentRevision: release.providerRevision.revisionId,
    previousRevision
  };
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertDeploymentCanStartDestroyPlan(
  deployment: DeploymentRecord,
  sourceStatus: DeploymentStatus,
  sourceFailureStage: DeploymentFailureStage | null
): void {
  if (deployment.scope !== "application" && !deployment.stateObjectKey) {
    throw new DeploymentConflictError("Terraform state is required before destroy");
  }

  if (sourceStatus === "SUCCESS") {
    return;
  }

  if (
    sourceStatus === "FAILED" &&
    (sourceFailureStage === "plan" ||
      sourceFailureStage === "apply" ||
      sourceFailureStage === "destroy")
  ) {
    return;
  }

  throw new DeploymentConflictError("Deployment cannot be destroyed in this state");
}

function assertDestroyCleanupArtifactHasNotDrifted(input: {
  sourceStatus: DeploymentStatus;
  sourceFailureStage: DeploymentFailureStage | null;
  currentPlanArtifact:
    | Awaited<ReturnType<DeploymentRepository["findDeploymentPlanArtifactById"]>>
    | undefined;
  deployment: DeploymentRecord;
  terraformArtifactSha256: string;
}): void {
  if (
    input.sourceStatus !== "FAILED" ||
    (input.sourceFailureStage !== "plan" &&
      input.sourceFailureStage !== "apply" &&
      input.sourceFailureStage !== "destroy")
  ) {
    return;
  }

  if (
    !input.currentPlanArtifact ||
    input.currentPlanArtifact.deploymentId !== input.deployment.id ||
    !input.currentPlanArtifact.terraformArtifactSha256
  ) {
    throw new DeploymentConflictError("Original Terraform plan is required before cleanup destroy");
  }

  if (input.currentPlanArtifact.terraformArtifactSha256 !== input.terraformArtifactSha256) {
    throw new DeploymentConflictError("Terraform artifact changed after failed deployment");
  }
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

async function requireDeploymentAwsConnection(
  deployment: DeploymentRecord,
  accessContext: ProjectAccessContext,
  repository: DeploymentRepository
): Promise<AwsConnection> {
  if (!deployment.awsConnectionId) {
    throw new DeploymentNotFoundError("Deployment AWS connection is missing");
  }

  const awsConnection = await repository.findVerifiedAwsConnectionById(
    deployment.awsConnectionId,
    accessContext
  );

  if (!awsConnection) {
    throw new DeploymentNotFoundError("Verified AWS connection not found for deployment");
  }

  return awsConnection;
}

async function prepareAwsCredentialsForDestroyPlan(input: {
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
        errorSummary: summarizeUnexpectedDestroyPlanFailure(error)
      })
      .catch(() => undefined);
    input.markFailureRecorded();

    throw error;
  }
}

async function cancelDeploymentDestroyPlanRun(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  terraform: RunDeploymentDestroyPlanResult["terraform"];
  errorSummary: string;
}): Promise<RunDeploymentDestroyPlanResult> {
  const cancelledDeployment = await input.repository.cancelDeployment(input.deployment.id, {
    errorSummary: input.errorSummary
  });

  if (!cancelledDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return {
    deployment: cancelledDeployment,
    terraform: input.terraform
  };
}

async function failDeploymentDestroyPlanRun(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  terraform: RunDeploymentDestroyPlanResult["terraform"];
  failureStage: DeploymentFailureStage;
  errorSummary: string;
}): Promise<RunDeploymentDestroyPlanResult> {
  const failedDeployment = await input.repository.failDeployment(input.deployment.id, {
    failureStage: input.failureStage,
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

async function failDeploymentDestroyPlan(
  deploymentId: string,
  error: unknown,
  failureStage: DeploymentFailureStage,
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const failedDeployment = await repository.failDeployment(deploymentId, {
    failureStage,
    errorSummary: summarizeUnexpectedDestroyPlanFailure(error)
  });

  if (!failedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return failedDeployment;
}

function resolveDestroyPlanFailureStage(
  sourceStatus: DeploymentStatus,
  sourceFailureStage: DeploymentFailureStage | null
): DeploymentFailureStage {
  return sourceStatus === "FAILED" &&
    (sourceFailureStage === "apply" || sourceFailureStage === "destroy")
    ? sourceFailureStage
    : "plan";
}

async function appendTerraformOutput(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: "init" | "plan";
  label: string;
  result: TerraformRunResult;
  repository: DeploymentRepository;
}): Promise<number> {
  let nextSequence = await appendOutputLines({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    stage: input.stage,
    output: input.result.stdout,
    level: "INFO",
    repository: input.repository
  });

  nextSequence = await appendOutputLines({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: nextSequence,
    stage: input.stage,
    output: input.result.stderr,
    level: input.result.exitCode === 0 ? "WARN" : "ERROR",
    repository: input.repository
  });

  return appendTerraformDurationLog({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: nextSequence,
    stage: input.stage,
    label: input.label,
    result: input.result,
    repository: input.repository
  });
}

async function appendTerraformErrorOutput(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  result: TerraformRunResult;
  repository: DeploymentRepository;
}): Promise<number> {
  const nextSequence = await appendOutputLines({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    stage: "plan",
    output: input.result.stderr,
    level: input.result.exitCode === 0 ? "WARN" : "ERROR",
    repository: input.repository
  });

  return appendTerraformDurationLog({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: nextSequence,
    stage: "plan",
    label: "terraform show -json",
    result: input.result,
    repository: input.repository
  });
}

async function appendOutputLines(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: "init" | "plan";
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
        stage: input.stage,
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
    return `${stage} timed out`;
  }

  const summary =
    splitOutputLines(result.stderr)[0] ?? `${stage} failed with exit code ${result.exitCode}`;

  return maskDeploymentMessage(summary);
}

function summarizeUnexpectedDestroyPlanFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return maskDeploymentMessage(message);
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}
