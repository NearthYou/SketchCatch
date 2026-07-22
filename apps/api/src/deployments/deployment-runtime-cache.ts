import type {
  DeploymentRecord,
  DeploymentLogRecord,
  DeploymentRepository
} from "./deployment-service.js";
import type { RuntimeCache, RuntimeCacheJsonValue } from "../runtime-cache/index.js";

export const deploymentStatusCacheTtlMs = 60 * 60 * 1000;
export const deploymentLogCursorCacheTtlMs = 10 * 60 * 1000;

export const deploymentStatusCacheNamespace = "deployment.status";
export const deploymentLogCursorCacheNamespace = "deployment.log_cursor";

export type DeploymentRuntimeStatusSnapshot = {
  readonly kind: "deployment_status";
  readonly deploymentId: string;
  readonly projectId: string;
  readonly status: DeploymentRecord["status"];
  readonly activeStage: DeploymentRecord["activeStage"];
  readonly failureStage: DeploymentRecord["failureStage"];
  readonly errorSummary: string | null;
  readonly updatedAt: string;
  readonly cachedAt: string;
};

export type DeploymentLogStreamCursorSnapshot = {
  readonly kind: "deployment_log_cursor";
  readonly deploymentId: string;
  readonly lastSequence: number;
  readonly updatedAt: string;
};

export function createRuntimeCachedDeploymentRepository(input: {
  readonly repository: DeploymentRepository;
  readonly runtimeCache: RuntimeCache;
  readonly now?: () => Date;
}): DeploymentRepository {
  const now = input.now ?? (() => new Date());
  const repository = input.repository;
  const runtimeCache = input.runtimeCache;

  async function cacheStatus(deployment: DeploymentRecord | undefined): Promise<void> {
    if (!deployment) {
      return;
    }

    await writeDeploymentRuntimeStatusSnapshot({
      deployment,
      now,
      runtimeCache
    });
  }

  const overrides: Partial<DeploymentRepository> = {
    createDeployment: async (createInput) => {
      const deployment = await repository.createDeployment(createInput);

      await cacheStatus(deployment);

      return deployment;
    },
    updateDeploymentStatus: async (deploymentId, status) => {
      const deployment = await repository.updateDeploymentStatus(deploymentId, status);

      await cacheStatus(deployment);

      return deployment;
    },
    markDeploymentInitRunning: async (deploymentId) => {
      const deployment = await repository.markDeploymentInitRunning(deploymentId);

      await cacheStatus(deployment);

      return deployment;
    },
    markDeploymentPlanRunning: async (deploymentId, operation) => {
      const deployment = await repository.markDeploymentPlanRunning(deploymentId, operation);

      await cacheStatus(deployment);

      return deployment;
    },
    markDeploymentApplyRunning: async (deploymentId) => {
      const deployment = await repository.markDeploymentApplyRunning(deploymentId);

      await cacheStatus(deployment);

      return deployment;
    },
    markDeploymentDestroyRunning: async (deploymentId) => {
      const deployment = await repository.markDeploymentDestroyRunning(deploymentId);

      await cacheStatus(deployment);

      return deployment;
    },
    markDeploymentInitSucceeded: async (deploymentId) => {
      const deployment = await repository.markDeploymentInitSucceeded(deploymentId);

      await cacheStatus(deployment);

      return deployment;
    },
    updateDeploymentPlan: async (deploymentId, updateInput) => {
      const deployment = await repository.updateDeploymentPlan(deploymentId, updateInput);

      await cacheStatus(deployment);

      return deployment;
    },
    saveDeploymentPlan: async (saveInput) => {
      const deployment = await repository.saveDeploymentPlan(saveInput);

      await cacheStatus(deployment);

      return deployment;
    },
    approveDeployment: async (deploymentId, approveInput) => {
      const deployment = await repository.approveDeployment(deploymentId, approveInput);

      await cacheStatus(deployment);

      return deployment;
    },
    revokeDeploymentApproval: async (deploymentId, revokeInput) => {
      const deployment = await repository.revokeDeploymentApproval?.(deploymentId, revokeInput);

      await cacheStatus(deployment);

      return deployment;
    },
    completeDeploymentApply: async (deploymentId) => {
      const deployment = await repository.completeDeploymentApply(deploymentId);

      await cacheStatus(deployment);

      return deployment;
    },
    completeDeploymentDestroy: async (deploymentId, completeInput) => {
      const deployment = await repository.completeDeploymentDestroy(deploymentId, completeInput);

      await cacheStatus(deployment);

      return deployment;
    },
    failDeployment: async (deploymentId, failInput) => {
      const deployment = await repository.failDeployment(deploymentId, failInput);

      await cacheStatus(deployment);

      return deployment;
    },
    requestDeploymentCancellation: async (deploymentId) => {
      const deployment = await repository.requestDeploymentCancellation(deploymentId);

      await cacheStatus(deployment);

      return deployment;
    },
    cancelDeployment: async (deploymentId, cancelInput) => {
      const deployment = await repository.cancelDeployment(deploymentId, cancelInput);

      await cacheStatus(deployment);

      return deployment;
    },
    recoverInterruptedDeployments: async (recoveryInput) => {
      const deployments = await repository.recoverInterruptedDeployments(recoveryInput);

      await Promise.all(deployments.map((deployment) => cacheStatus(deployment)));

      return deployments;
    },
    createDeploymentLog: async (logInput) => {
      const log = await repository.createDeploymentLog(logInput);

      await writeDeploymentLogStreamCursor({
        deploymentId: log.deploymentId,
        lastSequence: log.sequence,
        now,
        runtimeCache
      });

      return log;
    },
    createDeploymentLogs: async (logInputs) => {
      const logs = await repository.createDeploymentLogs(logInputs);
      const lastLog = getLastDeploymentLog(logs);

      if (lastLog) {
        await writeDeploymentLogStreamCursor({
          deploymentId: lastLog.deploymentId,
          lastSequence: lastLog.sequence,
          now,
          runtimeCache
        });
      }

      return logs;
    }
  };

  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property as keyof DeploymentRepository];
      }

      const value = Reflect.get(target, property, receiver);

      return typeof value === "function" ? value.bind(target) : value;
    }
  }) as DeploymentRepository;
}

