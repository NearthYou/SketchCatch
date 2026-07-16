import { readFile } from "node:fs/promises";
import {
  appendDeploymentLogs,
  DeploymentConflictError,
  DeploymentNotFoundError,
  getDeployment,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";
import {
  prepareTerraformAwsCredentialEnv as defaultPrepareTerraformAwsCredentialEnv,
  type PreparedTerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";
import type { AwsConnection, DeploymentStatus } from "@sketchcatch/types";
import {
  createTerraformFilesSafetyContent,
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import {
  runTerraformInit as defaultRunTerraformInit,
  type TerraformRunResult
} from "./terraform-runner.js";
import { maskDeploymentMessage } from "./log-masking.js";
import { assertTerraformArtifactIsSafe } from "./terraform-artifact-safety.js";
import {
  appendTerraformDurationLog,
  runLoggedDeploymentOperation
} from "./deployment-duration-logs.js";
import { createS3DeploymentPlanArtifactStorage } from "./deployment-plan-artifact-storage.js";
import {
  type TerraformLockFileCapableStorage,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";

export type RunDeploymentInitInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  abortSignal?: AbortSignal;
};

export type RunDeploymentInitOptions = {
  prepareTerraformWorkspace?: typeof defaultPrepareTerraformWorkspace;
  runTerraformInit?: typeof defaultRunTerraformInit;
  readTerraformArtifactFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  prepareTerraformAwsCredentialEnv?: (
    awsConnection: AwsConnection
  ) => Promise<PreparedTerraformAwsCredentialEnv>;
  awsStsGateway?: AwsConnectionStsGateway;
  initArtifactStorage?: TerraformLockFileCapableStorage;
};

export type RunDeploymentInitResult = {
  deployment: DeploymentRecord;
  terraform: TerraformRunResult | null;
};

export async function runDeploymentInit(
  input: RunDeploymentInitInput,
  repository: DeploymentRepository,
  options: RunDeploymentInitOptions = {}
): Promise<RunDeploymentInitResult> {
  const prepareTerraformWorkspace =
    options.prepareTerraformWorkspace ?? defaultPrepareTerraformWorkspace;
  const runTerraformInit = options.runTerraformInit ?? defaultRunTerraformInit;
  const readTerraformArtifactFile = options.readTerraformArtifactFile ?? readFile;
  const prepareTerraformAwsCredentialEnv =
    options.prepareTerraformAwsCredentialEnv ??
    ((awsConnection: AwsConnection) =>
      defaultPrepareTerraformAwsCredentialEnv(
        awsConnection,
        options.awsStsGateway ?? createAwsSdkStsGateway()
      ));
  let initArtifactStorage = options.initArtifactStorage;
  const getInitArtifactStorage = () =>
    (initArtifactStorage ??= createS3DeploymentPlanArtifactStorage());

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;
  let failureRecorded = false;

  try {
    const deployment = await getDeployment(
      {
        deploymentId: input.deploymentId,
        accessContext: input.accessContext
      },
      repository
    );
    deploymentId = deployment.id;

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

    if (!deployment.awsConnectionId) {
      throw new DeploymentNotFoundError("Deployment AWS connection is missing");
    }

    const awsConnection = await repository.findVerifiedAwsConnectionById(
      deployment.awsConnectionId,
      input.accessContext
    );

    if (!awsConnection) {
      throw new DeploymentNotFoundError("Verified AWS connection not found for deployment");
    }

    workspace = await prepareTerraformWorkspace({
      objectKey: artifact.objectKey,
      fileName: artifact.fileName,
      contentType: artifact.contentType
    });
    const terraformArtifactContent = await readTerraformArtifactFile(workspace.mainFilePath);
    assertTerraformArtifactIsSafe(
      createTerraformFilesSafetyContent(workspace.terraformFiles, terraformArtifactContent),
      { liveProfile: deployment.liveProfile, resourceValidationMode: "plan" }
    );

    const awsCredentials = await prepareAwsCredentialsForInit({
      deploymentId: deployment.id,
      awsConnection,
      prepareTerraformAwsCredentialEnv,
      repository,
      markFailureRecorded: () => {
        failureRecorded = true;
      }
    });

    const wasPreMarkedRunning =
      deployment.status === "RUNNING" && input.startedFromStatus !== undefined;

    if (!wasPreMarkedRunning) {
      const runningDeployment = await repository.markDeploymentInitRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment init could not be started");
      }
    }

    const terraform = await runTerraformInit(workspace.workdir, {
      env: awsCredentials.env,
      signal: input.abortSignal
    });
    let sequence = await getNextLogSequence(deployment.id, repository);

    sequence = await appendOutputLines({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      output: terraform.stdout,
      level: "INFO",
      repository
    });

    sequence = await appendOutputLines({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      output: terraform.stderr,
      level: terraform.exitCode === 0 ? "WARN" : "ERROR",
      repository
    });
    sequence = await appendTerraformDurationLog({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "init",
      label: "terraform init",
      result: terraform,
      repository
    });

    if (terraform.cancelled) {
      const cancelledDeployment = await repository.cancelDeployment(deployment.id, {
        errorSummary: "Terraform init was cancelled before AWS resources were changed"
      });

      if (!cancelledDeployment) {
        throw new DeploymentNotFoundError("Deployment not found");
      }

      return {
        deployment: cancelledDeployment,
        terraform
      };
    }

    if (terraform.exitCode === 0) {
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
            storage: getInitArtifactStorage()
          })
      });
      sequence = lockUpload.sequence;

      const initStatusSave = await runLoggedDeploymentOperation({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        stage: "init",
        label: "deployment init status save",
        repository,
        operation: () => repository.markDeploymentInitSucceeded(deployment.id)
      });
      const updatedDeployment = initStatusSave.result;

      if (!updatedDeployment) {
        throw new DeploymentNotFoundError("Deployment not found");
      }

      return {
        deployment: updatedDeployment,
        terraform
      };
    }

    const failedDeployment = await repository.failDeployment(deployment.id, {
      failureStage: "init",
      errorSummary: summarizeTerraformFailure(terraform)
    });

    if (!failedDeployment) {
      throw new DeploymentNotFoundError("Deployment not found");
    }

    return {
      deployment: failedDeployment,
      terraform
    };
  } catch (error) {
    if (deploymentId && !failureRecorded) {
      await repository
        .failDeployment(deploymentId, {
          failureStage: "init",
          errorSummary: summarizeUnexpectedInitFailure(error)
        })
        .catch(() => undefined);
    }

    throw error;
  } finally {
    await workspace?.cleanup();
  }
}

async function getNextLogSequence(
  deploymentId: string,
  repository: DeploymentRepository
): Promise<number> {
  return repository.getNextDeploymentLogSequence(deploymentId);
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

  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: lines.map((line, index) => ({
        sequence: input.sequence + index,
        stage: "init",
        level: input.level,
        message: line,
        relatedResourceId: null
      }))
    },
    input.repository
  );

  return input.sequence + lines.length;
}

async function prepareAwsCredentialsForInit(input: {
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
        errorSummary: summarizeUnexpectedInitFailure(error)
      })
      .catch(() => undefined);
    input.markFailureRecorded();

    throw error;
  }
}

function splitOutputLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => maskDeploymentMessage(line.trimEnd()))
    .filter((line) => line.length > 0);
}

function summarizeTerraformFailure(result: TerraformRunResult): string {
  if (result.timedOut) {
    return "Terraform init timed out";
  }

  const summary =
    splitOutputLines(result.stderr)[0] ?? `Terraform init failed with exit code ${result.exitCode}`;

  return maskDeploymentMessage(summary);
}

function summarizeUnexpectedInitFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return maskDeploymentMessage(message);
}
