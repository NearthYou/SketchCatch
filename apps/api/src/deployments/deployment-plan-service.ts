import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  AwsConnection,
  CheckFinding,
  DeploymentBlockedBy,
  DeploymentStatus,
  DeploymentPlanSummary,
  DeploymentPlanWarning
} from "@sketchcatch/types";
import {
  prepareTerraformAwsCredentialEnv as defaultPrepareTerraformAwsCredentialEnv,
  type PreparedTerraformAwsCredentialEnv
} from "../aws-connections/aws-connection-runtime-credentials.js";
import {
  createAwsSdkStsGateway,
  type AwsConnectionStsGateway
} from "../aws-connections/aws-connection-test-service.js";
import { analyzePreDeployment as defaultAnalyzePreDeployment } from "../services/aiPreDeploymentAnalysis.js";
import { maskDeploymentMessage } from "./log-masking.js";
import {
  createDeploymentPlanSummaryFromTerraformShowJson,
  DeploymentPlanSummaryParseError
} from "./deployment-plan-summary.js";
import {
  createS3DeploymentPlanArtifactStorage,
  type DeploymentPlanArtifactStorage
} from "./deployment-plan-artifact-storage.js";
import {
  appendDeploymentLogs,
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
  runTerraformPlan as defaultRunTerraformPlan,
  runTerraformShowJson as defaultRunTerraformShowJson,
  type TerraformRunResult
} from "./terraform-runner.js";

const defaultPlanFileName = "tfplan";

export type RunDeploymentPlanInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
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
  analyzePreDeployment?: (architectureJson: ArchitectureJson) => AiPreDeploymentAnalysisResult;
  planArtifactStorage?: DeploymentPlanArtifactStorage;
  generatePlanArtifactId?: () => string;
  readTerraformArtifactFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
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

  let workspace: PreparedTerraformWorkspace | undefined;
  let deploymentId: string | undefined;
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

    const artifact = await requireDeploymentTerraformArtifact(deployment, repository);
    const awsConnection = await requireDeploymentAwsConnection(
      deployment,
      input.accessContext,
      repository
    );
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

    const architecture = await repository.findArchitectureInProject(
      deployment.architectureId,
      deployment.projectId
    );

    if (!architecture) {
      throw new DeploymentNotFoundError("Architecture not found for deployment");
    }

    const preDeploymentAnalysis = analyzePreDeployment(architecture.architectureJson);
    const awsCredentials = await prepareTerraformAwsCredentialEnv(awsConnection);

    workspace = await prepareTerraformWorkspace({
      objectKey: artifact.objectKey,
      fileName: artifact.fileName
    });
    const terraformArtifactSha256 = createSha256(
      await readTerraformArtifactFile(workspace.mainFilePath)
    );

    await repository.updateDeploymentStatus(deployment.id, "RUNNING");

    let sequence = await repository.getNextDeploymentLogSequence(deployment.id);

    terraform.init = await runTerraformInit(workspace.workdir, {
      env: awsCredentials.env
    });
    sequence = await appendTerraformOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "init",
      result: terraform.init,
      repository
    });

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

    terraform.plan = await runTerraformPlan(workspace.workdir, {
      env: awsCredentials.env,
      planFileName: defaultPlanFileName
    });
    sequence = await appendTerraformOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      result: terraform.plan,
      repository
    });

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
      planFileName: defaultPlanFileName
    });
    await appendTerraformErrorOutput({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      result: terraform.showJson,
      repository
    });

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

    const planSummary = createBlockedPlanSummary(
      createDeploymentPlanSummaryFromTerraformShowJson(terraform.showJson.stdout),
      preDeploymentAnalysis.findings
    );
    const block = createDeploymentPlanBlock(planSummary);
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
          objectKey: uploadedPlanArtifact.objectKey,
          sha256: uploadedPlanArtifact.sha256,
          accountId: awsCredentials.accountId,
          region: awsCredentials.region
        },
        planSummary,
        isBlocked: block.isBlocked,
        blockedBy: block.blockedBy,
        blockedReason: block.blockedReason
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
        await cleanupUploadedPlanArtifact({
          deploymentId: deployment.id,
          accessContext: input.accessContext,
          objectKey: uploadedPlanArtifact.objectKey,
          planArtifactStorage,
          repository
        }).catch(() => undefined);
      }

      const failedDeployment = await failDeployment(deployment.id, "plan", error, repository);

      return {
        deployment: failedDeployment,
        terraform
      };
    }
  } catch (error) {
    if (deploymentId) {
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
    !input.deployment.isBlocked
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

function createBlockedPlanSummary(
  summary: DeploymentPlanSummary,
  findings: readonly CheckFinding[]
): DeploymentPlanSummary {
  const highRiskWarnings = findings
    .filter((finding) => finding.severity === "high")
    .map(toPlanWarning);
  const warnings = [...summary.warnings, ...highRiskWarnings];

  return {
    ...summary,
    blocked: true,
    warnings
  };
}

function createDeploymentPlanBlock(summary: DeploymentPlanSummary): {
  isBlocked: boolean;
  blockedBy: DeploymentBlockedBy;
  blockedReason: string;
} {
  const hasRiskFinding = summary.warnings.some((warning) => warning.level === "high");
  const hasDestructiveChange = summary.deleteCount > 0 || summary.replaceCount > 0;

  if (hasRiskFinding && hasDestructiveChange) {
    return {
      isBlocked: true,
      blockedBy: "risk_analysis",
      blockedReason: "Plan includes destructive changes and high-risk findings"
    };
  }

  if (hasDestructiveChange) {
    return {
      isBlocked: true,
      blockedBy: "risk_analysis",
      blockedReason: "Plan includes delete or replace changes"
    };
  }

  if (hasRiskFinding) {
    return {
      isBlocked: true,
      blockedBy: "risk_analysis",
      blockedReason: "Pre-Deployment Check found high-risk findings"
    };
  }

  return {
    isBlocked: true,
    blockedBy: "missing_approval",
    blockedReason: "Terraform Plan requires user approval before apply"
  };
}

function toPlanWarning(finding: CheckFinding): DeploymentPlanWarning {
  const warning: DeploymentPlanWarning = {
    level: "high",
    message: `${finding.title}: ${finding.recommendation}`
  };

  if (finding.resourceId) {
    warning.relatedResourceId = finding.resourceId;
  }

  return warning;
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

  return nextSequence;
}

async function appendTerraformErrorOutput(input: {
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
    stage: "plan",
    output: input.result.stderr,
    level: input.result.exitCode === 0 ? "WARN" : "ERROR",
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
