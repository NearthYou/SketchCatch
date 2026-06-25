import {
  appendDeploymentLog,
  DeploymentNotFoundError,
  getDeployment,
  type DeploymentRecord,
  type DeploymentRepository,
  type ProjectAccessContext
} from "./deployment-service.js";
import {
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import {
  runTerraformInit as defaultRunTerraformInit,
  type TerraformRunResult
} from "./terraform-runner.js";
import { maskDeploymentMessage } from "./log-masking.js";

export type RunDeploymentInitInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
};

export type RunDeploymentInitOptions = {
  prepareTerraformWorkspace?: typeof defaultPrepareTerraformWorkspace;
  runTerraformInit?: typeof defaultRunTerraformInit;
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

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;

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

    workspace = await prepareTerraformWorkspace({
      objectKey: artifact.objectKey,
      fileName: artifact.fileName
    });

    await repository.updateDeploymentStatus(deployment.id, "RUNNING");

    const terraform = await runTerraformInit(workspace.workdir);
    let sequence = await getNextLogSequence(deployment.id, repository);

    sequence = await appendOutputLines({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      output: terraform.stdout,
      level: "INFO",
      repository
    });

    await appendOutputLines({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      output: terraform.stderr,
      level: terraform.exitCode === 0 ? "WARN" : "ERROR",
      repository
    });

    if (terraform.exitCode === 0) {
      const updatedDeployment = await repository.markDeploymentInitSucceeded(deployment.id);

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
    if (deploymentId) {
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
  let sequence = input.sequence;

  for (const line of splitOutputLines(input.output)) {
    await appendDeploymentLog(
      {
        deploymentId: input.deploymentId,
        accessContext: input.accessContext,
        sequence,
        stage: "init",
        level: input.level,
        message: line,
        relatedResourceId: null
      },
      input.repository
    );

    sequence += 1;
  }

  return sequence;
}

function splitOutputLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function summarizeTerraformFailure(result: TerraformRunResult): string {
  if (result.timedOut) {
    return "Terraform init timed out";
  }

  return (
    splitOutputLines(result.stderr)[0] ?? `Terraform init failed with exit code ${result.exitCode}`
  );
}

function summarizeUnexpectedInitFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return maskDeploymentMessage(message);
}
