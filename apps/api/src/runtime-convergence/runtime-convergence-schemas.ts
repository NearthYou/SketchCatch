import { isIP } from "node:net";
import {
  RUNTIME_ADAPTER_KINDS,
  RUNTIME_CONVERGENCE_CONTRACT_VERSION,
  type DeploymentTargetFingerprintInput,
  type RuntimeConvergenceEvidence,
  type RuntimeDeploymentTarget
} from "@sketchcatch/types";
import { z } from "zod";
import { isPublicAddress } from "../network/public-address.js";

const identifierSchema = z.string().trim().min(1).max(512);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const rolloutQuantitySchema = z.string().trim().regex(/^(?:0|[1-9]\d*)(?:%)?$/u);
export const credentialFreeHttpsUrlSchema = z.url().max(2_048).superRefine(
  (value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: "custom", message: "Invalid URL format" });
      return;
    }
    const hostname = normalizeHostname(url.hostname);
    const family = isIP(hostname);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.port !== "" && url.port !== "443") ||
      ((family === 4 || family === 6) && !isPublicAddress(hostname, family))
    ) {
      context.addIssue({
        code: "custom",
        message: "Expected a credential-free public HTTPS URL without query or fragment"
      });
    }
  }
);

const runtimeHealthCheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("provider") }).strict(),
  z
    .object({
      kind: z.literal("https"),
      outputUrl: credentialFreeHttpsUrlSchema,
      path: z.string().trim().regex(/^\//u).max(512)
    })
    .strict(),
  z
    .object({
      kind: z.literal("kubernetes_deployment"),
      minimumAvailableReplicas: z.number().int().nonnegative()
    })
    .strict()
]);

const kubernetesHealthCheckSchema = z
  .object({
    kind: z.literal("kubernetes_deployment"),
    minimumAvailableReplicas: z.number().int().nonnegative()
  })
  .strict();

const ecsOrchestratorSchema = z
  .object({
    kind: z.literal("ecs_service"),
    clusterName: identifierSchema,
    serviceName: identifierSchema
  })
  .strict();

const containerComputeSchema = z
  .object({ kind: z.literal("container"), containerName: identifierSchema })
  .strict();

const ecsRolloutSchema = z
  .object({
    kind: z.literal("ecs_rolling"),
    minimumHealthyPercent: z.number().int().min(0).max(100),
    maximumPercent: z.number().int().min(100).max(1_000),
    circuitBreakerRollback: z.boolean()
  })
  .strict();

const kubernetesPodComputeSchema = z
  .object({ kind: z.literal("kubernetes_pods"), containerName: identifierSchema })
  .strict();

const kubernetesRolloutSchema = z
  .object({
    kind: z.literal("kubernetes_rolling"),
    maxUnavailable: rolloutQuantitySchema,
    maxSurge: rolloutQuantitySchema
  })
  .strict();

const eksOrchestratorSchema = z
  .object({
    kind: z.literal("eks"),
    clusterName: identifierSchema,
    namespace: identifierSchema,
    deploymentName: identifierSchema
  })
  .strict();

const ecsFargateTargetSchema = z
  .object({
    adapterKind: z.literal("ecs_service_fargate"),
    orchestrator: ecsOrchestratorSchema,
    compute: containerComputeSchema,
    capacity: z
      .object({ kind: z.literal("fargate"), platformVersion: identifierSchema.nullable() })
      .strict(),
    rollout: ecsRolloutSchema,
    health: runtimeHealthCheckSchema
  })
  .strict();

const ecsEc2CapacityProviderTargetSchema = z
  .object({
    adapterKind: z.literal("ecs_service_ec2_capacity_provider"),
    orchestrator: ecsOrchestratorSchema,
    compute: containerComputeSchema,
    capacity: z
      .object({
        kind: z.literal("ecs_ec2_capacity_provider"),
        capacityProviderNames: z.array(identifierSchema).min(1).max(64)
      })
      .strict(),
    rollout: ecsRolloutSchema,
    health: runtimeHealthCheckSchema
  })
  .strict();

const ec2InstanceTargetSchema = z
  .object({
    adapterKind: z.literal("ec2_instance"),
    orchestrator: z.object({ kind: z.literal("none") }).strict(),
    compute: z
      .object({
        kind: z.literal("ec2_instance"),
        instanceId: z.string().regex(/^i-[a-f0-9]{8,17}$/u)
      })
      .strict(),
    capacity: z.object({ kind: z.literal("single_instance") }).strict(),
    rollout: z.object({ kind: z.literal("in_place_all_at_once") }).strict(),
    health: runtimeHealthCheckSchema
  })
  .strict();

const ec2AutoScalingGroupTargetSchema = z
  .object({
    adapterKind: z.literal("ec2_auto_scaling_group"),
    orchestrator: z
      .object({
        kind: z.literal("codedeploy"),
        applicationName: identifierSchema,
        deploymentGroupName: identifierSchema
      })
      .strict(),
    compute: z.object({ kind: z.literal("ec2_instances") }).strict(),
    capacity: z
      .object({
        kind: z.literal("auto_scaling_group"),
        autoScalingGroupName: identifierSchema
      })
      .strict(),
    rollout: z.object({ kind: z.literal("codedeploy_all_at_once") }).strict(),
    health: runtimeHealthCheckSchema
  })
  .strict();

const eksManagedNodeGroupTargetSchema = z
  .object({
    adapterKind: z.literal("eks_managed_node_group"),
    orchestrator: eksOrchestratorSchema,
    compute: kubernetesPodComputeSchema,
    capacity: z
      .object({ kind: z.literal("managed_node_group"), nodeGroupName: identifierSchema })
      .strict(),
    rollout: kubernetesRolloutSchema,
    health: kubernetesHealthCheckSchema
  })
  .strict();

