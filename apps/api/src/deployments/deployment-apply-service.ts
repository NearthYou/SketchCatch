import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AwsConnection, DeploymentStatus } from "@sketchcatch/types";
import {
  prepareTerraformAwsCredentialEnv as defaultPrepareTerraformAwsCredentialEnv,
  type PreparedTerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";
import { assertDeploymentApplyPreconditions } from "./deployment-approval-service.js";
import {
  createS3DeploymentApplyArtifactStorage,
  type DeploymentApplyArtifactStorage
} from "./deployment-apply-artifact-storage.js";
import {
  extractDeployedResourcesFromTerraformStateJson,
  parseTerraformOutputsJson
} from "./deployment-apply-results.js";
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
import {
  runTerraformApply as defaultRunTerraformApply,
  runTerraformInit as defaultRunTerraformInit,
  runTerraformOutputJson as defaultRunTerraformOutputJson,
  runTerraformShowStateJson as defaultRunTerraformShowStateJson,
  type TerraformRunResult
} from "./terraform-runner.js";
import {
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";

const defaultPlanFileName = "tfplan";

export type RunDeploymentApplyInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
};

export type RunDeploymentApplyOptions = {
  prepareTerraformWorkspace?: typeof defaultPrepareTerraformWorkspace;
  runTerraformInit?: typeof defaultRunTerraformInit;
  runTerraformApply?: typeof defaultRunTerraformApply;
  runTerraformOutputJson?: typeof defaultRunTerraformOutputJson;
  runTerraformShowStateJson?: typeof defaultRunTerraformShowStateJson;
  prepareTerraformAwsCredentialEnv?: (
    awsConnection: AwsConnection
  ) => Promise<PreparedTerraformAwsCredentialEnv>;
  awsStsGateway?: AwsConnectionStsGateway;
  applyArtifactStorage?: DeploymentApplyArtifactStorage;
  readTerraformArtifactFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  writePlanFile?: (filePath: string, content: Buffer) => Promise<void>;
  generateResultId?: () => string;
};

export type RunDeploymentApplyResult = {
  deployment: DeploymentRecord;
  terraform: {
    init: TerraformRunResult | null;
    apply: TerraformRunResult | null;
    outputJson: TerraformRunResult | null;
    showStateJson: TerraformRunResult | null;
  };
};

export async function runDeploymentApply(
  input: RunDeploymentApplyInput,
  repository: DeploymentRepository,
  options: RunDeploymentApplyOptions = {}
): Promise<RunDeploymentApplyResult> {
  const prepareTerraformWorkspace =
    options.prepareTerraformWorkspace ?? defaultPrepareTerraformWorkspace;
  const runTerraformInit = options.runTerraformInit ?? defaultRunTerraformInit;
  const runTerraformApply = options.runTerraformApply ?? defaultRunTerraformApply;
  const runTerraformOutputJson = options.runTerraformOutputJson ?? defaultRunTerraformOutputJson;
  const runTerraformShowStateJson =
    options.runTerraformShowStateJson ?? defaultRunTerraformShowStateJson;
  const prepareTerraformAwsCredentialEnv =
    options.prepareTerraformAwsCredentialEnv ??
    ((awsConnection: AwsConnection) =>
      defaultPrepareTerraformAwsCredentialEnv(
        awsConnection,
        options.awsStsGateway ?? createAwsSdkStsGateway()
      ));
  const applyArtifactStorage =
    options.applyArtifactStorage ?? createS3DeploymentApplyArtifactStorage();
  const readTerraformArtifactFile =
    options.readTerraformArtifactFile ?? readFile;
  const writePlanFile = options.writePlanFile ?? writeFile;
  const generateResultId = options.generateResultId ?? randomUUID;

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;
  let applySucceeded = false;
  const terraform: RunDeploymentApplyResult["terraform"] = {
    init: null,
    apply: null,
    outputJson: null,
    showStateJson: null
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

    if ((input.startedFromStatus ?? deployment.status) === "SUCCESS") {
      throw new DeploymentConflictError("Deployment apply has already completed");
    }

    const terraformArtifact = await requireDeploymentTerraformArtifact(deployment, repository);
    const currentPlanArtifact = await requireCurrentPlanArtifact(deployment, repository);
    const awsConnection = await requireDeploymentAwsConnection(
      deployment,
      input.accessContext,
      repository
    );
    const planBuffer = await applyArtifactStorage.downloadDeploymentArtifact(
      currentPlanArtifact.objectKey
    );

    workspace = await prepareTerraformWorkspace({
      objectKey: terraformArtifact.objectKey,
      fileName: terraformArtifact.fileName
    });

    const currentTerraformArtifactHash = createSha256(
      await readTerraformArtifactFile(workspace.mainFilePath)
    );
    const currentTfplanHash = createSha256(planBuffer);

    assertDeploymentApplyPreconditions({
      deployment,
      currentPlanArtifact,
      currentTerraformArtifactHash,
      currentTfplanHash,
      currentAwsConnection: awsConnection
    });

    const awsCredentials = await prepareTerraformAwsCredentialEnv(awsConnection);
    await writePlanFile(join(workspace.workdir, defaultPlanFileName), Buffer.from(planBuffer));

    let sequence = await repository.getNextDeploymentLogSequence(deployment.id);

    terraform.init = await runTerraformInit(workspace.workdir, {
      env: awsCredentials.env
    });
    sequence = await appendTerraformApplyOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      result: terraform.init,
      repository
    });

    if (terraform.init.exitCode !== 0) {
      return failDeploymentApplyRun({
        deployment,
        repository,
        terraform,
        errorSummary: summarizeTerraformFailure("Terraform init before apply", terraform.init)
      });
    }

    terraform.apply = await runTerraformApply(workspace.workdir, {
      env: awsCredentials.env,
      planFileName: defaultPlanFileName
    });
    sequence = await appendTerraformApplyOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      result: terraform.apply,
      repository
    });

    if (terraform.apply.exitCode !== 0) {
      return failDeploymentApplyRun({
        deployment,
        repository,
        terraform,
        errorSummary: summarizeTerraformFailure("Terraform apply", terraform.apply)
      });
    }

    applySucceeded = true;

    const warnings: string[] = [];
    let stateObjectKey: string | null = null;
    let outputs = parseOptionalTerraformOutputs([]);
    let resources = extractOptionalDeployedResources([]);

    terraform.outputJson = await runTerraformOutputJson(workspace.workdir, {
      env: awsCredentials.env
    });
    sequence = await appendTerraformApplyStderr({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      result: terraform.outputJson,
      repository
    });

    if (terraform.outputJson.exitCode === 0) {
      try {
        outputs = parseOptionalTerraformOutputs(parseTerraformOutputsJson(terraform.outputJson.stdout));
      } catch (error) {
        warnings.push(summarizePostApplyWarning("Terraform output parse", error));
      }
    } else {
      warnings.push(summarizeTerraformFailure("Terraform output", terraform.outputJson));
    }

    terraform.showStateJson = await runTerraformShowStateJson(workspace.workdir, {
      env: awsCredentials.env
    });
    sequence = await appendTerraformApplyStderr({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      result: terraform.showStateJson,
      repository
    });

    if (terraform.showStateJson.exitCode === 0) {
      try {
        resources = extractOptionalDeployedResources(
          extractDeployedResourcesFromTerraformStateJson(
            terraform.showStateJson.stdout,
            awsCredentials.region
          )
        );
      } catch (error) {
        warnings.push(summarizePostApplyWarning("Terraform state parse", error));
      }
    } else {
      warnings.push(summarizeTerraformFailure("Terraform show state", terraform.showStateJson));
    }

    try {
      const uploadedState = await applyArtifactStorage.uploadDeploymentState({
        deploymentId: deployment.id,
        stateFilePath: join(workspace.workdir, "terraform.tfstate")
      });
      stateObjectKey = uploadedState.objectKey;
    } catch (error) {
      warnings.push(summarizePostApplyWarning("Terraform state upload", error));
    }

    await appendApplyWarnings({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      warnings,
      repository
    });

    const completedDeployment = await repository.completeDeploymentApply(deployment.id, {
      stateObjectKey,
      resultWarningSummary: warnings.length > 0 ? warnings.join("; ") : null,
      resources: resources.map((resource) => ({
        id: generateResultId(),
        deploymentId: deployment.id,
        ...resource
      })),
      outputs: outputs.map((output) => ({
        id: generateResultId(),
        deploymentId: deployment.id,
        ...output
      }))
    });

    if (!completedDeployment) {
      throw new DeploymentNotFoundError("Deployment not found");
    }

    return {
      deployment: completedDeployment,
      terraform
    };
  } catch (error) {
    if (deploymentId && !applySucceeded) {
      await repository
        .failDeployment(deploymentId, {
          failureStage: "apply",
          errorSummary: summarizeUnexpectedApplyFailure(error)
        })
        .catch(() => undefined);
    }

    throw error;
  } finally {
    await workspace?.cleanup();
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

async function requireCurrentPlanArtifact(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
) {
  if (!deployment.currentPlanArtifactId) {
    throw new DeploymentConflictError("Terraform Plan must be completed before apply");
  }

  const planArtifact = await repository.findDeploymentPlanArtifactById(
    deployment.currentPlanArtifactId
  );

  if (!planArtifact || planArtifact.deploymentId !== deployment.id) {
    throw new DeploymentConflictError("Current deployment plan artifact not found");
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

async function failDeploymentApplyRun(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  terraform: RunDeploymentApplyResult["terraform"];
  errorSummary: string;
}): Promise<RunDeploymentApplyResult> {
  const failedDeployment = await input.repository.failDeployment(input.deployment.id, {
    failureStage: "apply",
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

async function appendTerraformApplyOutput(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
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

  return nextSequence;
}

async function appendTerraformApplyStderr(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  result: TerraformRunResult;
  repository: DeploymentRepository;
}): Promise<number> {
  return appendOutputLines({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    output: input.result.stderr,
    level: input.result.exitCode === 0 ? "WARN" : "ERROR",
    repository: input.repository
  });
}

async function appendApplyWarnings(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  warnings: string[];
  repository: DeploymentRepository;
}): Promise<number> {
  if (input.warnings.length === 0) {
    return input.sequence;
  }

  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: input.warnings.map((warning, index) => ({
        sequence: input.sequence + index,
        stage: "apply",
        level: "WARN",
        message: warning,
        relatedResourceId: null
      }))
    },
    input.repository
  );

  return input.sequence + input.warnings.length;
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
        stage: "apply",
        level: input.level,
        message: line,
        relatedResourceId: null
      }))
    },
    input.repository
  );

  return input.sequence + lines.length;
}

function parseOptionalTerraformOutputs(
  outputs: ReturnType<typeof parseTerraformOutputsJson>
): ReturnType<typeof parseTerraformOutputsJson> {
  return outputs;
}

function extractOptionalDeployedResources(
  resources: ReturnType<typeof extractDeployedResourcesFromTerraformStateJson>
): ReturnType<typeof extractDeployedResourcesFromTerraformStateJson> {
  return resources;
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

function summarizeUnexpectedApplyFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return maskDeploymentMessage(message);
}

function summarizePostApplyWarning(stage: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return maskDeploymentMessage(`${stage} failed after successful apply: ${message}`);
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}
