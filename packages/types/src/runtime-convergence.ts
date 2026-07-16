export const RUNTIME_CONVERGENCE_CONTRACT_VERSION = "runtime-convergence/v1" as const;

export const RUNTIME_ADAPTER_KINDS = [
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
] as const;

export type RuntimeAdapterKind = (typeof RUNTIME_ADAPTER_KINDS)[number];

export type RuntimeTargetScope = {
  readonly projectId: string;
  readonly provider: "aws" | "kubernetes";
  readonly accountId: string;
  readonly region: string;
};

export type RuntimeHttpsHealthCheck = {
  readonly kind: "https";
  readonly outputUrl: string;
  readonly path: string;
};

export type RuntimeProviderHealthCheck = {
  readonly kind: "provider";
};

export type RuntimeKubernetesHealthCheck = {
  readonly kind: "kubernetes_deployment";
  readonly minimumAvailableReplicas: number;
};

export type RuntimeHealthCheck =
  | RuntimeHttpsHealthCheck
  | RuntimeProviderHealthCheck
  | RuntimeKubernetesHealthCheck;

type EcsServiceTarget = {
  readonly orchestrator: {
    readonly kind: "ecs_service";
    readonly clusterName: string;
    readonly serviceName: string;
  };
  readonly compute: {
    readonly kind: "container";
    readonly containerName: string;
  };
  readonly rollout: {
    readonly kind: "ecs_rolling";
    readonly minimumHealthyPercent: number;
    readonly maximumPercent: number;
    readonly circuitBreakerRollback: boolean;
  };
  readonly health: RuntimeHealthCheck;
};

export type EcsFargateRuntimeTarget = EcsServiceTarget & {
  readonly adapterKind: "ecs_service_fargate";
  readonly capacity: {
    readonly kind: "fargate";
    readonly platformVersion: string | null;
  };
};

export type EcsEc2CapacityProviderRuntimeTarget = EcsServiceTarget & {
  readonly adapterKind: "ecs_service_ec2_capacity_provider";
  readonly capacity: {
    readonly kind: "ecs_ec2_capacity_provider";
    readonly capacityProviderNames: readonly string[];
  };
};

export type Ec2InstanceRuntimeTarget = {
  readonly adapterKind: "ec2_instance";
  readonly orchestrator: { readonly kind: "none" };
  readonly compute: {
    readonly kind: "ec2_instance";
    readonly instanceId: string;
  };
  readonly capacity: { readonly kind: "single_instance" };
  readonly rollout: { readonly kind: "in_place_all_at_once" };
  readonly health: RuntimeHealthCheck;
};

export type Ec2AutoScalingGroupRuntimeTarget = {
  readonly adapterKind: "ec2_auto_scaling_group";
  readonly orchestrator: {
    readonly kind: "codedeploy";
    readonly applicationName: string;
    readonly deploymentGroupName: string;
  };
  readonly compute: { readonly kind: "ec2_instances" };
  readonly capacity: {
    readonly kind: "auto_scaling_group";
    readonly autoScalingGroupName: string;
  };
  readonly rollout: { readonly kind: "codedeploy_all_at_once" };
  readonly health: RuntimeHealthCheck;
};

type EksRuntimeTarget = {
  readonly orchestrator: {
    readonly kind: "eks";
    readonly clusterName: string;
    readonly namespace: string;
    readonly deploymentName: string;
  };
  readonly compute: {
    readonly kind: "kubernetes_pods";
    readonly containerName: string;
  };
  readonly rollout: {
    readonly kind: "kubernetes_rolling";
    readonly maxUnavailable: string;
    readonly maxSurge: string;
  };
  readonly health: RuntimeKubernetesHealthCheck;
};

export type EksManagedNodeGroupRuntimeTarget = EksRuntimeTarget & {
  readonly adapterKind: "eks_managed_node_group";
  readonly capacity: {
    readonly kind: "managed_node_group";
    readonly nodeGroupName: string;
  };
};

export type EksSelfManagedNodeRuntimeTarget = EksRuntimeTarget & {
  readonly adapterKind: "eks_self_managed_node";
  readonly capacity: {
    readonly kind: "self_managed_nodes";
    readonly autoScalingGroupName: string;
  };
};

