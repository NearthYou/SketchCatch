import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AiPreDeploymentAnalysisResult,
  ArchitectureJson,
  AwsConnection,
  DeploymentOptimizationDecision,
  TerraformDesiredStateIdentity,
  TerraformSyncFileInput,
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
import { createTerraformValidationDiagnostics } from "../services/terraform/terraform-diagnostics.js";
import {
  assertTerraformBaseFilesDoNotContainImportBlocks,
  assertTerraformImportArtifactMatches
} from "../services/terraform/terraform-import-artifact.js";
import {
  hasReverseEngineeringSourceProvenance,
  resolveVerifiedImportTargets
} from "../reverse-engineering/reverse-engineering-import-targets.js";
import {
  appendTerraformDurationLog,
  runLoggedDeploymentOperation
} from "./deployment-duration-logs.js";
import { createDeploymentTerraformLiveLogWriter } from "./deployment-terraform-live-logs.js";
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
import {
  createS3DeploymentApplyArtifactStorage,
  type DeploymentApplyArtifactStorage
} from "./deployment-apply-artifact-storage.js";
import {
  createDeploymentPlanOptimizationEvidence,
  createDeploymentPlanSingleFlight,
  createTerraformDesiredStateIdentity,
  createTerraformResourceChangeEvidence,
  defaultDeploymentPlanDriftTtlMs,
  evaluatePendingPlanReuse,
  isTerraformPlanNoChange,
  parseDeploymentPlanOptimizationEvidence
} from "./deployment-optimization.js";
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
  cleanupPreparedTerraformWorkspace,
  createTerraformFilesSafetyContent,
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import {
  runTerraformInit as defaultRunTerraformInit,
  runTerraformPlan as defaultRunTerraformPlan,
  runTerraformShowJson as defaultRunTerraformShowJson,
  terraformInitTimeoutMs,
  terraformMutationTimeoutMs,
  type TerraformRunResult
} from "./terraform-runner.js";
import { assertTerraformArtifactIsSafe } from "./terraform-artifact-safety.js";
import { findAnalysisExcludedTerraformConflicts } from "../services/terraform/analysis-excluded-terraform-guard.js";
import { listTerraformBlockIdentities } from "../services/terraform/terraform-to-diagram.js";
import { restoreInfrastructureRollbackState } from "./infrastructure-rollback-state.js";
import {
  restoreTerraformLockFile,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";
import { terraformLockFileName } from "./terraform-lock-file-storage.js";
import { createAwsCodeBuildDirectApplicationReleaseGateway } from "./aws-codebuild-direct-application-release-gateway.js";
import {
  DirectApplicationReleaseError,
  prepareDirectApplicationRelease as defaultPrepareDirectApplicationRelease,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";
import {
  acquireProjectExecutionLease,
  heartbeatProjectExecutionLease,
  recordProjectExecutionCoordinates,
  releaseProjectExecutionLease,
  type LeaseFence,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";
import { ProjectBuildEnvironmentError } from "../build-environments/project-build-environment-service.js";

const defaultPlanFileName = "tfplan";

export type RunDeploymentPlanInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  abortSignal?: AbortSignal;
  workerTaskArn?: string;
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
  prepareBuildEnvironment?: (input: {
    deployment: DeploymentRecord;
    accessContext: ProjectAccessContext;
    abortSignal?: AbortSignal;
    repository: DeploymentRepository;
  }) => Promise<void>;
  writeApplicationPlanFile?: (filePath: string, content: string) => Promise<void>;
  rollbackStateStorage?: Pick<DeploymentApplyArtifactStorage, "downloadDeploymentState">;
  projectExecutionLeaseRepository?: ProjectExecutionLeaseRepository;
  leaseHeartbeatIntervalMs?: number;
  readTerraformLockFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  readTerraformStateFile?: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  writeTerraformStateFile?: (filePath: string, content: Buffer) => Promise<void>;
  driftTtlMs?: number;
  now?: () => Date;
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
  optimization: DeploymentOptimizationDecision;
  terraform: {
    init: TerraformRunResult | null;
    validate: TerraformRunResult | null;
    plan: TerraformRunResult | null;
    showJson: TerraformRunResult | null;
  };
};

const deploymentPlanSingleFlight = createDeploymentPlanSingleFlight<RunDeploymentPlanResult>();

export async function runDeploymentPlan(
  input: RunDeploymentPlanInput,
  repository: DeploymentRepository,
  options: RunDeploymentPlanOptions = {}
): Promise<RunDeploymentPlanResult> {
  const deployment = await getDeployment(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext
    },
    repository
  );
  const flight = deploymentPlanSingleFlight.run(
    deployment.id,
    () => runDeploymentPlanOnce(input, repository, options, deployment)
  );
  const result = await flight.promise;

  return flight.joined
    ? {
        ...result,
        optimization: {
          outcome: "reuse",
          reason: "concurrent_plan_joined"
        }
      }
    : result;
}

async function runDeploymentPlanOnce(
  input: RunDeploymentPlanInput,
  repository: DeploymentRepository,
  options: RunDeploymentPlanOptions,
  deployment: DeploymentRecord
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
  const generatePlanArtifactId = options.generatePlanArtifactId ?? randomUUID;
  const readTerraformArtifactFile = options.readTerraformArtifactFile ?? readFile;
  const prepareApplicationArtifact =
    options.prepareApplicationArtifact ?? defaultPrepareApplicationArtifact;
  const prepareBuildEnvironment = options.prepareBuildEnvironment;
  const writeApplicationPlanFile = options.writeApplicationPlanFile ?? writeFile;
  const readTerraformLockFile = options.readTerraformLockFile ?? readFile;
  const readTerraformStateFile = options.readTerraformStateFile ?? readFile;
  const writeTerraformStateFile = options.writeTerraformStateFile ?? writeFile;
  const driftTtlMs = options.driftTtlMs ?? defaultDeploymentPlanDriftTtlMs;
  const now = options.now ?? (() => new Date());

  let workspace: PreparedTerraformWorkspace | undefined;
  let workspacePromise: Promise<PreparedTerraformWorkspace> | undefined;
  let deploymentId: string | undefined;
  let failureRecorded = false;
  let planLeaseFence: LeaseFence | undefined;
  let leaseHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let leaseHeartbeatPromise: Promise<void> | undefined;
  let leaseHeartbeatError: unknown;
  let retainLeaseForRecovery = false;
  const leaseAbortController = new AbortController();
  const abortFromRequest = () => leaseAbortController.abort(input.abortSignal?.reason);
  if (input.abortSignal?.aborted) abortFromRequest();
  else input.abortSignal?.addEventListener("abort", abortFromRequest, { once: true });
  const executionSignal = leaseAbortController.signal;
  let optimization: DeploymentOptimizationDecision;
  const terraform: RunDeploymentPlanResult["terraform"] = {
    init: null,
    validate: null,
    plan: null,
    showJson: null
  };

  try {
    deploymentId = deployment.id;
    const leaseRepository =
      options.projectExecutionLeaseRepository ?? repository.projectExecutionLeaseRepository;
    if (leaseRepository) {
      const lease = await acquireProjectExecutionLease(
        {
          projectId: deployment.projectId,
          holderId: deployment.id,
          source: "direct"
        },
        leaseRepository,
        { now }
      );
      planLeaseFence = {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      };
      if (input.workerTaskArn) {
        await recordProjectExecutionCoordinates(
          { ...planLeaseFence, activeWorkerTaskArn: input.workerTaskArn },
          leaseRepository,
          now()
        );
      }
      leaseHeartbeatTimer = setInterval(() => {
        if (leaseHeartbeatPromise || !planLeaseFence) return;
        leaseHeartbeatPromise = heartbeatProjectExecutionLease(
          planLeaseFence,
          leaseRepository,
          { now }
        )
          .then(() => undefined)
          .catch((error) => {
            leaseHeartbeatError = error;
            leaseAbortController.abort(error);
          })
          .finally(() => {
            leaseHeartbeatPromise = undefined;
          });
      }, options.leaseHeartbeatIntervalMs ?? 30_000);
      leaseHeartbeatTimer.unref?.();
    }

    let preparedApplicationRelease = null;
    if (deployment.scope !== "infrastructure") {
      await repository.markDeploymentActiveStage?.(deployment.id, "preflight");
      let applicationPreparationStage: "build_environment" | "preflight" = "build_environment";
      try {
        await prepareBuildEnvironment?.({
          deployment,
          accessContext: input.accessContext,
          repository,
          ...(executionSignal ? { abortSignal: executionSignal } : {})
        });
        applicationPreparationStage = "preflight";
        preparedApplicationRelease = await prepareApplicationArtifact({
          deployment,
          accessContext: input.accessContext,
          repository,
          ...(executionSignal ? { abortSignal: executionSignal } : {})
        });
      } catch (error) {
        if (
          error instanceof DirectApplicationReleaseError &&
          error.code === "PREFLIGHT_STOP_UNCONFIRMED"
        ) {
          retainLeaseForRecovery = true;
          failureRecorded = true;
          throw error;
        }
        const failureStage =
          applicationPreparationStage === "build_environment" ||
          isBuildEnvironmentPreparationFailure(error)
          ? "build_environment"
          : "preflight";
        await repository
          .failDeployment(deployment.id, {
            failureStage,
            errorSummary: summarizeUnexpectedPlanFailure(error)
          })
          .catch(() => undefined);
        failureRecorded = true;
        throw error;
      }
      await repository.markDeploymentActiveStage?.(deployment.id, "plan");
    }
    if (deployment.scope !== "infrastructure" && !preparedApplicationRelease) {
      throw new DeploymentConflictError("Application artifact preparation did not return a release");
    }

    const artifactPromise = requireDeploymentTerraformArtifact(deployment, repository);
    const awsConnectionPromise = requireDeploymentAwsConnection(
      deployment,
      input.accessContext,
      repository
    );
    const architecturePromise = repository.findArchitectureInProject(
      deployment.architectureId,
      deployment.projectId
    );
    const currentPlanArtifactPromise = deployment.currentPlanArtifactId
      ? repository.findDeploymentPlanArtifactById(deployment.currentPlanArtifactId)
      : Promise.resolve(undefined);
    workspacePromise = artifactPromise.then(async (artifact) => {
      const preparedWorkspace = await prepareTerraformWorkspace({
        objectKey: artifact.objectKey,
        fileName: artifact.fileName,
        contentType: artifact.contentType
      });
      workspace = preparedWorkspace;
      return preparedWorkspace;
    });
    const [artifact, awsConnection, architecture, preparedWorkspace, currentPlanArtifact] =
      await Promise.all([
        artifactPromise,
        awsConnectionPromise,
        architecturePromise,
        workspacePromise,
        currentPlanArtifactPromise
      ]);
    workspace = preparedWorkspace;

    const projectDeployments = await repository.listDeploymentsByProject(deployment.projectId);
    const stateBaseline = selectDeploymentStateBaseline(deployment, projectDeployments);
    const isRollbackPlan = Boolean(
      deployment.rollbackOfDeploymentId || deployment.rollbackTargetDeploymentId
    );

    if (isRollbackPlan) {
      await restoreInfrastructureRollbackState({
        deployment,
        repository,
        storage: options.rollbackStateStorage ?? createS3DeploymentApplyArtifactStorage(),
        workspace: preparedWorkspace,
        writeStateFile: writeTerraformStateFile
      });
    }

    if (!architecture) {
      throw new DeploymentNotFoundError("Architecture not found for deployment");
    }

    const terraformArtifactContent = await readTerraformArtifactFile(workspace.mainFilePath);
    const workspaceTerraformFiles = preparedWorkspace.terraformFiles ?? [];
    const preDeploymentTerraformFiles = workspaceTerraformFiles.length
      ? workspaceTerraformFiles
      : [
          {
            fileName: artifact.fileName,
            terraformCode: toTerraformCodeString(terraformArtifactContent)
          }
        ];
    await assertDeploymentTerraformImportArtifactMatches({
      deployment,
      accessContext: input.accessContext,
      repository,
      terraformFiles: preDeploymentTerraformFiles
    });
    assertArchitectureTerraformDoesNotIncludeAnalysisExcludedResource(
      architecture.architectureJson,
      preDeploymentTerraformFiles
    );
    assertTerraformArtifactIsSafe(
      createTerraformFilesSafetyContent(workspaceTerraformFiles, terraformArtifactContent),
      { liveProfile: deployment.liveProfile, resourceValidationMode: "plan" }
    );
    const terraformArtifactSha256 = createSha256(terraformArtifactContent);
    if (deployment.scope === "application") {
      const preDeploymentAnalysis = await analyzePreDeployment({
        architectureJson: architecture.architectureJson,
        ...(preDeploymentTerraformFiles.length === 1
          ? { artifactSha256: terraformArtifactSha256 }
          : {}),
        terraformFiles: preDeploymentTerraformFiles
      });

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
        getPlanArtifactStorage: () =>
          options.planArtifactStorage ?? createS3DeploymentPlanArtifactStorage(),
        generatePlanArtifactId,
        writeApplicationPlanFile,
        assertCurrentLease: assertCurrentPlanLease,
        repository,
        terraform
      });
    }

    const undefinedReferenceDiagnostic = createTerraformValidationDiagnostics({
      terraformCode: preDeploymentTerraformFiles[0]?.terraformCode ?? "",
      terraformFiles: preDeploymentTerraformFiles
    }).find((diagnostic) => diagnostic.code === "terraform.undefined_reference");

    if (undefinedReferenceDiagnostic) {
      throw new DeploymentConflictError(
        `Terraform artifact contains an undeclared resource reference: ${undefinedReferenceDiagnostic.resourceAddress ?? "unknown resource"}`
      );
    }
    const planArtifactStorage =
      options.planArtifactStorage ?? createS3DeploymentPlanArtifactStorage();

    const [awsCredentials, lockFileRestored, stateFileRestored] = await Promise.all([
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
      }),
      restoreTerraformStateForPlan({
        stateBaseline,
        workspace: preparedWorkspace,
        planArtifactStorage,
        writeTerraformStateFile,
        alreadyRestored: isRollbackPlan
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
    sequence = await appendDeploymentOptimizationLog({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      event: "provider_lock_cache",
      outcome: lockFileRestored ? "hit" : "miss",
      reason: lockFileRestored ? "verified_lock_restored" : "lock_not_found",
      repository
    });
    sequence = await appendDeploymentOptimizationLog({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      event: "terraform_state_restore",
      outcome: stateFileRestored ? "hit" : "miss",
      reason: stateFileRestored ? "verified_state_restored" : "state_not_available",
      repository
    });

    const initLogWriter = createDeploymentTerraformLiveLogWriter({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "init",
      repository
    });
    terraform.init = await runTerraformInit(workspace.workdir, {
      env: awsCredentials.env,
      onOutputLine: initLogWriter.onOutputLine,
      signal: executionSignal,
      timeoutMs: terraformInitTimeoutMs
    });
    sequence = await initLogWriter.complete({
      label: "terraform init",
      result: terraform.init
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

    const [providerLockContent, terraformStateContent] = await Promise.all([
      readOptionalTerraformFile(
        readTerraformLockFile,
        join(workspace.workdir, terraformLockFileName)
      ),
      readOptionalTerraformFile(
        readTerraformStateFile,
        join(workspace.workdir, "terraform.tfstate")
      )
    ]);
    const desiredStateIdentity = createTerraformDesiredStateIdentity({
      projectId: deployment.projectId,
      canonicalTerraformBundle: terraformArtifactContent,
      terraformFiles: preDeploymentTerraformFiles,
      providerLockContent,
      target: {
        provider: "aws",
        accountId: awsCredentials.accountId,
        region: awsCredentials.region
      },
      state: parseTerraformStateIdentity(terraformStateContent)
    });
    const reuseValidation = await runLoggedDeploymentOperation({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      label: "deployment plan reuse validation",
      repository,
      operation: () =>
        evaluateDeploymentPlanReuse({
          deployment,
          startedFromStatus: input.startedFromStatus ?? deployment.status,
          artifactId: artifact.id,
          accountId: awsCredentials.accountId,
          region: awsCredentials.region,
          currentPlanArtifact,
          desiredStateIdentity,
          planArtifactStorage,
          now: now(),
          driftTtlMs
        })
    });
    optimization = reuseValidation.result;
    sequence = reuseValidation.sequence;
    sequence = await appendDeploymentOptimizationDecision({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      decision: optimization,
      repository
    });

    if (optimization.outcome === "reuse") {
      return {
        deployment: await restorePendingDeploymentStatus(deployment, repository),
        optimization,
        terraform
      };
    }

    const preDeploymentAnalysis = await analyzePreDeployment({
      architectureJson: architecture.architectureJson,
      ...(preDeploymentTerraformFiles.length === 1
        ? { artifactSha256: terraformArtifactSha256 }
        : {}),
      terraformFiles: preDeploymentTerraformFiles
    });

    const planLogWriter = createDeploymentTerraformLiveLogWriter({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      repository
    });
    terraform.plan = await runTerraformPlan(workspace.workdir, {
      env: awsCredentials.env,
      onOutputLine: planLogWriter.onOutputLine,
      planFileName: defaultPlanFileName,
      signal: executionSignal,
      timeoutMs: terraformMutationTimeoutMs
    });
    sequence = await planLogWriter.complete({
      label: "terraform plan",
      result: terraform.plan
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
      signal: executionSignal
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
    const resourceChanges = createTerraformResourceChangeEvidence(terraform.showJson.stdout);
    sequence = await appendTerraformResourceChangeEvidenceLogs({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      resourceChanges,
      repository
    });

    if (isTerraformPlanNoChange(planSummary)) {
      optimization = {
        outcome: "no_change",
        reason: "terraform_plan_no_changes"
      };
      sequence = await appendDeploymentOptimizationDecision({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        decision: optimization,
        repository
      });
    }

    const planArtifactId = generatePlanArtifactId();
    let uploadedPlanArtifact: Awaited<
      ReturnType<DeploymentPlanArtifactStorage["uploadDeploymentPlanArtifact"]>
    > | null = null;

    try {
      await assertCurrentPlanLease();
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

      let optimizationEvidence: ReturnType<
        typeof createDeploymentPlanOptimizationEvidence
      > | null = null;

      try {
        optimizationEvidence = createDeploymentPlanOptimizationEvidence({
          projectId: deployment.projectId,
          deploymentId: deployment.id,
          planArtifactId,
          planArtifactSha256: uploadedPlan.sha256,
          desiredStateIdentity,
          driftVerifiedAt: now().toISOString(),
          planSummary,
          preDeploymentResult: preDeploymentAnalysis,
          resourceChanges
        });
      } catch {
        optimizationEvidence = null;
      }

      const evidenceUpload = await runLoggedDeploymentOperation({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        stage: "plan",
        label: "deployment plan optimization evidence upload",
        repository,
        operation: () =>
          optimizationEvidence
            ? uploadDeploymentPlanOptimizationEvidence({
                deploymentId: deployment.id,
                planArtifactId,
                evidence: optimizationEvidence,
                planArtifactStorage
              })
            : Promise.resolve(false)
      });
      sequence = evidenceUpload.sequence;

      if (!evidenceUpload.result) {
        sequence = await appendDeploymentOptimizationLog({
          deploymentId: deployment.id,
          accessContext: input.accessContext,
          sequence,
          event: "optimization_evidence_cache",
          outcome: "miss",
          reason: "evidence_unavailable",
          repository
        });
      }
      await assertCurrentPlanLease();
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
              region: awsCredentials.region,
              stateBaselineDeploymentId: stateBaseline?.id ?? null,
              stateObjectKey: stateBaseline?.stateObjectKey ?? null,
              stateLineageSha256: desiredStateIdentity.stateLineageSha256,
              stateSerial: desiredStateIdentity.stateSerial
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
        optimization,
        terraform
      };
    } catch (error) {
      if (leaseHeartbeatError) throw error;
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
        optimization,
        terraform
      };
    }
  } catch (error) {
    if (leaseHeartbeatError) failureRecorded = true;
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
    if (leaseHeartbeatTimer) clearInterval(leaseHeartbeatTimer);
    await leaseHeartbeatPromise?.catch(() => undefined);
    const leaseRepository =
      options.projectExecutionLeaseRepository ?? repository.projectExecutionLeaseRepository;
    if (planLeaseFence && leaseRepository && !retainLeaseForRecovery && !leaseHeartbeatError) {
      await releaseProjectExecutionLease(planLeaseFence, leaseRepository).catch(() => false);
    }
    input.abortSignal?.removeEventListener("abort", abortFromRequest);
    await cleanupPreparedTerraformWorkspace({ workspace, workspacePromise });
  }

  async function assertCurrentPlanLease(): Promise<void> {
    if (leaseHeartbeatError) throw leaseHeartbeatError;
    const leaseRepository =
      options.projectExecutionLeaseRepository ?? repository.projectExecutionLeaseRepository;
    if (planLeaseFence && leaseRepository) {
      await heartbeatProjectExecutionLease(planLeaseFence, leaseRepository, { now });
    }
    if (leaseHeartbeatError) throw leaseHeartbeatError;
  }
}

/** gg: upload 때 생성한 imports.tf를 현재 persisted ProjectDraft와 scan으로 다시 검증합니다. */
async function assertDeploymentTerraformImportArtifactMatches(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  repository: DeploymentRepository;
  terraformFiles: readonly TerraformSyncFileInput[];
}): Promise<void> {
  const findProjectDraft = input.repository.findProjectDraftForPreparation;
  if (!findProjectDraft) {
    return;
  }

  const draft = await findProjectDraft.call(input.repository, input.deployment.projectId);
  if (!draft) {
    return;
  }

  if (!hasReverseEngineeringSourceProvenance(draft.diagramJson)) {
    return;
  }

  const findAccessibleScan = input.repository.findAccessibleScan;
  if (!findAccessibleScan) {
    throw new DeploymentConflictError(
      "Terraform import artifact의 서버 원본을 확인할 수 없습니다."
    );
  }

  try {
    assertTerraformBaseFilesDoNotContainImportBlocks(
      input.terraformFiles.filter((file) => file.fileName !== "imports.tf")
    );
  } catch (error) {
    throw new DeploymentConflictError(
      error instanceof Error ? error.message : "Terraform import artifact가 올바르지 않습니다."
    );
  }

  const targets = await resolveVerifiedImportTargets(
    {
      projectId: input.deployment.projectId,
      accessContext: input.accessContext,
      diagramJson: draft.diagramJson
    },
    { findAccessibleScan: findAccessibleScan.bind(input.repository) }
  );

  if (
    input.deployment.preparedDraftRevision !== null &&
    draft.revision !== input.deployment.preparedDraftRevision
  ) {
    throw new DeploymentConflictError(
      "Terraform import artifact의 Project Draft revision이 변경됐습니다."
    );
  }

  try {
    assertTerraformImportArtifactMatches(input.terraformFiles, targets);
  } catch (error) {
    throw new DeploymentConflictError(
      error instanceof Error
        ? error.message
        : "Terraform import artifact가 현재 AWS 원본과 다릅니다."
    );
  }
}

function assertArchitectureTerraformDoesNotIncludeAnalysisExcludedResource(
  architectureJson: ArchitectureJson,
  terraformFiles: readonly TerraformSyncFileInput[]
): void {
  const conflicts = findAnalysisExcludedTerraformConflicts(
    architectureJson,
    listTerraformBlockIdentities({
      terraformCode: "",
      terraformFiles: terraformFiles.filter((file) => file.fileName.endsWith(".tf"))
    })
  );

  if (conflicts.length > 0) {
    throw new DeploymentConflictError(
      `${conflicts[0]!.resourceAddress} matches an analysis-excluded resource and cannot be planned for deployment`
    );
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
  getPlanArtifactStorage: () => DeploymentPlanArtifactStorage;
  generatePlanArtifactId: () => string;
  writeApplicationPlanFile: (filePath: string, content: string) => Promise<void>;
  assertCurrentLease: () => Promise<void>;
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
  let planArtifactStorage: DeploymentPlanArtifactStorage | undefined;
  try {
    let sequence = await input.repository.getNextDeploymentLogSequence(input.deployment.id);
    await input.assertCurrentLease();
    planArtifactStorage = input.getPlanArtifactStorage();
    const upload = await runLoggedDeploymentOperation({
      deploymentId: input.deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "plan",
      label: "application release plan artifact upload",
      repository: input.repository,
      operation: () =>
        planArtifactStorage!.uploadDeploymentPlanArtifact({
          deploymentId: input.deployment.id,
          planArtifactId,
          planFilePath
        })
    });
    uploadedPlanArtifact = upload.result;
    sequence = upload.sequence;
    await input.assertCurrentLease();
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
    return {
      deployment: save.result,
      optimization: {
        outcome: "unsupported",
        reason: "resource_not_deployable"
      },
      terraform: input.terraform
    };
  } catch (error) {
    if (uploadedPlanArtifact && planArtifactStorage) {
      await cleanupUploadedPlanArtifact({
        deploymentId: input.deployment.id,
        accessContext: input.accessContext,
        objectKey: uploadedPlanArtifact.objectKey,
        planArtifactStorage,
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
      retainProjectLease: true,
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

async function evaluateDeploymentPlanReuse(input: {
  deployment: DeploymentRecord;
  startedFromStatus: DeploymentStatus;
  artifactId: string;
  accountId: string;
  region: string;
  currentPlanArtifact: Awaited<
    ReturnType<DeploymentRepository["findDeploymentPlanArtifactById"]>
  >;
  desiredStateIdentity: TerraformDesiredStateIdentity;
  planArtifactStorage: DeploymentPlanArtifactStorage;
  now: Date;
  driftTtlMs: number;
}): Promise<DeploymentOptimizationDecision> {
  if (
    input.startedFromStatus !== "PENDING" ||
    !input.deployment.currentPlanArtifactId ||
    !input.deployment.planSummary ||
    input.deployment.approvedAt ||
    !input.currentPlanArtifact
  ) {
    return { outcome: "execute", reason: "cache_miss" };
  }

  const downloadPlanArtifact = input.planArtifactStorage.downloadDeploymentPlanArtifact;
  const downloadEvidence =
    input.planArtifactStorage.downloadDeploymentPlanOptimizationEvidence;

  if (!downloadPlanArtifact || !downloadEvidence) {
    return { outcome: "execute", reason: "cache_miss" };
  }

  try {
    const [planArtifactContent, evidenceContent] = await Promise.all([
      downloadPlanArtifact.call(input.planArtifactStorage, {
        deploymentId: input.deployment.id,
        planArtifactId: input.currentPlanArtifact.id,
        objectKey: input.currentPlanArtifact.objectKey
      }),
      downloadEvidence.call(input.planArtifactStorage, {
        deploymentId: input.deployment.id,
        planArtifactId: input.currentPlanArtifact.id
      })
    ]);

    if (!evidenceContent) {
      return { outcome: "execute", reason: "cache_miss" };
    }

    return evaluatePendingPlanReuse({
      startedFromStatus: input.startedFromStatus,
      projectId: input.deployment.projectId,
      deploymentId: input.deployment.id,
      currentPlanArtifactId: input.deployment.currentPlanArtifactId,
      approvedAt: input.deployment.approvedAt,
      planSummary: input.deployment.planSummary,
      planArtifact: input.currentPlanArtifact,
      expectedTerraformArtifactId: input.artifactId,
      expectedAccountId: input.accountId,
      expectedRegion: input.region,
      actualPlanArtifactSha256: createSha256(planArtifactContent),
      evidence: parseDeploymentPlanOptimizationEvidence(evidenceContent),
      currentDesiredStateIdentity: input.desiredStateIdentity,
      now: input.now,
      driftTtlMs: input.driftTtlMs
    });
  } catch {
    return { outcome: "fallback_execute", reason: "cache_validation_failed" };
  }
}

async function restoreTerraformStateForPlan(input: {
  stateBaseline: DeploymentRecord | null;
  workspace: PreparedTerraformWorkspace;
  planArtifactStorage: DeploymentPlanArtifactStorage;
  writeTerraformStateFile: (filePath: string, content: Buffer) => Promise<void>;
  alreadyRestored?: boolean;
}): Promise<boolean> {
  if (!input.stateBaseline?.stateObjectKey) {
    return false;
  }

  if (input.alreadyRestored) return true;

  const downloadDeploymentState = input.planArtifactStorage.downloadDeploymentState;

  if (!downloadDeploymentState) {
    throw new Error("Terraform state restore storage is unavailable");
  }

  const stateContent = await downloadDeploymentState.call(input.planArtifactStorage, {
    deploymentId: input.stateBaseline.id,
    objectKey: input.stateBaseline.stateObjectKey
  });
  await input.writeTerraformStateFile(
    join(input.workspace.workdir, "terraform.tfstate"),
    stateContent
  );

  return true;
}

async function readOptionalTerraformFile(
  reader: (filePath: string) => Promise<Buffer | Uint8Array | string>,
  filePath: string
): Promise<Buffer | null> {
  try {
    const content = await reader(filePath);
    return Buffer.from(content);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function parseTerraformStateIdentity(content: Buffer | null): {
  lineage: string | null;
  serial: number | null;
} {
  if (!content) {
    return { lineage: null, serial: null };
  }

  try {
    const parsed: unknown = JSON.parse(content.toString("utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const state = parsed as { lineage?: unknown; serial?: unknown };
      return {
        lineage:
          typeof state.lineage === "string" && state.lineage.length > 0
            ? state.lineage
            : null,
        serial:
          Number.isSafeInteger(state.serial) && (state.serial as number) >= 0
            ? (state.serial as number)
            : null
      };
    }
  } catch {
    return { lineage: null, serial: null };
  }

  return { lineage: null, serial: null };
}

async function uploadDeploymentPlanOptimizationEvidence(input: {
  deploymentId: string;
  planArtifactId: string;
  evidence: ReturnType<typeof createDeploymentPlanOptimizationEvidence>;
  planArtifactStorage: DeploymentPlanArtifactStorage;
}): Promise<boolean> {
  const uploadEvidence = input.planArtifactStorage.uploadDeploymentPlanOptimizationEvidence;

  if (!uploadEvidence) {
    return false;
  }

  try {
    await uploadEvidence.call(input.planArtifactStorage, {
      deploymentId: input.deploymentId,
      planArtifactId: input.planArtifactId,
      evidence: input.evidence
    });
    return true;
  } catch {
    return false;
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
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
  optimization?: DeploymentOptimizationDecision;
}): Promise<RunDeploymentPlanResult> {
  const cancelledDeployment = await input.repository.cancelDeployment(input.deployment.id, {
    errorSummary: input.errorSummary
  });

  if (!cancelledDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return {
    deployment: cancelledDeployment,
    optimization: input.optimization ?? { outcome: "execute", reason: "initial_plan" },
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
  optimization?: DeploymentOptimizationDecision;
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
    optimization: input.optimization ?? { outcome: "execute", reason: "initial_plan" },
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

type DeploymentOptimizationLogReason =
  | DeploymentOptimizationDecision["reason"]
  | "verified_lock_restored"
  | "lock_not_found"
  | "verified_state_restored"
  | "state_not_available"
  | "evidence_unavailable";

async function appendDeploymentOptimizationLog(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  event: "provider_lock_cache" | "terraform_state_restore" | "optimization_evidence_cache";
  outcome: "hit" | "miss";
  reason: DeploymentOptimizationLogReason;
  repository: DeploymentRepository;
}): Promise<number> {
  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: [
        {
          sequence: input.sequence,
          stage: "plan",
          level: "INFO",
          message: `[optimization] event=${input.event} outcome=${input.outcome} reason=${input.reason}`,
          relatedResourceId: null
        }
      ]
    },
    input.repository
  );

  return input.sequence + 1;
}

async function appendDeploymentOptimizationDecision(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  decision: DeploymentOptimizationDecision;
  repository: DeploymentRepository;
}): Promise<number> {
  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: [
        {
          sequence: input.sequence,
          stage: "plan",
          level: "INFO",
          message: `[optimization] event=plan_decision outcome=${input.decision.outcome} reason=${input.decision.reason}`,
          relatedResourceId: null
        }
      ]
    },
    input.repository
  );

  return input.sequence + 1;
}

async function appendTerraformResourceChangeEvidenceLogs(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  resourceChanges: ReturnType<typeof createTerraformResourceChangeEvidence>;
  repository: DeploymentRepository;
}): Promise<number> {
  if (input.resourceChanges.length === 0) {
    return input.sequence;
  }

  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: input.resourceChanges.map((resourceChange, index) => ({
        sequence: input.sequence + index,
        stage: "plan",
        level: "INFO",
        message: `[optimization] event=resource_change action=${resourceChange.action} address=${resourceChange.resourceAddress}`,
        relatedResourceId: null
      }))
    },
    input.repository
  );

  return input.sequence + input.resourceChanges.length;
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

function isBuildEnvironmentPreparationFailure(error: unknown): boolean {
  return (
    error instanceof ProjectBuildEnvironmentError ||
    (error instanceof DirectApplicationReleaseError &&
      typeof error.code === "string" &&
      error.code.startsWith("BUILD_ENVIRONMENT_"))
  );
}

function createSha256(value: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function toTerraformCodeString(value: Buffer | Uint8Array | string): string {
  return typeof value === "string" ? value : Buffer.from(value).toString("utf8");
}
