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
import { maskDeploymentMessage } from "./deployments/log-masking.js";

async function runDeploymentWorker(): Promise<void> {
  assertNoStaticAwsCredentialsForApiServer();

  const jobId = requireDeploymentWorkerJobId(process.env);
  const { db } = getDatabaseClient();
  const jobRepository = createPostgresDeploymentJobRepository(db);
  const deploymentRepository = createPostgresDeploymentRepository(db);

  await runDeploymentWorkerJob(
    { jobId },
    jobRepository,
    createDeploymentWorkerOperationRunner(deploymentRepository)
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
