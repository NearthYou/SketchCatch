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
import {
  assertDeploymentApplyPreconditions,
  DeploymentApplyPreconditionError
} from "./deployment-approval-service.js";
import {
  createS3DeploymentApplyArtifactStorage,
  type DeploymentApplyArtifactStorage
} from "./deployment-apply-artifact-storage.js";
import {
  extractDeployedResourcesFromTerraformStateJson,
  parseTerraformOutputsJson
} from "./deployment-apply-results.js";
import {
  appendDeploymentDurationLog,
  appendTerraformDurationLog,
  measureDeploymentDuration,
  runLoggedDeploymentOperation
} from "./deployment-duration-logs.js";
import { createDeploymentTerraformLiveLogWriter } from "./deployment-terraform-live-logs.js";
import { maskDeploymentMessage } from "./log-masking.js";
import {
  defaultDeploymentPlanDriftTtlMs,
  hashOptimizationValue,
  isTerraformPlanNoChange,
  parseDeploymentPlanOptimizationEvidence
} from "./deployment-optimization.js";
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
  runTerraformApply as defaultRunTerraformApply,
  runTerraformInit as defaultRunTerraformInit,
  runTerraformOutputJson as defaultRunTerraformOutputJson,
  runTerraformPlan as defaultRunTerraformPlan,
  runTerraformShowStateJson as defaultRunTerraformShowStateJson,
  terraformMutationTimeoutMs,
  type TerraformRunResult
} from "./terraform-runner.js";
import {
  assertTerraformArtifactIsSafe,
  containsArchiveFileDataSource
} from "./terraform-artifact-safety.js";
import {
  cleanupPreparedTerraformWorkspace,
  createTerraformFilesSafetyContent,
  prepareTerraformWorkspace as defaultPrepareTerraformWorkspace,
  type PreparedTerraformWorkspace
} from "./terraform-workspace.js";
import { restoreInfrastructureRollbackState } from "./infrastructure-rollback-state.js";
import {
  restoreTerraformLockFile,
  uploadTerraformLockFile
} from "./terraform-lock-file-workspace.js";
import { createAwsCodeBuildDirectApplicationReleaseGateway } from "./aws-codebuild-direct-application-release-gateway.js";
import {
  executeDirectApplicationRelease as defaultExecuteDirectApplicationRelease,
  reconcileDirectApplicationReleaseOutput as defaultReconcileDirectApplicationReleaseOutput,
  type DirectApplicationOutputReconciliationRepository,
  type DirectApplicationReleaseRepository
} from "./direct-application-release-service.js";
import type {
  TerraformOutputForEcsReconciliation,
  TerraformResourceForEcsReconciliation
} from "./ecs-fargate-output-reconciliation.js";
import {
  acquireProjectExecutionLease,
  heartbeatProjectExecutionLease,
  recordProjectExecutionCoordinates,
  releaseProjectExecutionLease,
  type LeaseFence,
  type ProjectExecutionLeaseRepository
} from "../releases/project-execution-lease-service.js";

const defaultPlanFileName = "tfplan";
const materializePlanFileName = "materialize.tfplan";

export type RunDeploymentApplyInput = {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  startedFromStatus?: DeploymentStatus;
  abortSignal?: AbortSignal;
  workerTaskArn?: string;
};

