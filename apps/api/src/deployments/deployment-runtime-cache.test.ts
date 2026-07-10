import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDeploymentRuntimeCacheKey,
  createRuntimeCachedDeploymentRepository,
  deploymentStatusCacheNamespace,
  type DeploymentRuntimeStatusSnapshot
} from "./deployment-runtime-cache.js";
import type { DeploymentRecord, DeploymentRepository } from "./deployment-service.js";
import { createInMemoryRuntimeCache } from "../runtime-cache/index.js";

const fixedNow = new Date("2026-07-05T00:00:00.000Z");
const deploymentId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

test("runtime cached deployment repository caches recovered interrupted deployments", async () => {
  const runtimeCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  const deployment = createDeploymentRecord({
    status: "FAILED",
    activeStage: null,
    failureStage: "apply",
    errorSummary: "API restarted while deployment was running"
  });
  const repository = {
    recoverInterruptedDeployments: async () => [deployment]
  } as unknown as DeploymentRepository;

  const cachedRepository = createRuntimeCachedDeploymentRepository({
    repository,
    runtimeCache,
    now: () => fixedNow
  });

  assert.deepEqual(await cachedRepository.recoverInterruptedDeployments(), [deployment]);

  const snapshot = await runtimeCache.get<DeploymentRuntimeStatusSnapshot>({
    namespace: deploymentStatusCacheNamespace,
    key: createDeploymentRuntimeCacheKey(deploymentId)
  });

  assert.equal(snapshot?.kind, "deployment_status");
  assert.equal(snapshot?.deploymentId, deploymentId);
  assert.equal(snapshot?.projectId, projectId);
  assert.equal(snapshot?.status, "FAILED");
  assert.equal(snapshot?.failureStage, "apply");
  assert.equal(snapshot?.errorSummary, "API restarted while deployment was running");
  assert.equal(snapshot?.cachedAt, fixedNow.toISOString());
});

test("runtime cached deployment repository delegates original methods with repository this binding", async () => {
  const runtimeCache = createInMemoryRuntimeCache({ cleanupIntervalMs: null });
  const deployment = createDeploymentRecord();
  const repository = {
    deployment,
    async findDeploymentById(
      this: { readonly deployment: DeploymentRecord },
      candidateDeploymentId: string
    ) {
      return this.deployment.id === candidateDeploymentId ? this.deployment : undefined;
    }
  } as unknown as DeploymentRepository & { readonly deployment: DeploymentRecord };

  const cachedRepository = createRuntimeCachedDeploymentRepository({
    repository,
    runtimeCache,
    now: () => fixedNow
  });

  assert.equal(await cachedRepository.findDeploymentById(deploymentId), deployment);
});

function createDeploymentRecord(
  overrides: Partial<DeploymentRecord> = {}
): DeploymentRecord {
  return {
    id: deploymentId,
    projectId,
    architectureId: "33333333-3333-4333-8333-333333333333",
    terraformArtifactId: "44444444-4444-4444-8444-444444444444",
    awsConnectionId: "55555555-5555-4555-8555-555555555555",
    liveProfile: "practice",
    currentPlanArtifactId: null,
    stateObjectKey: null,
    resultWarningSummary: null,
    status: "PENDING",
    activeStage: null,
    planSummary: null,
    isBlocked: false,
    blockedBy: null,
    blockedReason: null,
    failureStage: null,
    errorSummary: null,
    approvedAt: null,
    approvedByUserId: null,
    approvedTerraformArtifactId: null,
    approvedPlanArtifactId: null,
    approvedTerraformArtifactHash: null,
    approvedTfplanHash: null,
    approvedAwsAccountId: null,
    approvedAwsRegion: null,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelRequestedAt: null,
    cancelledAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}
