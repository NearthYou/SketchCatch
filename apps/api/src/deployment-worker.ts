import "./config/load-env.js";
import { assertNoStaticAwsCredentialsForApiServer } from "./config/env.js";
import { closeDatabaseClient, getDatabaseClient } from "./db/client.js";
import {
  createPostgresDeploymentJobRepository
} from "./deployments/deployment-job-service.js";
import {
  createDeploymentWorkerOperationRunner,
  requireDeploymentWorkerJobId,
  runDeploymentWorkerJob
} from "./deployments/deployment-worker-service.js";
import {
  createPostgresDeploymentRepository
} from "./deployments/deployment-service.js";
import { getDeployment } from "./deployments/deployment-service.js";
import {
  createInterruptedDirectApplicationReleaseRecovery,
  recoverInterruptedDirectPreflightCancellation
} from "./deployments/direct-release-recovery-orchestrator.js";
import { maskDeploymentMessage } from "./deployments/log-masking.js";
import {
  createPostgresDirectApplicationReleaseRepository,
  retryDirectApplicationFrontendRelease
} from "./deployments/direct-application-release-service.js";
import { createAwsCodeBuildDirectApplicationReleaseGateway } from "./deployments/aws-codebuild-direct-application-release-gateway.js";

async function runDeploymentWorker(): Promise<void> {
  assertNoStaticAwsCredentialsForApiServer();

  const jobId = requireDeploymentWorkerJobId(process.env);
  const { db } = getDatabaseClient();
  const jobRepository = createPostgresDeploymentJobRepository(db);
  const deploymentRepository = createPostgresDeploymentRepository(db);
  const defaultRunner = createDeploymentWorkerOperationRunner(deploymentRepository);
  const recoverApplicationRelease = createInterruptedDirectApplicationReleaseRecovery({ db });

  await runDeploymentWorkerJob(
    { jobId },
    jobRepository,
    async (input) => {
      if (input.operation === "retry_application_frontend") {
        await retryDirectApplicationFrontendRelease(
          { deploymentId: input.deploymentId, userId: input.accessContext.userId },
          createPostgresDirectApplicationReleaseRepository(db),
          createAwsCodeBuildDirectApplicationReleaseGateway()
        );
        const deployment = await getDeployment(
          { deploymentId: input.deploymentId, accessContext: input.accessContext },
          deploymentRepository
        );
        return { status: deployment.status, errorSummary: deployment.errorSummary };
      }
      if (input.operation !== "recover_application_release") {
        return defaultRunner(input);
      }
      const recovery = await recoverApplicationRelease({
        excludeDeploymentIds: [],
        onlyDeploymentIds: [input.deploymentId],
        stopActiveCodeBuild: true,
        recoveryWorkerTaskArn: input.workerTaskArn
      });
      let recovered = recovery.recoveredDeploymentIds.includes(input.deploymentId);
      if (!recovered) {
        recovered = await recoverInterruptedDirectPreflightCancellation({
          db,
          deploymentId: input.deploymentId,
          userId: input.accessContext.userId,
          recoveryWorkerTaskArn: input.workerTaskArn
        });
      }
      if (!recovered) {
        throw new Error("Direct application release recovery must be retried");
      }
      const deployment = await getDeployment(
        {
          deploymentId: input.deploymentId,
          accessContext: input.accessContext
        },
        deploymentRepository
      );
      return {
        status: deployment.status,
        errorSummary: deployment.errorSummary
      };
    }
  );
}

async function main(): Promise<void> {
  let exitCode = 0;

  try {
    await runDeploymentWorker();
  } catch (error) {
    reportWorkerFailure(error);
    exitCode = 1;
  } finally {
    try {
      await closeDatabaseClient();
    } catch (error) {
      reportWorkerFailure(error);
      exitCode = 1;
    }
    process.exit(exitCode);
  }
}

function reportWorkerFailure(error: unknown): void {
  const message = maskDeploymentMessage(
    error instanceof Error ? error.message : "Unknown deployment worker failure"
  );
  console.error(`Deployment worker failed: ${message}`);
  process.exitCode = 1;
}

void main();
