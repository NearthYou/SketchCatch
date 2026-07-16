import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AiPreDeploymentAnalysisResult,
  AwsConnection,
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
  analyzePreDeploymentCheck as defaultAnalyzePreDeployment,
  type AnalyzePreDeploymentCheckInput
} from "../services/aiPreDeploymentCheck.js";
import {
  appendTerraformDurationLog,
  runLoggedDeploymentOperation
} from "./deployment-duration-logs.js";
import { maskDeploymentMessage } from "./log-masking.js";
import {
  createDeploymentPlanSummaryFromTerraformShowJson,
  DeploymentPlanSummaryParseError,
  findUnsupportedLiveApplyResourceTypesFromTerraformShowJson
} from "./deployment-plan-summary.js";
import {
  createS3DeploymentPlanArtifactStorage,
  type DeploymentPlanArtifactStorage
} from "./deployment-plan-artifact-storage.js";
import { evaluateDeploymentSafetyGate } from "./deployment-safety-gate.js";
import {
  appendDeploymentLogs,
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  selectDeploymentStateBaseline,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";
import {
  createTerraformFilesSafetyContent,
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import {
  runTerraformInit as defaultRunTerraformInit,
  runTerraformPlan as defaultRunTerraformPlan,
  runTerraformShowJson as defaultRunTerraformShowJson,
  terraformMutationTimeoutMs,
  type TerraformRunResult
} from "./terraform-runner.js";
import { assertTerraformArtifactIsSafe } from "./terraform-artifact-safety.js";
import {
  restoreTerraformLockFile,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";
import { createAwsCodeBuildDirectApplicationReleaseGateway } from "./aws-codebuild-direct-application-release-gateway.js";
import {
  prepareDirectApplicationRelease as defaultPrepareDirectApplicationRelease,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";

const defaultPlanFileName = "tfplan";

export type RunDeploymentPlanInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  abortSignal?: AbortSignal;
};

export type RunDeploymentPlanOptions = {
  prepareTerraformWorkspace?: typeof defaultPrepareTerraformWorkspace;
  runTerraformInit?: typeof defaultRunTerraformInit;
  runTerraformPlan?: typeof defaultRunTerraformPlan;
  runTerraformShowJson?: typeof defaultRunTerraformShowJson;
  prepareTerraformAwsCredentialEnv?: (
    awsConnection: AwsConnection
  ) => Promise<PreparedTerraformAwsCredentialEnv>;
  awsStsGateway?: AwsConnectionStsGateway;
  analyzePreDeployment?: (
    input: AnalyzePreDeploymentCheckInput
  ) => AiPreDeploymentAnalysisResult | Promise<AiPreDeploymentAnalysisResult>;
  planArtifactStorage?: DeploymentPlanArtifactStorage;
  generatePlanArtifactId?: () => string;
  readTerraformArtifactFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  prepareApplicationArtifact?: (input: {
    deployment: DeploymentRecord;
    accessContext: ProjectAccessContext;
    abortSignal?: AbortSignal;
    repository: DeploymentRepository;
  }) => Promise<PreparedApplicationReleaseSummary | null>;
  writeApplicationPlanFile?: (filePath: string, content: string) => Promise<void>;
  writeTerraformStateFile?: (filePath: string, content: Buffer) => Promise<void>;
};

export type PreparedApplicationReleaseSummary = {
  releaseId: string;
  runtimeTargetKind: NonNullable<DeploymentRecord["targetKind"]>;
  version: string;
  commitSha: string;
  artifactDigest: string;
};

export type RunDeploymentPlanResult = {
  deployment: DeploymentRecord;
  terraform: {
    init: TerraformRunResult | null;
    validate: TerraformRunResult | null;
    plan: TerraformRunResult | null;
    showJson: TerraformRunResult | null;
  };
};

export async function runDeploymentPlan(
  input: RunDeploymentPlanInput,
  repository: DeploymentRepository,
  options: RunDeploymentPlanOptions = {}
): Promise<RunDeploymentPlanResult> {
  const prepareTerraformWorkspace =
    options.prepareTerraformWorkspace ?? defaultPrepareTerraformWorkspace;
  const runTerraformInit = options.runTerraformInit ?? defaultRunTerraformInit;
  const runTerraformPlan = options.runTerraformPlan ?? defaultRunTerraformPlan;
  const runTerraformShowJson = options.runTerraformShowJson ?? defaultRunTerraformShowJson;
  const prepareTerraformAwsCredentialEnv =
    options.prepareTerraformAwsCredentialEnv ??
    ((awsConnection: AwsConnection) =>
      defaultPrepareTerraformAwsCredentialEnv(
        awsConnection,
        options.awsStsGateway ?? createAwsSdkStsGateway()
      ));
  const analyzePreDeployment = options.analyzePreDeployment ?? defaultAnalyzePreDeployment;
  const planArtifactStorage =
    options.planArtifactStorage ?? createS3DeploymentPlanArtifactStorage();
  const generatePlanArtifactId = options.generatePlanArtifactId ?? randomUUID;
  const readTerraformArtifactFile = options.readTerraformArtifactFile ?? readFile;
  const prepareApplicationArtifact =
    options.prepareApplicationArtifact ?? defaultPrepareApplicationArtifact;
  const writeApplicationPlanFile = options.writeApplicationPlanFile ?? writeFile;
  const writeTerraformStateFile = options.writeTerraformStateFile ?? writeFile;

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;
  let failureRecorded = false;
  const terraform: RunDeploymentPlanResult["terraform"] = {
    init: null,
    validate: null,
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

    const preparedApplicationRelease =
      deployment.scope !== "infrastructure"
        ? await prepareApplicationArtifact({
            deployment,
            accessContext: input.accessContext,
            repository,
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
          })
        : null;
    if (deployment.scope !== "infrastructure" && !preparedApplicationRelease) {
      throw new DeploymentConflictError(
        "Application artifact preparation did not return a release"
      );
    }

    const [artifact, awsConnection] = await Promise.all([
      requireDeploymentTerraformArtifact(deployment, repository),
      requireDeploymentAwsConnection(deployment, input.accessContext, repository)
    ]);
    const canReusePlanArtifact = await canReuseDeploymentPlanArtifact({
      deployment,
      startedFromStatus: input.startedFromStatus,
      terraformArtifactId: artifact.id,
      accountId: awsConnection.accountId,
      region: awsConnection.region,
      repository
    });

    if (canReusePlanArtifact) {
      return {
        deployment: await restorePendingDeploymentStatus(deployment, repository),
        terraform
      };
    }

    const [architecture, preparedWorkspace] = await Promise.all([
      repository.findArchitectureInProject(deployment.architectureId, deployment.projectId),
      prepareTerraformWorkspace({
        objectKey: artifact.objectKey,
        fileName: artifact.fileName,
        contentType: artifact.contentType
      })
    ]);
    workspace = preparedWorkspace;

    if (!architecture) {
      throw new DeploymentNotFoundError("Architecture not found for deployment");
    }

    const terraformArtifactContent = await readTerraformArtifactFile(workspace.mainFilePath);
    const workspaceTerraformFiles = preparedWorkspace.terraformFiles ?? [];
    assertTerraformArtifactIsSafe(
      createTerraformFilesSafetyContent(workspaceTerraformFiles, terraformArtifactContent),
      { liveProfile: deployment.liveProfile, resourceValidationMode: "plan" }
    );
    const terraformArtifactSha256 = createSha256(terraformArtifactContent);
    const preDeploymentTerraformFiles = workspaceTerraformFiles.length
      ? workspaceTerraformFiles
      : [
          {
            fileName: artifact.fileName,
            terraformCode: toTerraformCodeString(terraformArtifactContent)
          }
        ];
    const preDeploymentAnalysis = await analyzePreDeployment({
      architectureJson: architecture.architectureJson,
      ...(preDeploymentTerraformFiles.length === 1
        ? { artifactSha256: terraformArtifactSha256 }
        : {}),
      terraformFiles: preDeploymentTerraformFiles
    });

    if (deployment.scope === "application") {
      return await saveApplicationOnlyPlan({
        deployment,
        artifact,
        awsConnection,
        terraformArtifactSha256,
        preparedApplicationRelease: preparedApplicationRelease!,
        findings: preDeploymentAnalysis.findings,
        ...(input.startedFromStatus ? { startedFromStatus: input.startedFromStatus } : {}),
        workspace,
        accessContext: input.accessContext,
        planArtifactStorage,
        generatePlanArtifactId,
        writeApplicationPlanFile,
        repository,
        terraform
      });
    }

    const stateBaseline = selectDeploymentStateBaseline(
      deployment,
      await repository.listDeploymentsByProject(deployment.projectId)
    );

    if (stateBaseline?.stateObjectKey) {
      const state = await planArtifactStorage.downloadDeploymentState({
        deploymentId: stateBaseline.id,
        objectKey: stateBaseline.stateObjectKey
      });
      await writeTerraformStateFile(join(workspace.workdir, "terraform.tfstate"), state);
    }

    const [awsCredentials] = await Promise.all([
      prepareAwsCredentialsForPlan({
        deploymentId: deployment.id,
        awsConnection,
        prepareTerraformAwsCredentialEnv,
        repository,
        markFailureRecorded: () => {
          failureRecorded = true;
        }
      }),
      restoreTerraformLockFile({
        deploymentId: deployment.id,
        workspace: preparedWorkspace,
        storage: planArtifactStorage
      })
    ]);

    const wasPreMarkedRunning =
      deployment.status === "RUNNING" && input.startedFromStatus !== undefined;

    if (!wasPreMarkedRunning) {
      const runningDeployment = await repository.markDeploymentPlanRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment plan could not be started");
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
      result: terraform.init,
      repository
    });

    if (terraform.init.cancelled) {
      return cancelDeploymentPlanRun({
        deployment,
        repository,
        terraform,
        errorSummary: "Terraform plan was cancelled during init before AWS resources were changed"
      });
    }

    if (terraform.init.exitCode !== 0) {
      return failDeploymentPlanRun({
        deployment,
        accessContext: input.accessContext,
        repository,
        terraform,
        failureStage: "init",
        errorSummary: summarizeTerraformFailure("Terraform init", terraform.init)
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
          storage: planArtifactStorage
        })
    });
    sequence = lockUpload.sequence;

    terraform.plan = await runTerraformPlan(workspace.workdir, {
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
      result: terraform.plan,
      repository
    });

    if (terraform.plan.cancelled) {
      return cancelDeploymentPlanRun({
        deployment,
        repository,
        terraform,
        errorSummary: "Terraform plan was cancelled before apply"
      });
    }

    if (terraform.plan.exitCode !== 0) {
      return failDeploymentPlanRun({
        deployment,
        accessContext: input.accessContext,
        repository,
        terraform,
        failureStage: "plan",
        errorSummary: summarizeTerraformFailure("Terraform plan", terraform.plan)
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
      return cancelDeploymentPlanRun({
        deployment,
        repository,
        terraform,
        errorSummary: "Terraform plan inspection was cancelled before apply"
      });
    }

    if (terraform.showJson.exitCode !== 0) {
      return failDeploymentPlanRun({
        deployment,
        accessContext: input.accessContext,
        repository,
        terraform,
        failureStage: "plan",
        errorSummary: summarizeTerraformFailure("Terraform show", terraform.showJson)
      });
    }

    const unsupportedResourceTypes = findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
      terraform.showJson.stdout,
      deployment.liveProfile
    );
    const planSummary = evaluateDeploymentSafetyGate({
      operation: "apply",
      planSummary: createDeploymentPlanSummaryFromTerraformShowJson(terraform.showJson.stdout),
      liveProfile: deployment.liveProfile,
      findings: preDeploymentAnalysis.findings,
      unsupportedResourceTypes
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
        label: "terraform plan artifact upload",
        repository,
        operation: () =>
          planArtifactStorage.uploadDeploymentPlanArtifact({
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
        label: "deployment plan save",
        repository,
        operation: () =>
          repository.saveDeploymentPlan({
            deploymentId: deployment.id,
            planArtifact: {
              id: planArtifactId,
              deploymentId: deployment.id,
              terraformArtifactId: artifact.id,
              terraformArtifactSha256,
              operation: "apply",
              objectKey: uploadedPlan.objectKey,
              sha256: uploadedPlan.sha256,
              accountId: awsCredentials.accountId,
              region: awsCredentials.region
            },
            planSummary,
            isBlocked: false,
            blockedBy: null,
            blockedReason: null
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
        await cleanupUploadedPlanArtifact({
          deploymentId: deployment.id,
          accessContext: input.accessContext,
          objectKey: uploadedPlanArtifact.objectKey,
          planArtifactStorage,
          repository
        }).catch(() => undefined);
      }

      const failedDeployment = await failDeployment(deployment.id, "plan", error, repository);
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
          failureStage: "plan",
          errorSummary: summarizeUnexpectedPlanFailure(error)
        })
        .catch(() => undefined);
    }

    throw error;
  } finally {
    await workspace?.cleanup();
  }
}

async function saveApplicationOnlyPlan(input: {
  deployment: DeploymentRecord;
  artifact: Awaited<ReturnType<typeof requireDeploymentTerraformArtifact>>;
  awsConnection: AwsConnection;
  terraformArtifactSha256: string;
  preparedApplicationRelease: PreparedApplicationReleaseSummary;
  findings: AiPreDeploymentAnalysisResult["findings"];
  startedFromStatus?: DeploymentStatus;
  workspace: PreparedTerraformWorkspace;
  accessContext: ProjectAccessContext;
  planArtifactStorage: DeploymentPlanArtifactStorage;
  generatePlanArtifactId: () => string;
  writeApplicationPlanFile: (filePath: string, content: string) => Promise<void>;
  repository: DeploymentRepository;
  terraform: RunDeploymentPlanResult["terraform"];
}): Promise<RunDeploymentPlanResult> {
  if (!input.awsConnection.accountId) {
    throw new DeploymentNotFoundError("Verified AWS account is missing for application release");
  }
  const wasPreMarkedRunning =
    input.deployment.status === "RUNNING" && input.startedFromStatus !== undefined;
  if (!wasPreMarkedRunning) {
    const runningDeployment = await input.repository.markDeploymentPlanRunning(input.deployment.id);
    if (!runningDeployment) {
      throw new DeploymentConflictError("Deployment validation could not be started");
    }
  }
  const planArtifactId = input.generatePlanArtifactId();
  const planFilePath = join(input.workspace.workdir, "application-release-plan.json");
  const planSummary = evaluateDeploymentSafetyGate({
    operation: "apply",
    planSummary: {
      createCount: 0,
      updateCount: 0,
      deleteCount: 0,
      replaceCount: 0,
      blocked: false,
      warnings: []
    },
    liveProfile: input.deployment.liveProfile,
    findings: input.findings,
    unsupportedResourceTypes: []
  });
  await input.writeApplicationPlanFile(
    planFilePath,
    JSON.stringify({
      schemaVersion: 1,
      kind: "application_release_plan",
      deploymentId: input.deployment.id,
      projectId: input.deployment.projectId,
      ...input.preparedApplicationRelease
    })
  );
  let uploadedPlanArtifact: Awaited<
    ReturnType<DeploymentPlanArtifactStorage["uploadDeploymentPlanArtifact"]>
  > | null = null;
  try {
    let sequence = await input.repository.getNextDeploymentLogSequence(input.deployment.id);
    const upload = await runLoggedDeploymentOperation({
      deploymentId: input.deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      label: "application release plan artifact upload",
      repository: input.repository,
      operation: () =>
        input.planArtifactStorage.uploadDeploymentPlanArtifact({
          deploymentId: input.deployment.id,
          planArtifactId,
          planFilePath
        })
    });
    uploadedPlanArtifact = upload.result;
    sequence = upload.sequence;
    const save = await runLoggedDeploymentOperation({
      deploymentId: input.deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      label: "application release plan save",
      repository: input.repository,
      operation: () =>
        input.repository.saveDeploymentPlan({
          deploymentId: input.deployment.id,
          planArtifact: {
            id: planArtifactId,
            deploymentId: input.deployment.id,
            terraformArtifactId: input.artifact.id,
            terraformArtifactSha256: input.terraformArtifactSha256,
            operation: "apply",
            objectKey: uploadedPlanArtifact!.objectKey,
            sha256: uploadedPlanArtifact!.sha256,
            accountId: input.awsConnection.accountId!,
            region: input.awsConnection.region
          },
          planSummary,
          isBlocked: false,
          blockedBy: null,
          blockedReason: null
        })
    });
    if (!save.result) throw new DeploymentNotFoundError("Deployment not found");
    return { deployment: save.result, terraform: input.terraform };
  } catch (error) {
    if (uploadedPlanArtifact) {
      await cleanupUploadedPlanArtifact({
        deploymentId: input.deployment.id,
        accessContext: input.accessContext,
        objectKey: uploadedPlanArtifact.objectKey,
        planArtifactStorage: input.planArtifactStorage,
        repository: input.repository
      }).catch(() => undefined);
    }
    throw error;
  }
}

async function defaultPrepareApplicationArtifact(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  abortSignal?: AbortSignal;
  repository: DeploymentRepository;
}): Promise<PreparedApplicationReleaseSummary | null> {
  const release = await defaultPrepareDirectApplicationRelease(
    {
      deploymentId: input.deployment.id,
      userId: input.accessContext.userId,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    },
    requireDirectApplicationReleaseRepository(input.repository),
    createAwsCodeBuildDirectApplicationReleaseGateway(),
    randomUUID
  );
  return release
    ? {
        releaseId: release.id,
        runtimeTargetKind: release.runtimeTargetKind,
        version: release.version,
        commitSha: release.commitSha,
        artifactDigest: release.artifactDigest
      }
    : null;
}

function requireDirectApplicationReleaseRepository(
  repository: DeploymentRepository
): DirectApplicationReleaseRepository {
  if (
    !repository.findContext ||
    !repository.findRelease ||
    !repository.savePreparedRelease ||
    !repository.saveCompletedRelease ||
    !repository.saveFailedRelease ||
    !repository.resetReleaseForRetry
  ) {
    throw new DeploymentConflictError("Direct application release repository is unavailable");
  }
  return {
    findContext: repository.findContext.bind(repository),
    findRelease: repository.findRelease.bind(repository),
    savePreparedRelease: repository.savePreparedRelease.bind(repository),
    saveCompletedRelease: repository.saveCompletedRelease.bind(repository),
    saveFailedRelease: repository.saveFailedRelease.bind(repository),
    resetReleaseForRetry: repository.resetReleaseForRetry.bind(repository)
  };
}

async function canReuseDeploymentPlanArtifact(input: {
  deployment: DeploymentRecord;
  startedFromStatus: DeploymentStatus | undefined;
  terraformArtifactId: string;
  accountId: string | null;
  region: string;
  repository: DeploymentRepository;
}): Promise<boolean> {
  const startedFromStatus = input.startedFromStatus ?? input.deployment.status;

  if (startedFromStatus !== "PENDING") {
    return false;
  }

  if (
    !input.deployment.currentPlanArtifactId ||
    !input.deployment.planSummary ||
    input.deployment.approvedAt
  ) {
    return false;
  }

  const currentPlanArtifact = await input.repository.findDeploymentPlanArtifactById(
    input.deployment.currentPlanArtifactId
  );

  if (!currentPlanArtifact || currentPlanArtifact.deploymentId !== input.deployment.id) {
    return false;
  }

  if (
    currentPlanArtifact.terraformArtifactId !== input.terraformArtifactId ||
    currentPlanArtifact.operation !== "apply" ||
    !currentPlanArtifact.terraformArtifactSha256 ||
    !input.accountId ||
    currentPlanArtifact.accountId !== input.accountId ||
    currentPlanArtifact.region !== input.region
  ) {
    return false;
  }

  return true;
}

async function restorePendingDeploymentStatus(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  if (deployment.status === "PENDING") {
    return deployment;
  }

  const updatedDeployment = await repository.updateDeploymentStatus(deployment.id, "PENDING");

  if (!updatedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return updatedDeployment;
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

async function prepareAwsCredentialsForPlan(input: {
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
        errorSummary: summarizeUnexpectedPlanFailure(error)
      })
      .catch(() => undefined);
    input.markFailureRecorded();

    throw error;
  }
}

async function cancelDeploymentPlanRun(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  terraform: RunDeploymentPlanResult["terraform"];
  errorSummary: string;
}): Promise<RunDeploymentPlanResult> {
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

async function failDeploymentPlanRun(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  repository: DeploymentRepository;
  terraform: RunDeploymentPlanResult["terraform"];
  failureStage: "init" | "validate" | "plan";
  errorSummary: string;
}): Promise<RunDeploymentPlanResult> {
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

async function failDeployment(
  deploymentId: string,
  failureStage: "plan",
  error: unknown,
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const failedDeployment = await repository.failDeployment(deploymentId, {
    failureStage,
    errorSummary: summarizeUnexpectedPlanFailure(error)
  });

  if (!failedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return failedDeployment;
}

async function appendTerraformOutput(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: "init" | "validate" | "plan";
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
    label: `terraform ${input.stage}`,
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
  stage: "init" | "validate" | "plan";
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

async function cleanupUploadedPlanArtifact(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  objectKey: string;
  planArtifactStorage: DeploymentPlanArtifactStorage;
  repository: DeploymentRepository;
}): Promise<void> {
  try {
    await input.planArtifactStorage.deleteDeploymentPlanArtifact(input.objectKey);
  } catch {
    const sequence = await input.repository.getNextDeploymentLogSequence(input.deploymentId);

    await appendDeploymentLogs(
      {
        deploymentId: input.deploymentId,
        accessContext: input.accessContext,
        logs: [
          {
            sequence,
            stage: "plan",
            level: "WARN",
            message: "Plan artifact cleanup failed after save error",
            relatedResourceId: null
          }
        ]
      },
      input.repository
    ).catch(() => undefined);
  }
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

function summarizeUnexpectedPlanFailure(error: unknown): string {
  if (error instanceof DeploymentPlanSummaryParseError) {
    return error.message;
  }

  const message = error instanceof Error ? error.message : String(error);

  return maskDeploymentMessage(message);
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function toTerraformCodeString(value: Buffer | Uint8Array | string): string {
  return typeof value === "string" ? value : Buffer.from(value).toString("utf8");
}