export async function writeDeploymentRuntimeStatusSnapshot(input: {
  readonly deployment: DeploymentRecord;
  readonly runtimeCache: RuntimeCache;
  readonly now?: () => Date;
}): Promise<void> {
  const now = input.now ?? (() => new Date());

  await setRuntimeCacheBestEffort(input.runtimeCache, {
    namespace: deploymentStatusCacheNamespace,
    key: createDeploymentRuntimeCacheKey(input.deployment.id),
    value: {
      kind: "deployment_status",
      deploymentId: input.deployment.id,
      projectId: input.deployment.projectId,
      status: input.deployment.status,
      activeStage: input.deployment.activeStage,
      failureStage: input.deployment.failureStage,
      errorSummary: input.deployment.errorSummary,
      updatedAt: toIsoString(input.deployment.updatedAt),
      cachedAt: now().toISOString()
    } satisfies DeploymentRuntimeStatusSnapshot,
    ttlMs: deploymentStatusCacheTtlMs
  });
}

export async function readDeploymentLogStreamCursor(input: {
  readonly deploymentId: string;
  readonly runtimeCache: RuntimeCache;
}): Promise<DeploymentLogStreamCursorSnapshot | null> {
  try {
    const value = await input.runtimeCache.get<DeploymentLogStreamCursorSnapshot>({
      namespace: deploymentLogCursorCacheNamespace,
      key: createDeploymentRuntimeCacheKey(input.deploymentId)
    });

    return isDeploymentLogStreamCursorSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export async function writeDeploymentLogStreamCursor(input: {
  readonly deploymentId: string;
  readonly lastSequence: number;
  readonly runtimeCache: RuntimeCache;
  readonly now?: () => Date;
}): Promise<void> {
  const now = input.now ?? (() => new Date());

  if (!Number.isInteger(input.lastSequence) || input.lastSequence < 0) {
    return;
  }

  await setRuntimeCacheBestEffort(input.runtimeCache, {
    namespace: deploymentLogCursorCacheNamespace,
    key: createDeploymentRuntimeCacheKey(input.deploymentId),
    value: {
      kind: "deployment_log_cursor",
      deploymentId: input.deploymentId,
      lastSequence: input.lastSequence,
      updatedAt: now().toISOString()
    } satisfies DeploymentLogStreamCursorSnapshot,
    ttlMs: deploymentLogCursorCacheTtlMs
  });
}

export function createDeploymentRuntimeCacheKey(deploymentId: string): string {
  return `deployment:${deploymentId}`;
}

async function setRuntimeCacheBestEffort(
  runtimeCache: RuntimeCache,
  input: {
    readonly namespace: string;
    readonly key: string;
    readonly value: RuntimeCacheJsonValue;
    readonly ttlMs: number;
  }
): Promise<void> {
  await runtimeCache
    .set(
      {
        namespace: input.namespace,
        key: input.key
      },
      input.value,
      {
        ttlMs: input.ttlMs
      }
    )
    .catch(() => undefined);
}

function getLastDeploymentLog(
  logs: readonly DeploymentLogRecord[]
): DeploymentLogRecord | undefined {
  return logs.reduce<DeploymentLogRecord | undefined>((current, log) => {
    if (!current || log.sequence > current.sequence) {
      return log;
    }

    return current;
  }, undefined);
}

function isDeploymentLogStreamCursorSnapshot(
  value: DeploymentLogStreamCursorSnapshot | null
): value is DeploymentLogStreamCursorSnapshot {
  return Boolean(
    value &&
    value.kind === "deployment_log_cursor" &&
    typeof value.deploymentId === "string" &&
    Number.isInteger(value.lastSequence) &&
    value.lastSequence >= 0 &&
    typeof value.updatedAt === "string"
  );
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
