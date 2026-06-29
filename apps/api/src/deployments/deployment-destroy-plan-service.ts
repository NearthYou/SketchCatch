import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AwsConnection,
  DeploymentFailureStage,
  DeploymentPlanSummary,
  DeploymentPlanWarning,
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
import {
  createS3DeploymentApplyArtifactStorage,
  type DeploymentApplyArtifactStorage
} from "./deployment-apply-artifact-storage.js";
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
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import {
  runTerraformDestroyPlan as defaultRunTerraformDestroyPlan,
  runTerraformInit as defaultRunTerraformInit,
  runTerraformShowJson as defaultRunTerraformShowJson,
  type TerraformRunResult
} from "./terraform-runner.js";

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
  const planArtifactStorage =
    options.planArtifactStorage ?? createS3DeploymentPlanArtifactStorage();
  const applyArtifactStorage =
    options.applyArtifactStorage ?? createS3DeploymentApplyArtifactStorage();
  const generatePlanArtifactId = options.generatePlanArtifactId ?? randomUUID;
  const readTerraformArtifactFile = options.readTerraformArtifactFile ?? readFile;
  const writeTerraformStateFile = options.writeTerraformStateFile ?? writeFile;

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;
  let failureRecorded = false;
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

    assertDeploymentCanStartDestroyPlan(deployment, sourceStatus, sourceFailureStage);

    const artifact = await requireDeploymentTerraformArtifact(deployment, repository);
    const currentPlanArtifact = deployment.currentPlanArtifactId
      ? await repository.findDeploymentPlanArtifactById(deployment.currentPlanArtifactId)
      : undefined;
    const awsConnection = await requireDeploymentAwsConnection(
      deployment,
      input.accessContext,
      repository
    );
    workspace = await prepareTerraformWorkspace({
      objectKey: artifact.objectKey,
      fileName: artifact.fileName
    });

    const terraformArtifactContent = await readTerraformArtifactFile(workspace.mainFilePath);
    assertTerraformArtifactIsSafe(terraformArtifactContent);
    const terraformArtifactSha256 = createSha256(terraformArtifactContent);

    assertDestroyCleanupArtifactHasNotDrifted({
      sourceStatus,
      sourceFailureStage,
      currentPlanArtifact,
      deployment,
      terraformArtifactSha256
    });

    const stateBuffer = await applyArtifactStorage.downloadDeploymentState({
      deploymentId: deployment.id,
      objectKey: deployment.stateObjectKey ?? ""
    });
    await writeTerraformStateFile(join(workspace.workdir, "terraform.tfstate"), stateBuffer);

    const awsCredentials = await prepareAwsCredentialsForDestroyPlan({
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
        errorSummary: summarizeTerraformFailure("Terraform init before destroy plan", terraform.init)
      });
    }

    terraform.plan = await runTerraformDestroyPlan(workspace.workdir, {
      env: awsCredentials.env,
      planFileName: defaultPlanFileName,
      signal: input.abortSignal
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
        errorSummary: summarizeTerraformFailure("Terraform destroy plan", terraform.plan)
      });
    }

    terraform.showJson = await runTerraformShowJson(workspace.workdir, {
      env: awsCredentials.env,
      planFileName: defaultPlanFileName,
      signal: input.abortSignal
    });
    await appendTerraformOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
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
        errorSummary: summarizeTerraformFailure("Terraform destroy plan inspection", terraform.showJson)
      });
    }

    const unsupportedResourceTypes = findUnsupportedLiveApplyResourceTypesFromTerraformShowJson(
      terraform.showJson.stdout
    );
    const planSummary = createDestroyPlanSummary(
      createDeploymentPlanSummaryFromTerraformShowJson(terraform.showJson.stdout),
      unsupportedResourceTypes
    );
    const block = createDestroyPlanBlock(unsupportedResourceTypes);
    const planArtifactId = generatePlanArtifactId();
    let uploadedPlanArtifact: Awaited<
      ReturnType<DeploymentPlanArtifactStorage["uploadDeploymentPlanArtifact"]>
    > | null = null;

    try {
      uploadedPlanArtifact = await planArtifactStorage.uploadDeploymentPlanArtifact({
        deploymentId: deployment.id,
        planArtifactId,
        planFilePath: join(workspace.workdir, defaultPlanFileName)
      });

      const updatedDeployment = await repository.saveDeploymentPlan({
        deploymentId: deployment.id,
        planArtifact: {
          id: planArtifactId,
          deploymentId: deployment.id,
          terraformArtifactId: artifact.id,
          terraformArtifactSha256,
          operation: "destroy",
          objectKey: uploadedPlanArtifact.objectKey,
          sha256: uploadedPlanArtifact.sha256,
          accountId: awsCredentials.accountId,
          region: awsCredentials.region
        },
        planSummary,
        isBlocked: block.isBlocked,
        blockedBy: block.blockedBy,
        blockedReason: block.blockedReason,
        terminalStatus: sourceStatus === "FAILED" ? "FAILED" : "SUCCESS",
        failureStage: sourceStatus === "FAILED" ? sourceFailureStage : null,
        errorSummary: sourceStatus === "FAILED" ? sourceErrorSummary : null
      });

      if (!updatedDeployment) {
        throw new DeploymentNotFoundError("Deployment not found");
      }

      return {
        deployment: updatedDeployment,
        terraform
      };
    } catch (error) {
      if (uploadedPlanArtifact) {
        await planArtifactStorage.deleteDeploymentPlanArtifact(uploadedPlanArtifact.objectKey).catch(
          () => undefined
        );
      }

      const failedDeployment = await failDeploymentDestroyPlan(
        deployment.id,
        error,
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
          failureStage: "plan",
          errorSummary: summarizeUnexpectedDestroyPlanFailure(error)
        })
        .catch(() => undefined);
    }

    throw error;
  } finally {
    await workspace?.cleanup();
  }
}