export type RunDeploymentApplyOptions = {
  prepareTerraformWorkspace?: typeof defaultPrepareTerraformWorkspace;
  runTerraformInit?: typeof defaultRunTerraformInit;
  runTerraformPlan?: typeof defaultRunTerraformPlan;
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
  writeTerraformStateFile?: (filePath: string, content: Buffer) => Promise<void>;
  generateResultId?: () => string;
  driftTtlMs?: number;
  now?: () => Date;
  executeApplicationRelease?: (input: {
    deployment: DeploymentRecord;
    accessContext: ProjectAccessContext;
    abortSignal?: AbortSignal;
    leaseFence?: LeaseFence;
    repository: DeploymentRepository;
  }) => Promise<
    void | "succeeded" | "partially_failed" | "cancelled" | "partially_cancelled"
  >;
  reconcileApplicationOutput?: (input: {
    deployment: DeploymentRecord;
    accessContext: ProjectAccessContext;
    outputs: readonly TerraformOutputForEcsReconciliation[];
    resources: readonly TerraformResourceForEcsReconciliation[];
    accountId: string;
    region: string;
    repository: DeploymentRepository;
  }) => Promise<void>;
  synchronizeDeploymentTargetAfterApply?: (input: {
    projectId: string;
    deploymentId: string;
    accessContext: ProjectAccessContext;
  }) => Promise<void>;
  projectExecutionLeaseRepository?: ProjectExecutionLeaseRepository;
  leaseHeartbeatIntervalMs?: number;
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
  const runTerraformPlan = options.runTerraformPlan ?? defaultRunTerraformPlan;
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
  const writeTerraformStateFile = options.writeTerraformStateFile ?? writeFile;
  const generateResultId = options.generateResultId ?? randomUUID;
  const driftTtlMs = options.driftTtlMs ?? defaultDeploymentPlanDriftTtlMs;
  const now = options.now ?? (() => new Date());
  const executeApplicationRelease =
    options.executeApplicationRelease ?? defaultExecuteApplicationRelease;
  const reconcileApplicationOutput =
    options.reconcileApplicationOutput ?? defaultReconcileApplicationOutput;
  const synchronizeDeploymentTargetAfterApply =
    options.synchronizeDeploymentTargetAfterApply ??
    repository.synchronizeDeploymentTargetAfterApply;

  let workspace: PreparedTerraformWorkspace | undefined;
  let workspacePromise: Promise<PreparedTerraformWorkspace> | undefined;
  let deploymentId: string | undefined;
  let failureRecorded = false;
  let applyLeaseFence: LeaseFence | undefined;
  let leaseHeartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let leaseHeartbeatPromise: Promise<void> | undefined;
  let leaseHeartbeatError: unknown;
  const leaseAbortController = new AbortController();
  const executionSignal = input.abortSignal
    ? AbortSignal.any([input.abortSignal, leaseAbortController.signal])
    : leaseAbortController.signal;
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
      applyLeaseFence = {
        projectId: lease.projectId,
        holderId: lease.holderId,
        fencingVersion: lease.fencingVersion
      };
      if (input.workerTaskArn) {
        await recordProjectExecutionCoordinates(
          { ...applyLeaseFence, activeWorkerTaskArn: input.workerTaskArn },
          leaseRepository,
          now()
        );
      }
      const heartbeatIntervalMs = options.leaseHeartbeatIntervalMs ?? 30_000;
      leaseHeartbeatTimer = setInterval(() => {
        if (leaseHeartbeatPromise || !applyLeaseFence) return;
        leaseHeartbeatPromise = heartbeatProjectExecutionLease(
          applyLeaseFence,
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
      }, heartbeatIntervalMs);
      leaseHeartbeatTimer.unref?.();
    }

    if ((input.startedFromStatus ?? deployment.status) === "SUCCESS") {
      throw new DeploymentConflictError("Deployment apply has already completed");
    }

    if (deployment.scope === "application") {
      return await runApplicationOnlyDeploymentApply({
        deployment,
        input: { ...input, abortSignal: executionSignal },
        repository,
        prepareTerraformWorkspace,
        applyArtifactStorage,
        readTerraformArtifactFile,
        executeApplicationRelease,
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {}),
        terraform
      });
    }

    const [terraformArtifact, currentPlanArtifact, awsConnection, currentReleaseCandidate] = await Promise.all([
      requireDeploymentTerraformArtifact(deployment, repository),
      requireCurrentPlanArtifact(deployment, repository),
      requireDeploymentAwsConnection(deployment, input.accessContext, repository),
      findCurrentReleaseCandidate(deployment, repository)
    ]);
    workspacePromise = prepareTerraformWorkspace({
      objectKey: terraformArtifact.objectKey,
      fileName: terraformArtifact.fileName,
      contentType: terraformArtifact.contentType
    }).then((preparedWorkspace) => {
      workspace = preparedWorkspace;
      return preparedWorkspace;
    });
    const [planBuffer, preparedWorkspace] = await Promise.all([
      applyArtifactStorage.downloadDeploymentArtifact({
        deploymentId: deployment.id,
        planArtifactId: currentPlanArtifact.id,
        objectKey: currentPlanArtifact.objectKey
      }),
      workspacePromise
    ]);
    workspace = preparedWorkspace;

    await restoreInfrastructureRollbackState({
      deployment,
      repository,
      storage: applyArtifactStorage,
      workspace: preparedWorkspace,
      writeStateFile: writeTerraformStateFile
    });

    const currentTerraformArtifactContent = await readTerraformArtifactFile(workspace.mainFilePath);
    const terraformSafetyContent = createTerraformFilesSafetyContent(
      workspace.terraformFiles,
      currentTerraformArtifactContent
    );
    assertTerraformArtifactIsSafe(terraformSafetyContent, { liveProfile: deployment.liveProfile });
    const currentTerraformArtifactHash = createSha256(currentTerraformArtifactContent);
    const currentTfplanHash = createSha256(planBuffer);

    assertDeploymentApplyPreconditions({
      deployment,
      currentPlanArtifact,
      currentTerraformArtifactHash,
      currentTfplanHash,
      currentAwsConnection: awsConnection,
      ...(currentReleaseCandidate ? { currentReleaseCandidate } : {})
    });

    const hasNoTerraformChanges =
      deployment.planSummary !== null && isTerraformPlanNoChange(deployment.planSummary);
    const hasVerifiedNoChangeEvidence = hasNoTerraformChanges
      ? await verifyNoChangeApplyEvidence({
          deployment,
          currentPlanArtifact,
          currentTerraformArtifactHash,
          currentTfplanHash,
          applyArtifactStorage,
          now: now(),
          driftTtlMs
        })
      : false;

    if (hasVerifiedNoChangeEvidence) {
      const wasPreMarkedRunning =
        deployment.status === "RUNNING" && input.startedFromStatus !== undefined;

      if (!wasPreMarkedRunning) {
        const runningDeployment = await repository.markDeploymentApplyRunning(deployment.id);

        if (!runningDeployment) {
          throw new DeploymentConflictError("Deployment apply could not be started");
        }
      }

      let sequence = await repository.getNextDeploymentLogSequence(deployment.id);
      sequence = await appendApplyOptimizationDecisionLog({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        outcome: "no_change",
        reason: "terraform_plan_no_changes",
        repository
      });

      const [existingResources, existingOutputs] = await Promise.all([
        repository.listDeployedResources(deployment.id),
        repository.listTerraformOutputs(deployment.id)
      ]);
      const applyResultSave = await runLoggedDeploymentOperation({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        stage: "apply",
        label: "no-change deployment apply result save",
        repository,
        operation: () =>
          repository.saveDeploymentApplyResults(deployment.id, {
            stateObjectKey: deployment.stateObjectKey,
            resultWarningSummary: deployment.resultWarningSummary,
            resources: existingResources.map((resource) => ({
              id: resource.id,
              deploymentId: resource.deploymentId,
              terraformAddress: resource.terraformAddress,
              terraformType: resource.terraformType,
              providerName: resource.providerName,
              resourceId: resource.resourceId,
              region: resource.region
            })),
            outputs: existingOutputs.map((output) => ({
              id: output.id,
              deploymentId: output.deploymentId,
              name: output.name,
              value: output.value,
              sensitive: output.sensitive
            }))
          })
      });

      if (!applyResultSave.result) {
        throw new DeploymentNotFoundError("Deployment not found");
      }
      sequence = applyResultSave.sequence;

      sequence = await synchronizeEcsDeploymentTargetAfterApply({
        deployment,
        accessContext: input.accessContext,
        sequence,
        repository,
        synchronizeDeploymentTargetAfterApply
      });

      if (deployment.scope !== "infrastructure") {
        const releaseExecution = await runLoggedDeploymentOperation({
          deploymentId: deployment.id,
          accessContext: input.accessContext,
          sequence,
          stage: "apply",
          label: "application runtime release",
          repository,
          operation: () =>
            executeApplicationRelease({
              deployment,
              accessContext: input.accessContext,
              repository,
              ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
            })
        });
        sequence = releaseExecution.sequence;
      }

      const completedDeployment = await repository.completeDeploymentApply(deployment.id, {
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {}),
        fenceCheckedAt: now()
      });
      if (!completedDeployment) {
        throw new DeploymentNotFoundError("Deployment not found");
      }

      return {
        deployment: completedDeployment,
        terraform
      };
    }

    if (hasNoTerraformChanges) {
      await appendApplyOptimizationDecisionLog({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence: await repository.getNextDeploymentLogSequence(deployment.id),
        outcome: "fallback_execute",
        reason: "cache_validation_failed",
        repository
      });
    }

    const stateBaseline = selectDeploymentStateBaseline(
      deployment,
      await repository.listDeploymentsByProject(deployment.projectId)
    );

    if (stateBaseline?.stateObjectKey) {
      const state = await applyArtifactStorage.downloadDeploymentState({
        deploymentId: stateBaseline.id,
        objectKey: stateBaseline.stateObjectKey
      });
      await writeTerraformStateFile(join(workspace.workdir, "terraform.tfstate"), state);
    }

    const [awsCredentials] = await Promise.all([
      prepareAwsCredentialsForApply({
        deploymentId: deployment.id,
        awsConnection,
        prepareTerraformAwsCredentialEnv,
        repository,
        markFailureRecorded: () => {
          failureRecorded = true;
        },
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
      }),
      restoreTerraformLockFile({
        deploymentId: deployment.id,
        workspace: preparedWorkspace,
        storage: applyArtifactStorage
      })
    ]);
    const wasPreMarkedRunning =
      deployment.status === "RUNNING" && input.startedFromStatus !== undefined;

    if (!wasPreMarkedRunning) {
      const runningDeployment = await repository.markDeploymentApplyRunning(deployment.id);

      if (!runningDeployment) {
        throw new DeploymentConflictError("Deployment apply could not be started");
      }
    }
    await writePlanFile(join(workspace.workdir, defaultPlanFileName), planBuffer);

    let sequence = await repository.getNextDeploymentLogSequence(deployment.id);

    const initLogWriter = createDeploymentTerraformLiveLogWriter({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "apply",
      repository
    });
    terraform.init = await runTerraformInit(workspace.workdir, {
      env: awsCredentials.env,
      onOutputLine: initLogWriter.onOutputLine,
      signal: executionSignal,
      timeoutMs: terraformMutationTimeoutMs
    });
    sequence = await initLogWriter.complete({
      label: "terraform init",
      result: terraform.init
    });

    if (terraform.init.cancelled) {
      return cancelDeploymentBeforeApplyRun({
        deployment,
        repository,
        terraform,
        errorSummary: "Terraform apply was cancelled during init before AWS resources were changed",
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
      });
    }

    if (terraform.init.exitCode !== 0) {
      return await failDeploymentApplyRun({
        deployment,
        repository,
        terraform,
        errorSummary: summarizeTerraformFailure("Terraform init before apply", terraform.init),
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
      });
    }

    const lockUpload = await runLoggedDeploymentOperation({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "apply",
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

    if (containsArchiveFileDataSource(terraformSafetyContent)) {
      const materializeLogWriter = createDeploymentTerraformLiveLogWriter({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        stage: "apply",
        repository
      });
      const materializeResult = await runTerraformPlan(workspace.workdir, {
        env: awsCredentials.env,
        onOutputLine: materializeLogWriter.onOutputLine,
        planFileName: materializePlanFileName,
        timeoutMs: terraformMutationTimeoutMs,
        signal: executionSignal
      });
      sequence = await materializeLogWriter.complete({
        label: "terraform plan for local apply files",
        result: materializeResult
      });

      if (materializeResult.cancelled) {
        return cancelDeploymentBeforeApplyRun({
          deployment,
          repository,
          terraform,
          errorSummary: "Terraform apply was cancelled while preparing local apply files",
          ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
        });
      }

      if (materializeResult.exitCode !== 0) {
        return await failDeploymentApplyRun({
          deployment,
          repository,
          terraform,
          errorSummary: summarizeTerraformFailure(
            "Terraform plan for local apply files",
            materializeResult
          ),
          ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
        });
      }
    }

    const applyLogWriter = createDeploymentTerraformLiveLogWriter({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "apply",
      repository
    });
    terraform.apply = await runTerraformApply(workspace.workdir, {
      env: awsCredentials.env,
      onOutputLine: applyLogWriter.onOutputLine,
      planFileName: defaultPlanFileName,
      timeoutMs: terraformMutationTimeoutMs,
      signal: executionSignal
    });
    sequence = await applyLogWriter.complete({
      label: "terraform apply tfplan",
      result: terraform.apply
    });

    if (terraform.apply.cancelled) {
      const partialState = await uploadPartialStateAfterFailedApply({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        workspace,
        applyArtifactStorage,
        repository
      });

      return await failDeploymentApplyRun({
        deployment,
        repository,
        terraform,
        stateObjectKey: partialState.stateObjectKey,
        resultWarningSummary: partialState.warningSummary,
        errorSummary:
          "Terraform apply was cancelled. AWS resources may have been partially changed; verify resources before retry.",
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
      });
    }

    if (terraform.apply.exitCode !== 0) {
      const partialState = await uploadPartialStateAfterFailedApply({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        workspace,
        applyArtifactStorage,
        repository
      });

      return await failDeploymentApplyRun({
        deployment,
        repository,
        terraform,
        stateObjectKey: partialState.stateObjectKey,
        resultWarningSummary: partialState.warningSummary,
        errorSummary: summarizeTerraformFailure("Terraform apply", terraform.apply),
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
      });
    }

    const warnings: string[] = [];
    let stateObjectKey: string | null = null;
    let outputs = parseOptionalTerraformOutputs([]);
    let resources = extractOptionalDeployedResources([]);

    terraform.outputJson = await runTerraformOutputJson(workspace.workdir, {
      env: awsCredentials.env,
      signal: executionSignal
    });
    sequence = await appendTerraformApplyStderr({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      label: "terraform output -json",
      result: terraform.outputJson,
      repository
    });

    if (terraform.outputJson.cancelled) {
      warnings.push("Terraform output collection was cancelled after successful apply");
    } else if (terraform.outputJson.exitCode === 0) {
      try {
        outputs = parseOptionalTerraformOutputs(parseTerraformOutputsJson(terraform.outputJson.stdout));
      } catch (error) {
        warnings.push(summarizePostApplyWarning("Terraform output parse", error));
      }
    } else {
      warnings.push(summarizeTerraformFailure("Terraform output", terraform.outputJson));
    }

    terraform.showStateJson = await runTerraformShowStateJson(workspace.workdir, {
      env: awsCredentials.env,
      signal: executionSignal
    });
    sequence = await appendTerraformApplyStderr({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      label: "terraform show -json",
      result: terraform.showStateJson,
      repository
    });

    if (terraform.showStateJson.cancelled) {
      warnings.push("Terraform state inspection was cancelled after successful apply");
    } else if (terraform.showStateJson.exitCode === 0) {
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
      const stateUpload = await runLoggedDeploymentOperation({
        deploymentId: deployment.id,
        accessContext: input.accessContext,
        sequence,
        stage: "apply",
        label: "terraform state upload",
        repository,
        operation: () =>
          applyArtifactStorage.uploadDeploymentState({
            deploymentId: deployment.id,
            stateFilePath: join(workspace!.workdir, "terraform.tfstate")
          })
      });
      stateObjectKey = stateUpload.result.objectKey;
      sequence = stateUpload.sequence;
    } catch (error) {
      warnings.push(summarizePostApplyWarning("Terraform state upload", error));
    }

    sequence = await appendApplyWarnings({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      warnings,
      repository
    });

    const applyResults = {
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
    };
    const applyResultSave = await runLoggedDeploymentOperation({
      deploymentId: deployment.id,
      accessContext: input.accessContext,
      sequence,
      stage: "apply",
      label: "deployment apply result save",
      repository,
      operation: () => repository.saveDeploymentApplyResults(deployment.id, applyResults)
    });
    sequence = applyResultSave.sequence;
    if (!applyResultSave.result) {
      throw new DeploymentNotFoundError("Deployment not found");
    }

    sequence = await synchronizeEcsDeploymentTargetAfterApply({
      deployment,
      accessContext: input.accessContext,
      sequence,
      repository,
      synchronizeDeploymentTargetAfterApply
    });

    if (deployment.scope === "full_stack") {
      try {
        const reconciliation = await runLoggedDeploymentOperation({
          deploymentId: deployment.id,
          accessContext: input.accessContext,
          sequence,
          stage: "apply",
          label: "application output reconciliation",
          repository,
          operation: () =>
            reconcileApplicationOutput({
              deployment,
              accessContext: input.accessContext,
              outputs,
              resources,
              accountId: awsConnection.accountId,
              region: awsConnection.region,
              repository
            })
        });
        sequence = reconciliation.sequence;
      } catch (error) {
        return await failDeploymentApplyRun({
          deployment,
          repository,
          terraform,
          stateObjectKey,
          resultWarningSummary: applyResults.resultWarningSummary,
          errorSummary: maskDeploymentMessage(
            `Application output reconciliation failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          ),
          ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
        });
      }
    }

    let applicationReleaseOutcome:
      | void
      | "succeeded"
      | "partially_failed"
      | "cancelled"
      | "partially_cancelled" = undefined;
    if (deployment.scope !== "infrastructure") {
      try {
        await repository.markDeploymentActiveStage?.(deployment.id, "application_release");
        const releaseExecution = await runLoggedDeploymentOperation({
          deploymentId: deployment.id,
          accessContext: input.accessContext,
          sequence,
          stage: "apply",
          label: "application runtime release",
          repository,
          operation: () =>
            executeApplicationRelease({
              deployment,
              accessContext: input.accessContext,
              repository,
              ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {}),
              ...(executionSignal ? { abortSignal: executionSignal } : {})
            })
        });
        sequence = releaseExecution.sequence;
        applicationReleaseOutcome = releaseExecution.result;
      } catch (error) {
        return await failDeploymentApplyRun({
          deployment,
          repository,
          terraform,
          stateObjectKey,
          resultWarningSummary: applyResults.resultWarningSummary,
          errorSummary: maskDeploymentMessage(
            `Application runtime release failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          ),
          ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
        });
      }
    }

    if (applicationReleaseOutcome === "partially_failed") {
      const partialDeployment = await getDeployment(
        { deploymentId: deployment.id, accessContext: input.accessContext },
        repository
      );
      if (partialDeployment.status !== "PARTIALLY_FAILED") {
        throw new DeploymentConflictError("Partial application release state was not persisted");
      }
      return { deployment: partialDeployment, terraform };
    }
    if (
      applicationReleaseOutcome === "cancelled" ||
      applicationReleaseOutcome === "partially_cancelled"
    ) {
      return finishCancelledApplicationRelease({
        deployment,
        accessContext: input.accessContext,
        outcome: applicationReleaseOutcome,
        repository,
        terraform,
        ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
      });
    }

    const completedDeployment = await repository.completeDeploymentApply(deployment.id, {
      ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {}),
      fenceCheckedAt: now()
    });

    if (!completedDeployment) {
      throw new DeploymentNotFoundError("Deployment not found");
    }

    return {
      deployment: completedDeployment,
      terraform
    };
  } catch (error) {
    const terminalError = leaseHeartbeatError ?? error;
    if (deploymentId && !failureRecorded) {
      const errorSummary = summarizeUnexpectedApplyFailure(terminalError);

      if (terminalError instanceof DeploymentApplyPreconditionError) {
        await appendApplyPreconditionFailureLog({
          deploymentId,
          accessContext: input.accessContext,
          errorSummary,
          repository
        }).catch(() => undefined);
      }

      await repository
        .failDeployment(deploymentId, {
          failureStage:
            terminalError instanceof DeploymentApplyPreconditionError ? "approval" : "apply",
          errorSummary,
          ...(applyLeaseFence ? { leaseFence: applyLeaseFence } : {})
        })
        .catch(() => undefined);
    }

    throw terminalError;
  } finally {
    if (leaseHeartbeatTimer) clearInterval(leaseHeartbeatTimer);
    await leaseHeartbeatPromise?.catch(() => undefined);
    const leaseRepository =
      options.projectExecutionLeaseRepository ?? repository.projectExecutionLeaseRepository;
    if (applyLeaseFence && leaseRepository) {
      await releaseProjectExecutionLease(applyLeaseFence, leaseRepository).catch(() => false);
    }
    await cleanupPreparedTerraformWorkspace({ workspace, workspacePromise });
  }
}

