import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RUNTIME_ADAPTER_KINDS,
  normalizeLegacyRuntimeDeploymentTarget,
  type DeploymentTargetFingerprintInput,
  type RuntimeAdapterKind,
  type RuntimeDeploymentTarget
} from "./runtime-convergence.js";

test("runtime convergence exposes every supported provider-neutral adapter", () => {
  assert.deepEqual(RUNTIME_ADAPTER_KINDS, [
    "ecs_service_fargate",
    "ecs_service_ec2_capacity_provider",
    "ec2_instance",
    "ec2_auto_scaling_group",
    "eks_managed_node_group",
    "eks_self_managed_node",
    "eks_fargate_profile",
    "kubernetes_deployment",
    "lambda_alias",
    "static_s3_cloudfront"
  ] satisfies readonly RuntimeAdapterKind[]);
});

test("every runtime target separates orchestrator, compute, capacity, and rollout", () => {
  for (const target of createSupportedTargets()) {
    assert.ok(target.orchestrator.kind, target.adapterKind);
    assert.ok(target.compute.kind, target.adapterKind);
    assert.ok(target.capacity.kind, target.adapterKind);
    assert.ok(target.rollout.kind, target.adapterKind);
  }
});

test("legacy ECS Fargate and EC2 ASG targets normalize into the canonical model", () => {
  assert.equal(
    normalizeLegacyRuntimeDeploymentTarget({
      runtimeTargetKind: "ecs_fargate",
      codeBuildProjectName: "project-build",
      ecrRepositoryName: "project-app",
      clusterName: "project-cluster",
      serviceName: "project-service",
      containerName: "app",
      outputUrl: "https://app.example.com"
    }).adapterKind,
    "ecs_service_fargate"
  );
  assert.equal(
    normalizeLegacyRuntimeDeploymentTarget({
      runtimeTargetKind: "ec2_asg",
      codeDeployApplicationName: "project-app",
      codeDeployDeploymentGroupName: "project-group",
      autoScalingGroupName: "project-asg",
      outputUrl: "https://app.example.com"
    }).adapterKind,
    "ec2_auto_scaling_group"
  );
});

test("deployment target fingerprint input carries no artifact fingerprint", () => {
  const input = {
    contractVersion: "runtime-convergence/v1",
    scope: {
      projectId: "11111111-1111-4111-8111-111111111111",
      provider: "aws",
      accountId: "123456789012",
      region: "ap-northeast-2"
    },
    target: createSupportedTargets()[0]
  } satisfies DeploymentTargetFingerprintInput;

  assert.equal("artifactFingerprint" in input, false);
});

function createSupportedTargets(): readonly RuntimeDeploymentTarget[] {
  const httpsHealth = {
    kind: "https" as const,
    outputUrl: "https://app.example.com",
    path: "/health"
  };
  const kubernetesRollout = {
    kind: "kubernetes_rolling" as const,
    maxUnavailable: "25%",
    maxSurge: "25%"
  };

  return [
    {
      adapterKind: "ecs_service_fargate",
      orchestrator: { kind: "ecs_service", clusterName: "cluster", serviceName: "service" },
      compute: { kind: "container", containerName: "app" },
      capacity: { kind: "fargate", platformVersion: null },
      rollout: {
        kind: "ecs_rolling",
        minimumHealthyPercent: 100,
        maximumPercent: 200,
        circuitBreakerRollback: true
      },
      health: httpsHealth
    },
    {
      adapterKind: "ecs_service_ec2_capacity_provider",
      orchestrator: { kind: "ecs_service", clusterName: "cluster", serviceName: "service" },
      compute: { kind: "container", containerName: "app" },
      capacity: { kind: "ecs_ec2_capacity_provider", capacityProviderNames: ["provider"] },
      rollout: {
        kind: "ecs_rolling",
        minimumHealthyPercent: 100,
        maximumPercent: 200,
        circuitBreakerRollback: true
      },
      health: httpsHealth
    },
    {
      adapterKind: "ec2_instance",
      orchestrator: { kind: "none" },
      compute: { kind: "ec2_instance", instanceId: "i-0123456789abcdef0" },
      capacity: { kind: "single_instance" },
      rollout: { kind: "in_place_all_at_once" },
      health: httpsHealth
    },
    {
      adapterKind: "ec2_auto_scaling_group",
      orchestrator: {
        kind: "codedeploy",
        applicationName: "app",
        deploymentGroupName: "group"
      },
      compute: { kind: "ec2_instances" },
      capacity: { kind: "auto_scaling_group", autoScalingGroupName: "asg" },
      rollout: { kind: "codedeploy_all_at_once" },
      health: httpsHealth
    },
    createEksTarget("eks_managed_node_group", {
      kind: "managed_node_group",
      nodeGroupName: "managed"
    }),
    createEksTarget("eks_self_managed_node", {
      kind: "self_managed_nodes",
      autoScalingGroupName: "self-managed"
    }),
    createEksTarget("eks_fargate_profile", {
      kind: "fargate_profile",
      fargateProfileName: "profile"
    }),
    {
      adapterKind: "kubernetes_deployment",
      orchestrator: {
        kind: "kubernetes",
        clusterIdentity: "cluster-identity",
        namespace: "default",
        deploymentName: "app"
      },
      compute: { kind: "kubernetes_pods", containerName: "app" },
      capacity: { kind: "external_cluster" },
      rollout: kubernetesRollout,
      health: { kind: "kubernetes_deployment", minimumAvailableReplicas: 1 }
    },
    {
      adapterKind: "lambda_alias",
      orchestrator: { kind: "lambda_alias", functionName: "app", aliasName: "live" },
      compute: { kind: "lambda_version", architecture: "arm64" },
      capacity: { kind: "provider_managed" },
      rollout: {
        kind: "lambda_all_at_once",
        applicationName: "app",
        deploymentGroupName: "app-live"
      },
      health: httpsHealth
    },
    {
      adapterKind: "static_s3_cloudfront",
      orchestrator: {
        kind: "cloudfront_distribution",
        distributionId: "DISTRIBUTION",
        originId: "origin"
      },
      compute: { kind: "static_objects", bucketName: "site-bucket" },
      capacity: { kind: "provider_managed" },
      rollout: { kind: "static_atomic_prefix", invalidationPaths: ["/*"] },
      health: httpsHealth
    }
  ];
}

function createEksTarget(
  adapterKind:
    | "eks_managed_node_group"
    | "eks_self_managed_node"
    | "eks_fargate_profile",
  capacity:
    | { readonly kind: "managed_node_group"; readonly nodeGroupName: string }
    | { readonly kind: "self_managed_nodes"; readonly autoScalingGroupName: string }
    | { readonly kind: "fargate_profile"; readonly fargateProfileName: string }
): RuntimeDeploymentTarget {
  return {
    adapterKind,
    orchestrator: {
      kind: "eks",
      clusterName: "cluster",
      namespace: "default",
      deploymentName: "app"
    },
    compute: { kind: "kubernetes_pods", containerName: "app" },
    capacity,
    rollout: { kind: "kubernetes_rolling", maxUnavailable: "25%", maxSurge: "25%" },
    health: { kind: "kubernetes_deployment", minimumAvailableReplicas: 1 }
  } as RuntimeDeploymentTarget;
}