export type EksFargateProfileRuntimeTarget = EksRuntimeTarget & {
  readonly adapterKind: "eks_fargate_profile";
  readonly capacity: {
    readonly kind: "fargate_profile";
    readonly fargateProfileName: string;
  };
};

export type KubernetesDeploymentRuntimeTarget = {
  readonly adapterKind: "kubernetes_deployment";
  readonly orchestrator: {
    readonly kind: "kubernetes";
    readonly clusterIdentity: string;
    readonly namespace: string;
    readonly deploymentName: string;
  };
  readonly compute: {
    readonly kind: "kubernetes_pods";
    readonly containerName: string;
  };
  readonly capacity: { readonly kind: "external_cluster" };
  readonly rollout: {
    readonly kind: "kubernetes_rolling";
    readonly maxUnavailable: string;
    readonly maxSurge: string;
  };
  readonly health: RuntimeKubernetesHealthCheck;
};

export type LambdaAliasRuntimeTarget = {
  readonly adapterKind: "lambda_alias";
  readonly orchestrator: {
    readonly kind: "lambda_alias";
    readonly functionName: string;
    readonly aliasName: string;
  };
  readonly compute: {
    readonly kind: "lambda_version";
    readonly architecture: "x86_64" | "arm64";
  };
  readonly capacity: { readonly kind: "provider_managed" };
  readonly rollout: {
    readonly kind: "lambda_all_at_once";
    readonly applicationName: string;
    readonly deploymentGroupName: string;
  };
  readonly health: RuntimeHealthCheck;
};

export type StaticS3CloudFrontRuntimeTarget = {
  readonly adapterKind: "static_s3_cloudfront";
  readonly orchestrator: {
    readonly kind: "cloudfront_distribution";
    readonly distributionId: string;
    readonly originId: string;
  };
  readonly compute: {
    readonly kind: "static_objects";
    readonly bucketName: string;
  };
  readonly capacity: { readonly kind: "provider_managed" };
  readonly rollout: {
    readonly kind: "static_atomic_prefix";
    readonly invalidationPaths: readonly string[];
  };
  readonly health: RuntimeHealthCheck;
};

export type RuntimeDeploymentTarget =
  | EcsFargateRuntimeTarget
  | EcsEc2CapacityProviderRuntimeTarget
  | Ec2InstanceRuntimeTarget
  | Ec2AutoScalingGroupRuntimeTarget
  | EksManagedNodeGroupRuntimeTarget
  | EksSelfManagedNodeRuntimeTarget
  | EksFargateProfileRuntimeTarget
  | KubernetesDeploymentRuntimeTarget
  | LambdaAliasRuntimeTarget
  | StaticS3CloudFrontRuntimeTarget;

export type DeploymentTargetFingerprintInput = {
  readonly contractVersion: typeof RUNTIME_CONVERGENCE_CONTRACT_VERSION;
  readonly scope: RuntimeTargetScope;
  readonly target: RuntimeDeploymentTarget;
};

export type DeploymentTargetIdentity = {
  readonly contractVersion: typeof RUNTIME_CONVERGENCE_CONTRACT_VERSION;
  readonly deploymentTargetFingerprint: string;
  readonly adapterKind: RuntimeAdapterKind;
  readonly scope: RuntimeTargetScope;
  readonly target: RuntimeDeploymentTarget;
};

export type RuntimeConvergenceOutcome = "already_active" | "rolled_out";

export type RuntimeConvergenceFallbackReason =
  | "current_state_unavailable"
  | "target_mismatch"
  | "artifact_fingerprint_mismatch"
  | "artifact_digest_mismatch"
  | "health_unverified"
  | "unhealthy";

export type RuntimeConvergenceEvidence = {
  readonly contractVersion: typeof RUNTIME_CONVERGENCE_CONTRACT_VERSION;
  readonly adapterKind: RuntimeAdapterKind;
  readonly outcome: RuntimeConvergenceOutcome;
  readonly deploymentTargetFingerprint: string;
  readonly artifactFingerprint: string;
  readonly artifactDigestAlgorithm: "sha256";
  readonly artifactDigest: string;
  readonly providerStateVerifiedAt: string;
  readonly fallbackReason: RuntimeConvergenceFallbackReason | null;
};