async function runApplicationOnlyDeploymentApply(input: {
  deployment: DeploymentRecord;
  input: RunDeploymentApplyInput;
  repository: DeploymentRepository;
  prepareTerraformWorkspace: typeof defaultPrepareTerraformWorkspace;
  applyArtifactStorage: DeploymentApplyArtifactStorage;
  readTerraformArtifactFile: (filePath: string) => Promise<Buffer | Uint8Array | string>;
  executeApplicationRelease: NonNullable<RunDeploymentApplyOptions["executeApplicationRelease"]>;
  leaseFence?: LeaseFence;
  terraform: RunDeploymentApplyResult["terraform"];
}): Promise<RunDeploymentApplyResult> {
  let workspace: PreparedTerraformWorkspace | undefined;
  let workspacePromise: Promise<PreparedTerraformWorkspace> | undefined;
  try {
    const [terraformArtifact, currentPlanArtifact, awsConnection, currentReleaseCandidate] = await Promise.all([
      requireDeploymentTerraformArtifact(input.deployment, input.repository),
      requireCurrentPlanArtifact(input.deployment, input.repository),
      requireDeploymentAwsConnection(
        input.deployment,
        input.input.accessContext,
        input.repository
      ),
      findCurrentReleaseCandidate(input.deployment, input.repository)
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
    const terraformArtifactContent = await input.readTerraformArtifactFile(
      preparedWorkspace.mainFilePath
    );
    assertDeploymentApplyPreconditions({
      deployment: input.deployment,
      currentPlanArtifact,
      currentTerraformArtifactHash: createSha256(terraformArtifactContent),
      currentTfplanHash: createSha256(planBuffer),
      currentAwsConnection: awsConnection,
      ...(currentReleaseCandidate ? { currentReleaseCandidate } : {})
    });
    const wasPreMarkedRunning =
      input.deployment.status === "RUNNING" && input.input.startedFromStatus !== undefined;
    if (!wasPreMarkedRunning) {
      const running = await input.repository.markDeploymentApplyRunning(input.deployment.id);
      if (!running) throw new DeploymentConflictError("Application release could not be started");
    }
    await input.repository.markDeploymentActiveStage?.(
      input.deployment.id,
      "application_release"
    );
    const sequence = await input.repository.getNextDeploymentLogSequence(input.deployment.id);
    try {
      const releaseExecution = await runLoggedDeploymentOperation({
        deploymentId: input.deployment.id,
        accessContext: input.input.accessContext,
        sequence,
        stage: "apply",
        label: "application runtime release",
        repository: input.repository,
        operation: () =>
          input.executeApplicationRelease({
            deployment: input.deployment,
            accessContext: input.input.accessContext,
            repository: input.repository,
            ...(input.leaseFence ? { leaseFence: input.leaseFence } : {}),
            ...(input.input.abortSignal ? { abortSignal: input.input.abortSignal } : {})
          })
      });
      if (releaseExecution.result === "partially_failed") {
        const partialDeployment = await getDeployment(
          {
            deploymentId: input.deployment.id,
            accessContext: input.input.accessContext
          },
          input.repository
        );
        if (partialDeployment.status !== "PARTIALLY_FAILED") {
          throw new DeploymentConflictError("Partial application release state was not persisted");
        }
        return { deployment: partialDeployment, terraform: input.terraform };
      }
      if (
        releaseExecution.result === "cancelled" ||
        releaseExecution.result === "partially_cancelled"
      ) {
        return finishCancelledApplicationRelease({
          deployment: input.deployment,
          accessContext: input.input.accessContext,
          outcome: releaseExecution.result,
          repository: input.repository,
          terraform: input.terraform,
          ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
        });
      }
    } catch (error) {
      return await failDeploymentApplyRun({
        deployment: input.deployment,
        repository: input.repository,
        terraform: input.terraform,
        errorSummary: maskDeploymentMessage(
          `Application runtime release failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        ),
        ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
      });
    }
    const completed = await input.repository.completeDeploymentApply(input.deployment.id, {
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    });
    if (!completed) throw new DeploymentNotFoundError("Deployment not found");
    return { deployment: completed, terraform: input.terraform };
  } finally {
    await cleanupPreparedTerraformWorkspace({ workspace, workspacePromise });
  }
}

async function defaultExecuteApplicationRelease(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  abortSignal?: AbortSignal;
  leaseFence?: LeaseFence;
  repository: DeploymentRepository;
}): Promise<"succeeded" | "partially_failed" | "cancelled" | "partially_cancelled"> {
  const release = await defaultExecuteDirectApplicationRelease(
    {
      deploymentId: input.deployment.id,
      userId: input.accessContext.userId,
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {}),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {})
    },
    requireDirectApplicationReleaseRepository(input.repository),
    createAwsCodeBuildDirectApplicationReleaseGateway()
  );
  if (release?.status === "partially_failed") return "partially_failed";
  if (release?.status === "cancelled") return "cancelled";
  if (release?.status === "partially_cancelled") return "partially_cancelled";
  if (release && release.status !== "succeeded") {
    throw new DirectApplicationReleaseOutcomeError(
      `Application runtime release ended as ${release.status}`
    );
  }
  return "succeeded";
}

async function finishCancelledApplicationRelease(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  outcome: "cancelled" | "partially_cancelled";
  repository: DeploymentRepository;
  terraform: RunDeploymentApplyResult["terraform"];
  leaseFence?: LeaseFence;
}): Promise<RunDeploymentApplyResult> {
  if (input.outcome === "cancelled") {
    return cancelDeploymentBeforeApplyRun({
      deployment: input.deployment,
      repository: input.repository,
      terraform: input.terraform,
      errorSummary: "Application release was safely cancelled and ECS was restored",
      ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
    });
  }
  const partial = await getDeployment(
    { deploymentId: input.deployment.id, accessContext: input.accessContext },
    input.repository
  );
  if (partial.status !== "PARTIALLY_CANCELED") {
    throw new DeploymentConflictError("Partial application cancellation state was not persisted");
  }
  return { deployment: partial, terraform: input.terraform };
}

async function defaultReconcileApplicationOutput(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  outputs: readonly TerraformOutputForEcsReconciliation[];
  resources: readonly TerraformResourceForEcsReconciliation[];
  accountId: string;
  region: string;
  repository: DeploymentRepository;
}): Promise<void> {
  await defaultReconcileDirectApplicationReleaseOutput(
    {
      deploymentId: input.deployment.id,
      userId: input.accessContext.userId,
      outputs: input.outputs,
      resources: input.resources,
      accountId: input.accountId,
      region: input.region
    },
    requireDirectApplicationOutputReconciliationRepository(input.repository)
  );
}

class DirectApplicationReleaseOutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectApplicationReleaseOutcomeError";
  }
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

function requireDirectApplicationOutputReconciliationRepository(
  repository: DeploymentRepository
): DirectApplicationOutputReconciliationRepository {
  if (!repository.findContext || !repository.findRelease || !repository.reconcileEcsFargateOutput) {
    throw new DeploymentConflictError(
      "Direct application output reconciliation repository is unavailable"
    );
  }
  return {
    findContext: repository.findContext.bind(repository),
    findRelease: repository.findRelease.bind(repository),
    reconcileEcsFargateOutput: repository.reconcileEcsFargateOutput.bind(repository)
  };
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

async function findCurrentReleaseCandidate(
  deployment: DeploymentRecord,
  repository: DeploymentRepository
) {
  if (deployment.scope === "infrastructure") return undefined;
  if (!deployment.releaseCandidateId || !repository.findReleaseCandidateById) {
    throw new DeploymentConflictError(
      "A finalized ReleaseCandidate is required before application apply"
    );
  }
  return repository.findReleaseCandidateById(deployment.releaseCandidateId);
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

async function prepareAwsCredentialsForApply(input: {
  deploymentId: string;
  awsConnection: AwsConnection;
  prepareTerraformAwsCredentialEnv: (
    awsConnection: AwsConnection
  ) => Promise<PreparedTerraformAwsCredentialEnv>;
  repository: DeploymentRepository;
  markFailureRecorded: () => void;
  leaseFence?: LeaseFence;
}): Promise<PreparedTerraformAwsCredentialEnv> {
  try {
    return await input.prepareTerraformAwsCredentialEnv(input.awsConnection);
  } catch (error) {
    await input.repository
      .failDeployment(input.deploymentId, {
        failureStage: "aws_connection",
        errorSummary: summarizeUnexpectedApplyFailure(error),
        ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
      })
      .catch(() => undefined);
    input.markFailureRecorded();

    throw error;
  }
}

async function verifyNoChangeApplyEvidence(input: {
  deployment: DeploymentRecord;
  currentPlanArtifact: Awaited<ReturnType<typeof requireCurrentPlanArtifact>>;
  currentTerraformArtifactHash: string;
  currentTfplanHash: string;
  applyArtifactStorage: DeploymentApplyArtifactStorage;
  now: Date;
  driftTtlMs: number;
}): Promise<boolean> {
  const downloadEvidence =
    input.applyArtifactStorage.downloadDeploymentPlanOptimizationEvidence;

  if (!downloadEvidence || !input.deployment.planSummary) {
    return false;
  }

  try {
    const content = await downloadEvidence.call(input.applyArtifactStorage, {
      deploymentId: input.deployment.id,
      planArtifactId: input.currentPlanArtifact.id
    });

    if (!content) {
      return false;
    }

    const evidence = parseDeploymentPlanOptimizationEvidence(content);
    const verifiedAt = Date.parse(evidence.driftVerifiedAt);
    const ageMs = input.now.getTime() - verifiedAt;

    return (
      evidence.projectId === input.deployment.projectId &&
      evidence.deploymentId === input.deployment.id &&
      evidence.planArtifactId === input.currentPlanArtifact.id &&
      evidence.planArtifactSha256 === input.currentPlanArtifact.sha256 &&
      evidence.planArtifactSha256 === input.currentTfplanHash &&
      evidence.desiredStateIdentity.terraformBundleSha256 ===
        input.currentTerraformArtifactHash &&
      evidence.planSummarySha256 === hashOptimizationValue(input.deployment.planSummary) &&
      Number.isFinite(verifiedAt) &&
      ageMs >= 0 &&
      ageMs <= input.driftTtlMs &&
      input.driftTtlMs >= 0 &&
      evidence.resourceChanges.every(
        (resourceChange) =>
          resourceChange.action === "no_change" || resourceChange.action === "read"
      )
    );
  } catch {
    return false;
  }
}

async function appendApplyOptimizationDecisionLog(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  outcome: "no_change" | "fallback_execute";
  reason: "terraform_plan_no_changes" | "cache_validation_failed";
  repository: DeploymentRepository;
}): Promise<number> {
  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: [
        {
          sequence: input.sequence,
          stage: "apply",
          level: "INFO",
          message: `[optimization] event=apply_decision outcome=${input.outcome} reason=${input.reason}`,
          relatedResourceId: null
        }
      ]
    },
    input.repository
  );

  return input.sequence + 1;
}

async function cancelDeploymentBeforeApplyRun(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  terraform: RunDeploymentApplyResult["terraform"];
  errorSummary: string;
  leaseFence?: LeaseFence;
}): Promise<RunDeploymentApplyResult> {
  const cancelledDeployment = await input.repository.cancelDeployment(input.deployment.id, {
    errorSummary: input.errorSummary,
    ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
  });

  if (!cancelledDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return {
    deployment: cancelledDeployment,
    terraform: input.terraform
  };
}

async function failDeploymentApplyRun(input: {
  deployment: DeploymentRecord;
  repository: DeploymentRepository;
  terraform: RunDeploymentApplyResult["terraform"];
  errorSummary: string;
  stateObjectKey?: string | null;
  resultWarningSummary?: string | null;
  leaseFence?: LeaseFence;
}): Promise<RunDeploymentApplyResult> {
  const failureInput: Parameters<DeploymentRepository["failDeployment"]>[1] = {
    failureStage: "apply",
    errorSummary: input.errorSummary,
    ...(input.leaseFence ? { leaseFence: input.leaseFence } : {})
  };

  if (input.stateObjectKey !== undefined) {
    failureInput.stateObjectKey = input.stateObjectKey;
  }

  if (input.resultWarningSummary !== undefined) {
    failureInput.resultWarningSummary = input.resultWarningSummary;
  }

  const failedDeployment = await input.repository.failDeployment(input.deployment.id, {
    ...failureInput
  });

  if (!failedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  return {
    deployment: failedDeployment,
    terraform: input.terraform
  };
}

async function uploadPartialStateAfterFailedApply(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  workspace: PreparedTerraformWorkspace;
  applyArtifactStorage: DeploymentApplyArtifactStorage;
  repository: DeploymentRepository;
}): Promise<{ stateObjectKey: string | null; warningSummary: string | null }> {
  const warningSummary =
    "Partial Terraform state was saved after failed apply for explicit cleanup destroy.";
  let stateUpload: Awaited<
    ReturnType<typeof input.applyArtifactStorage.uploadDeploymentState>
  >;
  let stateUploadDurationMs: number;

  try {
    const measuredStateUpload = await measureDeploymentDuration(() =>
      input.applyArtifactStorage.uploadDeploymentState({
        deploymentId: input.deploymentId,
        stateFilePath: join(input.workspace.workdir, "terraform.tfstate")
      })
    );
    stateUpload = measuredStateUpload.result;
    stateUploadDurationMs = measuredStateUpload.durationMs;
  } catch (error) {
    const uploadWarningSummary = summarizePostApplyWarning("Partial Terraform state upload", error);

    await appendApplyWarnings({
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      sequence: input.sequence,
      warnings: [uploadWarningSummary],
      repository: input.repository
    }).catch(() => undefined);

    return {
      stateObjectKey: null,
      warningSummary: uploadWarningSummary
    };
  }

  const saveDeploymentApplyState = input.repository.saveDeploymentApplyState;
  if (!saveDeploymentApplyState) {
    throw new DeploymentConflictError("Deployment apply state persistence is unavailable");
  }
  const persistedDeployment = await saveDeploymentApplyState.call(
    input.repository,
    input.deploymentId,
    {
      stateObjectKey: stateUpload.objectKey,
      resultWarningSummary: warningSummary
    }
  );
  if (!persistedDeployment) {
    throw new DeploymentNotFoundError("Deployment not found");
  }

  const nextSequence = await appendDeploymentDurationLog({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    stage: "apply",
    label: "partial terraform state upload",
    durationMs: stateUploadDurationMs,
    repository: input.repository
  }).catch(() => input.sequence);

  await appendApplyWarnings({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: nextSequence,
    warnings: [warningSummary],
    repository: input.repository
  }).catch(() => undefined);

  return {
    stateObjectKey: stateUpload.objectKey,
    warningSummary
  };
}

async function appendApplyPreconditionFailureLog(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  errorSummary: string;
  repository: DeploymentRepository;
}): Promise<void> {
  const sequence = await input.repository.getNextDeploymentLogSequence(input.deploymentId);

  await appendDeploymentLogs(
    {
      deploymentId: input.deploymentId,
      accessContext: input.accessContext,
      logs: [
        {
          sequence,
          stage: "apply",
          level: "ERROR",
          message: `Apply blocked before Terraform apply: ${input.errorSummary}`,
          relatedResourceId: null
        }
      ]
    },
    input.repository
  );
}

async function appendTerraformApplyStderr(input: {
  deploymentId: string;
  accessContext: ProjectAccessContext;
  sequence: number;
  label: string;
  result: TerraformRunResult;
  repository: DeploymentRepository;
}): Promise<number> {
  const nextSequence = await appendOutputLines({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: input.sequence,
    output: input.result.stderr,
    level: input.result.exitCode === 0 ? "WARN" : "ERROR",
    repository: input.repository
  });

  return appendTerraformDurationLog({
    deploymentId: input.deploymentId,
    accessContext: input.accessContext,
    sequence: nextSequence,
    stage: "apply",
    label: input.label,
    result: input.result,
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

async function synchronizeEcsDeploymentTargetAfterApply(input: {
  deployment: DeploymentRecord;
  accessContext: ProjectAccessContext;
  sequence: number;
  repository: DeploymentRepository;
  synchronizeDeploymentTargetAfterApply:
    | NonNullable<RunDeploymentApplyOptions["synchronizeDeploymentTargetAfterApply"]>
    | undefined;
}): Promise<number> {
  if (
    !input.synchronizeDeploymentTargetAfterApply ||
    input.deployment.scope !== "infrastructure" ||
    input.deployment.targetKind !== "ecs_fargate"
  ) {
    return input.sequence;
  }

  try {
    await input.synchronizeDeploymentTargetAfterApply({
      projectId: input.deployment.projectId,
      deploymentId: input.deployment.id,
      accessContext: input.accessContext
    });
    return input.sequence;
  } catch (error) {
    try {
      return await appendApplyWarnings({
        deploymentId: input.deployment.id,
        accessContext: input.accessContext,
        sequence: input.sequence,
        warnings: [
          summarizePostApplyWarning("Deployment target metadata synchronization", error)
        ],
        repository: input.repository
      });
    } catch {
      try {
        return await input.repository.getNextDeploymentLogSequence(input.deployment.id);
      } catch {
        return input.sequence;
      }
    }
  }
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
    if (stage === "Terraform apply") {
      return `${stage} timed out. AWS resources may have been partially changed; verify resources before retry.`;
    }

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
