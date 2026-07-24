import { getDatabaseClient } from "./db/client.js";
import {
  assertPostgresDatabaseMigrationsCurrent,
  type DatabaseMigrationStatus
} from "./db/migration-readiness.js";
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
import {
  createConfiguredDeploymentWorkerDispatcher,
  createLocalDeploymentWorkerDispatcher
} from "./deployments/deployment-worker-dispatcher.js";
import {
  createEcsInterruptedDirectReleaseRecoveryDispatcher,
  createInterruptedDirectApplicationReleaseRecovery,
  createPostgresInterruptedDirectReleaseRecoveryStore
} from "./deployments/direct-release-recovery-orchestrator.js";
import { warmTerraformPluginCache as defaultWarmTerraformPluginCache } from "./deployments/terraform-plugin-cache-warmup.js";
import type { TerraformRunResult } from "./deployments/terraform-runner.js";
import { warmTrivyCheckBundle as defaultWarmTrivyCheckBundle } from "./services/terraform/trivy-terraform-scan.js";

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
  assertDatabaseMigrationsCurrent?: () => Promise<DatabaseMigrationStatus>;
  requireDatabaseUrl?: () => string;
  validateAwsCredentialSource?: () => void;
  warmTerraformPluginCache?: () => Promise<TerraformRunResult>;
  warmTrivyCheckBundle?: () => Promise<void>;
  recoverInterruptedDeployments?: (
    logger?: StartupLogger
  ) => Promise<DeploymentStartupReconciliationResult | unknown[]>;
  scheduleRecoveryRetry?: (callback: () => Promise<void>, delayMs: number) => void;
};

export async function startApiServer(options: StartApiServerOptions): Promise<void> {
  const validateAwsCredentialSource =
    options.validateAwsCredentialSource ?? assertNoStaticAwsCredentialsForApiServer;
  const requireConfiguredDatabaseUrl = options.requireDatabaseUrl ?? requireDatabaseUrl;
  const assertDatabaseMigrationsCurrent =
    options.assertDatabaseMigrationsCurrent ??
    (() => assertPostgresDatabaseMigrationsCurrent(getDatabaseClient().pool));
  const warmTerraformPluginCache =
    options.warmTerraformPluginCache ?? defaultWarmTerraformPluginCache;
  const warmTrivyCheckBundle = options.warmTrivyCheckBundle ?? defaultWarmTrivyCheckBundle;
  const recoverInterruptedDeployments =
    options.recoverInterruptedDeployments ?? defaultRecoverInterruptedDeployments;

  validateAwsCredentialSource();
  requireConfiguredDatabaseUrl();
  await assertDatabaseMigrationsCurrent();
  await warmTerraformCacheBeforeListen(options.app, warmTerraformPluginCache);
  await warmTrivyCacheBeforeListen(options.app, warmTrivyCheckBundle);
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

async function warmTrivyCacheBeforeListen(
  app: StartupApp,
  warmTrivyCheckBundle: () => Promise<void>
): Promise<void> {
  try {
    await warmTrivyCheckBundle();
    app.log.info("Trivy checks cache warm-up completed");
  } catch (error) {
    app.log.warn({ error }, "Trivy checks cache warm-up failed; continuing API startup");
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
    workerMode === "ecs"
      ? createConfiguredDeploymentWorkerDispatcher()
      : workerMode === "local_process"
        ? createLocalDeploymentWorkerDispatcher()
        : undefined;
  const recoverApplicationReleases =
    workerMode !== "in_process" && dispatcher
      ? createEcsInterruptedDirectReleaseRecoveryDispatcher({
          store: createPostgresInterruptedDirectReleaseRecoveryStore(client.db),
          jobs: jobRepository,
          dispatcher,
          ...(logger ? { logger } : {})
        })
      : createInterruptedDirectApplicationReleaseRecovery({
          db: client.db,
          ...(logger ? { logger } : {})
        });

  return reconcileDeploymentStartup(
    {
      workerMode,
      now: new Date(),
      dispatchGracePeriodMs: deploymentDispatchGracePeriodMs
    },
    jobRepository,
    deploymentRepository,
    async (job) => dispatcher?.inspect({ job }) ?? { state: "MISSING", lastStatus: null },
    logger,
    recoverApplicationReleases
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