function assertDeploymentCanStartDestroyPlan(
  deployment: DeploymentRecord,
  sourceStatus: DeploymentStatus,
  sourceFailureStage: DeploymentFailureStage | null
): asserts deployment is DeploymentRecord & { stateObjectKey: string } {
  if (!deployment.stateObjectKey) {
    throw new DeploymentConflictError("Terraform state is required before destroy");
  }

  if (sourceStatus === "SUCCESS") {
    return;
  }

  if (
    sourceStatus === "FAILED" &&
    (sourceFailureStage === "apply" || sourceFailureStage === "destroy")
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
    (input.sourceFailureStage !== "apply" && input.sourceFailureStage !== "destroy")
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
  errorSummary: string;
}): Promise<RunDeploymentDestroyPlanResult> {
  const failedDeployment = await input.repository.failDeployment(input.deployment.id, {
    failureStage: "plan",
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
  repository: DeploymentRepository
): Promise<DeploymentRecord> {
  const failedDeployment = await repository.failDeployment(deploymentId, {
    failureStage: "plan",
    errorSummary: summarizeUnexpectedDestroyPlanFailure(error)
  });

  if (!failedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return failedDeployment;
}

function createDestroyPlanSummary(
  summary: DeploymentPlanSummary,
  unsupportedResourceTypes: readonly string[]
): DeploymentPlanSummary {
  const warnings: DeploymentPlanWarning[] = [
    ...summary.warnings,
    ...unsupportedResourceTypes.map((resourceType) => ({
      level: "high" as const,
      message: `MVP live destroy does not support Terraform resource type ${resourceType}`
    }))
  ];

  if (summary.deleteCount === 0 && summary.replaceCount === 0) {
    warnings.push({
      level: "medium",
      message: "Terraform destroy plan has no resources to delete"
    });
  }

  return {
    ...summary,
    blocked: true,
    warnings
  };
}

function createDestroyPlanBlock(unsupportedResourceTypes: readonly string[]): {
  isBlocked: boolean;
  blockedBy: "missing_approval" | "risk_analysis";
  blockedReason: string;
} {
  if (unsupportedResourceTypes.length > 0) {
    return {
      isBlocked: true,
      blockedBy: "risk_analysis",
      blockedReason: `Unsupported Terraform resource types for MVP live destroy: ${unsupportedResourceTypes.join(", ")}`
    };
  }

  return {
    isBlocked: true,
    blockedBy: "missing_approval",
    blockedReason: "Terraform Destroy Plan requires user approval before destroy"
  };
}

async function appendTerraformOutput(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  stage: "init" | "plan";
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

  return nextSequence;
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
