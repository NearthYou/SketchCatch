import "./config/load-env.js";
import { assertNoStaticAwsCredentialsForApiServer } from "./config/env.js";
import { closeDatabaseClient } from "./db/client.js";
import { maskDeploymentMessage } from "./deployments/log-masking.js";
import { createGitHubReleaseRunExecutor } from "./git-cicd/github-release-run-executor.js";

async function main(): Promise<void> {
  let exitCode = 0;
  try {
    assertNoStaticAwsCredentialsForApiServer();
    const runId = process.env.SKETCHCATCH_GITHUB_RELEASE_RUN_ID?.trim();
    if (!runId) throw new Error("SKETCHCATCH_GITHUB_RELEASE_RUN_ID is required");
    const mode = process.env.SKETCHCATCH_GITHUB_RELEASE_WORKER_MODE?.trim() || "execute";
    const executor = createGitHubReleaseRunExecutor({ dispatchToWorker: false });
    if (mode === "recover") {
      await executor.recoverInterruptedRuns(runId);
    } else if (mode === "retry_frontend") {
      await executor.executeFrontendRetryNow(runId);
    } else if (mode === "execute") {
      await executor.executeNow(runId);
    } else {
      throw new Error("SKETCHCATCH_GITHUB_RELEASE_WORKER_MODE is invalid");
    }
  } catch (error) {
    console.error(
      `GitHub release worker failed: ${maskDeploymentMessage(
        error instanceof Error ? error.message : "Unknown GitHub release worker failure"
      )}`
    );
    exitCode = 1;
  } finally {
    await closeDatabaseClient().catch(() => {
      exitCode = 1;
    });
    process.exit(exitCode);
  }
}

void main();
