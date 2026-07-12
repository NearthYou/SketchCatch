import { getDatabaseClient } from "./db/client.js";
import {
  assertNoStaticAwsCredentialsForApiServer,
  getDeploymentWorkerMode,
  requireDatabaseUrl
} from "./config/env.js";
import { createPostgresDeploymentJobRepository } from "./deployments/deployment-job-service.js";
import { createPostgresDeploymentRepository } from "./deployments/deployment-service.js";
import {
  reconcileDeploymentStartup,
  type DeploymentStartupReconciliationResult
} from "./deployments/deployment-startup-reconciliation.js";
import { createConfiguredDeploymentWorkerDispatcher } from "./deployments/deployment-worker-dispatcher.js";
import { warmTerraformPluginCache as defaultWarmTerraformPluginCache } from "./deployments/terraform-plugin-cache-warmup.js";
import type { TerraformRunResult } from "./deployments/terraform-runner.js";

const deploymentDispatchGracePeriodMs = 5 * 60 * 1000;

type StartupLogger = {
  info: (messageOrObject: unknown, message?: string) => void;
  warn: (messageOrObject: unknown, message?: string) => void;
};

export type StartupApp = {
  listen: (options: { host: string; port: number }) => Promise<unknown>;
  log: StartupLogger;
};

export type StartApiServerOptions = {
  app: StartupApp;
  host: string;
  port: number;
  validateAwsCredentialSource?: () => void;
  warmTerraformPluginCache?: () => Promise<TerraformRunResult>;
  recoverInterruptedDeployments?: (
    logger?: StartupLogger
  ) => Promise<DeploymentStartupReconciliationResult | unknown[]>;
  scheduleRecoveryRetry?: (callback: () => Promise<void>, delayMs: number) => void;
};

export async function startApiServer(options: StartApiServerOptions): Promise<void> {
  const validateAwsCredentialSource =
    options.validateAwsCredentialSource ?? assertNoStaticAwsCredentialsForApiServer;
  const warmTerraformPluginCache =
    options.warmTerraformPluginCache ?? defaultWarmTerraformPluginCache;
  const recoverInterruptedDeployments =
    options.recoverInterruptedDeployments ?? defaultRecoverInterruptedDeployments;

  validateAwsCredentialSource();
  requireDatabaseUrl();
  await warmTerraformCacheBeforeListen(options.app, warmTerraformPluginCache);
  const recoveryResult = await recoverInterruptedDeploymentsBeforeListen(
    options.app,
    recoverInterruptedDeployments
  );
  await options.app.listen({ host: options.host, port: options.port });
  options.app.log.info(`SketchCatch API listening on ${options.host}:${options.port}`);

  const scheduleRecoveryRetry = options.scheduleRecoveryRetry ?? scheduleDefaultRecoveryRetry;
  const scheduleNextRecovery = () => {
    scheduleRecoveryRetry(async () => {
      const retryResult = await recoverInterruptedDeploymentsBeforeListen(
        options.app,
        recoverInterruptedDeployments
      );

      if (retryResult.recoveryRetryCount > 0) {
        scheduleNextRecovery();
      }
    }, deploymentDispatchGracePeriodMs);
  };

  if (recoveryResult.recoveryRetryCount > 0) {
    scheduleNextRecovery();
  }
}

async function defaultRecoverInterruptedDeployments(
  logger?: StartupLogger
): Promise<DeploymentStartupReconciliationResult> {
  const client = getDatabaseClient();
  const deploymentRepository = createPostgresDeploymentRepository(client.db);
  const jobRepository = createPostgresDeploymentJobRepository(client.db);
  const workerMode = getDeploymentWorkerMode();
  const dispatcher =
    workerMode === "ecs" ? createConfiguredDeploymentWorkerDispatcher() : undefined;

  return reconcileDeploymentStartup(
    {
      workerMode,
      now: new Date(),
      dispatchGracePeriodMs: deploymentDispatchGracePeriodMs
    },
    jobRepository,
    deploymentRepository,
    async (job) => dispatcher?.inspect({ job }) ?? { state: "MISSING", lastStatus: null },
    logger
  );
}

async function warmTerraformCacheBeforeListen(
  app: StartupApp,
  warmTerraformPluginCache: () => Promise<TerraformRunResult>
): Promise<void> {
  try {
    const result = await warmTerraformPluginCache();

    if (result.exitCode === 0) {
      app.log.info("Terraform plugin cache warm-up completed");
      return;
    }

    app.log.warn(
      {
        exitCode: result.exitCode,
        timedOut: result.timedOut
      },
      "Terraform plugin cache warm-up failed; continuing API startup"
    );
  } catch (error) {
    app.log.warn({ error }, "Terraform plugin cache warm-up failed; continuing API startup");
  }
}

async function recoverInterruptedDeploymentsBeforeListen(
  app: StartupApp,
  recoverInterruptedDeployments: (
    logger?: StartupLogger
  ) => Promise<DeploymentStartupReconciliationResult | unknown[]>
): Promise<DeploymentStartupReconciliationResult> {
  try {
    const outcome = await recoverInterruptedDeployments(app.log);
    const result = Array.isArray(outcome)
      ? {
          activeDeploymentCount: 0,
          deferredInspectionCount: 0,
          failedJobCount: 0,
          recoveryRetryCount: 0,
          recoveredDeploymentCount: outcome.length
        }
      : outcome;

    if (result.activeDeploymentCount > 0) {
      app.log.info(
        { activeDeploymentCount: result.activeDeploymentCount },
        "Active ECS worker deployments were preserved during API startup"
      );
    }

    if (result.deferredInspectionCount > 0) {
      app.log.warn(
        { deferredInspectionCount: result.deferredInspectionCount },
        "ECS worker task inspection was deferred; deployments remain protected"
      );
    }

    if (result.recoveryRetryCount > 0) {
      app.log.info(
        {
          recoveryRetryCount: result.recoveryRetryCount,
          retryDelayMs: deploymentDispatchGracePeriodMs
        },
        "Deployment startup reconciliation retry scheduled"
      );
    }

    if (result.recoveredDeploymentCount > 0 || result.failedJobCount > 0) {
      app.log.warn(
        {
          failedJobCount: result.failedJobCount,
          recoveredDeploymentCount: result.recoveredDeploymentCount
        },
        "Interrupted deployments were marked failed before API startup"
      );
    }

    return result;
  } catch (error) {
    app.log.warn({ error }, "Interrupted deployment recovery failed; continuing API startup");
    return {
      activeDeploymentCount: 0,
      deferredInspectionCount: 0,
      failedJobCount: 0,
      recoveryRetryCount: 1,
      recoveredDeploymentCount: 0
    };
  }
}

function scheduleDefaultRecoveryRetry(callback: () => Promise<void>, delayMs: number): void {
  const timeout = setTimeout(() => {
    void callback();
  }, delayMs);

  timeout.unref();
}
