import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RUNTIME_ADAPTER_KINDS,
  type RuntimeAdapterKind,
  type RuntimeDeploymentTarget,
  type RuntimeTargetScope
} from "@sketchcatch/types";
import { createDeploymentTargetIdentity } from "./deployment-target-identity.js";
import {
  RuntimeConvergenceVerificationError,
  createRuntimeConvergenceAdapterRegistry,
  createRuntimeConvergenceService,
  type RuntimeProviderCurrentState,
  type RuntimeProviderGateway
} from "./runtime-convergence-service.js";

const artifact = {
  artifactFingerprint: "f".repeat(64),
  digestAlgorithm: "sha256" as const,
  digest: "a".repeat(64),
  reference: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/app@sha256:" +
    "a".repeat(64)
};
const scope: RuntimeTargetScope = {
  projectId: "11111111-1111-4111-8111-111111111111",
  provider: "aws",
  accountId: "123456789012",
  region: "ap-northeast-2"
};
const target = createEcsTarget();

test("registry exposes a distinct provider adapter for every supported target", () => {
  const gateways = createGatewayRecord((kind) =>
    createGateway(createState({ adapterKind: kind }))
  );
  const registry = createRuntimeConvergenceAdapterRegistry(gateways);

  assert.deepEqual(registry.kinds(), RUNTIME_ADAPTER_KINDS);
  for (const kind of RUNTIME_ADAPTER_KINDS) {
    assert.equal(registry.get(kind).kind, kind);
  }
  assert.notEqual(
    registry.get("eks_managed_node_group"),
    registry.get("ecs_service_fargate")
  );
});

test("healthy exact provider state returns already_active without rollout", async () => {
  const current = createState();
  const gateway = createGateway(current);
  const service = createService(gateway);

  const result = await service.converge({ scope, target, artifact });

  assert.equal(result.outcome, "already_active");
  assert.equal(result.fallbackReason, null);
  assert.equal(gateway.rolloutCalls, 0);
  assert.equal(result.deploymentTargetFingerprint, createTargetFingerprint(scope, target));
  assert.equal(result.providerRevision.revisionId, "task-definition:42");
});

test("provider read failure falls back to rollout without exposing provider errors", async () => {
  const gateway = createGateway(createState(), { readError: new Error("credential secret") });
  const service = createService(gateway);

  const result = await service.converge({ scope, target, artifact });

  assert.equal(result.outcome, "rolled_out");
  assert.equal(result.fallbackReason, "current_state_unavailable");
  assert.equal(gateway.rolloutCalls, 1);
  assert.equal(JSON.stringify(result).includes("credential secret"), false);
});

test("target, artifact, and health mismatches each force a safe rollout", async () => {
  const cases = [
    {
      name: "target",
      current: createState({
        target: {
          ...target,
          orchestrator: { ...target.orchestrator, serviceName: "other-service" }
        }
      }),
      reason: "target_mismatch"
    },
    {
      name: "artifact identity",
      current: createState({
        artifact: { ...artifact, artifactFingerprint: "e".repeat(64) }
      }),
      reason: "artifact_fingerprint_mismatch"
    },
    {
      name: "artifact",
      current: createState({ artifact: { ...artifact, digest: "b".repeat(64) } }),
      reason: "artifact_digest_mismatch"
    },
    {
      name: "unhealthy",
      current: createState({ health: { status: "unhealthy", verifiedAt: new Date().toISOString() } }),
      reason: "unhealthy"
    },
    {
      name: "unverified health",
      current: createState({ health: { status: "unknown", verifiedAt: null } }),
      reason: "health_unverified"
    }
  ] as const;

  for (const item of cases) {
    const gateway = createGateway(item.current, { rolloutState: createState() });
    const result = await createService(gateway).converge({ scope, target, artifact });

    assert.equal(result.outcome, "rolled_out", item.name);
    assert.equal(result.fallbackReason, item.reason, item.name);
    assert.equal(gateway.rolloutCalls, 1, item.name);
  }
});

test("account or region mismatch cannot produce a no-op", async () => {
  for (const mismatchedScope of [
    { ...scope, accountId: "210987654321" },
    { ...scope, region: "us-east-1" }
  ]) {
    const gateway = createGateway(createState({ scope: mismatchedScope }), {
      rolloutState: createState()
    });
    const result = await createService(gateway).converge({ scope, target, artifact });

    assert.equal(result.outcome, "rolled_out");
    assert.equal(result.fallbackReason, "target_mismatch");
  }
});

test("provider revision boundary mismatch cannot produce a no-op", async () => {
  const gateway = createGateway(createState({
    providerRevision: {
      provider: "kubernetes",
      resourceType: "ecs_service",
      revisionId: "task-definition:42",
      artifactReference: artifact.reference,
      metadata: { desiredCount: 1, runningCount: 1 }
    }
  }), { rolloutState: createState() });

  const result = await createService(gateway).converge({ scope, target, artifact });

  assert.equal(result.outcome, "rolled_out");
  assert.equal(result.fallbackReason, "current_state_unavailable");
  assert.equal(gateway.rolloutCalls, 1);
});