const eksSelfManagedNodeTargetSchema = z
  .object({
    adapterKind: z.literal("eks_self_managed_node"),
    orchestrator: eksOrchestratorSchema,
    compute: kubernetesPodComputeSchema,
    capacity: z
      .object({
        kind: z.literal("self_managed_nodes"),
        autoScalingGroupName: identifierSchema
      })
      .strict(),
    rollout: kubernetesRolloutSchema,
    health: kubernetesHealthCheckSchema
  })
  .strict();

const eksFargateProfileTargetSchema = z
  .object({
    adapterKind: z.literal("eks_fargate_profile"),
    orchestrator: eksOrchestratorSchema,
    compute: kubernetesPodComputeSchema,
    capacity: z
      .object({ kind: z.literal("fargate_profile"), fargateProfileName: identifierSchema })
      .strict(),
    rollout: kubernetesRolloutSchema,
    health: kubernetesHealthCheckSchema
  })
  .strict();

const kubernetesDeploymentTargetSchema = z
  .object({
    adapterKind: z.literal("kubernetes_deployment"),
    orchestrator: z
      .object({
        kind: z.literal("kubernetes"),
        clusterIdentity: identifierSchema,
        namespace: identifierSchema,
        deploymentName: identifierSchema
      })
      .strict(),
    compute: kubernetesPodComputeSchema,
    capacity: z.object({ kind: z.literal("external_cluster") }).strict(),
    rollout: kubernetesRolloutSchema,
    health: kubernetesHealthCheckSchema
  })
  .strict();

const lambdaAliasTargetSchema = z
  .object({
    adapterKind: z.literal("lambda_alias"),
    orchestrator: z
      .object({
        kind: z.literal("lambda_alias"),
        functionName: identifierSchema,
        aliasName: identifierSchema
      })
      .strict(),
    compute: z
      .object({
        kind: z.literal("lambda_version"),
        architecture: z.enum(["x86_64", "arm64"])
      })
      .strict(),
    capacity: z.object({ kind: z.literal("provider_managed") }).strict(),
    rollout: z
      .object({
        kind: z.literal("lambda_all_at_once"),
        applicationName: identifierSchema,
        deploymentGroupName: identifierSchema
      })
      .strict(),
    health: runtimeHealthCheckSchema
  })
  .strict();

const staticS3CloudFrontTargetSchema = z
  .object({
    adapterKind: z.literal("static_s3_cloudfront"),
    orchestrator: z
      .object({
        kind: z.literal("cloudfront_distribution"),
        distributionId: identifierSchema,
        originId: identifierSchema
      })
      .strict(),
    compute: z
      .object({ kind: z.literal("static_objects"), bucketName: identifierSchema })
      .strict(),
    capacity: z.object({ kind: z.literal("provider_managed") }).strict(),
    rollout: z
      .object({
        kind: z.literal("static_atomic_prefix"),
        invalidationPaths: z.array(z.string().trim().regex(/^\//u).max(512)).min(1).max(64)
      })
      .strict(),
    health: runtimeHealthCheckSchema
  })
  .strict();

export const runtimeDeploymentTargetSchema: z.ZodType<RuntimeDeploymentTarget> =
  z.discriminatedUnion("adapterKind", [
    ecsFargateTargetSchema,
    ecsEc2CapacityProviderTargetSchema,
    ec2InstanceTargetSchema,
    ec2AutoScalingGroupTargetSchema,
    eksManagedNodeGroupTargetSchema,
    eksSelfManagedNodeTargetSchema,
    eksFargateProfileTargetSchema,
    kubernetesDeploymentTargetSchema,
    lambdaAliasTargetSchema,
    staticS3CloudFrontTargetSchema
  ]);

export const runtimeTargetScopeSchema = z
  .object({
    projectId: z.string().trim().min(1).max(128),
    provider: z.enum(["aws", "kubernetes"]),
    accountId: z.string().trim().min(1).max(128),
    region: z.string().trim().min(1).max(64)
  })
  .strict()
  .superRefine((scope, context) => {
    if (scope.provider !== "aws") return;
    if (!/^\d{12}$/u.test(scope.accountId)) {
      context.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Expected a 12-digit AWS account ID"
      });
    }
    if (!/^[a-z]{2}(?:-[a-z0-9]+)+-\d$/u.test(scope.region)) {
      context.addIssue({
        code: "custom",
        path: ["region"],
        message: "Expected a canonical AWS region"
      });
    }
  });

export const deploymentTargetFingerprintInputSchema: z.ZodType<DeploymentTargetFingerprintInput> =
  z
    .object({
      contractVersion: z.literal(RUNTIME_CONVERGENCE_CONTRACT_VERSION),
      scope: runtimeTargetScopeSchema,
      target: runtimeDeploymentTargetSchema
    })
    .strict();

export const runtimeConvergenceEvidenceSchema: z.ZodType<RuntimeConvergenceEvidence> = z
  .object({
    contractVersion: z.literal(RUNTIME_CONVERGENCE_CONTRACT_VERSION),
    adapterKind: z.enum(RUNTIME_ADAPTER_KINDS),
    outcome: z.enum(["already_active", "rolled_out"]),
    deploymentTargetFingerprint: sha256Schema,
    artifactFingerprint: sha256Schema,
    artifactDigestAlgorithm: z.literal("sha256"),
    artifactDigest: sha256Schema,
    providerStateVerifiedAt: z.string().datetime(),
    fallbackReason: z
      .enum([
        "current_state_unavailable",
        "target_mismatch",
        "artifact_fingerprint_mismatch",
        "artifact_digest_mismatch",
        "health_unverified",
        "unhealthy"
      ])
      .nullable()
  })
  .strict();

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}
