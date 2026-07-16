import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RUNTIME_ADAPTER_KINDS,
  RUNTIME_CONVERGENCE_CONTRACT_VERSION,
  type DeploymentTargetFingerprintInput,
  type RuntimeAdapterKind,
  type RuntimeDeploymentTarget
} from "@sketchcatch/types";
import {
  DeploymentTargetFingerprintMismatchError,
  createDeploymentTargetIdentity,
  resolveAwsDeploymentTargetIdentity
} from "./deployment-target-identity.js";
import {
  deploymentTargetFingerprintInputSchema,
  runtimeDeploymentTargetSchema
} from "./runtime-convergence-schemas.js";

test("Zod accepts exactly the ten supported runtime target variants", () => {
  for (const adapterKind of RUNTIME_ADAPTER_KINDS) {
    const target = createTarget(adapterKind);
    assert.deepEqual(runtimeDeploymentTargetSchema.parse(target), target, adapterKind);
  }
});

test("runtime target DTO rejects unknown secret-shaped fields", () => {
  const target = createTarget("ecs_service_fargate");
  assert.throws(
    () => runtimeDeploymentTargetSchema.parse({ ...target, apiToken: "must-not-enter-target" }),
    /Unrecognized key/u
  );
});

test("runtime target DTO rejects unsafe HTTPS health endpoints", () => {
  const target = createTarget("ecs_service_fargate");
  for (const outputUrl of [
    "not a URL",
    "https://user:password@app.example.com",
    "https://app.example.com:8443",
    "https://app.example.com?token=secret",
    "https://app.example.com#fragment",
    "https://169.254.169.254"
  ]) {
    assert.throws(
      () => runtimeDeploymentTargetSchema.parse({
        ...target,
        health: { kind: "https", outputUrl, path: "/health" }
      }),
      { name: "ZodError" },
      outputUrl
    );
  }
});