export type LegacyRuntimeDeploymentConfig =
  | {
      readonly runtimeTargetKind: "ecs_fargate";
      readonly codeBuildProjectName: string;
      readonly ecrRepositoryName: string;
      readonly clusterName: string;
      readonly serviceName: string;
      readonly containerName: string;
      readonly outputUrl: string | null;
    }
  | {
      readonly runtimeTargetKind: "lambda";
      readonly codeBuildProjectName?: string | undefined;
      readonly functionLogicalId: string;
      readonly functionName: string;
      readonly aliasName: string;
      readonly codeDeployApplicationName: string;
      readonly codeDeployDeploymentGroupName: string;
      readonly outputUrl: string;
    }
  | {
      readonly runtimeTargetKind: "ec2_asg";
      readonly codeBuildProjectName?: string | undefined;
      readonly codeDeployApplicationName: string;
      readonly codeDeployDeploymentGroupName: string;
      readonly autoScalingGroupName: string;
      readonly outputUrl: string;
    }
  | {
      readonly runtimeTargetKind: "static_site";
      readonly codeBuildProjectName?: string | undefined;
      readonly hostingBucketName: string;
      readonly cloudFrontDistributionId: string;
      readonly cloudFrontOriginId: string;
      readonly outputUrl: string;
    };

export function normalizeLegacyRuntimeDeploymentTarget(
  config: LegacyRuntimeDeploymentConfig,
  options: {
    readonly healthCheckPath?: string | null | undefined;
    readonly lambdaArchitecture?: "x86_64" | "arm64" | undefined;
  } = {}
): RuntimeDeploymentTarget {
  const health = createLegacyHealthCheck(config.outputUrl, options.healthCheckPath);

  if (config.runtimeTargetKind === "ecs_fargate") {
    return {
      adapterKind: "ecs_service_fargate",
      orchestrator: {
        kind: "ecs_service",
        clusterName: config.clusterName,
        serviceName: config.serviceName
      },
      compute: { kind: "container", containerName: config.containerName },
      capacity: { kind: "fargate", platformVersion: null },
      rollout: {
        kind: "ecs_rolling",
        minimumHealthyPercent: 0,
        maximumPercent: 100,
        circuitBreakerRollback: true
      },
      health
    };
  }
  if (config.runtimeTargetKind === "lambda") {
    return {
      adapterKind: "lambda_alias",
      orchestrator: {
        kind: "lambda_alias",
        functionName: config.functionName,
        aliasName: config.aliasName
      },
      compute: {
        kind: "lambda_version",
        architecture: options.lambdaArchitecture ?? "x86_64"
      },
      capacity: { kind: "provider_managed" },
      rollout: {
        kind: "lambda_all_at_once",
        applicationName: config.codeDeployApplicationName,
        deploymentGroupName: config.codeDeployDeploymentGroupName
      },
      health
    };
  }
  if (config.runtimeTargetKind === "ec2_asg") {
    return {
      adapterKind: "ec2_auto_scaling_group",
      orchestrator: {
        kind: "codedeploy",
        applicationName: config.codeDeployApplicationName,
        deploymentGroupName: config.codeDeployDeploymentGroupName
      },
      compute: { kind: "ec2_instances" },
      capacity: {
        kind: "auto_scaling_group",
        autoScalingGroupName: config.autoScalingGroupName
      },
      rollout: { kind: "codedeploy_all_at_once" },
      health
    };
  }
  return {
    adapterKind: "static_s3_cloudfront",
    orchestrator: {
      kind: "cloudfront_distribution",
      distributionId: config.cloudFrontDistributionId,
      originId: config.cloudFrontOriginId
    },
    compute: { kind: "static_objects", bucketName: config.hostingBucketName },
    capacity: { kind: "provider_managed" },
    rollout: { kind: "static_atomic_prefix", invalidationPaths: ["/*"] },
    health
  };
}

function createLegacyHealthCheck(
  outputUrl: string | null,
  path: string | null | undefined
): RuntimeHealthCheck {
  return outputUrl
    ? { kind: "https", outputUrl, path: path?.trim() || "/" }
    : { kind: "provider" };
}
