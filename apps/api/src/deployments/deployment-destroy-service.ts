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
  runTerraformApply as defaultRunTerraformApply,
  runTerraformInit as defaultRunTerraformInit,
  terraformMutationTimeoutMs,
  type TerraformRunResult
} from "./terraform-runner.js";
import {
  restoreTerraformLockFile,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";

const defaultPlanFileName = "tfplan";

export type RunDeploymentDestroyInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  startedFromFailureStage?: DeploymentFailureStage | null;
  abortSignal?: AbortSignal;
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

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;
  let destroySucceeded = false;
  let failureRecorded = false;
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

    const [terraformArtifact, currentPlanArtifact, awsConnection] = await Promise.all([
      requireDeploymentTerraformArtifact(deployment, repository),
      requireCurrentDestroyPlanArtifact(deployment, repository),
      requireDeploymentAwsConnection(deployment, input.accessContext, repository)
    ]);
    const [planBuffer, preparedWorkspace, stateBuffer] = await Promise.all([
      applyArtifactStorage.downloadDeploymentArtifact({
        deploymentId: deployment.id,
        planArtifactId: currentPlanArtifact.id,
        objectKey: currentPlanArtifact.objectKey
      }),
      prepareTerraformWorkspace({
        objectKey: terraformArtifact.objectKey,
        fileName: terraformArtifact.fileName,
        contentType: terraformArtifact.contentType
      }),
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

    terraform.destroy = await runTerraformApply(workspace.workdir, {
      env: awsCredentials.env,
      planFileName: defaultPlanFileName,
      timeoutMs: terraformMutationTimeoutMs,
      signal: input.abortSignal
    });
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
    await workspace?.cleanup();
  }
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