test("deployment target fingerprint is canonical, scoped, and independent from artifacts", () => {
  const first = createFingerprintInput("123456789012", "ap-northeast-2");
  const reordered = {
    target: first.target,
    scope: {
      region: first.scope.region,
      accountId: first.scope.accountId,
      provider: first.scope.provider,
      projectId: first.scope.projectId
    },
    contractVersion: first.contractVersion
  } satisfies DeploymentTargetFingerprintInput;

  const firstIdentity = createDeploymentTargetIdentity(first);
  const reorderedIdentity = createDeploymentTargetIdentity(reordered);
  const otherAccount = createDeploymentTargetIdentity(
    createFingerprintInput("210987654321", "ap-northeast-2")
  );
  const otherRegion = createDeploymentTargetIdentity(
    createFingerprintInput("123456789012", "us-east-1")
  );

  assert.match(firstIdentity.deploymentTargetFingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(
    firstIdentity.deploymentTargetFingerprint,
    reorderedIdentity.deploymentTargetFingerprint
  );
  assert.notEqual(
    firstIdentity.deploymentTargetFingerprint,
    otherAccount.deploymentTargetFingerprint
  );
  assert.notEqual(
    firstIdentity.deploymentTargetFingerprint,
    otherRegion.deploymentTargetFingerprint
  );
  assert.equal("artifactFingerprint" in firstIdentity, false);
});

test("fingerprint DTO fails closed on artifact and credential fields", () => {
  const valid = createFingerprintInput("123456789012", "ap-northeast-2");
  assert.throws(
    () =>
      deploymentTargetFingerprintInputSchema.parse({
        ...valid,
        artifactFingerprint: "a".repeat(64)
      }),
    /Unrecognized key/u
  );
  assert.throws(
    () =>
      deploymentTargetFingerprintInputSchema.parse({
        ...valid,
        scope: { ...valid.scope, accessKey: "must-not-enter-scope" }
      }),
    /Unrecognized key/u
  );
});

test("AWS fingerprint scope requires a canonical account and region", () => {
  const valid = createFingerprintInput("123456789012", "ap-northeast-2");
  for (const scope of [
    { ...valid.scope, accountId: "cluster-identity" },
    { ...valid.scope, region: "AP-NORTHEAST-2" },
    { ...valid.scope, region: "localhost" }
  ]) {
    assert.throws(() => deploymentTargetFingerprintInputSchema.parse({ ...valid, scope }));
  }

  assert.doesNotThrow(() => deploymentTargetFingerprintInputSchema.parse({
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    scope: {
      projectId: valid.scope.projectId,
      provider: "kubernetes",
      accountId: "cluster-identity",
      region: "on-premises"
    },
    target: createTarget("kubernetes_deployment")
  }));
});

test("AWS target identity is reconstructed for legacy rows and rejects stale persisted fingerprints", () => {
  const runtimeConfig = {
    runtimeTargetKind: "ecs_fargate" as const,
    codeBuildProjectName: "app-build",
    ecrRepositoryName: "app",
    clusterName: "cluster",
    serviceName: "service",
    containerName: "app",
    outputUrl: "https://app.example.com"
  };
  const legacy = resolveAwsDeploymentTargetIdentity({
    projectId: "11111111-1111-4111-8111-111111111111",
    accountId: "123456789012",
    region: "ap-northeast-2",
    runtimeTarget: null,
    runtimeConfig,
    healthCheckPath: "/health",
    persistedDeploymentTargetFingerprint: null
  });

  assert.match(legacy.deploymentTargetFingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(legacy.adapterKind, "ecs_service_fargate");
  if (legacy.target.adapterKind !== "ecs_service_fargate") {
    throw new Error("expected legacy ECS Fargate target");
  }
  const legacyTarget = legacy.target;
  assert.throws(
    () => resolveAwsDeploymentTargetIdentity({
      projectId: legacy.scope.projectId,
      accountId: legacy.scope.accountId,
      region: legacy.scope.region,
      runtimeTarget: legacyTarget,
      runtimeConfig,
      healthCheckPath: "/health",
      persistedDeploymentTargetFingerprint: "e".repeat(64)
    }),
    DeploymentTargetFingerprintMismatchError
  );
  assert.throws(
    () => resolveAwsDeploymentTargetIdentity({
      projectId: legacy.scope.projectId,
      accountId: legacy.scope.accountId,
      region: legacy.scope.region,
      runtimeTarget: {
        ...legacyTarget,
        orchestrator: {
          kind: "ecs_service",
          clusterName: "cluster",
          serviceName: "other-service"
        }
      },
      runtimeConfig,
      healthCheckPath: "/health",
      persistedDeploymentTargetFingerprint: null
    }),
    DeploymentTargetFingerprintMismatchError
  );
});

test("runtime provider scope cannot cross AWS and Kubernetes adapter boundaries", () => {
  const awsTarget = createTarget("ecs_service_fargate");
  const kubernetesTarget = createTarget("kubernetes_deployment");

  assert.throws(() => createDeploymentTargetIdentity({
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    scope: {
      projectId: "11111111-1111-4111-8111-111111111111",
      provider: "kubernetes",
      accountId: "cluster-identity",
      region: "ap-northeast-2"
    },
    target: awsTarget
  }));
  assert.throws(() => createDeploymentTargetIdentity({
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    scope: {
      projectId: "11111111-1111-4111-8111-111111111111",
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    target: kubernetesTarget
  }));
});

function createFingerprintInput(
  accountId: string,
  region: string
): DeploymentTargetFingerprintInput {
  return {
    contractVersion: RUNTIME_CONVERGENCE_CONTRACT_VERSION,
    scope: {
      projectId: "11111111-1111-4111-8111-111111111111",
      provider: "aws",
      accountId,
      region
    },
    target: createTarget("ecs_service_fargate")
  };
}

function createTarget(adapterKind: RuntimeAdapterKind): RuntimeDeploymentTarget {
  const health = { kind: "https" as const, outputUrl: "https://app.example.com", path: "/" };
  const ecs = {
    orchestrator: { kind: "ecs_service" as const, clusterName: "cluster", serviceName: "service" },
    compute: { kind: "container" as const, containerName: "app" },
    rollout: {
      kind: "ecs_rolling" as const,
      minimumHealthyPercent: 100,
      maximumPercent: 200,
      circuitBreakerRollback: true
    },
    health
  };
  const kubernetes = {
    orchestrator: {
      kind: "eks" as const,
      clusterName: "cluster",
      namespace: "default",
      deploymentName: "app"
    },
    compute: { kind: "kubernetes_pods" as const, containerName: "app" },
    rollout: {
      kind: "kubernetes_rolling" as const,
      maxUnavailable: "25%",
      maxSurge: "25%"
    },
    health: { kind: "kubernetes_deployment" as const, minimumAvailableReplicas: 1 }
  };

  switch (adapterKind) {
    case "ecs_service_fargate":
      return { adapterKind, ...ecs, capacity: { kind: "fargate", platformVersion: null } };
    case "ecs_service_ec2_capacity_provider":
      return {
        adapterKind,
        ...ecs,
        capacity: { kind: "ecs_ec2_capacity_provider", capacityProviderNames: ["provider"] }
      };
    case "ec2_instance":
      return {
        adapterKind,
        orchestrator: { kind: "none" },
        compute: { kind: "ec2_instance", instanceId: "i-0123456789abcdef0" },
        capacity: { kind: "single_instance" },
        rollout: { kind: "in_place_all_at_once" },
        health
      };
    case "ec2_auto_scaling_group":
      return {
        adapterKind,
        orchestrator: {
          kind: "codedeploy",
          applicationName: "app",
          deploymentGroupName: "group"
        },
        compute: { kind: "ec2_instances" },
        capacity: { kind: "auto_scaling_group", autoScalingGroupName: "asg" },
        rollout: { kind: "codedeploy_all_at_once" },
        health
      };
    case "eks_managed_node_group":
      return { adapterKind, ...kubernetes, capacity: { kind: "managed_node_group", nodeGroupName: "ng" } };
    case "eks_self_managed_node":
      return {
        adapterKind,
        ...kubernetes,
        capacity: { kind: "self_managed_nodes", autoScalingGroupName: "asg" }
      };
    case "eks_fargate_profile":
      return {
        adapterKind,
        ...kubernetes,
        capacity: { kind: "fargate_profile", fargateProfileName: "profile" }
      };
    case "kubernetes_deployment":
      return {
        adapterKind,
        orchestrator: {
          kind: "kubernetes",
          clusterIdentity: "cluster-identity",
          namespace: "default",
          deploymentName: "app"
        },
        compute: kubernetes.compute,
        capacity: { kind: "external_cluster" },
        rollout: kubernetes.rollout,
        health: kubernetes.health
      };
    case "lambda_alias":
      return {
        adapterKind,
        orchestrator: { kind: "lambda_alias", functionName: "app", aliasName: "live" },
        compute: { kind: "lambda_version", architecture: "arm64" },
        capacity: { kind: "provider_managed" },
        rollout: {
          kind: "lambda_all_at_once",
          applicationName: "app",
          deploymentGroupName: "live"
        },
        health
      };
    case "static_s3_cloudfront":
      return {
        adapterKind,
        orchestrator: {
          kind: "cloudfront_distribution",
          distributionId: "DISTRIBUTION",
          originId: "origin"
        },
        compute: { kind: "static_objects", bucketName: "bucket" },
        capacity: { kind: "provider_managed" },
        rollout: { kind: "static_atomic_prefix", invalidationPaths: ["/*"] },
        health
      };
  }
}