test("post-rollout verification fails closed and retains rollback evidence", async () => {
  const before = createState({
    health: { status: "unhealthy", verifiedAt: new Date().toISOString() },
    rollbackEvidence: { previousRevisionId: "task-definition:41" }
  });
  const after = createState({
    health: { status: "unhealthy", verifiedAt: new Date().toISOString() }
  });
  const gateway = createGateway(before, { rolloutState: after });

  await assert.rejects(
    () => createService(gateway).converge({ scope, target, artifact }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConvergenceVerificationError);
      assert.equal(error.reason, "unhealthy");
      assert.deepEqual(error.rollbackEvidence, {
        previousRevisionId: "task-definition:41"
      });
      return true;
    }
  );
});

test("provider evidence with secret-shaped keys is never returned for persistence", async () => {
  const current = createState({
    healthEvidence: { state: "healthy", nested: { apiToken: "redacted" } }
  });

  await assert.rejects(
    () => createService(createGateway(current)).converge({ scope, target, artifact }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConvergenceVerificationError);
      assert.equal(error.reason, "evidence_unverified");
      return true;
    }
  );
});

function createService(gateway: RuntimeProviderGateway) {
  const gateways = createGatewayRecord(() => gateway);
  return createRuntimeConvergenceService({
    adapters: createRuntimeConvergenceAdapterRegistry(gateways),
    now: () => new Date("2026-07-16T00:00:00.000Z")
  });
}

function createGatewayRecord(
  create: (kind: RuntimeAdapterKind) => RuntimeProviderGateway
): Record<RuntimeAdapterKind, RuntimeProviderGateway> {
  return {
    ecs_service_fargate: create("ecs_service_fargate"),
    ecs_service_ec2_capacity_provider: create("ecs_service_ec2_capacity_provider"),
    ec2_instance: create("ec2_instance"),
    ec2_auto_scaling_group: create("ec2_auto_scaling_group"),
    eks_managed_node_group: create("eks_managed_node_group"),
    eks_self_managed_node: create("eks_self_managed_node"),
    eks_fargate_profile: create("eks_fargate_profile"),
    kubernetes_deployment: create("kubernetes_deployment"),
    lambda_alias: create("lambda_alias"),
    static_s3_cloudfront: create("static_s3_cloudfront")
  };
}

function createGateway(
  current: RuntimeProviderCurrentState,
  options: {
    readonly readError?: Error | undefined;
    readonly rolloutState?: RuntimeProviderCurrentState | undefined;
  } = {}
): RuntimeProviderGateway & { rolloutCalls: number } {
  return {
    rolloutCalls: 0,
    async readCurrentState() {
      if (options.readError) throw options.readError;
      return current;
    },
    async rollout() {
      this.rolloutCalls += 1;
      return options.rolloutState ?? createState();
    }
  };
}

function createState(
  overrides: Partial<RuntimeProviderCurrentState> & {
    readonly adapterKind?: RuntimeAdapterKind | undefined;
  } = {}
): RuntimeProviderCurrentState {
  return {
    adapterKind: "ecs_service_fargate",
    deploymentTargetFingerprint: createTargetFingerprint(scope, target),
    scope,
    target,
    artifact,
    providerRevision: {
      provider: "aws",
      resourceType: "ecs_service",
      revisionId: "task-definition:42",
      artifactReference: artifact.reference,
      metadata: { desiredCount: 1, runningCount: 1 }
    },
    health: { status: "healthy", verifiedAt: "2026-07-16T00:00:00.000Z" },
    healthEvidence: { state: "healthy" },
    rollbackEvidence: { previousRevisionId: "task-definition:41" },
    ...overrides
  };
}

function createTargetFingerprint(
  targetScope: RuntimeTargetScope,
  runtimeTarget: RuntimeDeploymentTarget
): string {
  return createDeploymentTargetIdentity({
    contractVersion: "runtime-convergence/v1",
    scope: targetScope,
    target: runtimeTarget
  }).deploymentTargetFingerprint;
}

function createEcsTarget(): Extract<
  RuntimeDeploymentTarget,
  { readonly adapterKind: "ecs_service_fargate" }
> {
  return {
    adapterKind: "ecs_service_fargate",
    orchestrator: { kind: "ecs_service", clusterName: "cluster", serviceName: "service" },
    compute: { kind: "container", containerName: "app" },
    capacity: { kind: "fargate", platformVersion: null },
    rollout: {
      kind: "ecs_rolling",
      minimumHealthyPercent: 0,
      maximumPercent: 100,
      circuitBreakerRollback: true
    },
    health: { kind: "https", outputUrl: "https://app.example.com", path: "/health" }
  };
}
